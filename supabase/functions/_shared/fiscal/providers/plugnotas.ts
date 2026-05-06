import type { FiscalProvider } from '../provider.ts';
import type {
  FiscalCancelPayload,
  FiscalCancelResult,
  FiscalIssuePayload,
  FiscalIssueResult,
  FiscalWebhookNormalizedEvent,
} from '../types.ts';

export class PlugNotasProvider implements FiscalProvider {
  private getBaseUrl() {
    return String(Deno.env.get('PLUGNOTAS_BASE_URL') || 'https://api.plugnotas.com.br').replace(/\/$/, '');
  }

  private getApiKey() {
    return String(Deno.env.get('PLUGNOTAS_API_KEY') || '').trim();
  }

  private getIssuePath() {
    return String(Deno.env.get('PLUGNOTAS_ISSUE_PATH') || '/nfse');
  }

  private getCancelPathTemplate() {
    return String(Deno.env.get('PLUGNOTAS_CANCEL_PATH_TEMPLATE') || '/nfse/{reference}/cancelamento');
  }

  private async request(path: string, init: RequestInit) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { ok: true, status: 200, body: { mode: 'mock_without_api_key' } };
    }

    const response = await fetch(`${this.getBaseUrl()}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        ...(init.headers || {}),
      },
    });

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    return { ok: response.ok, status: response.status, body };
  }

  async issueInvoice(payload: FiscalIssuePayload): Promise<FiscalIssueResult> {
    const reqBody = {
      idIntegracao: payload.invoice_id,
      ambiente: payload.environment === 'production' ? 'producao' : 'homologacao',
      servico: {
        discriminacao: payload.items.map((item) => item.description).join(' | '),
        valorServicos: payload.amount_services,
        valorIss: payload.amount_iss,
        codigoServico: payload.items[0]?.service_code || undefined,
      },
      itens: payload.items.map((item) => ({
        descricao: item.description,
        quantidade: item.quantity,
        valorUnitario: item.unit_amount,
        valorTotal: item.total_amount,
        codigoServico: item.service_code || undefined,
      })),
      rps: {
        serie: payload.rps_series || undefined,
      },
    };

    const result = await this.request(this.getIssuePath(), {
      method: 'POST',
      body: JSON.stringify(reqBody),
    });

    if (!result.ok) {
      throw new Error(`PlugNotas emissão falhou (${result.status}).`);
    }

    const raw = (result.body || {}) as Record<string, unknown>;
    const providerReference = String(
      raw.id || raw.idNfse || raw.idIntegracao || raw.referencia || `plugnotas_${payload.invoice_id}`
    );

    return {
      accepted: true,
      provider_reference: providerReference,
      raw: result.body,
    };
  }

  async cancelInvoice(payload: FiscalCancelPayload): Promise<FiscalCancelResult> {
    const path = this
      .getCancelPathTemplate()
      .replace('{reference}', encodeURIComponent(payload.provider_reference));

    const result = await this.request(path, {
      method: 'POST',
      body: JSON.stringify({
        justificativa: payload.reason,
        ambiente: payload.environment === 'production' ? 'producao' : 'homologacao',
      }),
    });

    if (!result.ok) {
      throw new Error(`PlugNotas cancelamento falhou (${result.status}).`);
    }

    return { accepted: true, raw: result.body };
  }

  normalizeWebhook(payload: unknown): FiscalWebhookNormalizedEvent {
    const obj = (payload || {}) as Record<string, unknown>;
    const statusRaw = String(obj.status || obj.situacao || obj.evento || '').toLowerCase();
    const status = statusRaw.includes('cancel')
      ? 'cancelled'
      : statusRaw.includes('rejeit') || statusRaw.includes('erro')
      ? 'rejected'
      : statusRaw.includes('autoriz') || statusRaw.includes('emitid')
      ? 'authorized'
      : 'processing';

    return {
      provider_reference: String(obj.provider_reference || obj.id || obj.idNfse || obj.idIntegracao || ''),
      status,
      invoice_number: obj.invoice_number ? String(obj.invoice_number) : obj.numero ? String(obj.numero) : null,
      verification_code: obj.verification_code ? String(obj.verification_code) : obj.codigoVerificacao ? String(obj.codigoVerificacao) : null,
      pdf_url: obj.pdf_url ? String(obj.pdf_url) : obj.urlPdf ? String(obj.urlPdf) : null,
      xml_url: obj.xml_url ? String(obj.xml_url) : obj.urlXml ? String(obj.urlXml) : null,
      reason: obj.error_message ? String(obj.error_message) : obj.motivo ? String(obj.motivo) : null,
      issued_at: obj.issued_at ? String(obj.issued_at) : null,
      cancelled_at: obj.cancelled_at ? String(obj.cancelled_at) : null,
      raw: payload,
    };
  }
}
