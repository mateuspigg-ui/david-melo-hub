import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, MapPin, Users, DollarSign, Clock, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Lead } from '@/pages/CRMPage';

interface Props {
  lead: Lead;
  onClick?: () => void;
  onCompleteTasks?: () => void;
  isCompleting?: boolean;
  isOverlay?: boolean;
  isOverdue?: boolean;
  taskMeta?: {
    pendingCount: number;
    assignees: string[];
  };
}

export default function LeadCard({ lead, onClick, onCompleteTasks, isCompleting = false, isOverlay, isOverdue = false, taskMeta }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id });
  const hasPendingTasks = (taskMeta?.pendingCount || 0) > 0;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : transition,
  };

  const clientName = lead.clients 
    ? `${lead.clients.first_name} ${lead.clients.last_name}`.trim() 
    : (lead.first_name || lead.last_name)
      ? `${lead.first_name || ''} ${lead.last_name || ''}`.trim()
      : null;

  const cardBorder = isDragging
    ? ''
    : isOverlay
    ? 'border-gold/60 ring-2 ring-gold/20'
    : isOverdue
    ? 'border-red-400/70 ring-1 ring-red-200'
    : hasPendingTasks
    ? 'border-emerald-400/60 ring-1 ring-emerald-100'
    : 'border-border/40 hover:border-gold/40';

  const cardBg = isOverlay
    ? 'bg-white'
    : isOverdue
    ? 'bg-gradient-to-br from-red-50 to-white'
    : hasPendingTasks
    ? 'bg-gradient-to-br from-emerald-50/80 to-white'
    : 'bg-white';

  return (
    <div
      ref={!isOverlay ? setNodeRef : undefined}
      style={!isOverlay ? style : undefined}
      {...(!isOverlay ? { ...attributes, ...listeners } : {})}
      onClick={onClick}
      className={`touch-pan-y select-none p-4 rounded-xl border cursor-grab active:cursor-grabbing transition-all duration-200 ${
        isDragging ? 'opacity-30 scale-[0.97]' : 'hover:-translate-y-0.5 hover:shadow-lg'
      } ${
        isOverlay ? 'shadow-[0_16px_48px_-10px_rgba(0,0,0,0.3)] rotate-[2deg] scale-[1.04]' : 'shadow-sm'
      } ${cardBorder} ${cardBg}`}
    >
      {/* Status badge - unified (no duplicates) */}
      {hasPendingTasks && (
        <div className={`flex items-center justify-between gap-2 mb-3 rounded-lg px-3 py-2 ${
          isOverdue
            ? 'bg-red-100 border border-red-300/60'
            : 'bg-emerald-100 border border-emerald-300/60'
        }`}>
          <div className="flex items-center gap-1.5">
            {isOverdue ? (
              <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
            )}
            <span className={`text-[9px] font-black uppercase tracking-widest ${
              isOverdue ? 'text-red-700' : 'text-emerald-700'
            }`}>
              {isOverdue ? 'Atraso' : ''} {taskMeta!.pendingCount} tarefa{taskMeta!.pendingCount > 1 ? 's' : ''}
            </span>
          </div>
          {taskMeta!.assignees.length > 0 && (
            <span className={`text-[8px] font-bold uppercase tracking-wider truncate max-w-[100px] ${
              isOverdue ? 'text-red-600' : 'text-emerald-600'
            }`} title={taskMeta!.assignees.join(', ')}>
              {taskMeta!.assignees[0]}{taskMeta!.assignees.length > 1 ? ` +${taskMeta!.assignees.length - 1}` : ''}
            </span>
          )}
        </div>
      )}

      {hasPendingTasks && onCompleteTasks && !isOverlay && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onCompleteTasks();
          }}
          disabled={isCompleting}
          className="w-full mb-3 h-7 rounded-lg bg-foreground/90 text-background text-[9px] font-black uppercase tracking-widest disabled:opacity-60 hover:bg-foreground transition-colors"
        >
          {isCompleting ? <Loader2 className="w-3 h-3 inline mr-1 animate-spin" /> : <CheckCircle2 className="w-3 h-3 inline mr-1" />}
          Concluir
        </button>
      )}

      {/* Title + event type */}
      <div className="flex justify-between items-start gap-2">
        <h4 className="text-[13px] font-bold text-foreground leading-snug tracking-tight line-clamp-2">{lead.title}</h4>
        {lead.event_type && (
          <span className="shrink-0 bg-gold/10 text-gold text-[8px] font-black px-2 py-0.5 rounded-md border border-gold/15 uppercase tracking-wider">
            {lead.event_type}
          </span>
        )}
      </div>

      {/* Client */}
      {clientName && (
        <p className="text-[11px] font-semibold text-gold/90 mt-1.5 truncate">{clientName}</p>
      )}
      {lead.phone && (
        <p className="text-[10px] font-medium text-muted-foreground/60 mt-0.5 truncate">{lead.phone}</p>
      )}

      {/* Details */}
      <div className="mt-3 space-y-1.5">
        {lead.event_date && (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium">
            <Calendar className="w-3.5 h-3.5 text-gold/50" />
            {format(new Date(lead.event_date + 'T00:00:00'), "dd 'de' MMM, yyyy", { locale: ptBR })}
          </div>
        )}
        
        {lead.total_budget && (
          <div className="flex items-center gap-2 text-[10px] font-bold text-foreground/90 bg-gold/5 w-fit px-2.5 py-1 rounded-md border border-gold/10">
            <DollarSign className="w-3.5 h-3.5 text-gold" />
            {Number(lead.total_budget).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
        )}

        <div className="flex items-center gap-3 pt-0.5">
          {lead.event_location && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70 font-medium truncate max-w-[140px]">
              <MapPin className="w-3 h-3 shrink-0 text-gold/40" />
              <span className="truncate">{lead.event_location}</span>
            </div>
          )}
          {lead.guest_count && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70 font-medium">
              <Users className="w-3 h-3 text-gold/40" />
              {lead.guest_count}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 pt-2.5 border-t border-border/10 flex items-center justify-between">
        {lead.profiles?.full_name ? (
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-gold/15 flex items-center justify-center text-[8px] font-black text-gold">
              {lead.profiles.full_name[0]}
            </div>
            <span className="text-[9px] text-muted-foreground/70 font-bold">{lead.profiles.full_name}</span>
          </div>
        ) : <span />}
        <div className="flex items-center gap-1">
          <Clock className="w-2.5 h-2.5 text-muted-foreground/30" />
          <span className="text-[8px] text-muted-foreground/40 font-medium">
            {format(new Date(lead.created_at), "dd/MM/yy", { locale: ptBR })}
          </span>
        </div>
      </div>
    </div>
  );
}
