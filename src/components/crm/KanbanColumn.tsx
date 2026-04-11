import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import LeadCard from './LeadCard';
import type { Lead } from '@/pages/CRMPage';

interface Props {
  stage: { id: string; label: string; color: string };
  leads: Lead[];
  onCardClick: (lead: Lead) => void;
  onCompleteTasks: (leadId: string) => void;
  completingLeadId: string | null;
  overdueLeadIds: Set<string>;
  leadTaskMeta: Record<string, { pendingCount: number; assignees: string[] }>;
}

export default function KanbanColumn({ stage, leads, onCardClick, onCompleteTasks, completingLeadId, overdueLeadIds, leadTaskMeta }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      className={`min-w-[320px] max-w-[360px] flex-1 rounded-2xl border-2 transition-all duration-200 snap-start ${
        isOver 
          ? 'border-gold/60 bg-gold/[0.04] shadow-lg shadow-gold/10 scale-[1.01]' 
          : 'border-transparent bg-secondary/40'
      }`}
    >
      <div className="p-4 border-b border-border/15 rounded-t-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-3 h-3 rounded-full shadow-sm ring-2 ring-white" style={{ backgroundColor: stage.color }} />
            <span className="text-[11px] font-black text-foreground tracking-tight uppercase">{stage.label}</span>
          </div>
          <span className="text-[11px] font-black text-foreground/70 bg-white/80 px-2.5 py-1 rounded-lg border border-border/20 shadow-sm min-w-[28px] text-center">
            {leads.length}
          </span>
        </div>
      </div>
      <div className={`p-2.5 space-y-2 min-h-[200px] max-h-[calc(100vh-300px)] overflow-y-auto no-scrollbar transition-colors duration-200 ${isOver ? 'bg-gold/[0.03]' : ''}`}>
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
          <div className="text-center py-12 flex flex-col items-center justify-center opacity-30">
            <div className="w-10 h-10 rounded-xl border-2 border-dashed border-foreground/20 mb-3 flex items-center justify-center">
              <span className="text-foreground/30 text-lg">+</span>
            </div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-foreground/60">Arraste aqui</p>
          </div>
        )}
        {isOver && <div className="h-10 rounded-xl border-2 border-dashed border-gold/40 bg-gold/5 animate-pulse" />}
      </div>
    </div>
  );
}
