import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import ChatThread, { type ChatMessage } from '@/components/chat/ChatThread';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Copy, Loader2, MessageCircle } from 'lucide-react';

interface Props {
  leadId: string;
}

const buildPublicChatUrl = (token: string) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/#/chat/${encodeURIComponent(token)}`;
};

export default function LeadChatPanel({ leadId }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [chatId, setChatId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Cria/obtém o chat
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      setLoading(true);
      const { data, error } = await (supabase as any).rpc('get_or_create_lead_chat', { p_lead_id: leadId });
      if (cancelled) return;
      if (error || !data) {
        toast({ title: 'Erro ao iniciar chat', description: error?.message, variant: 'destructive' });
        setLoading(false);
        return;
      }
      setChatId(data.id);
      setToken(data.token);

      const { data: msgs } = await (supabase as any)
        .from('lead_chat_messages')
        .select('*')
        .eq('chat_id', data.id)
        .order('created_at', { ascending: true });
      if (!cancelled) {
        setMessages((msgs || []) as ChatMessage[]);
        setLoading(false);
        await (supabase as any).rpc('mark_company_chat_read', { p_chat_id: data.id });
        queryClient.invalidateQueries({ queryKey: ['lead_chats_inbox'] });
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [leadId, queryClient, toast]);

  // Realtime
  useEffect(() => {
    if (!chatId) return;
    const channel = supabase
      .channel(`lead-chat-panel-${chatId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lead_chat_messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          const msg = payload.new as ChatMessage;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          if (msg.sender_type === 'client') {
            void (supabase as any).rpc('mark_company_chat_read', { p_chat_id: chatId });
            queryClient.invalidateQueries({ queryKey: ['lead_chats_inbox'] });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [chatId, queryClient]);

  const handleSend = async (body: string) => {
    if (!chatId) return;
    setSending(true);
    const { error } = await (supabase as any).from('lead_chat_messages').insert({
      chat_id: chatId,
      sender_type: 'company',
      sender_user_id: user?.id,
      body,
    });
    setSending(false);
    if (error) toast({ title: 'Erro ao enviar', description: error.message, variant: 'destructive' });
  };

  const handleUpload = async (files: File[]) => {
    if (!chatId || !token) return;
    setUploading(true);
    try {
      for (const file of files) {
        const safeName = file.name.replace(/[^\w.\-]+/g, '_');
        const path = `${token}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from('lead-chat-attachments')
          .upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('lead-chat-attachments').getPublicUrl(path);
        const { error } = await (supabase as any).from('lead_chat_messages').insert({
          chat_id: chatId,
          sender_type: 'company',
          sender_user_id: user?.id,
          attachment_url: pub.publicUrl,
          attachment_name: file.name,
          attachment_type: file.type,
          attachment_size: file.size,
        });
        if (error) throw error;
      }
    } catch (e: any) {
      toast({ title: 'Falha no upload', description: e?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const copyLink = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(buildPublicChatUrl(token));
      toast({ title: 'Link copiado!', description: 'Envie ao cliente por WhatsApp ou email.' });
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Abrindo chat...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[60vh] min-h-[420px] rounded-2xl overflow-hidden border border-border/40 bg-white">
      <div className="bg-gold/5 border-b border-border/30 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <MessageCircle className="w-4 h-4 text-gold shrink-0" />
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gold/80 truncate">
            Chat direto com o cliente
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={copyLink}
          className="h-8 border-gold/40 text-gold hover:bg-gold hover:text-white"
        >
          <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar link
        </Button>
      </div>
      <ChatThread
        viewerSide="company"
        messages={messages}
        sending={sending}
        uploading={uploading}
        onSend={handleSend}
        onUpload={handleUpload}
        emptyHint="Use o link acima para enviar ao cliente, depois converse e envie o orçamento em PDF por aqui."
        className="flex-1"
      />
    </div>
  );
}
