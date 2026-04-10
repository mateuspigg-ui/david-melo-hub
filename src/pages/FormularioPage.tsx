import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ClipboardList, Send } from 'lucide-react';

const EVENT_TYPES = [
  { value: 'casamento', label: 'Casamento' },
  { value: '15_anos', label: '15 Anos' },
  { value: 'formatura', label: 'Formatura' },
  { value: 'aniversario', label: 'Aniversário' },
  { value: 'bodas', label: 'Bodas' },
  { value: 'corporativo', label: 'Corporativo' },
];

type FormState = {
  title: string;
  first_name: string;
  last_name: string;
  phone: string;
  event_type: string;
  event_location: string;
  event_date: string;
  event_time: string;
  guest_count: string;
  notes: string;
};

const initialState: FormState = {
  title: '',
  first_name: '',
  last_name: '',
  phone: '',
  event_type: '',
  event_location: '',
  event_date: '',
  event_time: '',
  guest_count: '',
  notes: '',
};

export default function FormularioPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(initialState);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title.trim(),
        first_name: form.first_name.trim() || null,
        last_name: form.last_name.trim() || null,
        phone: form.phone.trim() || null,
        event_type: form.event_type || null,
        event_location: form.event_location.trim() || null,
        event_date: form.event_date || null,
        event_time: form.event_time || null,
        guest_count: form.guest_count ? Number(form.guest_count) : null,
        notes: form.notes.trim() || null,
        total_budget: null,
        stage: 'novo_contato',
      };

      if (!payload.title) throw new Error('Informe o título do evento.');
      if (!payload.first_name) throw new Error('Informe o nome do cliente.');
      if (!payload.phone) throw new Error('Informe o telefone do cliente.');
      if (!payload.event_type) throw new Error('Selecione o tipo de evento.');

      const { error } = await (supabase as any).from('leads').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setForm(initialState);
      toast({ title: 'Formulário enviado', description: 'Lead criado no Kanban em Novo Contato.' });
      setTimeout(() => navigate('/crm'), 700);
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao enviar', description: error?.message || 'Não foi possível registrar o formulário.', variant: 'destructive' });
    },
  });

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="p-8 space-y-8 animate-fade-in max-w-[1100px] mx-auto min-h-screen">
      <div className="flex items-center gap-4 border-b border-border/10 pb-6">
        <div className="w-12 h-12 rounded-xl bg-gold/10 text-gold flex items-center justify-center">
          <ClipboardList className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-3xl font-display text-foreground tracking-tight">Formulário de Orçamento</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gold mt-1">Cadastro de dados do evento</p>
        </div>
      </div>

      <div className="bg-white border border-border/40 rounded-[24px] p-6 md:p-8 premium-shadow space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2 space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Título do Evento *</Label>
            <Input value={form.title} onChange={(e) => updateField('title', e.target.value)} placeholder="Ex: Casamento Ana e Bruno" className="h-11 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Nome *</Label>
            <Input value={form.first_name} onChange={(e) => updateField('first_name', e.target.value)} placeholder="Nome" className="h-11 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Sobrenome</Label>
            <Input value={form.last_name} onChange={(e) => updateField('last_name', e.target.value)} placeholder="Sobrenome" className="h-11 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Telefone *</Label>
            <Input value={form.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="(00) 00000-0000" className="h-11 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Tipo de Evento *</Label>
            <Select value={form.event_type} onValueChange={(value) => updateField('event_type', value)}>
              <SelectTrigger className="h-11 bg-secondary/20 border-border/10 focus:ring-gold rounded-xl font-bold uppercase text-[10px] tracking-widest text-foreground">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent className="bg-white border-border/40 rounded-xl">
                {EVENT_TYPES.map((item) => (
                  <SelectItem key={item.value} value={item.value} className="font-bold text-[10px] uppercase tracking-widest py-3">
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2 space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Local</Label>
            <Input value={form.event_location} onChange={(e) => updateField('event_location', e.target.value)} placeholder="Cidade, salão, buffet..." className="h-11 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Data</Label>
            <Input type="date" value={form.event_date} onChange={(e) => updateField('event_date', e.target.value)} className="h-11 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Horário</Label>
            <Input type="time" value={form.event_time} onChange={(e) => updateField('event_time', e.target.value)} className="h-11 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Quantidade de Convidados</Label>
            <Input type="number" min="0" value={form.guest_count} onChange={(e) => updateField('guest_count', e.target.value)} placeholder="Ex: 150" className="h-11 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" />
          </div>

          <div className="md:col-span-2 space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Observação</Label>
            <Textarea value={form.notes} onChange={(e) => updateField('notes', e.target.value)} rows={5} placeholder="Detalhes adicionais do evento, preferências e informações importantes..." className="bg-secondary/20 border-border/10 focus:border-gold rounded-xl resize-none" />
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-border/10">
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-gradient-gold hover:opacity-90 text-white font-black h-11 px-10 rounded-xl shadow-gold uppercase text-[11px] tracking-[0.2em]"
          >
            <Send className="w-4 h-4 mr-2" />
            {mutation.isPending ? 'Enviando...' : 'Enviar Orçamento'}
          </Button>
        </div>
      </div>
    </div>
  );
}
