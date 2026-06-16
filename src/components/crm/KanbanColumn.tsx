import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Trash2 } from 'lucide-react';
import LeadCard from './LeadCard';
import type { Lead } from '@/pages/CRMPage';
import { cn } from '@/lib/utils';

interface Stage {
  id: string;
  label: string;
  color: string;
  position: number;
  is_default?: boolean;
}

interface Props {
  stage: Stage;
  leads: Lead[];
  onCardClick: (lead: Lead) => void;
  onCompleteTasks: (leadId: string) => void;
  completingLeadId: string | null;
  overdueLeadIds: Set<string>;
  leadTaskMeta: Record<string, { pendingCount: number; assignees: string[] }>;
  onEditColumn?: (stage: Stage) => void;
  onDeleteColumn?: (stage: Stage) => void;
  isDraggingColumn?: boolean;
}

export default function KanbanColumn({
  stage,
  leads,
  onCardClick,
  onCompleteTasks,
  completingLeadId,
  overdueLeadIds,
  leadTaskMeta,
  onEditColumn,
  onDeleteColumn,
  isDraggingColumn,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging: isColumnDragging,
  } = useSortable({ id: `column-${stage.id}`, data: { type: 'column', stage } });

  const {
    setNodeRef: setDroppableRef,
    isOver,
  } = useDroppable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isColumnDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setSortableRef}
      style={style}
      className={cn(
        "w-[340px] shrink-0 rounded-[28px] border-2 transition-colors duration-200 snap-start flex flex-col h-full min-h-[460px]",
        isColumnDragging
          ? 'border-gold/50 shadow-2xl shadow-gold/20 z-50'
          : isOver
            ? 'border-gold/50 bg-gold/[0.05] shadow-xl shadow-gold/10 ring-2 ring-gold/20'
            : 'border-transparent bg-white/40 backdrop-blur-sm'
      )}
    >
      <div
        ref={setDroppableRef}
        className="p-6 border-b border-border/10"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-gold transition-colors"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="w-4 h-4" />
            </button>
            <div className="w-3.5 h-3.5 rounded-full shadow-gold-sm ring-4 ring-white" style={{ backgroundColor: stage.color }} />
            <h3 className="text-[11px] font-black text-foreground tracking-[0.1em] uppercase">{stage.label}</h3>
          </div>
          <div className="flex items-center gap-1">
            {onEditColumn && (
              <button
                type="button"
                onClick={() => onEditColumn(stage)}
                className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-gold hover:bg-gold/10 transition-all"
                title="Editar coluna"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
            {onDeleteColumn && !stage.is_default && (
              <button
                type="button"
                onClick={() => onDeleteColumn(stage)}
                className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all"
                title="Excluir coluna"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
            <span className="text-[10px] font-black text-gold/80 bg-gold/5 px-3 py-1 rounded-full border border-gold/10 shadow-sm min-w-[32px] text-center">
              {leads.length}
            </span>
          </div>
        </div>
      </div>

      <div className={cn(
        "flex-1 p-3 space-y-3 overflow-y-auto no-scrollbar transition-colors duration-300",
        isOver ? 'bg-gold/[0.02]' : ''
      )}>
        <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map(lead => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onClick={() => onCardClick(lead)}
              onCompleteTasks={() => onCompleteTasks(lead.id)}
              isCompleting={completingLeadId === lead.id}
              isOverdue={overdueLeadIds.has(lead.id)}
              taskMeta={leadTaskMeta[lead.id]}
            />
          ))}
        </SortableContext>

        {leads.length === 0 && !isOver && (
          <div className="flex-1 flex flex-col items-center justify-center py-20 opacity-20 group/empty">
            <div className="w-16 h-16 rounded-[20px] border-2 border-dashed border-foreground/30 mb-4 flex items-center justify-center transition-all group-hover/empty:scale-110 group-hover/empty:border-gold/50 group-hover/empty:text-gold">
              <span className="text-foreground/40 text-2xl font-light">+</span>
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/60 group-hover/empty:text-gold transition-colors">Pronto para leads</p>
          </div>
        )}

        {isOver && (
          <div className="h-24 rounded-2xl border-2 border-dashed border-gold/30 bg-gold/5 animate-pulse flex items-center justify-center">
            <p className="text-[9px] font-black uppercase tracking-widest text-gold/60">Solte para mover</p>
          </div>
        )}
      </div>
    </div>
  );
}
