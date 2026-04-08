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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 rounded-2xl shadow-2xl border-border/40 bg-background overflow-hidden">
        <div className="bg-gradient-gold p-8 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display text-white">{lead ? 'Editar Oportunidade' : 'Nova Oportunidade'}</DialogTitle>
            <p className="text-white/80 text-sm mt-1">Insira as informações do lead para alimentar seu pipeline comercial.</p>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="p-8 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="sm:col-span-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-gold/80 mb-2 block">Título da Oportunidade *</Label>
              <Input 
                {...register('title', { required: true })} 
                placeholder="Ex: Casamento João & Maria" 
                className="bg-secondary/30 border-border/40 focus:border-gold h-11"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-gold/80 mb-2 block">Cliente Vinculado</Label>
              <Select value={watch('client_id')} onValueChange={v => setValue('client_id', v)}>
                <SelectTrigger className="h-11 bg-secondary/30 border-border/40 focus:ring-gold font-medium">
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent className="bg-white border-border/40 shadow-2xl capitalize">
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id} className="font-medium text-xs font-bold">{c.first_name} {c.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-gold/80 mb-2 block">Estágio do Pipeline</Label>
              <Select value={watch('stage')} onValueChange={v => setValue('stage', v)}>
                <SelectTrigger className="h-11 bg-secondary/30 border-border/40 focus:ring-gold font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-border/40 shadow-2xl">
                  {stages.map(s => (
                    <SelectItem key={s.id} value={s.id} className="font-medium text-xs font-bold">{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-gold/80 mb-2 block">Tipo de Evento</Label>
              <Select value={watch('event_type') || ''} onValueChange={v => setValue('event_type', v)}>
                <SelectTrigger className="h-11 bg-secondary/30 border-border/40 focus:ring-gold font-medium">
                  <SelectValue placeholder="Tipo de projeto" />
                </SelectTrigger>
                <SelectContent className="bg-white border-border/40 shadow-2xl">
                  {eventTypes.map(t => (
                    <SelectItem key={t.value} value={t.value} className="font-medium text-xs font-bold">{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-gold/80 mb-2 block">Local Previsto</Label>
              <Input 
                {...register('event_location')} 
                placeholder="Salão, Buffet ou Cidade" 
                className="bg-secondary/30 border-border/40 focus:border-gold h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-gold/80 mb-2 block">Data do Evento</Label>
              <Input type="date" {...register('event_date')} className="h-11 bg-secondary/30 border-border/40 focus:border-gold" />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-gold/80 mb-2 block">Horário</Label>
              <Input type="time" {...register('event_time')} className="h-11 bg-secondary/30 border-border/40 focus:border-gold" />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-gold/80 mb-2 block">Nº de Convidados</Label>
              <Input type="number" {...register('guest_count')} placeholder="Qtd" className="h-11 bg-secondary/30 border-border/40 focus:border-gold" />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-gold/80 mb-2 block">Budget Estimado (R$)</Label>
              <Input type="number" step="0.01" {...register('total_budget')} placeholder="0,00" className="h-11 bg-secondary/30 border-border/40 focus:border-gold font-bold text-gold" />
            </div>

            <div className="sm:col-span-2 space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-gold/80 mb-2 block">Consultor Responsável</Label>
              <Select value={watch('assigned_to') || ''} onValueChange={v => setValue('assigned_to', v)}>
                <SelectTrigger className="h-11 bg-secondary/30 border-border/40 focus:ring-gold font-medium">
                  <SelectValue placeholder="Selecione um membro do time" />
                </SelectTrigger>
                <SelectContent className="bg-white border-border/40 shadow-2xl">
                  {teamMembers.map(m => (
                    <SelectItem key={m.id} value={m.id} className="font-medium text-xs font-bold">{m.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-2 space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-gold/80 mb-2 block">Breve Resumo / Notas</Label>
              <Textarea 
                {...register('notes')} 
                rows={3} 
                placeholder="Expectativas do cliente, detalhes técnicos essenciais..." 
                className="bg-secondary/30 border-border/40 focus:border-gold resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-border/10">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground font-bold uppercase text-[11px] tracking-widest">
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending} className="bg-gold hover:bg-gold-light text-white font-bold h-11 px-8 rounded-lg shadow-gold uppercase text-[11px] tracking-widest">
              {mutation.isPending ? 'Salvando...' : lead ? 'Salvar Edição' : 'Criar Oportunidade'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
