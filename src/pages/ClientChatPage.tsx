import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import LeadChatContainer from '@/components/crm/LeadChatContainer';
import { Loader2, MessageCircle, AlertCircle, Share2, ClipboardCheck } from 'lucide-react';
import logo from '@/assets/logo.png';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { buildClientChatUrl } from '@/lib/clientChatLink';

export default function ClientChatPage() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLead() {
      try {
        if (!token) throw new Error('Link inválido');
        
        const { data, error: rpcError } = await supabase.rpc('get_lead_by_token', { p_token: token });
        
        if (rpcError) throw rpcError;
        if (!data || data.length === 0) throw new Error('Convite ou lead não encontrado.');

        setLead(data[0]);
      } catch (err: any) {
        console.error('Erro:', err);
        setError(err.message || 'Não foi possível encontrar este lead.');
      } finally {
        setLoading(false);
      }
    }
    fetchLead();
  }, [token]);

  const handleCopyLink = () => {
    const fullUrl = buildClientChatUrl(String(token || ''));
    navigator.clipboard.writeText(fullUrl);
    toast({ title: 'Link do Chat copiado!' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 bg-[radial-gradient(circle_at_top,_rgba(218,165,32,0.1),_transparent_50%)]">
        <Loader2 className="w-10 h-10 animate-spin text-gold mb-4" />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-foreground/40 animate-pulse">Estabelecendo Conexão Segura...</p>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-destructive/10 text-destructive flex items-center justify-center mb-6">
          <AlertCircle size={40} />
        </div>
        <h1 className="text-2xl font-display uppercase tracking-tight mb-2">Ops! Link Expirado</h1>
        <p className="text-sm text-muted-foreground max-w-sm mb-8">
          Este link de chat não é mais válido ou não existe. Entre em contato com a equipe David Melo para receber um novo acesso.
        </p>
        <Link to="/">
          <Button variant="outline" className="rounded-xl border-gold text-gold hover:bg-gold hover:text-white">
            Voltar ao Início
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fcfcfc] font-body flex flex-col">
      {/* Premium Header */}
      <header className="bg-gradient-gold p-6 md:p-8 text-white relative overflow-hidden shadow-2xl z-10">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl opacity-50" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/10 rounded-full -ml-16 -mb-16 blur-3xl opacity-30" />
        
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
          <div className="flex flex-col items-center md:items-start text-center md:text-left gap-1">
             <img src={logo} alt="David Melo" className="h-16 md:h-20 w-auto object-contain brightness-110 drop-shadow-xl mb-4" />
             <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/60 mb-2">Canal Direto David Melo Hub</p>
             <h1 className="text-3xl md:text-4xl font-display tracking-tight leading-none uppercase">
                {lead.first_name} {lead.last_name || 'Inspirações'}
             </h1>
             <div className="flex items-center gap-2 mt-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white/90">Equipe Online</span>
             </div>
          </div>

          <div className="flex flex-col items-center md:items-end gap-3 shrink-0">
             <div className="bg-black/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/10 text-center">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 mb-1">Status do Projeto</p>
                <p className="text-xs font-bold uppercase tracking-wider">{lead.stage?.replace('_', ' ')}</p>
             </div>
             <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleCopyLink}
                className="text-white hover:bg-white/20 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] px-5"
             >
                <Share2 className="w-3.5 h-3.5 mr-2" /> Salvar Link
             </Button>
          </div>
        </div>
      </header>

      {/* Chat Space */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-8 flex flex-col">
        <div className="flex-1 min-h-[500px] md:min-h-[600px]">
           <LeadChatContainer chatToken={token} />
        </div>
        
        {/* Helper info */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
           <div className="bg-gold/5 p-4 rounded-2xl border border-gold/10 flex items-start gap-3">
              <MessageCircle className="text-gold shrink-0 mt-0.5" size={18} />
              <p className="text-[11px] font-medium leading-relaxed text-foreground/70">
                 Envie suas <b>referências</b>, fotos de decorações e temas que você ama aqui.
              </p>
           </div>
           <div className="bg-gold/5 p-4 rounded-2xl border border-gold/10 flex items-start gap-3">
              <ClipboardCheck className="text-gold shrink-0 mt-0.5" size={18} />
              <p className="text-[11px] font-medium leading-relaxed text-foreground/70">
                 Nossa equipe enviará o <b>orçamento oficial</b> em formato PDF por este canal.
              </p>
           </div>
           <div className="bg-gold/5 p-4 rounded-2xl border border-gold/10 flex items-start gap-3 text-center justify-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-gold self-center">
                 David Melo Produções <br/><span className="text-[8px] opacity-60">Exclusividade em destaque</span>
              </p>
           </div>
        </div>
      </main>

      <footer className="p-6 text-center">
         <p className="text-[9px] font-bold text-muted-foreground/30 uppercase tracking-[0.3em]">
            Plataforma Segura David Melo Hub &copy; 2024
         </p>
      </footer>
    </div>
  );
}
