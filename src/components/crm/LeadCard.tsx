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
    transition,
  };

  const clientName = lead.clients 
    ? `${lead.clients.first_name} ${lead.clients.last_name}`.trim() 
    : (lead.first_name || lead.last_name)
      ? `${lead.first_name || ''} ${lead.last_name || ''}`.trim()
      : null;

  return (
    <div
      ref={!isOverlay ? setNodeRef : undefined}
      style={!isOverlay ? style : undefined}
      {...(!isOverlay ? { ...attributes, ...listeners } : {})}
      onClick={onClick}
      className={`p-3.5 rounded-lg border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] ${
        isDragging ? 'opacity-40 grayscale' : ''
      } ${
        isOverlay
          ? 'shadow-2xl border-gold bg-white rotate-1'
          : isOverdue
          ? 'border-red-500 bg-red-100/80 shadow-sm shadow-red-200 hover:border-red-600'
          : hasPendingTasks
          ? 'border-emerald-500 bg-emerald-100/75 shadow-sm shadow-emerald-200 hover:border-emerald-600'
          : 'border-border/30 bg-white shadow-sm hover:border-border/50 hover:shadow-md'
      }`}
    >
      {/* Alerta de tarefas em atraso */}
      {isOverdue && (
        <div className="flex items-center gap-1.5 mb-3 bg-red-200 border border-red-400 rounded-lg px-3 py-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-red-700 shrink-0 animate-pulse" />
          <span className="text-[9px] font-black uppercase tracking-widest text-red-800">Tarefa em atraso</span>
        </div>
      )}

      {hasPendingTasks && !isOverdue && (
        <div className="flex items-center gap-1.5 mb-3 bg-emerald-200 border border-emerald-400 rounded-lg px-3 py-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-700 animate-pulse" />
          <span className="text-[9px] font-black uppercase tracking-widest text-emerald-800">Tarefa ativa</span>
        </div>
      )}

      {taskMeta && taskMeta.pendingCount > 0 && (
        <div className={`flex items-center justify-between gap-2 mb-3 rounded-lg px-3 py-1.5 border ${
          isOverdue
            ? 'bg-red-200 border-red-400'
            : 'bg-emerald-200 border-emerald-400'
        }`}>
          <span className={`text-[9px] font-black uppercase tracking-widest ${
            isOverdue ? 'text-red-800' : 'text-emerald-800'
          }`}>
            {taskMeta.pendingCount} tarefa{taskMeta.pendingCount > 1 ? 's' : ''} ativa{taskMeta.pendingCount > 1 ? 's' : ''}
          </span>
          <span className={`text-[9px] font-black uppercase tracking-widest truncate max-w-[120px] ${
            isOverdue ? 'text-red-800' : 'text-emerald-800'
          }`} title={taskMeta.assignees.join(', ') || 'Responsavel nao definido'}>
            Resp: {taskMeta.assignees.length > 0 ? `${taskMeta.assignees[0]}${taskMeta.assignees.length > 1 ? ` +${taskMeta.assignees.length - 1}` : ''}` : 'NAO DEFINIDO'}
          </span>
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
          className="w-full mb-3 h-8 rounded-md bg-foreground text-background text-[10px] font-black uppercase tracking-widest disabled:opacity-60"
        >
          {isCompleting ? <Loader2 className="w-3.5 h-3.5 inline mr-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />}
          Marcar como feita
        </button>
      )}

      <div className="flex justify-between items-start gap-2.5">
        <h4 className="text-[13px] font-semibold text-foreground leading-snug tracking-tight line-clamp-2">{lead.title}</h4>
        {lead.event_type && (
          <span className="shrink-0 bg-gold/10 text-gold text-[9px] font-bold px-2 py-0.5 rounded-md border border-gold/10">
            {lead.event_type}
          </span>
        )}
      </div>

      {clientName && (
        <p className="text-[11px] font-semibold text-gold mt-1.5 truncate">{clientName}</p>
      )}
      {lead.phone && (
        <p className="text-[10px] font-medium text-muted-foreground/70 mt-0.5 truncate">{lead.phone}</p>
      )}

      <div className="mt-3.5 space-y-2">
        {lead.event_date && (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium">
            <Calendar className="w-3.5 h-3.5 text-gold/60" />
            {format(new Date(lead.event_date + 'T00:00:00'), "dd 'de' MMM, yyyy", { locale: ptBR })}
          </div>
        )}
        
        {lead.total_budget && (
          <div className="flex items-center gap-2 text-[10px] font-bold text-foreground bg-secondary/40 w-fit px-2.5 py-1.5 rounded-md">
            <DollarSign className="w-3.5 h-3.5 text-gold" />
            {Number(lead.total_budget).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
        )}

        <div className="flex items-center gap-2.5 pt-1">
          {lead.event_location && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium truncate max-w-[150px]">
              <MapPin className="w-3.5 h-3.5 shrink-0 text-gold/60" />
              <span className="truncate">{lead.event_location}</span>
            </div>
          )}
          {lead.guest_count && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
              <Users className="w-3.5 h-3.5 text-gold/60" />
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

      {/* Data de chegada do lead */}
      <div className={`flex items-center gap-1.5 ${lead.profiles?.full_name ? 'mt-2' : 'mt-4 pt-3 border-t border-border/10'}`}>
        <Clock className="w-3 h-3 text-gold/40 shrink-0" />
        <span className="text-[9px] text-muted-foreground/50 font-medium italic">
          Lead desde {format(new Date(lead.created_at), "dd/MM/yyyy", { locale: ptBR })}
        </span>
      </div>
    </div>
  );
}
