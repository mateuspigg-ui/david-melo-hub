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

  return (
    <Dialog open={!!lead} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-0 rounded-2xl shadow-2xl border-border/40 bg-background overflow-hidden font-body">
        <div className="bg-gradient-gold p-8 text-white relative">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70 mb-1">Detalhes da Oportunidade</p>
                <DialogTitle className="text-3xl font-display text-white tracking-tight">{lead.title}</DialogTitle>
                {clientName && <p className="text-lg font-bold text-white/90 mt-1 capitalize">{clientName}</p>}
              </div>
            </div>
          </DialogHeader>
          <div className="flex items-center gap-2 mt-6 flex-wrap">
            {stageInfo && (
              <Badge className="bg-white/20 text-white border-white/30 font-bold uppercase text-[9px] tracking-wider px-3 py-1">
                {stageInfo.label}
              </Badge>
            )}
            {eventTypeLabel && (
              <Badge className="bg-black/20 text-white border-none font-bold uppercase text-[9px] tracking-wider px-3 py-1">
                {eventTypeLabel}
              </Badge>
            )}
          </div>
        </div>

        <div className="p-8 space-y-8">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              {lead.event_date && (
                <div className="flex items-center gap-3 text-sm font-medium text-foreground">
                  <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center text-gold">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <span>{format(new Date(lead.event_date + 'T00:00:00'), "dd 'de' MMMM, yyyy", { locale: ptBR })}</span>
                </div>
              )}
              {lead.event_time && (
                <div className="flex items-center gap-3 text-sm font-medium text-foreground">
                  <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center text-gold">
                    <Clock className="w-4 h-4" />
                  </div>
                  <span>{lead.event_time}</span>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {lead.total_budget && (
                <div className="flex items-center gap-3 text-sm font-bold text-gold">
                   <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <span>{Number(lead.total_budget).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
              )}
              {lead.guest_count && (
                <div className="flex items-center gap-3 text-sm font-medium text-foreground">
                  <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center text-gold">
                    <Users className="w-4 h-4" />
                  </div>
                  <span>{lead.guest_count} Convidados</span>
                </div>
              )}
            </div>

            {lead.event_location && (
              <div className="flex items-center gap-3 text-sm font-medium text-foreground col-span-2 bg-secondary/30 p-4 rounded-xl border border-border/20">
                <MapPin className="w-5 h-5 text-gold shrink-0" />
                <span className="leading-tight">{lead.event_location}</span>
              </div>
            )}
          </div>

          {lead.notes && (
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-gold uppercase tracking-[0.2em]">Resumo Estratégico</h4>
              <div className="p-4 bg-secondary/20 rounded-xl border border-border/10">
                <p className="text-sm text-foreground/80 leading-relaxed font-body whitespace-pre-wrap italic">"{lead.notes}"</p>
              </div>
            </div>
          )}

          <div className="space-y-4 bg-secondary/10 p-6 rounded-2xl border border-border/10 shadow-inner">
            <h4 className="text-[10px] font-bold text-foreground/60 uppercase tracking-[0.2em] flex items-center justify-between">
              Tarefas Pendentes 
              <span className="bg-foreground/10 text-foreground px-2 py-0.5 rounded-full text-[9px]">{tasks.length}</span>
            </h4>
            
            <div className="space-y-2.5 max-h-[200px] overflow-y-auto no-scrollbar">
              {tasks.map(task => (
                <div key={task.id} className="flex items-center gap-3 group bg-white p-3 rounded-lg border border-border/20 hover:shadow-sm transition-all">
                  <button 
                    onClick={() => toggleTaskMutation.mutate({ id: task.id, status: task.status })} 
                    className="shrink-0 transition-transform active:scale-90"
                  >
                    <CheckCircle2 className={`w-5 h-5 ${task.status === 'done' ? 'text-green-500 bg-green-500/10 rounded-full' : 'text-muted-foreground/30 hover:text-gold'}`} />
                  </button>
                  <span className={`text-sm font-medium flex-1 ${task.status === 'done' ? 'line-through text-muted-foreground/60' : 'text-foreground'}`}>
                    {task.title}
                  </span>
                </div>
              ))}
            </div>

            <form onSubmit={e => { e.preventDefault(); if (newTask.trim()) addTaskMutation.mutate(newTask.trim()); }} className="flex gap-2 pt-2">
              <Input 
                value={newTask} 
                onChange={e => setNewTask(e.target.value)} 
                placeholder="Próximo passo..." 
                className="text-xs h-10 bg-white border-border/40 focus:border-gold rounded-lg" 
              />
              <Button type="submit" size="icon" className="h-10 w-10 shrink-0 bg-gold text-white hover:bg-gold-light rounded-lg">
                <Plus className="w-4 h-4" />
              </Button>
            </form>
          </div>

          <div className="flex justify-between items-center pt-6 border-t border-border/10">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive/60 hover:text-white hover:bg-destructive font-bold uppercase text-[9px] tracking-widest px-4">
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir Oportunidade
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-2xl border-destructive/20 shadow-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-display">Encerrar e Excluir?</AlertDialogTitle>
                  <AlertDialogDescription className="text-muted-foreground">Esta ação é irreversível e removerá todos os registros deste lead.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-lg font-bold">Voltar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteLeadMutation.mutate()} className="bg-destructive hover:bg-destructive/90 rounded-lg font-bold">
                    Sim, Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button size="lg" onClick={() => onEdit(lead)} className="bg-gold hover:bg-gold-light text-white font-bold px-10 rounded-xl shadow-gold uppercase text-[11px] tracking-widest h-12">
              <Edit className="w-4 h-4 mr-2" /> Editar Dados
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
