import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners, MouseSensor, pointerWithin, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Filter, Columns3 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import KanbanColumn from '@/components/crm/KanbanColumn';
import LeadCard from '@/components/crm/LeadCard';
import LeadFormDialog from '@/components/crm/LeadFormDialog';
import LeadDetailDialog from '@/components/crm/LeadDetailDialog';
import ColumnFormDialog from '@/components/crm/ColumnFormDialog';
import { publishLeadAlert } from '@/lib/leadAlerts';

const DEFAULT_STAGES = [
  { id: 'novo_contato', label: 'Novo Contato', color: 'hsl(var(--gold))', position: 0, is_default: true },
  { id: 'orcamento_enviado', label: 'Orçamento Enviado', color: 'hsl(210 60% 50%)', position: 1, is_default: true },
  { id: 'cliente_em_contato', label: 'Cliente em Contato', color: 'hsl(48 95% 52%)', position: 2, is_default: true },
  { id: 'em_negociacao', label: 'Em Negociação', color: 'hsl(35 80% 55%)', position: 3, is_default: true },
  { id: 'fechados', label: 'Fechados', color: 'hsl(142 60% 45%)', position: 4, is_default: true },
  { id: 'perdidos', label: 'Perdidos', color: 'hsl(0 60% 50%)', position: 5, is_default: true },
];

export type KanbanStage = {
  id: string;
  label: string;
  color: string;
  position: number;
  is_default?: boolean;
};

const EVENT_TYPES = [
  { value: 'casamento', label: 'Casamento' },
  { value: '15_anos', label: '15 Anos' },
  { value: 'formatura', label: 'Formatura' },
  { value: 'aniversario', label: 'Aniversário' },
  { value: 'bodas', label: 'Bodas' },
  { value: 'corporativo', label: 'Corporativo' },
];

export type LeadFile = {
  id: string;
  lead_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
};

export type Lead = {
  id: string;
  title: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  client_id: string | null;
  stage: string;
  event_type: string | null;
  service_type: string | null;
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
  lead_files?: LeadFile[];
};

