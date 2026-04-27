import { MapPin, Calendar, Clock, DollarSign, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export const EventCard = ({ event, onClick }: { event: any, onClick: (e: any) => void }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'partial': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      default: return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'paid': return 'Liquidado';
      case 'partial': return 'Parcial';
      default: return 'Pendente';
    }
  };

  const initials = event.clients ? 
    `${event.clients.first_name?.[0] || ''}${event.clients.last_name?.[0] || ''}`.toUpperCase() : 
    (event.leads?.title?.[0] || 'E').toUpperCase();

  return (
    <div 
      className="group relative bg-white rounded-[32px] p-8 border border-border/30 premium-shadow transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl cursor-pointer overflow-hidden"
      onClick={() => onClick(event)}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-gold/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
      
      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 rounded-full bg-gold shadow-gold-sm" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gold/80">
                {event.event_type || 'Evento VIP'}
              </span>
            </div>
            <h3 className="text-xl font-display text-foreground leading-tight uppercase group-hover:text-gold transition-colors line-clamp-2">
              {event.title}
            </h3>
          </div>
          <div className={cn(
            "px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border shadow-sm shrink-0 transition-colors", 
            getStatusColor(event.payment_status)
          )}>
            {getStatusLabel(event.payment_status)}
          </div>
        </div>
        
        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {event.event_date && (
            <div className="bg-secondary/20 p-4 rounded-2xl border border-border/5 transition-colors group-hover:bg-white group-hover:border-border/20">
              <div className="flex items-center gap-2 mb-1 opacity-40">
                <Calendar size={12} className="text-foreground" />
                <span className="text-[9px] font-black uppercase tracking-widest">Data</span>
              </div>
              <p className="text-sm font-bold text-foreground">
                {new Date(event.event_date).toLocaleDateString('pt-BR')}
              </p>
            </div>
          )}
          {event.event_time && (
            <div className="bg-secondary/20 p-4 rounded-2xl border border-border/5 transition-colors group-hover:bg-white group-hover:border-border/20">
              <div className="flex items-center gap-2 mb-1 opacity-40">
                <Clock size={12} className="text-foreground" />
                <span className="text-[9px] font-black uppercase tracking-widest">Horário</span>
              </div>
              <p className="text-sm font-bold text-foreground">
                {event.event_time.substring(0, 5)}h
              </p>
            </div>
          )}
        </div>

        {/* Location */}
        {event.location && (
          <div className="flex items-start gap-4 mb-8 group/loc">
            <div className="w-10 h-10 rounded-xl bg-secondary/30 flex items-center justify-center shrink-0 group-hover/loc:bg-gold/10 group-hover/loc:text-gold transition-colors">
              <MapPin size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40 mb-0.5">Localização</p>
              <p className="text-xs font-bold text-foreground/80 line-clamp-1">{event.location}</p>
            </div>
          </div>
        )}

        {/* Footer - Client & Value */}
        <div className="mt-auto pt-6 border-t border-border/10 flex items-end justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-gold/10 flex items-center justify-center text-gold border border-gold/10 shadow-sm shrink-0">
              <span className="text-xs font-black tracking-tighter">{initials}</span>
            </div>
            <div className="min-w-0">
              <p className="text-[8px] font-black uppercase text-muted-foreground/40 tracking-[0.2em] mb-0.5">Contratante</p>
              <p className="text-xs font-bold text-foreground uppercase tracking-tight line-clamp-1">
                {event.clients ? `${event.clients.first_name || ''} ${event.clients.last_name || ''}`.trim() : 
                 event.leads ? event.leads.title : 'Não Identificado'}
              </p>
            </div>
          </div>
          
          <div className="text-right shrink-0">
            <p className="text-[8px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] mb-1">Budget Total</p>
            <div className="flex items-center justify-end gap-1.5 text-gold">
              <span className="text-xs font-black">R$</span>
              <span className="font-display text-2xl tracking-tighter leading-none">
                {new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0 }).format(event.budget_value || 0)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
