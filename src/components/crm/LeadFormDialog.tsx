import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Lead } from '@/pages/CRMPage';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  clients: { id: string; first_name: string; last_name: string }[];
  teamMembers: { id: string; full_name: string }[];
  stages: { id: string; label: string }[];
  eventTypes: { value: string; label: string }[];
}

interface FormData {
  title: string;
  client_id: string;
  stage: string;
  event_type: string;
  event_location: string;
  event_date: string;
  event_time: string;
  guest_count: string;
  total_budget: string;
  notes: string;
  assigned_to: string;
}

export default function LeadFormDialog({ open, onOpenChange, lead, clients, teamMembers, stages, eventTypes }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, setValue, watch } = useForm<FormData>();

  useEffect(() => {
    if (open) {
      if (lead) {
        reset({
          title: lead.title,
          client_id: lead.client_id || '',
          stage: lead.stage,
          event_type: lead.event_type || '',
          event_location: lead.event_location || '',
          event_date: lead.event_date || '',
          event_time: lead.event_time || '',
          guest_count: lead.guest_count?.toString() || '',
          total_budget: lead.total_budget?.toString() || '',
          notes: lead.notes || '',
          assigned_to: lead.assigned_to || '',
        });
      } else {
        reset({ title: '', client_id: '', stage: 'novo_contato', event_type: '', event_location: '', event_date: '', event_time: '', guest_count: '', total_budget: '', notes: '', assigned_to: '' });
      }
    }
  }, [open, lead, reset]);

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        title: data.title,
        client_id: data.client_id || null,
        stage: data.stage,
        event_type: data.event_type || null,
        event_location: data.event_location || null,
        event_date: data.event_date || null,
        event_time: data.event_time || null,
        guest_count: data.guest_count ? parseInt(data.guest_count) : null,
        total_budget: data.total_budget ? parseFloat(data.total_budget) : null,
        notes: data.notes || null,
        assigned_to: data.assigned_to || null,
      };
      if (lead) {
        const { error } = await supabase.from('leads').update(payload).eq('id', lead.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('leads').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      onOpenChange(false);
      toast({ title: lead ? 'Lead atualizado' : 'Lead criado com sucesso' });
    },
    onError: () => toast({ title: 'Erro ao salvar lead', variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{lead ? 'Editar Lead' : 'Novo Lead'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label>Título *</Label>
              <Input {...register('title', { required: true })} placeholder="Ex: Casamento João & Maria" />
            </div>
            <div>
              <Label>Cliente</Label>
              <Select value={watch('client_id')} onValueChange={v => setValue('client_id', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Etapa</Label>
              <Select value={watch('stage')} onValueChange={v => setValue('stage', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stages.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de Evento</Label>
              <Select value={watch('event_type') || ''} onValueChange={v => setValue('event_type', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {eventTypes.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Local</Label>
              <Input {...register('event_location')} placeholder="Local do evento" />
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" {...register('event_date')} />
            </div>
            <div>
              <Label>Horário</Label>
              <Input type="time" {...register('event_time')} />
            </div>
            <div>
              <Label>Convidados</Label>
              <Input type="number" {...register('guest_count')} placeholder="Número" />
            </div>
            <div>
              <Label>Orçamento Total (R$)</Label>
              <Input type="number" step="0.01" {...register('total_budget')} placeholder="0,00" />
            </div>
            <div>
              <Label>Responsável</Label>
              <Select value={watch('assigned_to') || ''} onValueChange={v => setValue('assigned_to', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {teamMembers.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Notas</Label>
              <Textarea {...register('notes')} rows={3} placeholder="Observações sobre o lead..." />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending} className="bg-gold hover:bg-gold-dark text-dark">
              {mutation.isPending ? 'Salvando...' : lead ? 'Atualizar' : 'Criar Lead'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
