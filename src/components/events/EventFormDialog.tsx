import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

export const EventFormDialog = ({ open, onOpenChange, event, onSaved }: any) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
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
    queryKey: ['leads-options'],
    queryFn: async () => {
      const { data } = await supabase.from('leads').select('id, title');
      return data || [];
    }
  });

  const handleChange = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
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
      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open && !loading) onOpenChange(false); }}>
      <DialogContent className="bg-dark border-border/30 max-w-2xl text-foreground font-body max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-display text-gold">
            {event ? 'Editar Evento' : 'Novo Evento'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
          <div className="space-y-2 md:col-span-2">
            <Label>Título do Evento *</Label>
            <Input 
              value={form.title} 
              onChange={e => handleChange('title', e.target.value)} 
              className="bg-dark-surface border-border/40 focus:border-gold"
              placeholder="Ex: Cerimônia de Casamento"
            />
          </div>

          <div className="space-y-2">
            <Label>Tipo de Evento</Label>
            <select 
              value={form.event_type}
              onChange={e => handleChange('event_type', e.target.value)}
              className="flex h-10 w-full rounded-md bg-dark-surface border border-border/40 px-3 py-2 text-sm focus:border-gold text-foreground outline-none"
            >
              <option value="Casamento">Casamento</option>
              <option value="Formatura">Formatura</option>
              <option value="15 Anos">15 Anos / Debutante</option>
              <option value="Corporativo">Corporativo</option>
              <option value="Aniversário">Aniversário</option>
              <option value="Outro">Outro</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label>Status Financeiro</Label>
            <select 
              value={form.payment_status}
              onChange={e => handleChange('payment_status', e.target.value)}
              className="flex h-10 w-full rounded-md bg-dark-surface border border-border/40 px-3 py-2 text-sm focus:border-gold text-foreground outline-none"
            >
              <option value="pending">Pendente (Não Pago)</option>
              <option value="partial">Parcialmente Pago</option>
              <option value="paid">Totalmente Pago</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label>Data do Evento</Label>
            <Input 
              type="date"
              value={form.event_date} 
              onChange={e => handleChange('event_date', e.target.value)} 
              className="bg-dark-surface border-border/40 focus:border-gold dark:[color-scheme:dark]"
            />
          </div>

          <div className="space-y-2">
            <Label>Hora do Evento</Label>
            <Input 
              type="time"
              value={form.event_time} 
              onChange={e => handleChange('event_time', e.target.value)} 
              className="bg-dark-surface border-border/40 focus:border-gold dark:[color-scheme:dark]"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Local/Endereço</Label>
            <Input 
              value={form.location} 
              onChange={e => handleChange('location', e.target.value)} 
              className="bg-dark-surface border-border/40 focus:border-gold"
              placeholder="Nome do salão, buffet ou endereço"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Orçamento (Budget) R$</Label>
            <Input 
              type="number"
              value={form.budget_value} 
              onChange={e => handleChange('budget_value', e.target.value)} 
              className="bg-dark-surface border-border/40 focus:border-gold"
            />
          </div>

          <div className="space-y-2">
            <Label>Vincular a um Cliente (Opcional)</Label>
            <select 
              value={form.client_id}
              onChange={e => handleChange('client_id', e.target.value)}
              className="flex h-10 w-full rounded-md bg-dark-surface border border-border/40 px-3 py-2 text-sm focus:border-gold text-foreground outline-none"
            >
              <option value="">-- Nenhum Cliente --</option>
              {clients?.map((c: any) => (
                <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Vincular a um Lead (Opcional)</Label>
            <select 
              value={form.lead_id}
              onChange={e => handleChange('lead_id', e.target.value)}
              className="flex h-10 w-full rounded-md bg-dark-surface border border-border/40 px-3 py-2 text-sm focus:border-gold text-foreground outline-none"
            >
              <option value="">-- Nenhum Lead --</option>
              {leads?.map((l: any) => (
                <option key={l.id} value={l.id}>{l.title}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Notas/Detalhes</Label>
            <textarea
              value={form.notes} 
              onChange={e => handleChange('notes', e.target.value)} 
              className="flex min-h-[80px] w-full rounded-md bg-dark-surface border border-border/40 px-3 py-2 text-sm focus:border-gold text-foreground outline-none"
              placeholder="Informações extras essenciais para o evento..."
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading} className="border-border/40 bg-dark-surface hover:bg-dark-surface/80 hover:text-white">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading} className="bg-gold hover:bg-gold-light text-dark font-medium">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {event ? 'Salvar Alterações' : 'Criar Evento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
