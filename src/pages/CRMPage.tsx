import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import KanbanColumn from '@/components/crm/KanbanColumn';
import LeadCard from '@/components/crm/LeadCard';
import LeadFormDialog from '@/components/crm/LeadFormDialog';
import LeadDetailDialog from '@/components/crm/LeadDetailDialog';

const STAGES = [
  { id: 'novo_contato', label: 'Novo Contato', color: 'hsl(var(--gold))' },
  { id: 'orcamento_enviado', label: 'Orçamento Enviado', color: 'hsl(210 60% 50%)' },
  { id: 'em_negociacao', label: 'Em Negociação', color: 'hsl(35 80% 55%)' },
  { id: 'fechados', label: 'Fechados', color: 'hsl(142 60% 45%)' },
  { id: 'perdidos', label: 'Perdidos', color: 'hsl(0 60% 50%)' },
];

const EVENT_TYPES = [
  { value: 'casamento', label: 'Casamento' },
  { value: '15_anos', label: '15 Anos' },
  { value: 'formatura', label: 'Formatura' },
  { value: 'aniversario', label: 'Aniversário' },
  { value: 'bodas', label: 'Bodas' },
  { value: 'corporativo', label: 'Corporativo' },
];

export type Lead = {
  id: string;
  title: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  client_id: string | null;
  stage: string;
  event_type: string | null;
  event_location: string | null;
  event_date: string | null;
  event_time: string | null;
  guest_count: number | null;
  total_budget: number | null;
  notes: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  clients?: { first_name: string; last_name: string } | null;
  profiles?: { full_name: string } | null;
};

