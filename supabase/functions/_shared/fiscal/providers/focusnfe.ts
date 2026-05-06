import type { FiscalProvider } from '../provider.ts';
import type {
  FiscalCancelPayload,
  FiscalCancelResult,
  FiscalIssuePayload,
  FiscalIssueResult,
  FiscalWebhookNormalizedEvent,
} from '../types.ts';

export class FocusNFeProvider implements FiscalProvider {
  async issueInvoice(payload: FiscalIssuePayload): Promise<FiscalIssueResult> {
    return {
      accepted: true,
      provider_reference: `focusnfe_${payload.invoice_id}`,
      raw: { mode: 'stub' },
    };
  }

  async cancelInvoice(_payload: FiscalCancelPayload): Promise<FiscalCancelResult> {
    return { accepted: true, raw: { mode: 'stub' } };
  }

  normalizeWebhook(payload: unknown): FiscalWebhookNormalizedEvent {
    const obj = (payload || {}) as Record<string, unknown>;
    return {
      provider_reference: String(obj.provider_reference || ''),
      status: 'processing',
      raw: payload,
    };
  }
}
