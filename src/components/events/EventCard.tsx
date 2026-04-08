import { MapPin, Calendar, Clock, DollarSign, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export const EventCard = ({ event, onClick }: { event: any, onClick: (e: any) => void }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'partial': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      default: return 'bg-destructive/10 text-destructive border-destructive/20';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'paid': return 'Pago';
      case 'partial': return 'Parcial';
      default: return 'Pendente';
    }
  };

  return (
    <div 
      className="bg-white premium-shadow rounded-2xl p-6 border border-border/40 hover:border-gold/30 hover:-translate-y-1 transition-all duration-300 cursor-pointer group"
      onClick={() => onClick(event)}
    >
      <div className="flex justify-between items-start mb-6">
        <div className="flex-1 min-w-0 pr-2">
          <h3 className="font-bold text-base text-foreground line-clamp-1 uppercase tracking-tight">{event.title}</h3>
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-secondary/50 text-foreground/60 border border-border/10 mt-2">
            {event.event_type || 'Social / VIP'}
          </span>
        </div>
        <div className={cn("inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.15em] border shadow-sm", getStatusColor(event.payment_status))}>
          {getStatusLabel(event.payment_status)}
        </div>
      </div>
      
      <div className="space-y-4 text-xs font-medium text-muted-foreground mb-6">
        {event.event_date && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-secondary/30 flex items-center justify-center">
              <Calendar size={14} className="text-gold/70" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-foreground font-bold">{new Date(event.event_date).toLocaleDateString('pt-BR')}</span>
              {event.event_time && (
                <div className="flex items-center gap-2 pl-2 border-l border-border/20">
                  <Clock size={14} className="text-gold/70" />
                  <span className="text-foreground font-bold">{event.event_time.substring(0, 5)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {event.location && (
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-lg bg-secondary/30 flex items-center justify-center">
               <MapPin size={14} className="text-gold/70" />
             </div>
            <span className="line-clamp-1 text-foreground font-bold">{event.location}</span>
          </div>
        )}

        {(event.client_id || event.lead_id) && (
          <div className="flex items-center gap-3 pt-4 border-t border-border/10">
            <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center">
              <User size={14} className="text-gold" />
            </div>
            <div className="min-w-0">
               <p className="text-[8px] font-black uppercase text-muted-foreground tracking-[0.2em] mb-0.5 opacity-50">Cliente / Contratante</p>
               <span className="line-clamp-1 text-foreground font-black text-[11px] uppercase tracking-tight">
                {event.clients ? `${event.clients.first_name || ''} ${event.clients.last_name || ''}`.trim() : 
                 event.leads ? event.leads.title : 'Não Identificado'}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 pt-4 border-t border-border/10">
        <p className="text-[8px] font-black text-muted-foreground uppercase tracking-[0.2em] opacity-40">Valor Total do Contrato</p>
        <div className="flex items-center gap-2 text-gold">
          <DollarSign size={20} className="shrink-0" />
          <span className="font-display text-2xl tracking-tighter">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(event.budget_value || 0)}
          </span>
        </div>
      </div>
    </div>
  );
};