export default function CRMPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*, clients(first_name, last_name), profiles:assigned_to(full_name)')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, first_name, last_name').order('first_name');
      if (error) throw error;
      return data;
    },
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name').order('full_name');
      if (error) throw error;
      return data;
    },
  });

  const { data: leadTaskMeta = {} } = useQuery({
    queryKey: ['lead_task_meta', teamMembers.length],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_tasks')
        .select('lead_id, status, assigned_to');
      if (error) throw error;

      const meta: Record<string, { pendingCount: number; assignees: string[] }> = {};
      const memberById = new Map((teamMembers || []).map((m: any) => [m.id, m.full_name]));

      (data || []).forEach((task: any) => {
        const leadId = task.lead_id as string;
        if (!meta[leadId]) meta[leadId] = { pendingCount: 0, assignees: [] };
        if (task.status !== 'done') {
          meta[leadId].pendingCount += 1;
          const assigneeName = task.assigned_to ? memberById.get(task.assigned_to) : null;
          if (assigneeName && !meta[leadId].assignees.includes(assigneeName)) {
            meta[leadId].assignees.push(assigneeName);
          }
        }
      });

      return meta;
    },
  });

  // Busca leads com tarefas pendentes vencidas — falha silenciosamente se o banco não suportar
  const { data: overdueLeadIds = new Set<string>() } = useQuery({
    queryKey: ['overdue_leads'],
    queryFn: async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase
          .from('lead_tasks')
          .select('lead_id')
          .neq('status', 'done')
          .lt('due_date', today)
          .not('due_date', 'is', null);
        if (error) return new Set<string>(); // falha silenciosa
        return new Set((data ?? []).map(t => t.lead_id as string));
      } catch {
        return new Set<string>();
      }
    },
    refetchInterval: 60_000,
    retry: false, // não retentar em caso de erro
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const { error } = await supabase.from('leads').update({ stage }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_kpis'] });
    },
    onError: () => toast({ title: 'Erro ao mover lead', variant: 'destructive' }),
  });

  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      const leadName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim();
      const matchesSearch = !search || 
        lead.title.toLowerCase().includes(search.toLowerCase()) ||
        (lead.clients && `${lead.clients.first_name} ${lead.clients.last_name}`.toLowerCase().includes(search.toLowerCase())) ||
        (lead.event_location && lead.event_location.toLowerCase().includes(search.toLowerCase())) ||
        leadName.toLowerCase().includes(search.toLowerCase()) ||
        (lead.phone && lead.phone.includes(search));
      const matchesType = filterType === 'all' || lead.event_type === filterType;
      return matchesSearch && matchesType;
    });
  }, [leads, search, filterType]);

  const leadsByStage = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    STAGES.forEach(s => { map[s.id] = []; });
    filteredLeads.forEach(lead => {
      if (map[lead.stage]) map[lead.stage].push(lead);
    });
    return map;
  }, [filteredLeads]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

    const leadId = active.id as string;
    const overId = over.id as string;

    // over.id can be a stage ID (dropped on empty column area)
    // or a card ID (dropped on top of another card) – resolve to stage either way
    const isStage = STAGES.some(s => s.id === overId);
    let newStage: string;

    if (isStage) {
      newStage = overId;
    } else {
      // overId is a lead id – find which stage that lead belongs to
      const targetLead = leads.find(l => l.id === overId);
      if (!targetLead) return;
      newStage = targetLead.stage;
    }

    const lead = leads.find(l => l.id === leadId);
    if (lead && lead.stage !== newStage) {
      updateStageMutation.mutate({ id: leadId, stage: newStage });
    }
  };

  const activeLead = activeDragId ? leads.find(l => l.id === activeDragId) : null;

  return (
    <div className="space-y-8 animate-fade-in max-w-[1900px] mx-auto p-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-display text-foreground tracking-tighter uppercase">Gestão Comercial</h1>
          <p className="text-sm text-muted-foreground mt-1 font-body">Pipeline estratégico de leads e oportunidades</p>
        </div>
        <Button 
          onClick={() => { setEditingLead(null); setIsFormOpen(true); }} 
          className="bg-gradient-gold hover:opacity-90 text-white font-bold h-11 px-6 rounded-lg shadow-gold uppercase text-[11px] tracking-widest"
        >
          <Plus className="w-5 h-5 mr-2" /> Novo Lead
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por título, cliente ou local..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            className="pl-11 bg-secondary/30 border-border/40 focus:border-gold h-11 rounded-xl" 
          />
        </div>
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-gold" />
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[180px] bg-secondary/30 border-border/40 h-11 rounded-xl focus:ring-gold font-medium">
              <SelectValue placeholder="Tipo de evento" />
            </SelectTrigger>
            <SelectContent className="bg-white border-border/40 rounded-xl shadow-2xl">
              <SelectItem value="all" className="font-medium text-xs">Todos os tipos</SelectItem>
              {EVENT_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value} className="font-medium text-xs font-bold">{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex gap-5 overflow-x-auto pb-6 px-1 snap-x snap-mandatory">
          {STAGES.map(s => (
            <div key={s.id} className="min-w-[340px] flex-1 bg-card/50 rounded-xl p-4 border border-border/30 animate-pulse h-[420px]" />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-5 overflow-x-auto pb-6 px-1 snap-x snap-mandatory">
            {STAGES.map(stage => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                leads={leadsByStage[stage.id] || []}
                onCardClick={setDetailLead}
                overdueLeadIds={overdueLeadIds}
                leadTaskMeta={leadTaskMeta}
              />
            ))}
          </div>
          <DragOverlay>
            {activeLead && <LeadCard lead={activeLead} isOverlay taskMeta={leadTaskMeta[activeLead.id]} />}
          </DragOverlay>
        </DndContext>
      )}

      <LeadFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        lead={editingLead}
        clients={clients}
        teamMembers={teamMembers}
        stages={STAGES}
        eventTypes={EVENT_TYPES}
      />

      <LeadDetailDialog
        lead={detailLead}
        onClose={() => setDetailLead(null)}
        onEdit={(lead) => { setDetailLead(null); setEditingLead(lead); setIsFormOpen(true); }}
        clients={clients}
        teamMembers={teamMembers}
        stages={STAGES}
        eventTypes={EVENT_TYPES}
      />
    </div>
  );
}