export default function CRMPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterEventDate, setFilterEventDate] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [completingLeadId, setCompletingLeadId] = useState<string | null>(null);
  const [columnFormOpen, setColumnFormOpen] = useState(false);
  const [editingColumn, setEditingColumn] = useState<KanbanStage | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } }),
  );

  const collisionDetectionStrategy = (args: any) => {
    const pointerIntersections = pointerWithin(args);
    if (pointerIntersections.length > 0) return pointerIntersections;
    return closestCorners(args);
  };

  // Fetch kanban stages from DB
  const { data: stages = DEFAULT_STAGES, isLoading: isLoadingStages } = useQuery({
    queryKey: ['kanban_stages'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('kanban_stages')
          .select('*')
          .order('position', { ascending: true });
        if (error || !data?.length) return DEFAULT_STAGES;
        return data as KanbanStage[];
      } catch {
        return DEFAULT_STAGES;
      }
    },
    retry: false,
  });

  // Create stage mutation
  const createStageMutation = useMutation({
    mutationFn: async ({ label, color }: { label: string; color: string }) => {
      const maxPos = stages.reduce((max, s) => Math.max(max, s.position), -1);
      const id = `custom_${Date.now()}`;
      const { error } = await supabase.from('kanban_stages').insert({
        id,
        label,
        color,
        position: maxPos + 1,
        is_default: false,
      });
      if (error) throw error;
      return { id, label, color, position: maxPos + 1, is_default: false };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban_stages'] });
      toast({ title: 'Coluna criada com sucesso!' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao criar coluna', description: error?.message || 'Tente novamente.', variant: 'destructive' });
    },
  });

  // Update stage mutation
  const updateStageMutation = useMutation({
    mutationFn: async ({ id, label, color }: { id: string; label: string; color: string }) => {
      const { error } = await supabase.from('kanban_stages').update({ label, color }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban_stages'] });
      toast({ title: 'Coluna atualizada!' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao atualizar coluna', description: error?.message || 'Tente novamente.', variant: 'destructive' });
    },
  });

  // Delete stage mutation
  const deleteStageMutation = useMutation({
    mutationFn: async (stageId: string) => {
      const leadsInStage = leads.filter(l => l.stage === stageId);
      if (leadsInStage.length > 0) {
        throw new Error('Não é possível excluir uma coluna que contém leads. Mova os leads para outra coluna primeiro.');
      }
      const { error } = await supabase.from('kanban_stages').delete().eq('id', stageId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban_stages'] });
      toast({ title: 'Coluna excluída!' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao excluir coluna', description: error?.message || 'Tente novamente.', variant: 'destructive' });
    },
  });

  // Reorder stages mutation
  const reorderStagesMutation = useMutation({
    mutationFn: async (orderedStages: KanbanStage[]) => {
      const updates = orderedStages.map((s, i) =>
        supabase.from('kanban_stages').update({ position: i }).eq('id', s.id)
      );
      await Promise.all(updates);
    },
    onMutate: async (orderedStages) => {
      await queryClient.cancelQueries({ queryKey: ['kanban_stages'] });
      const previousStages = queryClient.getQueryData<KanbanStage[]>(['kanban_stages']) || DEFAULT_STAGES;
      queryClient.setQueryData<KanbanStage[]>(['kanban_stages'], orderedStages);
      return { previousStages };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousStages) {
        queryClient.setQueryData(['kanban_stages'], context.previousStages);
      }
      toast({ title: 'Erro ao reordenar colunas', variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban_stages'] });
    },
  });

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*, clients(first_name, last_name), profiles:assigned_to(full_name), lead_files(id, file_name, file_url, file_type, file_size, created_at)')
        .order('updated_at', { ascending: false });
      if (error) return [];
      return (data || []) as Lead[];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, first_name, last_name').order('first_name');
      if (error) return [];
      return data || [];
    },
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data: rpcData, error: rpcError } = await (supabase as any).rpc('get_team_members_for_assignment');
      if (!rpcError && Array.isArray(rpcData)) {
        return rpcData.filter((p: any) => !!p?.id);
      }

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('role', ['team_member', 'admin'])
        .order('full_name');

      if (profilesError) return [];
      return (profiles || []).filter((p: any) => !!p?.id);
    },
  });

  const { data: leadTaskMeta = {} } = useQuery({
    queryKey: ['lead_task_meta', teamMembers.length],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_tasks')
        .select('lead_id, status, assigned_to');
      if (error) return {};

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
        if (error) return new Set<string>();
        return new Set((data ?? []).map(t => t.lead_id as string));
      } catch {
        return new Set<string>();
      }
    },
    refetchInterval: 60_000,
    retry: false,
  });

  const updateLeadStageMutation = useMutation({
    mutationFn: async ({ id, stage, previousStage }: { id: string; stage: string; previousStage: string }) => {
      const { error } = await supabase.from('leads').update({ stage }).eq('id', id);
      if (error) throw error;
      return { id, stage, previousStage };
    },
    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: ['leads'] });
      const previousLeads = queryClient.getQueryData<Lead[]>(['leads']) || [];

      queryClient.setQueryData<Lead[]>(['leads'], previousLeads.map((item) => {
        if (item.id !== id) return item;
        return { ...item, stage };
      }));

      return { previousLeads };
    },
    onSuccess: (data) => {
      if (data.stage === 'fechados' && data.previousStage !== 'fechados') {
        publishLeadAlert('closed', data.id);
      }
    },
    onError: (_error, _variables, context) => {
      if (context?.previousLeads) {
        queryClient.setQueryData(['leads'], context.previousLeads);
      }
      toast({ title: 'Erro ao mover lead', variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_kpis'] });
    },
  });

  const completeLeadTasksMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const { error } = await supabase
        .from('lead_tasks')
        .update({ status: 'done' })
        .eq('lead_id', leadId)
        .neq('status', 'done');
      if (error) throw error;
      return leadId;
    },
    onMutate: (leadId: string) => {
      setCompletingLeadId(leadId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead_tasks'] });
      queryClient.invalidateQueries({ queryKey: ['overdue_leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead_task_meta'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({ title: 'Tarefas marcadas como feitas!' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao concluir tarefas', description: error?.message || 'Tente novamente.', variant: 'destructive' });
    },
    onSettled: () => {
      setCompletingLeadId(null);
    },
  });

  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      const leadName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim();
      const leadTitle = (lead.title || '').toLowerCase();
      const searchText = search.toLowerCase();
      const matchesSearch = !search ||
        leadTitle.includes(searchText) ||
        (lead.clients && `${lead.clients.first_name} ${lead.clients.last_name}`.toLowerCase().includes(searchText)) ||
        (lead.event_location && lead.event_location.toLowerCase().includes(searchText)) ||
        leadName.toLowerCase().includes(searchText) ||
        (lead.phone && lead.phone.includes(search));
      const matchesType = filterType === 'all' || lead.event_type === filterType;
      const matchesEventDate = !filterEventDate || lead.event_date === filterEventDate;
      return matchesSearch && matchesType && matchesEventDate;
    });
  }, [leads, search, filterType, filterEventDate]);

  const leadsByStage = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    stages.forEach(s => { map[s.id] = []; });
    filteredLeads.forEach(lead => {
      if (map[lead.stage]) map[lead.stage].push(lead);
      else {
        map[lead.stage] = [lead];
      }
    });
    return map;
  }, [filteredLeads, stages]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const activeData = active.data.current;
    if (activeData?.type === 'column') {
      setActiveDragId(null);
    } else {
      setActiveDragId(active.id as string);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Column reorder
    if (activeData?.type === 'column' && overData?.type === 'column') {
      const activeStage = activeData.stage as KanbanStage;
      const overStage = overData.stage as KanbanStage;
      if (activeStage.id === overStage.id) return;

      const oldIndex = stages.findIndex(s => s.id === activeStage.id);
      const newIndex = stages.findIndex(s => s.id === overStage.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(stages, oldIndex, newIndex).map((s, i) => ({ ...s, position: i }));
      reorderStagesMutation.mutate(reordered);
      return;
    }

    // Card drag
    const leadId = active.id as string;
    const overId = over.id as string;

    const isStage = stages.some(s => s.id === overId);
    let newStage: string;

    if (isStage) {
      newStage = overId;
    } else {
      const targetLead = leads.find(l => l.id === overId);
      if (!targetLead) return;
      newStage = targetLead.stage;
    }

    const lead = leads.find(l => l.id === leadId);
    if (lead && lead.stage !== newStage) {
      updateLeadStageMutation.mutate({ id: leadId, stage: newStage, previousStage: lead.stage });
    }
  };

  const activeLead = activeDragId ? leads.find(l => l.id === activeDragId) : null;

  const handleSaveColumn = (label: string, color: string) => {
    if (editingColumn) {
      updateStageMutation.mutate({ id: editingColumn.id, label, color });
    } else {
      createStageMutation.mutate({ label, color });
    }
    setEditingColumn(null);
  };

  const handleDeleteColumn = (stage: KanbanStage) => {
    if (window.confirm(`Excluir a coluna "${stage.label}"? Leads nela serão movidos para "Novo Contato".`)) {
      const leadsInStage = leads.filter(l => l.stage === stage.id);
      leadsInStage.forEach(lead => {
        updateLeadStageMutation.mutate({ id: lead.id, stage: 'novo_contato', previousStage: lead.id });
      });
      deleteStageMutation.mutate(stage.id);
    }
  };

  return (
    <div className="page-container overflow-x-hidden">
      <div className="page-header">
        <div className="space-y-2">
          <div className="page-header-title-container">
            <div className="page-header-bar" />
            <h1 className="page-header-title">Gestão Comercial</h1>
          </div>
          <p className="page-header-subtitle">David Melo Produções • Pipeline de Leads e Oportunidades</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => { setEditingColumn(null); setColumnFormOpen(true); }}
            variant="outline"
            className="h-11 px-5 rounded-xl border-gold/30 text-gold hover:bg-gold hover:text-white font-black uppercase text-[10px] tracking-widest transition-all"
          >
            <Columns3 className="w-4 h-4 mr-2" /> Nova Coluna
          </Button>
          <Button
            onClick={() => { setEditingLead(null); setIsFormOpen(true); }}
            className="page-action-button"
          >
            <Plus className="w-5 h-5 mr-2" /> Novo Lead
          </Button>
        </div>
      </div>

      <div className="px-1 md:px-2">
        <div className="filter-bar-container">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-gold transition-colors" />
            <Input
              placeholder="Buscar por título, cliente ou local..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-12 bg-white/50 border-border/30 focus:border-gold/50 h-14 rounded-2xl transition-all focus:ring-4 focus:ring-gold/5"
            />
          </div>
          <div className="flex items-center gap-3 bg-white/50 border border-border/30 rounded-2xl px-4 h-14 group focus-within:border-gold/50 transition-all">
            <Filter className="w-4 h-4 text-gold" />
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[200px] border-none bg-transparent h-full focus:ring-0 font-black uppercase text-[10px] tracking-widest text-foreground/70">
                <SelectValue placeholder="Tipo de evento" />
              </SelectTrigger>
              <SelectContent className="bg-white/95 backdrop-blur-xl border-border/40 rounded-2xl shadow-2xl p-2">
                <SelectItem value="all" className="font-black text-[10px] uppercase tracking-widest rounded-xl mb-1">Todos os tipos</SelectItem>
                {EVENT_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value} className="font-black text-[10px] uppercase tracking-widest rounded-xl">{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 bg-white/50 border border-border/30 rounded-2xl px-4 h-14 group focus-within:border-gold/50 transition-all">
            <Input
              type="date"
              value={filterEventDate}
              onChange={(e) => setFilterEventDate(e.target.value)}
              className="w-[200px] border-none bg-transparent h-full focus-visible:ring-0 font-black uppercase text-[10px] tracking-widest text-foreground/70"
            />
            {filterEventDate && (
              <Button type="button" variant="ghost" className="h-9 px-3 text-[10px] font-black uppercase tracking-widest" onClick={() => setFilterEventDate('')}>
                Limpar
              </Button>
            )}
          </div>
        </div>
      </div>

      {isLoading || isLoadingStages ? (
        <div className="px-2">
            <div className="rounded-[32px] border border-border/30 bg-secondary/10 p-4 h-[calc(100vh-260px)] min-h-[520px]">
              <div className="flex gap-5 overflow-x-auto overflow-y-hidden pb-2 h-full">
              {DEFAULT_STAGES.map(s => (
                <div key={s.id} className="min-w-[340px] flex-1 bg-white/40 rounded-[28px] p-6 border border-border/20 animate-pulse h-[600px] shadow-sm" />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={collisionDetectionStrategy} autoScroll={false} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="px-2">
            <div className="rounded-[32px] border border-border/30 bg-secondary/10 p-4 relative overflow-hidden group h-[calc(100vh-260px)] min-h-[520px]">
              <div className="absolute inset-0 bg-gradient-to-br from-gold/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
              <div className="flex gap-4 overflow-x-auto overflow-y-hidden pb-2 h-full relative z-10">
                {stages.map(stage => (
                  <KanbanColumn
                    key={stage.id}
                    stage={stage}
                    leads={leadsByStage[stage.id] || []}
                    onCardClick={setDetailLead}
                    onCompleteTasks={(leadId) => completeLeadTasksMutation.mutate(leadId)}
                    completingLeadId={completingLeadId}
                    overdueLeadIds={overdueLeadIds}
                    leadTaskMeta={leadTaskMeta}
                    onEditColumn={(s) => { setEditingColumn(s); setColumnFormOpen(true); }}
                    onDeleteColumn={handleDeleteColumn}
                  />
                ))}

                <button
                  type="button"
                  onClick={() => { setEditingColumn(null); setColumnFormOpen(true); }}
                  className="min-w-[340px] shrink-0 rounded-[28px] border-2 border-dashed border-border/30 flex flex-col items-center justify-center gap-3 text-muted-foreground/40 hover:border-gold/50 hover:text-gold hover:bg-gold/[0.02] transition-all cursor-pointer h-[200px] self-start mt-4"
                >
                  <Plus className="w-8 h-8" />
                  <p className="text-[10px] font-black uppercase tracking-[0.2em]">Nova Coluna</p>
                </button>
              </div>
            </div>
          </div>
          <DragOverlay dropAnimation={{ duration: 250, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
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
        stages={stages}
        eventTypes={EVENT_TYPES}
      />

      <LeadDetailDialog
        lead={detailLead}
        onClose={() => setDetailLead(null)}
        onOpenLeadCard={setDetailLead}
        onEdit={(lead) => { setDetailLead(null); setEditingLead(lead); setIsFormOpen(true); }}
        clients={clients}
        teamMembers={teamMembers}
        stages={stages}
        eventTypes={EVENT_TYPES}
      />

      <ColumnFormDialog
        open={columnFormOpen}
        onOpenChange={(open) => { setColumnFormOpen(open); if (!open) setEditingColumn(null); }}
        initialLabel={editingColumn?.label}
        initialColor={editingColumn?.color}
        title={editingColumn ? 'Editar Coluna' : 'Nova Coluna'}
        onSave={handleSaveColumn}
      />
    </div>
  );
}
