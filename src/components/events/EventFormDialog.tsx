import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2 } from 'lucide-react';

export const EventFormDialog = ({ open, onOpenChange, event, onSaved }: any) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    title: '',
    event_type: 'Casamento',
    event_date: '',
    event_time: '',
    location: '',
    budget_value: 0,
    payment_status: 'pending',
    client_id: '',
    lead_id: '',
    notes: ''
  });

  const leadTypeToEventType: Record<string, string> = {
    casamento: 'Casamento',
    '15_anos': '15 Anos',
    formatura: 'Formatura',
    aniversario: 'Aniversário',
    bodas: 'Bodas',
    corporativo: 'Corporativo',
  };

  useEffect(() => {
    if (event && open) {
      setForm({
        title: event.title || '',
        event_type: event.event_type || 'Casamento',
        event_date: event.event_date || '',
        event_time: event.event_time || '',
        location: event.location || '',
        budget_value: event.budget_value || 0,
        payment_status: event.payment_status || 'pending',
        client_id: event.client_id || '',
        lead_id: event.lead_id || '',
        notes: event.notes || ''
      });
    } else {
      setForm({
        title: '', event_type: 'Casamento', event_date: '', event_time: '',
        location: '', budget_value: 0, payment_status: 'pending',
        client_id: '', lead_id: '', notes: ''
      });
    }
  }, [event, open]);

  const { data: clients } = useQuery({
    queryKey: ['clients-options'],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('id, first_name, last_name');
      return data || [];
    }
  });

  const { data: leads } = useQuery({
    queryKey: ['closed-leads-options'],
    queryFn: async () => {
      const { data } = await supabase
        .from('leads')
        .select('id, title, stage, client_id, event_type, event_location, event_date, event_time, total_budget, notes, clients(first_name, last_name)')
        .eq('stage', 'fechados')
        .order('updated_at', { ascending: false });
      return data || [];
    }
  });

  const handleChange = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const applyClosedLead = (leadId: string) => {
    handleChange('lead_id', leadId);
    const selectedLead = leads?.find((lead: any) => lead.id === leadId);
    if (!selectedLead) return;

    const matchedClientByName = clients?.find((client: any) => {
      const leadFirst = String(selectedLead.clients?.first_name || '').trim().toLowerCase();
      const leadLast = String(selectedLead.clients?.last_name || '').trim().toLowerCase();
      if (!leadFirst || !leadLast) return false;
      return (
        String(client.first_name || '').trim().toLowerCase() === leadFirst &&
        String(client.last_name || '').trim().toLowerCase() === leadLast
      );
    });

    const resolvedClientId = selectedLead.client_id || matchedClientByName?.id || '';

    setForm((prev) => ({
      ...prev,
      lead_id: leadId,
      title: selectedLead.title || prev.title,
      event_type: leadTypeToEventType[selectedLead.event_type || ''] || selectedLead.event_type || prev.event_type,
      event_date: selectedLead.event_date || prev.event_date,
      event_time: selectedLead.event_time || prev.event_time,
      location: selectedLead.event_location || prev.location,
      budget_value: selectedLead.total_budget ?? prev.budget_value,
      notes: selectedLead.notes || prev.notes,
      client_id: resolvedClientId || prev.client_id,
    }));

    toast({ title: 'Lead fechado aplicado', description: 'Campos do evento preenchidos automaticamente.' });
  };

  const handleSave = async () => {
    if (!form.title) {
      toast({ title: 'Aviso', description: 'Título é obrigatório', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        title: form.title,
        event_type: form.event_type,
        event_date: form.event_date || null,
        event_time: form.event_time || null,
        location: form.location,
        budget_value: Number(form.budget_value),
        payment_status: form.payment_status,
        client_id: form.client_id || null,
        lead_id: form.lead_id || null,
        notes: form.notes
      };

      if (event?.id) {
        await supabase.from('events').update(payload).eq('id', event.id);
      } else {
        await supabase.from('events').insert([payload]);
      }

      toast({ title: 'Sucesso', description: 'Evento salvo com sucesso!', style: { backgroundColor: '#DAA520', color: '#000' } });
      
      // Sync Dashboard Data
      queryClient.invalidateQueries({ queryKey: ['dashboard_kpis'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_metrics'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      
      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!event?.id) return;

    setDeleting(true);
    try {
      const eventId = event.id as string;
      const { error } = await supabase.from('events').delete().eq('id', eventId);

      if (error && /foreign key|constraint|violates/i.test(error.message || '')) {
        const [contractsResult, paymentsResult] = await Promise.all([
          supabase.from('contracts').update({ event_id: null }).eq('event_id', eventId),
          supabase.from('payments').update({ event_id: null }).eq('event_id', eventId),
        ]);

        if (contractsResult.error) throw contractsResult.error;
        if (paymentsResult.error) throw paymentsResult.error;

        const retry = await supabase.from('events').delete().eq('id', eventId);
        if (retry.error) throw retry.error;
      } else if (error) {
        throw error;
      }

      toast({ title: 'Sucesso', description: 'Evento excluído com sucesso!', style: { backgroundColor: '#DAA520', color: '#000' } });

      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['agenda-events'] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_kpis'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_metrics'] });

      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open && !loading && !deleting) onOpenChange(false); }}>
      <DialogContent className="bg-white border-border/40 max-w-2xl text-foreground font-body h-[90vh] flex flex-col p-0 rounded-[28px] shadow-[0_25px_50px_-12px_rgba(218,165,32,0.15)] overflow-hidden">
        {/* Header - Fixed */}
        <div className="bg-gradient-gold p-6 text-white relative flex-none">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl" />
          <div className="flex items-start justify-between gap-4">
            <DialogHeader>
              <DialogTitle className="text-2xl font-display text-white tracking-tight">
                {event ? 'Refinar Evento' : 'Novo Projeto de Evento'}
              </DialogTitle>
              <p className="text-white/80 text-[9px] font-black uppercase tracking-[0.2em] mt-1">Gestão Executiva David Melo</p>
            </DialogHeader>
            {event?.id && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={loading || deleting}
                className="border-white/50 bg-white/10 text-white hover:bg-white hover:text-destructive whitespace-nowrap"
              >
                {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Excluir
              </Button>
            )}
          </div>
        </div>

        {/* Form Body - Scrollable */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-white/50 backdrop-blur-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2 md:col-span-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Título do Evento / Identificação</Label>
              <Input 
                value={form.title} 
                onChange={e => handleChange('title', e.target.value)} 
                className="bg-secondary/20 border-border/10 focus:border-gold h-11 rounded-xl text-sm font-bold shadow-sm"
                placeholder="Ex: Cerimônia de Casamento - Família Silva"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Importar de Lead Fechado</Label>
              <select 
                value={form.lead_id}
                onChange={e => applyClosedLead(e.target.value)}
                className="flex h-11 w-full rounded-xl bg-secondary/20 border border-border/10 px-4 py-2 text-[11px] font-black uppercase tracking-widest focus:border-gold text-foreground outline-none transition-all shadow-sm"
              >
                <option value="">-- Selecionar Lead Fechado --</option>
                {leads?.map((l: any) => {
                  const leadName = `${l.clients?.first_name || ''} ${l.clients?.last_name || ''}`.trim();
                  return (
                    <option key={l.id} value={l.id}>
                      {l.title} {leadName ? `• ${leadName}` : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Tipo de Evento</Label>
              <select 
                value={form.event_type}
                onChange={e => handleChange('event_type', e.target.value)}
                className="flex h-11 w-full rounded-xl bg-secondary/20 border border-border/10 px-4 py-2 text-xs font-bold uppercase tracking-wider focus:border-gold text-foreground outline-none transition-all shadow-sm"
              >
                <option value="Casamento">Casamento</option>
                <option value="Formatura">Formatura / Gala</option>
                <option value="15 Anos">15 Anos / Debutante</option>
                <option value="Corporativo">Corporativo / Business</option>
                <option value="Aniversário">Aniversário / Festa</option>
                <option value="Outro">Outro Especial</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Status de Faturamento</Label>
              <select 
                value={form.payment_status}
                onChange={e => handleChange('payment_status', e.target.value)}
                className="flex h-11 w-full rounded-xl bg-secondary/20 border border-border/10 px-4 py-2 text-xs font-bold uppercase tracking-wider focus:border-gold text-foreground outline-none transition-all shadow-sm"
              >
                <option value="pending" className="text-destructive font-bold">Pendente (Não Pago)</option>
                <option value="partial" className="text-amber-500 font-bold">Parcialmente Recebido</option>
                <option value="paid" className="text-emerald-500 font-bold">Totalmente Liquidado</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Data Prevista</Label>
              <Input 
                type="date"
                value={form.event_date} 
                onChange={e => handleChange('event_date', e.target.value)} 
                className="bg-secondary/20 border-border/10 focus:border-gold h-11 rounded-xl font-bold transition-all shadow-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Horário de Início</Label>
              <Input 
                type="time"
                value={form.event_time} 
                onChange={e => handleChange('event_time', e.target.value)} 
                className="bg-secondary/20 border-border/10 focus:border-gold h-11 rounded-xl font-bold transition-all shadow-sm"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Localização Principal</Label>
              <Input 
                value={form.location} 
                onChange={e => handleChange('location', e.target.value)} 
                className="bg-secondary/20 border-border/10 focus:border-gold h-11 rounded-xl text-sm font-bold shadow-sm"
                placeholder="Nome do salão, buffet ou endereço completo"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Orçamento Global do Projeto R$</Label>
              <Input 
                type="number"
                value={form.budget_value} 
                onChange={e => handleChange('budget_value', e.target.value)} 
                className="bg-gold/5 border-gold/20 focus:border-gold h-12 rounded-xl font-display text-xl text-gold shadow-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Contratante Principal (Cliente)</Label>
              <select 
                value={form.client_id}
                onChange={e => handleChange('client_id', e.target.value)}
                className="flex h-11 w-full rounded-xl bg-secondary/20 border border-border/10 px-4 py-2 text-[11px] font-black uppercase tracking-widest focus:border-gold text-foreground outline-none transition-all shadow-sm"
              >
                <option value="">-- Vincular Cliente --</option>
                {clients?.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                ))}
              </select>
            </div>

            

            <div className="space-y-2 md:col-span-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Notas e Observações Operacionais</Label>
              <textarea
                value={form.notes} 
                onChange={e => handleChange('notes', e.target.value)} 
                className="flex min-h-[100px] w-full rounded-xl bg-secondary/20 border border-border/10 px-4 py-3 text-sm font-medium focus:border-gold text-foreground outline-none transition-all shadow-sm"
                placeholder="Detalhes essenciais para o planejamento e execução..."
              />
            </div>
          </div>
        </div>

        {/* Footer - Fixed */}
        <div className="p-6 bg-white border-t border-border/10 flex-none flex flex-wrap justify-end items-center gap-3">
          {event?.id && (
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={loading || deleting}
              className="h-11 px-5 border-destructive/30 text-destructive hover:bg-destructive hover:text-white font-black uppercase text-[10px] tracking-[0.2em] rounded-xl"
            >
              {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Excluir Evento
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading || deleting} className="h-11 px-5 text-muted-foreground font-black uppercase text-[10px] tracking-[0.2em] rounded-xl hover:bg-secondary/50">
            Descartar
          </Button>
          <Button onClick={handleSave} disabled={loading || deleting} className="bg-gradient-gold hover:opacity-90 text-white font-black h-11 px-8 rounded-xl shadow-gold uppercase text-[11px] tracking-[0.25em] transition-all duration-300">
            {loading ? <Loader2 className="w-4 h-4 mr-3 animate-spin" /> : null}
            {event ? 'Atualizar Evento' : 'Publicar Evento'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
