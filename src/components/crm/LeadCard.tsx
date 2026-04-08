import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, MapPin, Users, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Lead } from '@/pages/CRMPage';

interface Props {
  lead: Lead;
  onClick?: () => void;
  isOverlay?: boolean;
}

export default function LeadCard({ lead, onClick, isOverlay }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const clientName = lead.clients ? `${lead.clients.first_name} ${lead.clients.last_name}`.trim() : null;

  return (
    <div
      ref={!isOverlay ? setNodeRef : undefined}
      style={!isOverlay ? style : undefined}
      {...(!isOverlay ? { ...attributes, ...listeners } : {})}
      onClick={onClick}
      className={`p-4 rounded-xl border cursor-pointer transition-all duration-300 hover:border-gold/40 hover:-translate-y-1 active:scale-[0.98] ${
        isDragging ? 'opacity-40 grayscale' : ''
      } ${isOverlay ? 'shadow-2xl border-gold bg-card rotate-2' : 'border-border/40 bg-card premium-shadow hover:shadow-gold/10'}`}
    >
      <div className="flex justify-between items-start gap-2">
        <h4 className="text-xs font-bold text-foreground leading-tight tracking-tight line-clamp-2 uppercase">{lead.title}</h4>
        {lead.event_type && (
          <span className="shrink-0 bg-gold/10 text-gold text-[8px] font-bold px-1.5 py-0.5 rounded uppercase border border-gold/10">
            {lead.event_type}
          </span>
        )}
      </div>

      {clientName && (
        <p className="text-[10px] font-bold text-gold mt-1.5 truncate tracking-wide">{clientName}</p>
      )}

      <div className="mt-4 space-y-2">
        {lead.event_date && (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium">
            <Calendar className="w-3 h-3 text-gold/60" />
            {format(new Date(lead.event_date + 'T00:00:00'), "dd 'de' MMM, yyyy", { locale: ptBR })}
          </div>
        )}
        
        {lead.total_budget && (
          <div className="flex items-center gap-2 text-[10px] font-bold text-foreground bg-secondary/30 w-fit px-2 py-1 rounded-md">
            <DollarSign className="w-3 h-3 text-gold" />
            {Number(lead.total_budget).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          {lead.event_location && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium truncate max-w-[120px]">
              <MapPin className="w-3 h-3 shrink-0 text-gold/60" />
              <span className="truncate">{lead.event_location}</span>
            </div>
          )}
          {lead.guest_count && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
              <Users className="w-3 h-3 text-gold/60" />
              {lead.guest_count}
            </div>
          )}
        </div>
      </div>

      {lead.profiles?.full_name && (
        <div className="mt-4 pt-3 border-t border-border/10 flex items-center justify-between">
          <div className="flex items-center gap-1.5 grayscale opacity-70">
            <div className="w-4 h-4 rounded-full bg-secondary flex items-center justify-center text-[8px] font-bold">
              {lead.profiles.full_name[0]}
            </div>
            <span className="text-[9px] text-muted-foreground font-bold tracking-tight">{lead.profiles.full_name}</span>
          </div>
        </div>
      )}
    </div>
  );
}
