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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="font-display text-lg">{lead.title}</DialogTitle>
              {clientName && <p className="text-sm text-gold mt-0.5">{clientName}</p>}
            </div>
          </div>
        </DialogHeader>

        <div className="flex items-center gap-2 flex-wrap">
          {stageInfo && (
            <Badge variant="outline" style={{ borderColor: stageInfo.color, color: stageInfo.color }}>
              {stageInfo.label}
            </Badge>
          )}
          {eventTypeLabel && <Badge variant="secondary">{eventTypeLabel}</Badge>}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          {lead.event_date && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="w-4 h-4 text-gold/70" />
              {format(new Date(lead.event_date + 'T00:00:00'), "dd MMM yyyy", { locale: ptBR })}
            </div>
          )}
          {lead.event_time && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4 text-gold/70" />
              {lead.event_time}
            </div>
          )}
          {lead.event_location && (
            <div className="flex items-center gap-2 text-muted-foreground col-span-2">
              <MapPin className="w-4 h-4 text-gold/70 shrink-0" />
              {lead.event_location}
            </div>
          )}
          {lead.guest_count && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="w-4 h-4 text-gold/70" />
              {lead.guest_count} convidados
            </div>
          )}
          {lead.total_budget && (
            <div className="flex items-center gap-2 text-gold">
              <DollarSign className="w-4 h-4" />
              {Number(lead.total_budget).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </div>
          )}
        </div>

        {lead.notes && (
          <>
            <Separator className="border-border/30" />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Notas</p>
              <p className="text-sm text-foreground/80 whitespace-pre-wrap">{lead.notes}</p>
            </div>
          </>
        )}

        <Separator className="border-border/30" />

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Tarefas ({tasks.length})</p>
          <div className="space-y-1.5 mb-3">
            {tasks.map(task => (
              <div key={task.id} className="flex items-center gap-2 group">
                <button onClick={() => toggleTaskMutation.mutate({ id: task.id, status: task.status })} className="shrink-0">
                  <CheckCircle2 className={`w-4 h-4 ${task.status === 'done' ? 'text-green-500' : 'text-muted-foreground/40 hover:text-gold/60'}`} />
                </button>
                <span className={`text-sm flex-1 ${task.status === 'done' ? 'line-through text-muted-foreground/50' : 'text-foreground/80'}`}>
                  {task.title}
                </span>
              </div>
            ))}
          </div>
          <form onSubmit={e => { e.preventDefault(); if (newTask.trim()) addTaskMutation.mutate(newTask.trim()); }} className="flex gap-2">
            <Input value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="Nova tarefa..." className="text-sm h-8 bg-card/50 border-border/30" />
            <Button type="submit" size="sm" variant="outline" className="h-8 px-2">
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </form>
        </div>

        <Separator className="border-border/30" />

        <div className="flex justify-between">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                <Trash2 className="w-4 h-4 mr-1" /> Excluir
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir lead?</AlertDialogTitle>
                <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteLeadMutation.mutate()} className="bg-destructive text-destructive-foreground">
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button size="sm" onClick={() => onEdit(lead)} className="bg-gold hover:bg-gold-dark text-dark">
            <Edit className="w-4 h-4 mr-1" /> Editar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
