import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calendar, MapPin, Users, DollarSign, Clock, Edit, Trash2, CheckCircle2, Phone, AlertTriangle, Loader2, UserPlus } from 'lucide-react';
import { format, isPast, isToday, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import type { Lead } from '@/pages/CRMPage';

interface Props {
  lead: Lead | null;
  onClose: () => void;
  onOpenLeadCard: (lead: Lead) => void;
  onEdit: (lead: Lead) => void;
  clients: { id: string; first_name: string; last_name: string }[];
  teamMembers: { id: string; full_name: string }[];
  stages: { id: string; label: string; color: string }[];
  eventTypes: { value: string; label: string }[];
}

const playTaskCreatedAlert = () => {
  if (typeof window === 'undefined') return;

  try {
    const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextConstructor) return;

    const audioContext = new AudioContextConstructor();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(960, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(740, audioContext.currentTime + 0.4);
    oscillator.frequency.setValueAtTime(960, audioContext.currentTime + 0.55);
    oscillator.frequency.exponentialRampToValueAtTime(680, audioContext.currentTime + 1);

    gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.25, audioContext.currentTime + 0.03);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.45);
    gainNode.gain.exponentialRampToValueAtTime(0.25, audioContext.currentTime + 0.58);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 1.05);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 1.1);
    oscillator.onended = () => {
      void audioContext.close();
    };
  } catch {
    return;
  }
};

const showTaskCreatedSystemNotification = async ({
  assigneeName,
  clientName,
}: {
  assigneeName: string;
  clientName: string;
}) => {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;

  const body = `Responsavel: ${assigneeName} | Cliente: ${clientName}`;

  try {
    if (Notification.permission === 'granted') {
      new Notification('Nova tarefa criada', { body });
      return;
    }

    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        new Notification('Nova tarefa criada', { body });
      }
    }
  } catch {
    return;
  }
};

