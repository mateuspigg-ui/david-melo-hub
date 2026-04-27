import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, MapPin, Users, DollarSign, Clock, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Lead } from '@/pages/CRMPage';
import { cn } from '@/lib/utils';

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
    ? 'border-gold/30'
    : isOverlay
    ? 'border-gold/60 ring-4 ring-gold/10'
    : isOverdue
    ? 'border-red-400/50 ring-1 ring-red-100'
    : hasPendingTasks
    ? 'border-emerald-400/40 ring-1 ring-emerald-50'
    : 'border-border/30 hover:border-gold/30';

  const cardBg = isOverlay
    ? 'bg-white'
    : isOverdue
    ? 'bg-gradient-to-br from-red-50/50 to-white'
    : hasPendingTasks
    ? 'bg-gradient-to-br from-emerald-50/30 to-white'
    : 'bg-white/80 backdrop-blur-sm';

  return (
    <div
      ref={!isOverlay ? setNodeRef : undefined}
      style={!isOverlay ? style : undefined}
      {...(!isOverlay ? { ...attributes, ...listeners } : {})}
      onClick={onClick}
      className={cn(
        "touch-pan-y select-none p-5 rounded-2xl border cursor-grab active:cursor-grabbing transition-all duration-300",
        isDragging ? 'opacity-40 scale-[0.98] blur-[1px]' : 'hover:-translate-y-1 hover:shadow-xl',
        isOverlay ? 'shadow-2xl rotate-[1deg] scale-[1.05] z-50' : 'premium-shadow',
        cardBorder,
        cardBg
      )}
    >
      {/* Status Indicators */}
      {hasPendingTasks && (
        <div className={cn(
          "flex items-center justify-between gap-2 mb-4 rounded-xl px-3 py-2 border",
          isOverdue
            ? 'bg-red-50/80 border-red-200/50'
            : 'bg-emerald-50/80 border-emerald-200/50'
        )}>
          <div className="flex items-center gap-2">
            {isOverdue ? (
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
            ) : (
              <div className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </div>
            )}
            <span className={cn(
              "text-[9px] font-black uppercase tracking-[0.1em]",
              isOverdue ? 'text-red-700' : 'text-emerald-700'
            )}>
              {isOverdue ? 'Atrasado' : 'Ativo'} • {taskMeta!.pendingCount} {taskMeta!.pendingCount > 1 ? 'Tarefas' : 'Tarefa'}
            </span>
          </div>
          {taskMeta!.assignees.length > 0 && (
            <div className="flex -space-x-2">
              {taskMeta!.assignees.slice(0, 2).map((name, i) => (
                <div key={i} className="w-5 h-5 rounded-full border-2 border-white bg-secondary flex items-center justify-center text-[8px] font-black uppercase overflow-hidden" title={name}>
                  {name[0]}
                </div>
              ))}
              {taskMeta!.assignees.length > 2 && (
                <div className="w-5 h-5 rounded-full border-2 border-white bg-secondary flex items-center justify-center text-[7px] font-black">
                  +{taskMeta!.assignees.length - 2}
                </div>
              )}
            </div>
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
          className="w-full mb-4 h-9 rounded-xl bg-foreground text-background text-[10px] font-black uppercase tracking-[0.2em] disabled:opacity-60 hover:bg-gold transition-all hover:scale-[1.02] active:scale-[0.98] shadow-sm flex items-center justify-center gap-2"
        >
          {isCompleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          Concluir Tarefas
        </button>
      )}

      {/* Title + Badge */}
      <div className="space-y-3">
        <div className="flex justify-between items-start gap-3">
          <h4 className="text-[14px] font-bold text-foreground leading-tight tracking-tight line-clamp-2 group-hover:text-gold transition-colors">{lead.title || 'Sem titulo'}</h4>
          {lead.event_type && (
            <span className="shrink-0 bg-gold/5 text-gold text-[8px] font-black px-2 py-1 rounded-lg border border-gold/10 uppercase tracking-widest">
              {lead.event_type}
            </span>
          )}
        </div>

        {/* Client info */}
        <div className="space-y-0.5">
          {clientName && (
            <p className="text-[11px] font-black uppercase tracking-wider text-gold/80">{clientName}</p>
          )}
          {lead.phone && (
            <p className="text-[10px] font-bold text-muted-foreground/50 tracking-tight">{lead.phone}</p>
          )}
        </div>

        <div className="h-px w-full bg-gradient-to-r from-border/40 to-transparent" />

        {/* Details bento style */}
        <div className="grid grid-cols-1 gap-2.5">
          {lead.event_date && (
            <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider">
              <Calendar className="w-3.5 h-3.5 text-gold/60" />
              {format(new Date(lead.event_date + 'T00:00:00'), "dd 'de' MMM, yyyy", { locale: ptBR })}
            </div>
          )}
          
          <div className="flex flex-wrap gap-2">
            {lead.total_budget && (
              <div className="flex items-center gap-2 text-[10px] font-black text-emerald-700 bg-emerald-50/50 px-3 py-1.5 rounded-xl border border-emerald-100/50">
                <DollarSign className="w-3 h-3" />
                {Number(lead.total_budget).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </div>
            )}
            
            {(lead.event_location || lead.guest_count) && (
              <div className="flex items-center gap-3 text-[9px] text-muted-foreground/60 font-bold uppercase tracking-widest bg-secondary/30 px-3 py-1.5 rounded-xl">
                {lead.guest_count && (
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3 h-3 opacity-60" />
                    {lead.guest_count}
                  </div>
                )}
                {lead.event_location && (
                  <div className="flex items-center gap-1.5 max-w-[120px]">
                    <MapPin className="w-3 h-3 opacity-60 shrink-0" />
                    <span className="truncate">{lead.event_location}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Responsible + Date */}
        <div className="pt-3 flex items-center justify-between">
          {lead.profiles?.full_name ? (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-gold/20 to-gold/10 flex items-center justify-center text-[9px] font-black text-gold border border-gold/20 shadow-sm">
                {lead.profiles.full_name[0]}
              </div>
              <span className="text-[10px] text-muted-foreground/60 font-black uppercase tracking-wider">{lead.profiles.full_name.split(' ')[0]}</span>
            </div>
          ) : <div />}
          <div className="flex items-center gap-1.5 opacity-40 group-hover:opacity-60 transition-opacity">
            <Clock className="w-3 h-3" />
            <span className="text-[9px] font-bold">
              {format(new Date(lead.created_at), "dd/MM/yy")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
