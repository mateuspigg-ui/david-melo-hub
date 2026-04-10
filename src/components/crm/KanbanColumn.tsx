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
      className={`min-w-[320px] max-w-[360px] flex-1 rounded-xl border transition-all duration-300 snap-start ${
        isOver 
          ? 'border-gold bg-secondary/70 shadow-md shadow-gold/10' 
          : 'border-border/30 bg-secondary/60'
      }`}
    >
      <div className="p-3.5 border-b border-border/20 bg-secondary/40 rounded-t-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: stage.color }} />
            <span className="text-[12px] font-bold text-foreground tracking-tight">{stage.label}</span>
          </div>
          <span className="text-[11px] font-bold text-foreground/80 bg-white/70 px-2 py-0.5 rounded-md border border-border/30">
            {leads.length}
          </span>
        </div>
      </div>
      <div className="p-2.5 space-y-2.5 min-h-[140px] max-h-[calc(100vh-300px)] overflow-y-auto no-scrollbar">
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
        {leads.length === 0 && (
          <div className="text-center py-10 flex flex-col items-center justify-center opacity-40">
            <div className="w-8 h-8 rounded-full border-2 border-dashed border-foreground/30 mb-2" />
            <p className="text-[10px] font-bold uppercase tracking-wide text-foreground">Sem cards</p>
          </div>
        )}
      </div>
    </div>
  );
}
