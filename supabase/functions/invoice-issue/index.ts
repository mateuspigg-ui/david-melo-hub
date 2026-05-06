import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getFiscalProvider, type FiscalProviderName } from '../_shared/fiscal/index.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

type InvoiceItemInput = {
  description: string;
  service_code?: string | null;
  quantity?: number;
  unit_amount?: number;
};

const validStatus = ['draft', 'processing', 'authorized', 'rejected', 'cancelled'] as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'Método não permitido.' });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return json(500, { error: 'Variáveis do Supabase não configuradas.' });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json(401, { error: 'Não autenticado.' });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json(401, { error: 'Usuário inválido.' });
    }

    const { payment_id, company_id, client_id, items } = await req.json();

    if (!payment_id || !company_id || !client_id) {
      return json(400, { error: 'payment_id, company_id e client_id são obrigatórios.' });
    }

    const parsedItems: InvoiceItemInput[] = Array.isArray(items) ? items : [];

    const { data: fiscalSettings, error: fiscalError } = await adminClient
      .from('company_fiscal_settings')
      .select('*')
      .eq('company_id', company_id)
      .maybeSingle();

    if (fiscalError) {
      return json(400, { error: 'Falha ao carregar configuração fiscal.', details: fiscalError.message });
    }

    if (!fiscalSettings) {
      return json(400, { error: 'Empresa sem configuração fiscal. Preencha os dados em Empresas > Configuração Fiscal.' });
    }

    const { data: payment, error: paymentError } = await adminClient
      .from('payments')
      .select('id, total_event_value')
      .eq('id', payment_id)
      .maybeSingle();

    if (paymentError || !payment) {
      return json(404, { error: 'Pagamento não encontrado.' });
    }

    const idempotencyKey = `invoice:${company_id}:${payment_id}`;

    const { data: existingInvoice } = await adminClient
      .from('invoices')
      .select('id, status, invoice_number, provider_reference')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existingInvoice) {
      return json(200, {
        invoice_id: existingInvoice.id,
        status: existingInvoice.status,
        invoice_number: existingInvoice.invoice_number,
        provider_reference: existingInvoice.provider_reference,
        reused: true,
      });
    }

    const calculatedItems = parsedItems
      .filter((item) => item && item.description)
      .map((item) => {
        const quantity = Number(item.quantity ?? 1);
        const unitAmount = Number(item.unit_amount ?? 0);
        return {
          description: String(item.description),
          service_code: item.service_code || fiscalSettings.service_code_default || null,
          quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
          unit_amount: Number.isFinite(unitAmount) && unitAmount >= 0 ? unitAmount : 0,
        };
      })
      .map((item) => ({
        ...item,
        total_amount: Math.round(item.quantity * item.unit_amount * 100) / 100,
      }));

    const totalFromItems = calculatedItems.reduce((sum, item) => sum + item.total_amount, 0);
    const amountServices = totalFromItems > 0 ? totalFromItems : Number(payment.total_event_value || 0);
    const issRate = Number(fiscalSettings.iss_rate || 0);
    const amountIss = Math.round(amountServices * (issRate / 100) * 100) / 100;
    const amountNet = Math.round((amountServices - amountIss) * 100) / 100;

    if (!Number.isFinite(amountServices) || amountServices <= 0) {
      return json(400, { error: 'Valor de serviços inválido para emissão.' });
    }

    const invoicePayload = {
      company_id,
      payment_id,
      client_id,
      status: 'draft',
      issue_attempts: 0,
      idempotency_key: idempotencyKey,
      provider: fiscalSettings.provider,
      amount_services: amountServices,
      amount_deductions: 0,
      amount_iss: amountIss,
      amount_net: amountNet,
      created_by: user.id,
      rps_series: fiscalSettings.rps_series || null,
    };

    const { data: invoice, error: invoiceError } = await adminClient
      .from('invoices')
      .insert(invoicePayload)
      .select('id, status')
      .single();

    if (invoiceError || !invoice) {
      return json(500, { error: 'Falha ao criar nota.', details: invoiceError?.message });
    }

    if (calculatedItems.length > 0) {
      const { error: itemsError } = await adminClient.from('invoice_items').insert(
        calculatedItems.map((item) => ({
          invoice_id: invoice.id,
          description: item.description,
          service_code: item.service_code,
          quantity: item.quantity,
          unit_amount: item.unit_amount,
          total_amount: item.total_amount,
        }))
      );
      if (itemsError) {
        return json(500, { error: 'Nota criada, mas falhou ao salvar itens.', invoice_id: invoice.id, details: itemsError.message });
      }
    }

    await adminClient.from('invoice_events').insert([
      { invoice_id: invoice.id, event_type: 'created', payload: { status: 'draft' }, created_by: user.id },
    ]);

    const providerName = String(fiscalSettings.provider || '').toLowerCase() as FiscalProviderName;
    if (!['plugnotas', 'focusnfe', 'enotas'].includes(providerName)) {
      return json(400, { error: 'Provider fiscal inválido. Use plugnotas, focusnfe ou enotas.' });
    }

    const fiscalProvider = getFiscalProvider(providerName);
    const issueResult = await fiscalProvider.issueInvoice({
      invoice_id: invoice.id,
      company_id,
      client_id,
      environment: fiscalSettings.environment === 'production' ? 'production' : 'homologation',
      amount_services: amountServices,
      amount_iss: amountIss,
      amount_net: amountNet,
      rps_series: fiscalSettings.rps_series || null,
      items: calculatedItems,
    });

    if (!issueResult.accepted || !issueResult.provider_reference) {
      return json(502, { error: 'Provider fiscal recusou a emissão.' });
    }

    const providerReference = issueResult.provider_reference;
    const { error: processingError } = await adminClient
      .from('invoices')
      .update({
        status: 'processing',
        provider_reference: providerReference,
        issue_attempts: 1,
      })
      .eq('id', invoice.id)
      .in('status', validStatus)
      .eq('status', 'draft');

    if (processingError) {
      return json(500, { error: 'Falha ao iniciar processamento da nota.', invoice_id: invoice.id, details: processingError.message });
    }

    await adminClient.from('invoice_events').insert([
      {
        invoice_id: invoice.id,
        event_type: 'sent_to_provider',
        payload: { provider_reference: providerReference, provider: fiscalSettings.provider },
        created_by: user.id,
      },
    ]);

    const autoApproveHomologation = String(Deno.env.get('AUTO_APPROVE_HOMOLOGATION_NFSE') || 'true').toLowerCase() !== 'false';
    if (fiscalSettings.environment === 'homologation' && autoApproveHomologation) {
      const invoiceNumber = `H-${Date.now()}`;
      await adminClient
        .from('invoices')
        .update({
          status: 'authorized',
          invoice_number: invoiceNumber,
          verification_code: `VF-${Math.floor(Math.random() * 1000000)}`,
          issued_at: new Date().toISOString(),
          pdf_url: `https://example.local/nfse/${invoice.id}.pdf`,
          xml_url: `https://example.local/nfse/${invoice.id}.xml`,
        })
        .eq('id', invoice.id)
        .eq('status', 'processing');

      await adminClient.from('invoice_events').insert([
        {
          invoice_id: invoice.id,
          event_type: 'authorized',
          payload: { mode: 'homologation_auto_approve', provider_reference: providerReference },
          created_by: user.id,
        },
      ]);

      return json(200, { invoice_id: invoice.id, status: 'authorized', provider_reference: providerReference, simulated: true });
    }

    return json(200, { invoice_id: invoice.id, status: 'processing', provider_reference: providerReference });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Erro interno.' });
  }
});
