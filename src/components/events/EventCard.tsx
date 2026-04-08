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
      className="glass-card bg-dark-card rounded-xl p-5 border border-border/30 hover:border-gold/50 transition-all cursor-pointer shadow-sm hover:shadow-gold/10"
      onClick={() => onClick(event)}
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-semibold text-lg text-foreground line-clamp-1">{event.title}</h3>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gold/10 text-gold border border-gold/20 mt-1">
            {event.event_type || 'Evento'}
          </span>
        </div>
        <span className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border", getStatusColor(event.payment_status))}>
          {getStatusLabel(event.payment_status)}
        </span>
      </div>
      
      <div className="space-y-3 text-sm text-foreground/80 mb-4">
        {event.event_date && (
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-gold shrink-0" />
            <span>{new Date(event.event_date).toLocaleDateString('pt-BR')}</span>
            {event.event_time && (
              <>
                <Clock size={16} className="text-gold shrink-0 ml-2" />
                <span>{event.event_time.substring(0, 5)}</span>
              </>
            )}
          </div>
        )}

        {event.location && (
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-gold shrink-0" />
            <span className="line-clamp-1">{event.location}</span>
          </div>
        )}

        {(event.client_id || event.lead_id) && (
          <div className="flex items-center gap-2 pt-2 mt-2 border-t border-border/10">
            <User size={16} className="text-gold shrink-0" />
            <span className="line-clamp-1 text-foreground/90 font-medium">
              {event.clients ? `${event.clients.first_name || ''} ${event.clients.last_name || ''}`.trim() : 
               event.leads ? event.leads.title : 'Cliente não identificado'}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-border/30 text-gold">
        <DollarSign size={18} />
        <span className="font-semibold text-lg">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(event.budget_value || 0)}
        </span>
      </div>
    </div>
  );
};