export default function LeadDetailDialog({ lead, onClose, onOpenLeadCard, onEdit, teamMembers, stages, eventTypes }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newTask, setNewTask] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [isLeadTasksUnavailable, setIsLeadTasksUnavailable] = useState(false);

  const isLeadTasksMissingTableError = (error: any) => {
    const message = String(error?.message || '');
    return /could not find the table ['"]public\.lead_tasks['"]/i.test(message);
  };

  useEffect(() => {
    setNewTaskAssignee(lead?.assigned_to || '');
    setIsLeadTasksUnavailable(false);
  }, [lead?.id, lead?.assigned_to]);

  const { data: tasks = [] } = useQuery({
    queryKey: ['lead_tasks', lead?.id],
    queryFn: async () => {
      if (!lead) return [];
      const { data, error } = await supabase
        .from('lead_tasks')
        .select('*, assignee:assigned_to(full_name)')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: true });
      if (error) {
        if (isLeadTasksMissingTableError(error)) {
          setIsLeadTasksUnavailable(true);
          return [];
        }
        throw error;
      }
      setIsLeadTasksUnavailable(false);
      return data;
    },
    enabled: !!lead,
  });

  const addTaskMutation = useMutation({
    mutationFn: async ({ title, due_date, assigned_to }: { title: string; due_date: string | null; assigned_to: string | null }) => {
      if (!lead) return;
      const { error } = await supabase.from('lead_tasks').insert({
        lead_id: lead.id,
        title,
        due_date: due_date || null,
        assigned_to,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      const assigneeName = variables.assigned_to
        ? teamMembers.find(member => member.id === variables.assigned_to)?.full_name || 'Responsável não encontrado'
        : 'Sem responsável definido';
      const targetClientName = lead?.clients
        ? `${lead.clients.first_name} ${lead.clients.last_name}`.trim()
        : `${lead?.first_name || ''} ${lead?.last_name || ''}`.trim() || lead?.title || 'Cliente não informado';

      queryClient.invalidateQueries({ queryKey: ['lead_tasks', lead?.id] });
      queryClient.invalidateQueries({ queryKey: ['overdue_leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead_task_meta'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setNewTask('');
      setNewTaskDueDate('');
      setNewTaskAssignee(lead?.assigned_to || '');
      onClose();
      playTaskCreatedAlert();
      void showTaskCreatedSystemNotification({
        assigneeName,
        clientName: targetClientName,
      });
      toast({
        title: 'Nova tarefa criada',
        description: (
          <div className="space-y-1.5">
            <p>
              <span className="font-black uppercase tracking-wide text-[10px] text-foreground/60">Responsável</span>
              <span className="block font-bold text-foreground">{assigneeName}</span>
            </p>
            <p>
              <span className="font-black uppercase tracking-wide text-[10px] text-foreground/60">Cliente</span>
              <span className="block font-bold text-foreground">{targetClientName}</span>
            </p>
          </div>
        ),
        className: 'border-l-4 border-l-emerald-500 bg-emerald-50/80 cursor-pointer',
        duration: 15000,
        onClick: () => {
          if (!lead) return;
          onOpenLeadCard(lead);
        },
      });
    },
    onError: (error: any) => {
      if (isLeadTasksMissingTableError(error)) {
        setIsLeadTasksUnavailable(true);
        toast({
          title: 'Módulo de tarefas indisponível',
          description: 'A tabela de tarefas não foi aplicada no banco. Rode as migrations do Supabase para ativar.',
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: 'Erro ao confirmar tarefa',
        description: error?.message || 'Não foi possível salvar a tarefa.',
        variant: 'destructive',
      });
    },
  });

  const toggleTaskMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const newStatus = status === 'done' ? 'pending' : 'done';
      const { error } = await supabase.from('lead_tasks').update({ status: newStatus }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead_tasks', lead?.id] });
      queryClient.invalidateQueries({ queryKey: ['overdue_leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead_task_meta'] });
    },
    onError: (error: any) => {
      if (isLeadTasksMissingTableError(error)) {
        setIsLeadTasksUnavailable(true);
        toast({
          title: 'Módulo de tarefas indisponível',
          description: 'A tabela de tarefas não foi aplicada no banco. Rode as migrations do Supabase para ativar.',
          variant: 'destructive',
        });
        return;
      }
      toast({ title: 'Erro ao atualizar tarefa', description: error?.message || 'Tente novamente.', variant: 'destructive' });
    },
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

  const createClientFromLeadMutation = useMutation({
    mutationFn: async () => {
      if (!lead) return;

      const firstName = (lead.first_name || '').trim();
      const lastName = (lead.last_name || '').trim();

      if (!firstName) {
        throw new Error('Este lead não possui nome para cadastro de cliente.');
      }

      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .insert({
          first_name: firstName,
          last_name: lastName || '',
          phone: lead.phone || null,
        })
        .select('id')
        .single();

      if (clientError) throw clientError;

      const { error: linkError } = await supabase
        .from('leads')
        .update({ client_id: clientData.id })
        .eq('id', lead.id);

      if (linkError) throw linkError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({ title: 'Cliente criado a partir do lead fechado!' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao cadastrar cliente', description: error?.message || 'Não foi possível concluir a operação.', variant: 'destructive' });
    },
  });

  if (!lead) return null;

  const stageInfo = stages.find(s => s.id === lead.stage);
  const eventTypeLabel = eventTypes.find(t => t.value === lead.event_type)?.label;
  const clientName = lead.clients
    ? `${lead.clients.first_name} ${lead.clients.last_name}`.trim()
    : null;
  const leadName = (lead.first_name || lead.last_name)
    ? `${lead.first_name || ''} ${lead.last_name || ''}`.trim()
    : null;
  const displayName = clientName || leadName;

  // Calcula status de prazo de cada tarefa
  const getTaskDueStatus = (task: { status: string; due_date: string | null }) => {
    if (task.status === 'done' || !task.due_date) return 'ok';
    const due = parseISO(task.due_date);
    if (isPast(due) && !isToday(due)) return 'overdue';
    if (isToday(due)) return 'today';
    return 'ok';
  };

  const overdueTasks = tasks.filter(t => getTaskDueStatus(t) === 'overdue');
  const todayTasks = tasks.filter(t => getTaskDueStatus(t) === 'today');

  const handleTaskSubmit = () => {
    if (isLeadTasksUnavailable) {
      toast({
        title: 'Módulo de tarefas indisponível',
        description: 'A tabela de tarefas não foi aplicada no banco. Rode as migrations do Supabase para ativar.',
        variant: 'destructive',
      });
      return;
    }

    const taskTitle = newTask.trim();
    if (!taskTitle) {
      toast({
        title: 'Informe a tarefa',
        description: 'Digite uma descrição antes de confirmar.',
        variant: 'destructive',
      });
      return;
    }

    addTaskMutation.mutate({
      title: taskTitle,
      due_date: newTaskDueDate || null,
      assigned_to: newTaskAssignee || null,
    });
  };

  return (
    <Dialog open={!!lead} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl h-[90vh] flex flex-col p-0 rounded-[28px] shadow-[0_25px_50px_-12px_rgba(218,165,32,0.15)] border-border/40 bg-background overflow-hidden font-body">
        {/* Header - Fixed */}
        <div className="bg-gradient-gold p-8 text-white flex-none relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl opacity-50" />
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div className="relative z-10">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/70 mb-2">Dossiê da Oportunidade</p>
                <DialogTitle className="text-3xl font-display text-white tracking-tight leading-none mb-1">{lead.title}</DialogTitle>
                {displayName && <p className="text-lg font-bold text-white/90 mt-1 capitalize tracking-tight">{displayName}</p>}
                {lead.phone && (
                  <p className="flex items-center gap-1.5 text-sm text-white/70 font-medium mt-0.5">
                    <Phone className="w-3.5 h-3.5" />
                    {lead.phone}
                  </p>
                )}
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
            {/* Alertas de prazo no header */}
            {overdueTasks.length > 0 && (
              <Badge className="bg-red-500/90 text-white border-none font-black uppercase text-[9px] tracking-widest px-4 py-1.5 rounded-full animate-pulse">
                ⚠ {overdueTasks.length} tarefa{overdueTasks.length > 1 ? 's' : ''} em atraso
              </Badge>
            )}
            {todayTasks.length > 0 && overdueTasks.length === 0 && (
              <Badge className="bg-orange-400/90 text-white border-none font-black uppercase text-[9px] tracking-widest px-4 py-1.5 rounded-full">
                🔔 {todayTasks.length} tarefa{todayTasks.length > 1 ? 's' : ''} vence hoje
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

          {/* Tarefas */}
          <div className="space-y-5 bg-secondary/10 p-6 rounded-[28px] border border-border/10 shadow-inner">
            <h4 className="text-[10px] font-black text-foreground/40 uppercase tracking-[0.25em] flex items-center justify-between ml-1">
              Plano de Ação / Tarefas
              <div className="flex items-center gap-2">
                {overdueTasks.length > 0 && (
                  <span className="flex items-center gap-1 text-red-500 text-[9px] font-black">
                    <AlertTriangle className="w-3 h-3" /> {overdueTasks.length} em atraso
                  </span>
                )}
                <Badge variant="secondary" className="bg-foreground/5 text-foreground/60 rounded-full font-black text-[9px]">{tasks.length}</Badge>
              </div>
            </h4>

            <div className="space-y-3 max-h-[250px] overflow-y-auto no-scrollbar">
              {isLeadTasksUnavailable && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/[0.06] p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-destructive">Tarefas indisponíveis</p>
                  <p className="text-xs text-destructive/80 mt-1 font-medium">A tabela `lead_tasks` não foi encontrada no banco. Rode as migrations do Supabase para habilitar este recurso.</p>
                </div>
              )}
              {tasks.length === 0 && <p className="text-center py-6 text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest italic">Nenhuma tarefa agendada</p>}
              {tasks.map(task => {
                const dueStatus = getTaskDueStatus(task);
                return (
                  <div
                    key={task.id}
                    className={`flex items-start gap-3 group bg-white p-4 rounded-xl border transition-all duration-300 hover:shadow-md ${
                      dueStatus === 'overdue'
                        ? 'border-red-300 bg-red-50 shadow-sm shadow-red-100'
                        : dueStatus === 'today'
                        ? 'border-orange-300 bg-orange-50'
                        : 'border-border/10'
                    }`}
                  >
                    <button
                      onClick={() => toggleTaskMutation.mutate({ id: task.id, status: task.status })}
                      className="shrink-0 transition-transform active:scale-90 mt-0.5"
                    >
                      <CheckCircle2 className={`w-5 h-5 ${task.status === 'done' ? 'text-green-500' : dueStatus === 'overdue' ? 'text-red-400' : 'text-muted-foreground/20 hover:text-gold'}`} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-bold block ${task.status === 'done' ? 'line-through text-muted-foreground/40' : dueStatus === 'overdue' ? 'text-red-700' : 'text-foreground/80'}`}>
                        {task.title}
                      </span>
                      {task.due_date && (
                        <span className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1 mt-1 ${
                          dueStatus === 'overdue' ? 'text-red-500' :
                          dueStatus === 'today' ? 'text-orange-500' :
                          'text-muted-foreground/40'
                        }`}>
                          {dueStatus === 'overdue' && <AlertTriangle className="w-3 h-3" />}
                          {dueStatus === 'overdue' ? 'ATRASADA · ' : dueStatus === 'today' ? 'HOJE · ' : ''}
                          Prazo: {format(parseISO(task.due_date), "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                      )}
                      {task.assignee?.full_name && (
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 mt-1 block">
                          Responsavel: {task.assignee.full_name}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Formulário nova tarefa */}
            <form
              onSubmit={e => {
                e.preventDefault();
                handleTaskSubmit();
              }}
              className="space-y-3 pt-2"
            >
              <Input
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
                placeholder="Qual o próximo passo com este lead?"
                className="text-xs h-12 bg-white border-border/10 focus:border-gold rounded-xl font-medium shadow-sm"
              />
              <div className="flex gap-2 items-center">
                <div className="flex-1 space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 ml-1">Prazo da tarefa (opcional)</label>
                  <Input
                    type="date"
                    value={newTaskDueDate}
                    onChange={e => setNewTaskDueDate(e.target.value)}
                    className="h-10 bg-white border-border/10 focus:border-gold rounded-xl text-sm font-medium shadow-sm"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 ml-1">Responsavel</label>
                  <select
                    value={newTaskAssignee}
                    onChange={(e) => setNewTaskAssignee(e.target.value)}
                    className="flex h-10 w-full rounded-xl bg-white border border-border/10 px-3 text-xs font-bold focus:border-gold outline-none shadow-sm"
                  >
                    <option value="">Sem responsavel</option>
                    {teamMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="submit"
                  disabled={addTaskMutation.isPending}
                  className="h-10 shrink-0 bg-gradient-gold text-white hover:opacity-90 rounded-xl shadow-gold self-end font-black uppercase text-[10px] tracking-widest px-4"
                >
                  {addTaskMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />} OK
                </Button>
              </div>
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
          {lead.stage === 'fechados' && !lead.client_id && (
            <Button
              size="lg"
              variant="outline"
              onClick={() => createClientFromLeadMutation.mutate()}
              disabled={createClientFromLeadMutation.isPending}
              className="h-12 px-7 border-emerald-300 text-emerald-700 hover:bg-emerald-600 hover:text-white font-black uppercase text-[10px] tracking-widest rounded-xl"
            >
              {createClientFromLeadMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
              Cadastrar Cliente
            </Button>
          )}
          <Button size="lg" onClick={() => onEdit(lead)} className="bg-gradient-gold hover:opacity-90 text-white font-black px-12 rounded-xl shadow-gold uppercase text-[11px] tracking-[0.25em] h-12 transition-all">
            <Edit className="w-4 h-4 mr-2" /> Editar Dados
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
