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

    const { invoice_id, reason } = await req.json();
    const cancelReason = String(reason || '').trim();

    if (!invoice_id) {
      return json(400, { error: 'invoice_id é obrigatório.' });
    }

    if (!cancelReason) {
      return json(400, { error: 'Informe o motivo do cancelamento.' });
    }

    const { data: invoice, error: invoiceError } = await adminClient
      .from('invoices')
      .select('id, company_id, status, provider, provider_reference')
      .eq('id', invoice_id)
      .maybeSingle();

    if (invoiceError) {
      return json(500, { error: 'Falha ao localizar nota.', details: invoiceError.message });
    }

    if (!invoice) {
      return json(404, { error: 'Nota não encontrada.' });
    }

    if (invoice.status !== 'authorized') {
      return json(400, { error: 'Somente notas autorizadas podem ser canceladas.' });
    }

    const providerName = String(invoice.provider || '').toLowerCase() as FiscalProviderName;
    if (['plugnotas', 'focusnfe', 'enotas'].includes(providerName) && invoice.provider_reference) {
      const { data: fiscalSettings } = await adminClient
        .from('company_fiscal_settings')
        .select('environment')
        .eq('company_id', invoice.company_id)
        .maybeSingle();

      const fiscalProvider = getFiscalProvider(providerName);
      await fiscalProvider.cancelInvoice({
        invoice_id: invoice.id,
        provider_reference: String(invoice.provider_reference),
        reason: cancelReason,
        environment: fiscalSettings?.environment === 'production' ? 'production' : 'homologation',
      });
    }

    const { error: updateError } = await adminClient
      .from('invoices')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        error_message: cancelReason,
      })
      .eq('id', invoice.id)
      .eq('status', 'authorized');

    if (updateError) {
      return json(500, { error: 'Falha ao cancelar nota.', details: updateError.message });
    }

    await adminClient.from('invoice_events').insert([
      {
        invoice_id: invoice.id,
        event_type: 'cancel_requested',
        payload: { reason: cancelReason, provider_reference: invoice.provider_reference || null },
        created_by: user.id,
      },
      {
        invoice_id: invoice.id,
        event_type: 'cancelled',
        payload: { reason: cancelReason, provider_reference: invoice.provider_reference || null },
        created_by: user.id,
      },
    ]);

    return json(200, { success: true, invoice_id: invoice.id, status: 'cancelled' });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Erro interno.' });
  }
});
