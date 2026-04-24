import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { publicSupabase } from '@/integrations/supabase/publicClient';
import ChatThread, { type ChatMessage } from '@/components/chat/ChatThread';
import { CalendarDays, Loader2, MapPin, MessageCircle, Users } from 'lucide-react';
import logo from '@/assets/logo.png';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ChatInfo {
  chat_id: string;
  lead_id: string;
  lead_title: string;
  client_first_name: string;
  status: string;
  created_at: string;
  event_type: string | null;
  event_date: string | null;
  event_time: string | null;
  event_location: string | null;
  guest_count: number | null;
}

interface LegacyLeadInfo {
  id: string;
  title: string;
  first_name?: string | null;
  last_name?: string | null;
  stage?: string | null;
}

interface LegacyMessageRow {
  id: string;
  sender_name: string;
  content: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  created_at: string;
  is_from_me: boolean;
}

type ChatMode = 'modern' | 'legacy';

const EVENT_LABELS: Record<string, string> = {
  casamento: 'Casamento',
  '15_anos': '15 Anos',
  formatura: 'Formatura',
  aniversario: 'Aniversário',
  bodas: 'Bodas',
  corporativo: 'Corporativo',
};

export default function PublicChatPage() {
  const params = useParams();
  const token = params.token || '';
  const { toast } = useToast();

  const [mode, setMode] = useState<ChatMode>('modern');
  const [resolvedToken, setResolvedToken] = useState<string>('');
  const [info, setInfo] = useState<ChatInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mapLegacyMessages = (rows: LegacyMessageRow[]): ChatMessage[] => {
    return (rows || []).map((item) => ({
      id: item.id,
      chat_id: `legacy-${token}`,
      sender_type: item.is_from_me ? 'client' : 'company',
      body: item.content,
      attachment_url: item.attachment_url,
      attachment_name: null,
      attachment_type: item.attachment_type,
      attachment_size: null,
      created_at: item.created_at,
      read_at: null,
    }));
  };

  // 1. Resolve o token público (aceita token novo e legado)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingInfo(true);
      setError(null);

      const { data: resolved, error: resolveError } = await (publicSupabase as any).rpc('resolve_public_chat_token', { p_token: token });
      if (cancelled) return;

      if (!resolveError && resolved) {
        const nextToken = String(resolved).trim();
        setResolvedToken(nextToken);
        setMode('modern');

        const { data, error } = await (publicSupabase as any).rpc('get_public_chat', { p_token: nextToken });
        if (cancelled) return;
        if (!error && data && data.length > 0) {
          setInfo(data[0] as ChatInfo);
          setLoadingInfo(false);
          return;
        }
      }

      // fallback legado (chat_token UUID + lead_messages)
      const { data: legacyLead, error: legacyError } = await (publicSupabase as any).rpc('get_lead_by_token', { p_token: token });
      if (cancelled) return;

      if (legacyError || !legacyLead || legacyLead.length === 0) {
        setError('Link inválido ou expirado.');
      } else {
        const lead = legacyLead[0] as LegacyLeadInfo;
        setMode('legacy');
        setResolvedToken(token);
        setInfo({
          chat_id: `legacy-${token}`,
          lead_id: lead.id,
          lead_title: lead.title,
          client_first_name: String(lead.first_name || '').trim() || 'Cliente',
          status: lead.stage || 'open',
          created_at: new Date().toISOString(),
          event_type: null,
          event_date: null,
          event_time: null,
          event_location: null,
          guest_count: null,
        });
      }
      setLoadingInfo(false);
    };
    if (token) load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // 2. Carrega mensagens + realtime
  useEffect(() => {
    if (!info?.chat_id || !resolvedToken) return;
    let cancelled = false;

    const fetchAll = async (showLoader = false) => {
      if (showLoader) setLoadingMsgs(true);
      if (mode === 'modern') {
        const { data, error } = await (publicSupabase as any).rpc('list_public_chat_messages', { p_token: resolvedToken });
        if (cancelled) return;
        if (!error && data) setMessages(data as ChatMessage[]);
      } else {
        const { data, error } = await (publicSupabase as any).rpc('get_messages_by_token', { p_token: resolvedToken });
        if (cancelled) return;
        if (!error && data) setMessages(mapLegacyMessages(data as LegacyMessageRow[]));
      }
      if (showLoader) setLoadingMsgs(false);
      if (mode === 'modern') {
        await (publicSupabase as any).rpc('mark_public_chat_read', { p_token: resolvedToken });
      }
    };
    void fetchAll(true);
    const pollingId = window.setInterval(() => {
      void fetchAll(false);
    }, 4000);

    const channel = publicSupabase
      .channel(`public-chat-${info.chat_id}`)
      .on(
        'postgres_changes',
        mode === 'modern'
          ? { event: 'INSERT', schema: 'public', table: 'lead_chat_messages', filter: `chat_id=eq.${info.chat_id}` }
          : { event: 'INSERT', schema: 'public', table: 'lead_messages', filter: `lead_id=eq.${info.lead_id}` },
        (payload) => {
          if (mode === 'modern') {
            const msg = payload.new as ChatMessage;
            setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
            if (msg.sender_type === 'company') {
              void (publicSupabase as any).rpc('mark_public_chat_read', { p_token: resolvedToken });
            }
            return;
          }

          const msg = payload.new as {
            id: string;
            sender_id?: string | null;
            content?: string | null;
            attachment_url?: string | null;
            attachment_type?: string | null;
            created_at: string;
          };

          const mapped: ChatMessage = {
            id: msg.id,
            chat_id: `legacy-${resolvedToken}`,
            sender_type: msg.sender_id ? 'company' : 'client',
            body: msg.content || null,
            attachment_url: msg.attachment_url || null,
            attachment_name: null,
            attachment_type: msg.attachment_type || null,
            attachment_size: null,
            created_at: msg.created_at,
            read_at: null,
          };
          setMessages((prev) => (prev.some((m) => m.id === mapped.id) ? prev : [...prev, mapped]));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.clearInterval(pollingId);
      void publicSupabase.removeChannel(channel);
    };
  }, [info?.chat_id, info?.lead_id, resolvedToken, mode]);

  const handleSend = async (body: string) => {
    if (!resolvedToken) return;
    setSending(true);
    const { error } = mode === 'modern'
      ? await (publicSupabase as any).rpc('send_public_chat_message', {
          p_token: resolvedToken,
          p_body: body,
        })
      : await (publicSupabase as any).rpc('send_client_message', {
          p_token: resolvedToken,
          p_content: body,
          p_attachment_url: null,
          p_attachment_type: null,
        });
    setSending(false);
    if (error) {
      toast({ title: 'Erro ao enviar', description: error.message, variant: 'destructive' });
    }
  };

  const handleUpload = async (files: File[]) => {
    if (!resolvedToken) return;
    setUploading(true);
    try {
      for (const file of files) {
        const safeName = file.name.replace(/[^\w.\-]+/g, '_');
        const storageBucket = mode === 'modern' ? 'lead-chat-attachments' : 'lead-attachments';
        const path = `${resolvedToken}/${Date.now()}_${safeName}`;
        const { error: upErr } = await publicSupabase.storage
          .from(storageBucket)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = publicSupabase.storage.from(storageBucket).getPublicUrl(path);
        const { error } = mode === 'modern'
          ? await (publicSupabase as any).rpc('send_public_chat_message', {
              p_token: resolvedToken,
              p_body: null,
              p_attachment_url: pub.publicUrl,
              p_attachment_name: file.name,
              p_attachment_type: file.type,
              p_attachment_size: file.size,
            })
          : await (publicSupabase as any).rpc('send_client_message', {
              p_token: resolvedToken,
              p_content: null,
              p_attachment_url: pub.publicUrl,
              p_attachment_type: file.type,
            });
        if (error) throw error;
      }
    } catch (e: any) {
      toast({ title: 'Falha no upload', description: e?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const greetingName = useMemo(() => {
    const name = (info?.client_first_name || '').trim();
    return name && name.toLowerCase() !== 'cliente' ? name : 'Olá';
  }, [info?.client_first_name]);

  const eventTypeLabel = info?.event_type ? (EVENT_LABELS[info.event_type] || info.event_type) : null;
  const eventDateLabel = info?.event_date
    ? format(new Date(`${info.event_date}T00:00:00`), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
    : null;

  if (loadingInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30">
        <Loader2 className="w-8 h-8 animate-spin text-gold" />
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-6">
        <div className="bg-white rounded-3xl p-8 max-w-md text-center shadow-xl border border-border/30">
          <img src={logo} alt="David Melo" className="h-16 mx-auto mb-4 object-contain" />
          <h1 className="text-xl font-display uppercase tracking-tight text-foreground mb-2">Chat indisponível</h1>
          <p className="text-sm text-muted-foreground">{error || 'O link informado não é válido.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] overflow-hidden bg-secondary/20 flex flex-col">
      <ChatThread
        viewerSide="client"
        messages={messages}
        loading={loadingMsgs}
        sending={sending}
        uploading={uploading}
        onSend={handleSend}
        onUpload={handleUpload}
        emptyHint="Compartilhe inspirações, tire dúvidas e receba seu orçamento por aqui."
        className="flex-1"
        header={
          <div className="sticky top-0 z-20 bg-gradient-gold text-white px-3 sm:px-5 py-3 sm:py-4 md:px-8 md:py-5 shadow-md space-y-3 sm:space-y-4">
            <div className="flex items-start sm:items-center gap-3 sm:gap-4">
              <img src={logo} alt="David Melo" className="h-12 md:h-14 w-auto object-contain shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/70">
                  {greetingName}, bem-vindo(a)
                </p>
                <h1 className="text-lg md:text-xl font-display tracking-tight uppercase leading-tight break-words">
                  {info.lead_title}
                </h1>
                {eventTypeLabel && (
                  <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/85 mt-1">{eventTypeLabel}</p>
                )}
              </div>
              <div className="hidden md:flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-white/80 bg-white/10 rounded-full px-3 py-1.5">
                <MessageCircle className="w-3.5 h-3.5" /> Atendimento direto
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-3">
              <div className="bg-white/10 rounded-xl px-3 py-2 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 shrink-0 text-white/90" />
                <span className="text-[11px] font-bold text-white/95 truncate">
                  {eventDateLabel || 'Data a confirmar'}{info?.event_time ? ` · ${info.event_time.slice(0, 5)}` : ''}
                </span>
              </div>
              <div className="bg-white/10 rounded-xl px-3 py-2 flex items-center gap-2">
                <MapPin className="w-4 h-4 shrink-0 text-white/90" />
                <span className="text-[11px] font-bold text-white/95 truncate">{info?.event_location || 'Local a confirmar'}</span>
              </div>
              <div className="bg-white/10 rounded-xl px-3 py-2 flex items-center gap-2">
                <Users className="w-4 h-4 shrink-0 text-white/90" />
                <span className="text-[11px] font-bold text-white/95 truncate">{info?.guest_count ? `${info.guest_count} convidados` : 'Convidados a confirmar'}</span>
              </div>
            </div>
          </div>
        }
      />
    </div>
  );
}
