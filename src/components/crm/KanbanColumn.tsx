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
      className={`min-w-[300px] flex-1 rounded-2xl border transition-all duration-300 ${
        isOver 
          ? 'border-gold bg-gold/5 shadow-lg shadow-gold/10' 
          : 'border-border/40 bg-secondary/10'
      }`}
    >
      <div className="p-4 border-b border-border/20 bg-white/40 backdrop-blur-sm rounded-t-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: stage.color }} />
            <span className="text-xs font-bold text-foreground uppercase tracking-widest">{stage.label}</span>
          </div>
          <span className="text-[10px] font-bold text-gold bg-gold/10 px-2.5 py-1 rounded-full border border-gold/10">
            {leads.length}
          </span>
        </div>
      </div>
      <div className="p-3 space-y-3 min-h-[120px] max-h-[calc(100vh-350px)] overflow-y-auto no-scrollbar">
        <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map(lead => (
            <LeadCard key={lead.id} lead={lead} onClick={() => onCardClick(lead)} />
          ))}
        </SortableContext>
        {leads.length === 0 && (
          <div className="text-center py-12 flex flex-col items-center justify-center opacity-30 grayscale">
            <div className="w-8 h-8 rounded-full border-2 border-dashed border-foreground/30 mb-2" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground">Vazio</p>
          </div>
        )}
      </div>
    </div>
  );
}
