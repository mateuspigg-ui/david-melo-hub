import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import ChatThread, { type ChatMessage } from '@/components/chat/ChatThread';
import { Loader2, MessageCircle } from 'lucide-react';
import logo from '@/assets/logo.png';
import { useToast } from '@/hooks/use-toast';

interface ChatInfo {
  chat_id: string;
  lead_id: string;
  lead_title: string;
  client_first_name: string;
  status: string;
  created_at: string;
}

export default function PublicChatPage() {
  const params = useParams();
  const token = params.token || '';
  const { toast } = useToast();

  const [info, setInfo] = useState<ChatInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Carrega info do chat
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingInfo(true);
      const { data, error } = await (supabase as any).rpc('get_public_chat', { p_token: token });
      if (cancelled) return;
      if (error || !data || data.length === 0) {
        setError('Link inválido ou expirado.');
      } else {
        setInfo(data[0] as ChatInfo);
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
    if (!info?.chat_id) return;
    let cancelled = false;

    const fetchAll = async () => {
      setLoadingMsgs(true);
      const { data, error } = await (supabase as any).rpc('list_public_chat_messages', { p_token: token });
      if (cancelled) return;
      if (!error && data) setMessages(data as ChatMessage[]);
      setLoadingMsgs(false);
      // marca mensagens da empresa como lidas
      await (supabase as any).rpc('mark_public_chat_read', { p_token: token });
    };
    fetchAll();

    const channel = supabase
      .channel(`public-chat-${info.chat_id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lead_chat_messages', filter: `chat_id=eq.${info.chat_id}` },
        (payload) => {
          const msg = payload.new as ChatMessage;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          if (msg.sender_type === 'company') {
            void (supabase as any).rpc('mark_public_chat_read', { p_token: token });
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [info?.chat_id, token]);

  const handleSend = async (body: string) => {
    setSending(true);
    const { error } = await (supabase as any).rpc('send_public_chat_message', {
      p_token: token,
      p_body: body,
    });
    setSending(false);
    if (error) {
      toast({ title: 'Erro ao enviar', description: error.message, variant: 'destructive' });
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, '_');
      const path = `${token}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from('lead-chat-attachments')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('lead-chat-attachments').getPublicUrl(path);
      const { error } = await (supabase as any).rpc('send_public_chat_message', {
        p_token: token,
        p_body: null,
        p_attachment_url: pub.publicUrl,
        p_attachment_name: file.name,
        p_attachment_type: file.type,
        p_attachment_size: file.size,
      });
      if (error) throw error;
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
    <div className="min-h-screen bg-secondary/20 flex flex-col">
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
          <div className="bg-gradient-gold text-white px-5 py-4 md:px-8 md:py-5 flex items-center gap-4 shadow-md">
            <img src={logo} alt="David Melo" className="h-12 md:h-14 w-auto object-contain shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/70">
                {greetingName}, bem-vindo(a)
              </p>
              <h1 className="text-lg md:text-xl font-display tracking-tight uppercase truncate">
                {info.lead_title}
              </h1>
            </div>
            <div className="hidden md:flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-white/80 bg-white/10 rounded-full px-3 py-1.5">
              <MessageCircle className="w-3.5 h-3.5" /> Atendimento direto
            </div>
          </div>
        }
      />
    </div>
  );
}
