import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const acceptedStatuses = new Set(['processing', 'authorized', 'rejected', 'cancelled']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'Método não permitido.' });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const webhookSecret = Deno.env.get('FISCAL_WEBHOOK_SECRET');

    if (!supabaseUrl || !serviceRoleKey) {
      return json(500, { error: 'Variáveis do Supabase não configuradas.' });
    }

    if (webhookSecret) {
      const providedSecret = req.headers.get('x-webhook-secret');
      if (!providedSecret || providedSecret !== webhookSecret) {
        return json(401, { error: 'Webhook não autorizado.' });
      }
    }

    const body = await req.json();
    const invoiceId = body?.invoice_id ? String(body.invoice_id) : null;
    const providerReference = body?.provider_reference ? String(body.provider_reference) : null;
    const status = body?.status ? String(body.status).toLowerCase() : null;

    if (!invoiceId && !providerReference) {
      return json(400, { error: 'invoice_id ou provider_reference é obrigatório.' });
    }

    if (!status || !acceptedStatuses.has(status)) {
      return json(400, { error: 'status inválido. Use: processing, authorized, rejected, cancelled.' });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let query = supabase.from('invoices').select('id, status').limit(1);
    if (invoiceId) {
      query = query.eq('id', invoiceId);
    } else {
      query = query.eq('provider_reference', providerReference);
    }

    const { data: found, error: findError } = await query.maybeSingle();
    if (findError) {
      return json(500, { error: 'Erro ao localizar nota.', details: findError.message });
    }
    if (!found) {
      return json(404, { error: 'Nota não encontrada.' });
    }

    const updatePayload: Record<string, unknown> = {
      status,
      provider_reference: providerReference || undefined,
      error_code: body?.error_code ? String(body.error_code) : null,
      error_message: body?.error_message ? String(body.error_message) : null,
      pdf_url: body?.pdf_url ? String(body.pdf_url) : null,
      xml_url: body?.xml_url ? String(body.xml_url) : null,
      invoice_number: body?.invoice_number ? String(body.invoice_number) : null,
      verification_code: body?.verification_code ? String(body.verification_code) : null,
      issued_at: status === 'authorized' ? (body?.issued_at ? String(body.issued_at) : new Date().toISOString()) : null,
      cancelled_at: status === 'cancelled' ? (body?.cancelled_at ? String(body.cancelled_at) : new Date().toISOString()) : null,
    };

    const { error: updateError } = await supabase
      .from('invoices')
      .update(updatePayload)
      .eq('id', found.id);

    if (updateError) {
      return json(500, { error: 'Erro ao atualizar nota.', details: updateError.message });
    }

    await supabase.from('invoice_events').insert([
      {
        invoice_id: found.id,
        event_type: 'webhook_received',
        payload: body,
        created_by: null,
      },
      {
        invoice_id: found.id,
        event_type: status,
        payload: {
          previous_status: found.status,
          next_status: status,
          provider_reference: providerReference,
        },
        created_by: null,
      },
    ]);

    return json(200, { success: true, invoice_id: found.id, status });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Erro interno.' });
  }
});
