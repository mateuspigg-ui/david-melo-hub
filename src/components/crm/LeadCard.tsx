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
      className={`p-3 rounded-lg border cursor-pointer transition-all hover:border-gold/40 hover:shadow-md ${
        isDragging ? 'opacity-40' : ''
      } ${isOverlay ? 'shadow-xl border-gold/50 bg-card rotate-2' : 'border-border/30 bg-card/80'}`}
    >
      <h4 className="text-sm font-medium text-foreground truncate">{lead.title}</h4>
      {clientName && (
        <p className="text-xs text-gold mt-1 truncate">{clientName}</p>
      )}
      <div className="mt-2 space-y-1">
        {lead.event_date && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3" />
            {format(new Date(lead.event_date + 'T00:00:00'), "dd MMM yyyy", { locale: ptBR })}
          </div>
        )}
        {lead.event_location && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{lead.event_location}</span>
          </div>
        )}
        {lead.total_budget && (
          <div className="flex items-center gap-1.5 text-xs text-gold/80">
            <DollarSign className="w-3 h-3" />
            {Number(lead.total_budget).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
        )}
        {lead.guest_count && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="w-3 h-3" />
            {lead.guest_count} convidados
          </div>
        )}
      </div>
      {lead.profiles?.full_name && (
        <div className="mt-2 pt-2 border-t border-border/20">
          <span className="text-[10px] text-muted-foreground/70">Responsável: {lead.profiles.full_name}</span>
        </div>
      )}
    </div>
  );
}
