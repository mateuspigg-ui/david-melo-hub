import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import LeadChatContainer from '@/components/crm/LeadChatContainer';
import { Search, MessageSquare, User, Clock, CheckCircle2, AlertCircle, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { buildClientChatUrl } from '@/lib/clientChatLink';

export default function MensagensPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);

  // Buscar leads que já têm mensagens ou que você quer iniciar chat
  const { data: leadChats = [], isLoading } = useQuery({
    queryKey: ['lead_chat_list'],
    queryFn: async () => {
      // Busca leads e as últimas mensagens (se houver)
      const { data, error } = await supabase
        .from('leads')
        .select(`
          id, 
          title, 
          first_name, 
          last_name, 
          chat_token,
          stage,
          last_msg:lead_messages(id, content, created_at, is_read)
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      
      // Processar para pegar a última mensagem e formatar
      return (data || []).map(lead => {
          const msgs = (lead.last_msg || []) as any[];
          const last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
          const unreadCount = msgs.filter(m => !m.is_from_me && !m.is_read).length;

          return {
              ...lead,
              lastMessage: last?.content || 'Inicie a conversa...',
              lastTime: last?.created_at,
              unreadCount
          };
      });
    }
  });

  const filteredChats = useMemo(() => {
    return leadChats.filter(chat => 
      chat.title.toLowerCase().includes(search.toLowerCase()) ||
      `${chat.first_name} ${chat.last_name}`.toLowerCase().includes(search.toLowerCase())
    );
  }, [leadChats, search]);

  const activeChat = leadChats.find(c => c.id === activeLeadId);

  const handleCopyLink = (token: string) => {
    const link = buildClientChatUrl(token);
    navigator.clipboard.writeText(link);
    toast({ title: 'Link do Cliente copiado!', description: 'Envie via WhatsApp para o cliente.' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col md:flex-row bg-white rounded-3xl border border-border/10 overflow-hidden shadow-2xl">
      {/* Sidebar - Lista de Conversas */}
      <div className="w-full md:w-[350px] border-r border-border/10 flex flex-col bg-secondary/5">
        <div className="p-6 border-b border-border/10 bg-white">
          <h1 className="text-xl font-display uppercase tracking-tight mb-4">Mensagens</h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar cliente..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 h-10 bg-secondary/20 border-transparent focus:border-gold rounded-xl text-xs"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filteredChats.length === 0 && (
            <div className="p-8 text-center opacity-30 italic text-xs">Nenhuma conversa encontrada</div>
          )}
          {filteredChats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => setActiveLeadId(chat.id)}
              className={`w-full p-4 flex items-start gap-3 transition-all border-b border-border/5 hover:bg-gold/5 ${
                activeLeadId === chat.id ? 'bg-gold/10 border-r-4 border-r-gold shadow-sm' : ''
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-gold/15 flex items-center justify-center text-gold shrink-0 font-bold text-sm">
                {chat.first_name?.[0] || 'L'}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex justify-between items-center mb-1">
                  <h4 className="font-bold text-xs truncate">{chat.title}</h4>
                  {chat.lastTime && (
                    <span className="text-[10px] text-muted-foreground/50 font-medium">
                      {new Date(chat.lastTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate leading-relaxed">
                   {chat.lastMessage}
                </p>
                <div className="flex items-center gap-2 mt-2">
                   <Badge variant="outline" className="text-[8px] uppercase tracking-tighter h-4 px-1.5 border-gold/20 text-gold bg-gold/5">
                      {chat.stage?.replace('_', ' ')}
                   </Badge>
                   {chat.unreadCount > 0 && (
                      <span className="w-4 h-4 bg-gold text-white text-[9px] font-black rounded-full flex items-center justify-center animate-pulse">
                         {chat.unreadCount}
                      </span>
                   )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-white">
        {activeChat ? (
          <>
            {/* Header Conversa */}
            <div className="p-4 md:p-6 border-b border-border/10 flex items-center justify-between bg-white z-10 shadow-sm">
              <div className="flex items-center gap-4">
                 <div className="w-10 h-10 rounded-xl bg-gradient-gold text-white flex items-center justify-center font-bold text-sm shadow-gold">
                    {activeChat.first_name?.[0]}
                 </div>
                 <div>
                    <h3 className="font-display uppercase text-sm tracking-tight">{activeChat.title}</h3>
                    <p className="text-[10px] font-black text-gold uppercase tracking-widest">{activeChat.first_name} {activeChat.last_name}</p>
                 </div>
              </div>
              <div className="flex items-center gap-2">
                 <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleCopyLink(activeChat.chat_token)}
                    className="h-9 rounded-xl border-gold/30 text-gold hover:bg-gold hover:text-white transition-all text-[10px] font-black uppercase tracking-widest px-4"
                 >
                    <Copy className="w-3.5 h-3.5 mr-2" /> Link Cliente
                 </Button>
                 <a href={buildClientChatUrl(activeChat.chat_token)} target="_blank" rel="noreferrer">
                    <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9 text-muted-foreground/40 hover:text-gold">
                       <ExternalLink size={16} />
                    </Button>
                 </a>
              </div>
            </div>

            {/* Container de Mensagens */}
            <div className="flex-1 p-4 md:p-8 overflow-hidden">
               <LeadChatContainer leadId={activeChat.id} isAdminView />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-40">
             <div className="w-24 h-24 rounded-full bg-secondary/20 flex items-center justify-center mb-6">
                <MessageSquare size={48} className="text-muted-foreground/30" />
             </div>
             <h2 className="text-2xl font-display uppercase tracking-tight mb-2">Central de Atendimento</h2>
             <p className="text-sm max-w-xs font-medium">Selecione um cliente na lista lateral para iniciar ou continuar o atendimento exclusivo de David Melo.</p>
          </div>
        )}
      </div>
    </div>
  );
}
