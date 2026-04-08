import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import LeadCard from './LeadCard';
import type { Lead } from '@/pages/CRMPage';

interface Props {
  stage: { id: string; label: string; color: string };
  leads: Lead[];
  onCardClick: (lead: Lead) => void;
}

export default function KanbanColumn({ stage, leads, onCardClick }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      className={`min-w-[270px] flex-1 rounded-xl border transition-colors ${
        isOver ? 'border-gold/60 bg-gold/5' : 'border-border/30 bg-card/30'
      }`}
    >
      <div className="p-3 border-b border-border/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
            <span className="text-sm font-medium text-foreground">{stage.label}</span>
          </div>
          <span className="text-xs text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-full">
            {leads.length}
          </span>
        </div>
      </div>
      <div className="p-2 space-y-2 min-h-[120px] max-h-[calc(100vh-320px)] overflow-y-auto">
        <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map(lead => (
            <LeadCard key={lead.id} lead={lead} onClick={() => onCardClick(lead)} />
          ))}
        </SortableContext>
        {leads.length === 0 && (
          <div className="text-center py-8 text-xs text-muted-foreground/50">
            Nenhum lead
          </div>
        )}
      </div>
    </div>
  );
}
