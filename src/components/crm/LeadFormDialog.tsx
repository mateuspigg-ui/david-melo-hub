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
      <DialogContent className="max-w-2xl h-[90vh] flex flex-col p-0 rounded-[28px] shadow-[0_25px_50px_-12px_rgba(218,165,32,0.15)] border-border/40 bg-background overflow-hidden font-body">
        {/* Header - Fixed */}
        <div className="bg-gradient-gold p-6 text-white flex-none relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl opacity-50" />
          <DialogHeader>
            <DialogTitle className="text-2xl font-display text-white tracking-tight">
              {lead ? 'Refinar Oportunidade' : 'Novo Registro de Lead'}
            </DialogTitle>
            <p className="text-white/80 text-[10px] font-black uppercase tracking-[0.2em] mt-1 italic">
              David Melo Hub • Gestão Comercial
            </p>
          </DialogHeader>
        </div>

        {/* Body - Scrollable */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-white/50 backdrop-blur-sm">
          <form id="lead-form" onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="sm:col-span-2 space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Título da Oportunidade *</Label>
                <Input 
                  {...register('title', { required: true })} 
                  placeholder="Ex: Casamento João & Maria" 
                  className="bg-secondary/20 border-border/10 focus:border-gold h-11 rounded-xl text-sm font-bold shadow-sm"
                />
              </div>
              
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Cliente Vinculado</Label>
                <Select value={watch('client_id')} onValueChange={v => setValue('client_id', v)}>
                  <SelectTrigger className="h-11 bg-secondary/20 border-border/10 focus:ring-gold rounded-xl font-bold uppercase text-[10px] tracking-widest text-foreground shadow-sm">
                    <SelectValue placeholder="Selecionar Cliente" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-border/40 shadow-2xl rounded-xl">
                    <SelectItem value="" className="font-bold text-[10px] uppercase tracking-widest opacity-40">-- Sem Vínculo --</SelectItem>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id} className="font-bold text-[10px] uppercase tracking-widest py-3">
                        {c.first_name} {c.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Estágio do Pipeline</Label>
                <Select value={watch('stage')} onValueChange={v => setValue('stage', v)}>
                  <SelectTrigger className="h-11 bg-secondary/20 border-border/10 focus:ring-gold rounded-xl font-bold uppercase text-[10px] tracking-widest text-foreground shadow-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-border/40 shadow-2xl rounded-xl">
                    {stages.map(s => (
                      <SelectItem key={s.id} value={s.id} className="font-bold text-[10px] uppercase tracking-widest py-3">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Tipo de Evento</Label>
                <Select value={watch('event_type') || ''} onValueChange={v => setValue('event_type', v)}>
                  <SelectTrigger className="h-11 bg-secondary/20 border-border/10 focus:ring-gold rounded-xl font-bold uppercase text-[10px] tracking-widest text-foreground shadow-sm">
                    <SelectValue placeholder="Tipo de projeto" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-border/40 shadow-2xl rounded-xl">
                    {eventTypes.map(t => (
                      <SelectItem key={t.value} value={t.value} className="font-bold text-[10px] uppercase tracking-widest py-3">
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Local Previsto</Label>
                <Input 
                  {...register('event_location')} 
                  placeholder="Salão, Buffet ou Cidade" 
                  className="bg-secondary/20 border-border/10 focus:border-gold h-11 rounded-xl text-sm font-bold shadow-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Data do Evento</Label>
                <Input type="date" {...register('event_date')} className="h-11 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold shadow-sm" />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Horário</Label>
                <Input type="time" {...register('event_time')} className="h-11 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold shadow-sm" />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Nº de Convidados</Label>
                <Input type="number" {...register('guest_count')} placeholder="Qtd" className="h-11 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold shadow-sm" />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Budget Estimado (R$)</Label>
                <Input type="number" step="0.01" {...register('total_budget')} placeholder="0,00" className="h-11 bg-gold/5 border-gold/20 focus:border-gold font-display text-lg text-gold rounded-xl text-center shadow-sm" />
              </div>

              <div className="sm:col-span-2 space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Consultor Responsável</Label>
                <Select value={watch('assigned_to') || ''} onValueChange={v => setValue('assigned_to', v)}>
                  <SelectTrigger className="h-11 bg-secondary/20 border-border/10 focus:ring-gold rounded-xl font-bold uppercase text-[10px] tracking-widest text-foreground shadow-sm">
                    <SelectValue placeholder="Selecionar Membro do Time" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-border/40 shadow-2xl rounded-xl">
                    {teamMembers.map(m => (
                      <SelectItem key={m.id} value={m.id} className="font-bold text-[10px] uppercase tracking-widest py-3">{m.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2 space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Notas e Observações</Label>
                <Textarea 
                  {...register('notes')} 
                  rows={3} 
                  placeholder="Expectativas do cliente, detalhes técnicos essenciais..." 
                  className="bg-secondary/20 border-border/10 focus:border-gold rounded-xl resize-none text-sm font-medium p-4 shadow-sm min-h-[100px]"
                />
              </div>
            </div>
          </form>
        </div>

        {/* Footer - Fixed */}
        <div className="p-6 bg-white border-t border-border/10 flex-none flex justify-between items-center gap-6">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="h-11 px-8 text-muted-foreground font-black uppercase text-[10px] tracking-[0.2em] rounded-xl hover:bg-secondary/50 transition-all">
            Descartar
          </Button>
          <Button 
            form="lead-form"
            type="submit" 
            disabled={mutation.isPending} 
            className="bg-gradient-gold hover:opacity-90 text-white font-black h-11 px-12 rounded-xl shadow-gold uppercase text-[11px] tracking-[0.25em] transition-all duration-300"
          >
            {mutation.isPending ? 'Sincronizando...' : lead ? 'Atualizar Lead' : 'Publicar Lead'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
