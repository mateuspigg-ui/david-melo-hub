import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import ChatThread, { type ChatMessage } from '@/components/chat/ChatThread';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Copy, Inbox, MessageCircle, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const playClientMessageAlert = () => {
  if (typeof window === 'undefined') return;

  try {
    const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextConstructor) return;

    const audioContext = new AudioContextConstructor();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(740, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(980, audioContext.currentTime + 0.26);

    gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.2, audioContext.currentTime + 0.03);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.45);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.5);
    oscillator.onended = () => {
      void audioContext.close();
    };
  } catch {
    return;
  }
};

const showClientMessageNotification = async (body: string) => {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;

  try {
    if (Notification.permission === 'granted') {
      new Notification('Nova mensagem do cliente', {
        body,
        tag: 'client-chat-message',
        requireInteraction: true,
        silent: false,
      });
      return;
    }

    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        new Notification('Nova mensagem do cliente', {
          body,
          tag: 'client-chat-message',
          requireInteraction: true,
          silent: false,
        });
      }
    }
  } catch {
    return;
  }
};

interface ChatRow {
  id: string;
  lead_id: string;
  token: string;
  status: string;
  unread_company: number;
  unread_client: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  updated_at: string;
  lead?: {
    title: string;
    event_date: string | null;
    clients: { first_name: string; last_name: string } | null;
  } | null;
}

const buildPublicChatUrl = (token: string) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/#/chat/${encodeURIComponent(token)}`;
};

