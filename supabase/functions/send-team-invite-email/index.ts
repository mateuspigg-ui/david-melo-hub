import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('INVITE_FROM_EMAIL') || 'Convites <onboarding@resend.dev>';

    if (!supabaseUrl || !supabaseAnonKey) {
      return json(500, { error: 'Variáveis do Supabase ausentes.' });
    }

    if (!resendApiKey) {
      return json(500, { error: 'RESEND_API_KEY não configurada.' });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json(401, { error: 'Não autenticado.' });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return json(401, { error: 'Usuário inválido.' });
    }

    const { data: isAdmin, error: roleError } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin',
    });

    if (roleError) {
      return json(403, { error: 'Falha ao validar permissões.' });
    }

    if (!isAdmin) {
      return json(403, { error: 'Apenas administradores podem enviar convites.' });
    }

    const { email, inviteLink, modules } = await req.json();

    if (!email || !inviteLink) {
      return json(400, { error: 'email e inviteLink são obrigatórios.' });
    }

    const moduleList = Array.isArray(modules) && modules.length > 0 ? modules.join(', ') : 'Dashboard';

    const html = `
      <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.5;">
        <h2 style="margin: 0 0 12px;">Convite para o David Melo Hub</h2>
        <p>Olá,</p>
        <p>Você recebeu um convite para acessar o sistema.</p>
        <p><strong>Módulos liberados:</strong> ${moduleList}</p>
        <p>
          <a href="${inviteLink}" style="display:inline-block;padding:10px 16px;background:#C5A059;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">
            Aceitar convite
          </a>
        </p>
        <p>Ou acesse pelo link direto:</p>
        <p><a href="${inviteLink}">${inviteLink}</a></p>
      </div>
    `;

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: 'Convite para acessar o David Melo Hub',
        html,
      }),
    });

    if (!emailResponse.ok) {
      const err = await emailResponse.text();
      return json(502, { error: 'Falha no envio do e-mail.', details: err });
    }

    return json(200, { success: true });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : 'Erro interno.' });
  }
});
