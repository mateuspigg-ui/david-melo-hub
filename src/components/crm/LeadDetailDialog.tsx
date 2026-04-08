import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calendar, MapPin, Users, DollarSign, Clock, Edit, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import type { Lead } from '@/pages/CRMPage';

interface Props {
  lead: Lead | null;
  onClose: () => void;
  onEdit: (lead: Lead) => void;
  clients: { id: string; first_name: string; last_name: string }[];
  teamMembers: { id: string; full_name: string }[];
  stages: { id: string; label: string; color: string }[];
  eventTypes: { value: string; label: string }[];
}

export default function LeadDetailDialog({ lead, onClose, onEdit, stages, eventTypes }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newTask, setNewTask] = useState('');

  const { data: tasks = [] } = useQuery({
    queryKey: ['lead_tasks', lead?.id],
    queryFn: async () => {
      if (!lead) return [];
      const { data, error } = await supabase
        .from('lead_tasks')
        .select('*')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!lead,
  });

  const addTaskMutation = useMutation({
    mutationFn: async (title: string) => {
      if (!lead) return;
      const { error } = await supabase.from('lead_tasks').insert({ lead_id: lead.id, title });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead_tasks', lead?.id] });
      setNewTask('');
    },
  });

  const toggleTaskMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const newStatus = status === 'done' ? 'pending' : 'done';
      const { error } = await supabase.from('lead_tasks').update({ status: newStatus }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lead_tasks', lead?.id] }),
  });

  const deleteLeadMutation = useMutation({
    mutationFn: async () => {
      if (!lead) return;
      const { error } = await supabase.from('leads').delete().eq('id', lead.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      onClose();
      toast({ title: 'Lead excluído' });
    },
    onError: () => toast({ title: 'Erro ao excluir', variant: 'destructive' }),
  });

  if (!lead) return null;

  const stageInfo = stages.find(s => s.id === lead.stage);
  const eventTypeLabel = eventTypes.find(t => t.value === lead.event_type)?.label;
  const clientName = lead.clients ? `${lead.clients.first_name} ${lead.clients.last_name}`.trim() : null;

  return (    <Dialog open={!!lead} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl h-[90vh] flex flex-col p-0 rounded-[28px] shadow-[0_25px_50px_-12px_rgba(218,165,32,0.15)] border-border/40 bg-background overflow-hidden font-body">
        {/* Header - Fixed */}
        <div className="bg-gradient-gold p-8 text-white flex-none relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl opacity-50" />
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div className="relative z-10">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/70 mb-2">Dossiê da Oportunidade</p>
                <DialogTitle className="text-3xl font-display text-white tracking-tight leading-none mb-1">{lead.title}</DialogTitle>
                {clientName && <p className="text-lg font-bold text-white/90 mt-1 capitalize tracking-tight">{clientName}</p>}
              </div>
            </div>
          </DialogHeader>
          <div className="flex items-center gap-2 mt-6 flex-wrap relative z-10">
            {stageInfo && (
              <Badge className="bg-white/20 text-white border-white/30 font-black uppercase text-[9px] tracking-widest px-4 py-1.5 rounded-full">
                {stageInfo.label}
              </Badge>
            )}
            {eventTypeLabel && (
              <Badge className="bg-black/20 text-white border-none font-black uppercase text-[9px] tracking-widest px-4 py-1.5 rounded-full">
                {eventTypeLabel}
              </Badge>
            )}
          </div>
        </div>

        {/* Body - Scrollable */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-white/50 backdrop-blur-sm">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              {lead.event_date && (
                <div className="flex items-center gap-4 text-sm font-bold text-foreground/80">
                  <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center text-gold shadow-sm">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <span>{format(new Date(lead.event_date + 'T00:00:00'), "dd 'de' MMMM, yyyy", { locale: ptBR })}</span>
                </div>
              )}
              {lead.event_time && (
                <div className="flex items-center gap-4 text-sm font-bold text-foreground/80">
                  <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center text-gold shadow-sm">
                    <Clock className="w-5 h-5" />
                  </div>
                  <span>{lead.event_time}h</span>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {lead.total_budget && (
                <div className="flex items-center gap-4 text-sm font-black text-gold">
                   <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center shadow-sm">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <span className="text-lg font-display">{Number(lead.total_budget).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
              )}
              {lead.guest_count && (
                <div className="flex items-center gap-4 text-sm font-bold text-foreground/80">
                  <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center text-gold shadow-sm">
                    <Users className="w-5 h-5" />
                  </div>
                  <span>{lead.guest_count} Convidados</span>
                </div>
              )}
            </div>

            {lead.event_location && (
              <div className="flex items-center gap-3 text-sm font-bold text-foreground/70 col-span-2 bg-secondary/20 p-5 rounded-2xl border border-border/10">
                <MapPin className="w-5 h-5 text-gold shrink-0" />
                <span className="leading-tight">{lead.event_location}</span>
              </div>
            )}
          </div>

          {lead.notes && (
            <div className="space-y-3">
              <h4 className="text-[10px] font-black text-gold/80 uppercase tracking-[0.25em] ml-1">Resumo comercial</h4>
              <div className="p-5 bg-white rounded-2xl border border-border/10 shadow-sm italic">
                <p className="text-sm text-foreground/80 leading-relaxed font-medium whitespace-pre-wrap">"{lead.notes}"</p>
              </div>
            </div>
          )}

          <div className="space-y-5 bg-secondary/10 p-6 rounded-[28px] border border-border/10 shadow-inner">
            <h4 className="text-[10px] font-black text-foreground/40 uppercase tracking-[0.25em] flex items-center justify-between ml-1">
              Plano de Ação / Tarefas 
              <Badge variant="secondary" className="bg-foreground/5 text-foreground/60 rounded-full font-black text-[9px]">{tasks.length}</Badge>
            </h4>
            
            <div className="space-y-3 max-h-[250px] overflow-y-auto no-scrollbar">
              {tasks.length === 0 && <p className="text-center py-6 text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest italic">Nenhuma tarefa agendada</p>}
              {tasks.map(task => (
                <div key={task.id} className="flex items-center gap-3 group bg-white p-4 rounded-xl border border-border/10 hover:shadow-md transition-all duration-300">
                  <button 
                    onClick={() => toggleTaskMutation.mutate({ id: task.id, status: task.status })} 
                    className="shrink-0 transition-transform active:scale-90"
                  >
                    <CheckCircle2 className={`w-5 h-5 ${task.status === 'done' ? 'text-green-500 bg-green-500/5 rounded-full' : 'text-muted-foreground/20 hover:text-gold'}`} />
                  </button>
                  <span className={`text-sm font-bold flex-1 ${task.status === 'done' ? 'line-through text-muted-foreground/40' : 'text-foreground/80'}`}>
                    {task.title}
                  </span>
                </div>
              ))}
            </div>

            <form onSubmit={e => { e.preventDefault(); if (newTask.trim()) addTaskMutation.mutate(newTask.trim()); }} className="flex gap-2 pt-2">
              <Input 
                value={newTask} 
                onChange={e => setNewTask(e.target.value)} 
                placeholder="Qual o próximo passo com este lead?" 
                className="text-xs h-12 bg-white border-border/10 focus:border-gold rounded-xl font-medium shadow-sm" 
              />
              <Button type="submit" size="icon" className="h-12 w-12 shrink-0 bg-gradient-gold text-white hover:opacity-90 rounded-xl shadow-gold">
                <Plus className="w-5 h-5" />
              </Button>
            </form>
          </div>
        </div>

        {/* Footer - Fixed */}
        <div className="p-6 bg-white border-t border-border/10 flex-none flex justify-between items-center gap-6">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-12 px-6 text-destructive/40 hover:text-white hover:bg-destructive font-black uppercase text-[10px] tracking-widest rounded-xl transition-all">
                <Trash2 className="w-4 h-4 mr-2" /> Excluir Oportunidade
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-[32px] border-destructive/20 shadow-2xl p-8">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display text-2xl">Confirmar Exclusão?</AlertDialogTitle>
                <AlertDialogDescription className="text-muted-foreground font-medium">Esta ação é definitiva. Todos os dados históricos e tarefas deste lead serão removidos permanentemente.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="mt-8 gap-3">
                <AlertDialogCancel className="rounded-xl h-12 font-black uppercase text-[10px] tracking-widest border-none hover:bg-secondary">Voltar</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteLeadMutation.mutate()} className="bg-destructive hover:bg-destructive/90 rounded-xl h-12 px-8 font-black uppercase text-[10px] tracking-widest text-white border-none">
                  Sim, Excluir Registro
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button size="lg" onClick={() => onEdit(lead)} className="bg-gradient-gold hover:opacity-90 text-white font-black px-12 rounded-xl shadow-gold uppercase text-[11px] tracking-[0.25em] h-12 transition-all">
            <Edit className="w-4 h-4 mr-2" /> Editar Dados
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