export default function MensagensPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: chats = [], isLoading } = useQuery({
    queryKey: ['lead_chats_inbox'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('lead_chats')
        .select('*, lead:leads(title, event_date, clients(first_name, last_name))')
        .order('last_message_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data || []) as ChatRow[];
    },
  });

  // Realtime: atualiza inbox quando algo muda
  useEffect(() => {
    const channel = supabase
      .channel('inbox-chats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_chats' }, () => {
        queryClient.invalidateQueries({ queryKey: ['lead_chats_inbox'] });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_chat_messages' }, (payload) => {
        const msg = payload.new as ChatMessage;
        if (msg.sender_type === 'client') {
          const preview = (msg.body || msg.attachment_name || 'Anexo').slice(0, 100);
          playClientMessageAlert();
          toast({
            title: 'Nova mensagem do cliente 💬',
            description: preview,
            duration: 12000,
          });
          void showClientMessageNotification(preview);
        }
        if (selectedId && msg.chat_id === selectedId) {
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        }
        queryClient.invalidateQueries({ queryKey: ['lead_chats_inbox'] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, selectedId]);

  // Carrega mensagens do chat selecionado
  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadingMsgs(true);
      const { data, error } = await (supabase as any)
        .from('lead_chat_messages')
        .select('*')
        .eq('chat_id', selectedId)
        .order('created_at', { ascending: true });
      if (!cancelled && !error && data) setMessages(data as ChatMessage[]);
      setLoadingMsgs(false);
      if (!cancelled) {
        await (supabase as any).rpc('mark_company_chat_read', { p_chat_id: selectedId });
        queryClient.invalidateQueries({ queryKey: ['lead_chats_inbox'] });
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedId, queryClient]);

  const filteredChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) => {
      const title = c.lead?.title || '';
      const cli = c.lead?.clients ? `${c.lead.clients.first_name} ${c.lead.clients.last_name}` : '';
      return title.toLowerCase().includes(q) || cli.toLowerCase().includes(q);
    });
  }, [chats, search]);

  const selectedChat = chats.find((c) => c.id === selectedId);

  const handleSend = async (body: string) => {
    if (!selectedChat || !user) return;
    setSending(true);
    const { error } = await (supabase as any).from('lead_chat_messages').insert({
      chat_id: selectedChat.id,
      sender_type: 'company',
      sender_user_id: user.id,
      body,
    });
    setSending(false);
    if (error) toast({ title: 'Erro ao enviar', description: error.message, variant: 'destructive' });
  };

  const handleUpload = async (files: File[]) => {
    if (!selectedChat) return;
    setUploading(true);
    try {
      for (const file of files) {
        const safeName = file.name.replace(/[^\w.\-]+/g, '_');
        const path = `${selectedChat.token}/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from('lead-chat-attachments')
          .upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('lead-chat-attachments').getPublicUrl(path);
        const { error } = await (supabase as any).from('lead_chat_messages').insert({
          chat_id: selectedChat.id,
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

  const copyChatLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(buildPublicChatUrl(token));
      toast({ title: 'Link do chat copiado!', description: 'Envie para o cliente por WhatsApp ou email.' });
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' });
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex animate-fade-in">
      {/* Sidebar de conversas */}
      <aside className="w-[340px] shrink-0 border-r border-border/40 bg-white flex flex-col">
        <div className="p-5 border-b border-border/30 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gold/10 text-gold flex items-center justify-center">
              <Inbox className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-lg font-display uppercase tracking-tight text-foreground">Mensagens</h1>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gold/70">Chats com clientes</p>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversa..."
              className="pl-9 h-10 rounded-xl border-border/40 bg-secondary/20"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {isLoading && <p className="p-6 text-sm text-muted-foreground">Carregando...</p>}
          {!isLoading && filteredChats.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground text-center">Nenhuma conversa ainda.</p>
          )}
          {filteredChats.map((c) => {
            const cliName = c.lead?.clients
              ? `${c.lead.clients.first_name} ${c.lead.clients.last_name}`.trim()
              : null;
            const isSel = c.id === selectedId;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  'w-full text-left px-5 py-4 border-b border-border/20 hover:bg-secondary/30 transition flex flex-col gap-1.5',
                  isSel && 'bg-gold/8 border-l-4 border-l-gold',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-sm text-foreground truncate">
                    {cliName || c.lead?.title || 'Cliente'}
                  </p>
                  {c.unread_company > 0 && (
                    <Badge className="bg-gold text-white border-0 text-[10px] font-black px-2 h-5">
                      {c.unread_company}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {c.last_message_preview || 'Sem mensagens'}
                </p>
                {c.last_message_at && (
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                    {format(new Date(c.last_message_at), "dd/MM HH:mm", { locale: ptBR })}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Painel principal */}
      <main className="flex-1 flex flex-col bg-secondary/10">
        {!selectedChat ? (
          <div className="flex-1 flex items-center justify-center text-center px-8">
            <div className="max-w-sm">
              <div className="w-16 h-16 rounded-full bg-gold/10 text-gold mx-auto mb-4 flex items-center justify-center">
                <MessageCircle className="w-7 h-7" />
              </div>
              <h2 className="text-lg font-display uppercase tracking-tight text-foreground mb-1">
                Selecione uma conversa
              </h2>
              <p className="text-sm text-muted-foreground">
                Escolha um chat à esquerda para ver as mensagens trocadas com o cliente.
              </p>
            </div>
          </div>
        ) : (
          <ChatThread
            viewerSide="company"
            messages={messages}
            loading={loadingMsgs}
            sending={sending}
            uploading={uploading}
            onSend={handleSend}
            onUpload={handleUpload}
            emptyHint="Mande a primeira mensagem ou anexe o orçamento em PDF."
            className="flex-1"
            header={
              <div className="bg-white border-b border-border/30 px-6 py-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gold/80">
                    Chat com cliente
                  </p>
                  <h2 className="text-base font-display uppercase tracking-tight text-foreground truncate">
                    {selectedChat.lead?.title || 'Lead'}
                  </h2>
                  {selectedChat.lead?.clients && (
                    <p className="text-xs text-muted-foreground capitalize">
                      {selectedChat.lead.clients.first_name} {selectedChat.lead.clients.last_name}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyChatLink(selectedChat.token)}
                  className="border-gold/40 text-gold hover:bg-gold hover:text-white"
                >
                  <Copy className="w-3.5 h-3.5 mr-2" /> Copiar link
                </Button>
              </div>
            }
          />
        )}
      </main>
    </div>
  );
}
