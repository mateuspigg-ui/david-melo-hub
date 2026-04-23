import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Send, Paperclip, FileText, Image as ImageIcon, Loader2, Download, User, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Message {
  id: string;
  sender_name: string;
  content: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  created_at: string;
  is_from_me: boolean;
  sender_id?: string | null;
}

interface Props {
  leadId?: string;
  chatToken?: string;
  isAdminView?: boolean;
}

export default function LeadChatContainer({ leadId, chatToken, isAdminView = false }: Props) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchMessages();

    // Configurar Realtime
    const channel = supabase
      .channel(`chat:${leadId || chatToken}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'lead_messages',
        },
        async (payload) => {
          const nm = payload.new as any;
          
          // Verificar se a mensagem pertence a este chat
          let belongsToThisChat = false;
          if (leadId) {
            belongsToThisChat = nm.lead_id === leadId;
          } else if (chatToken) {
            // Se for cliente (token), precisamos validar se o lead_id da mensagem bate
            const { data } = await supabase.rpc('get_lead_by_token', { p_token: chatToken });
            if (data && data[0] && data[0].id === nm.lead_id) {
               belongsToThisChat = true;
            }
          }

          if (!belongsToThisChat) return;

          const isFromMe = isAdminView ? !!nm.sender_id : !nm.sender_id;
          
          const newMessageObj: Message = {
            id: nm.id,
            sender_name: nm.sender_name,
            content: nm.content,
            attachment_url: nm.attachment_url,
            attachment_type: nm.attachment_type,
            created_at: nm.created_at,
            is_from_me: isFromMe,
          };

          // Evitar duplicatas se o insert local já aconteceu
          setMessages((prev) => {
               if (prev.find(m => m.id === nm.id)) return prev;
               return [...prev, newMessageObj];
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [leadId, chatToken]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchMessages = async () => {
    try {
      if (chatToken) {
        const { data, error } = await supabase.rpc('get_messages_by_token', { p_token: chatToken });
        if (error) throw error;
        setMessages(data || []);
      } else if (leadId) {
        const { data, error } = await supabase
          .from('lead_messages')
          .select('*')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: true });
        if (error) throw error;
        
        const formatted = (data || []).map(m => ({
            ...m,
            is_from_me: !!m.sender_id // Na visão admin, se tem sender_id é da equipe (me)
        }));
        setMessages(formatted);
      }
    } catch (error: any) {
      console.error('Erro ao carregar mensagens:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent, attachment?: { url: string, type: string }) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() && !attachment) return;

    setSending(true);
    try {
      if (chatToken) {
        const { error } = await supabase.rpc('send_client_message', {
          p_token: chatToken,
          p_content: newMessage.trim() || null,
          p_attachment_url: attachment?.url || null,
          p_attachment_type: attachment?.type || null
        });
        if (error) throw error;
      } else if (leadId) {
        // Obter perfil do usuário logado para o nome do remetente
        const { data: { user } } = await supabase.auth.getUser();
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user?.id).single();

        const { error } = await supabase.from('lead_messages').insert({
          lead_id: leadId,
          sender_id: user?.id,
          sender_name: profile?.full_name || 'Equipe David Melo',
          content: newMessage.trim() || null,
          attachment_url: attachment?.url || null,
          attachment_type: attachment?.type || null
        });
        if (error) throw error;
      }
      setNewMessage('');
    } catch (error: any) {
      toast({ title: 'Erro ao enviar', description: error.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'O limite é de 25MB.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
      const filePath = `${leadId || 'client'}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('lead-attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('lead-attachments')
        .getPublicUrl(filePath);

      let type = 'other';
      if (file.type.startsWith('image/')) type = 'image';
      else if (file.type.startsWith('video/')) type = 'video';
      else if (file.type === 'application/pdf') type = 'pdf';

      await handleSendMessage(undefined, { url: publicUrl, type });
      // Pequeno delay para garantir que o realtime processe antes de tirar o loading visual
      setTimeout(() => {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        toast({ title: 'Arquivo enviado com sucesso!' });
      }, 1000);
    } catch (error: any) {
      toast({ title: 'Erro no upload', description: error.message, variant: 'destructive' });
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 opacity-40">
        <Loader2 className="w-8 h-8 animate-spin text-gold mb-4" />
        <p className="text-[10px] font-black uppercase tracking-widest">Sincronizando Conversa...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white/40 backdrop-blur-sm rounded-3xl border border-border/10 overflow-hidden shadow-inner">
      {/* Messages area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 scroll-smooth custom-scrollbar"
      >
        {messages.length === 0 && (
          <div className="text-center py-12 flex flex-col items-center opacity-20">
            <div className="w-16 h-16 rounded-3xl border-2 border-dashed border-gold flex items-center justify-center mb-4">
              <User className="w-8 h-8 text-gold" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em]">Inicie o contato direto</p>
          </div>
        )}
        
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.is_from_me ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
          >
            <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl p-3 md:p-4 shadow-sm ${
              msg.is_from_me
                ? 'bg-gradient-gold text-white rounded-tr-none'
                : 'bg-white text-foreground rounded-tl-none border border-border/10'
            }`}>
              {!msg.is_from_me && (
                <span className="block text-[9px] font-black uppercase tracking-widest opacity-50 mb-1.5">
                  {msg.sender_name}
                </span>
              )}

              {msg.content && <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{msg.content}</p>}

              {msg.attachment_url && (
                <div className={`mt-2 ${msg.content ? 'pt-2 border-t border-white/10' : ''}`}>
                  {msg.attachment_type === 'image' ? (
                    <a href={msg.attachment_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg group">
                      <img src={msg.attachment_url} alt="Anexo" className="w-full h-auto max-h-60 object-cover transition-transform group-hover:scale-105" />
                    </a>
                  ) : (
                    <a
                      href={msg.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                      className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                        msg.is_from_me ? 'bg-white/10 hover:bg-white/20' : 'bg-secondary/30 hover:bg-gold/10 hover:text-gold'
                      }`}
                    >
                      {msg.attachment_type === 'pdf' ? <FileText size={20} /> : <Paperclip size={20} />}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate">Documento anexo</p>
                        <p className="text-[9px] opacity-60 uppercase font-black">Clique para abrir</p>
                      </div>
                      <Download size={16} className="shrink-0" />
                    </a>
                  )}
                </div>
              )}

              <div className={`mt-1.5 flex items-center gap-1.5 ${msg.is_from_me ? 'justify-end' : 'justify-start'}`}>
                <span className="text-[8px] font-bold opacity-60 uppercase">
                  {format(new Date(msg.created_at), 'HH:mm')}
                </span>
              </div>
            </div>
          </div>
        ))}
        {uploading && (
          <div className="flex flex-col items-end animate-pulse">
            <div className="bg-gold/10 border border-gold/20 rounded-2xl p-4 flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin text-gold" />
              <p className="text-[10px] font-black uppercase tracking-widest text-gold text-right">David Melo Hub<br />Enviando arquivo...</p>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="p-4 bg-white/80 border-t border-border/10">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            accept="image/*,video/*,application/pdf"
          />
          <Button 
            type="button" 
            variant="ghost" 
            size="icon" 
            disabled={uploading || sending}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl h-11 w-11 text-muted-foreground hover:text-gold hover:bg-gold/10 transition-all shrink-0"
          >
            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip size={20} />}
          </Button>

          <Input 
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            disabled={sending}
            placeholder="Digite algo para David Melo Hub..."
            className="flex-1 h-11 bg-secondary/20 border-transparent focus:border-gold rounded-xl font-medium shadow-inner"
          />

          <Button 
            type="submit" 
            disabled={sending || (!newMessage.trim() && !uploading)}
            className="rounded-xl h-11 w-11 bg-gradient-gold text-white shadow-gold hover:opacity-90 transition-all shrink-0 p-0"
          >
            <Send size={18} className={sending ? 'animate-pulse' : ''} />
          </Button>
        </form>
        <p className="text-[8px] text-center mt-3 text-muted-foreground/40 font-black uppercase tracking-[0.2em]">David Melo Produções • Hub de Inspirações</p>
      </div>
    </div>
  );
}
