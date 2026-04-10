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
import { ClipboardList, Copy, Send } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

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

interface Props {
  publicView?: boolean;
}

export default function FormularioPage({ publicView = false }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState<FormState>(initialState);
  const publicFormUrl = 'https://davidmelo.com.br/formulario-publico';

  const mutation = useMutation({
    mutationFn: async () => {
      const title = form.title.trim();
      const firstName = form.first_name.trim();
      const lastName = form.last_name.trim();
      const phone = form.phone.trim();
      const eventType = form.event_type;
      const eventLocation = form.event_location.trim();
      const eventDate = form.event_date;
      const eventTime = form.event_time;
      const guestCountRaw = form.guest_count;
      const notes = form.notes.trim();

      if (!title) throw new Error('Informe o título do evento.');
      if (!firstName) throw new Error('Informe o nome do cliente.');
      if (!lastName) throw new Error('Informe o sobrenome do cliente.');
      if (!phone) throw new Error('Informe o telefone do cliente.');
      if (!eventType) throw new Error('Selecione o tipo de evento.');
      if (!eventLocation) throw new Error('Informe o local do evento.');
      if (!eventDate) throw new Error('Informe a data do evento.');
      if (!eventTime) throw new Error('Informe o horário do evento.');
      if (!guestCountRaw) throw new Error('Informe a quantidade de convidados.');

      const guestCount = Number(guestCountRaw);
      if (!Number.isFinite(guestCount) || guestCount <= 0) {
        throw new Error('A quantidade de convidados deve ser maior que zero.');
      }

      const payload = {
        title,
        first_name: firstName,
        last_name: lastName,
        phone,
        event_type: eventType,
        event_location: eventLocation,
        event_date: eventDate,
        event_time: eventTime,
        guest_count: guestCount,
        notes: notes || null,
        total_budget: null,
        stage: 'novo_contato',
      };

      const { error } = await (supabase as any).from('leads').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setForm(initialState);
      toast({
        title: 'Formulário enviado',
        description: user ? 'Lead criado no Kanban em Novo Contato.' : 'Recebemos seu pedido de orçamento. Em breve entraremos em contato.',
      });
      if (user && !publicView) {
        setTimeout(() => navigate('/crm'), 700);
      }
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao enviar', description: error?.message || 'Não foi possível registrar o formulário.', variant: 'destructive' });
    },
  });

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCopyPublicLink = async () => {
    try {
      await navigator.clipboard.writeText(publicFormUrl);
      toast({ title: 'Link copiado', description: publicFormUrl });
    } catch {
      toast({ title: 'Não foi possível copiar o link', variant: 'destructive' });
    }
  };

  return (
    <div className="p-8 space-y-8 animate-fade-in max-w-[1100px] mx-auto min-h-screen">
      <div className="flex items-center gap-4 border-b border-border/10 pb-6">
        <div className="w-12 h-12 rounded-xl bg-gold/10 text-gold flex items-center justify-center">
          <ClipboardList className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-3xl font-display text-foreground tracking-tight uppercase">FORMULÁRIO DE ORÇAMENTO</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gold mt-1">
            {publicView ? 'Preencha para solicitar proposta' : 'Cadastro de dados do evento'}
          </p>
        </div>
        {!publicView && (
          <Button
            type="button"
            variant="outline"
            onClick={handleCopyPublicLink}
            className="ml-auto border-gold/40 text-gold hover:bg-gold hover:text-white"
          >
            <Copy className="w-4 h-4 mr-2" /> Copiar link público
          </Button>
        )}
      </div>

      <div className="bg-white border border-border/40 rounded-[24px] p-6 md:p-8 premium-shadow space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2 space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Título do Evento *</Label>
            <Input required value={form.title} onChange={(e) => updateField('title', e.target.value)} placeholder="Ex: Casamento Ana e Bruno" className="h-11 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Nome *</Label>
            <Input required value={form.first_name} onChange={(e) => updateField('first_name', e.target.value)} placeholder="Nome" className="h-11 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Sobrenome *</Label>
            <Input required value={form.last_name} onChange={(e) => updateField('last_name', e.target.value)} placeholder="Sobrenome" className="h-11 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Telefone *</Label>
            <Input required value={form.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="(00) 00000-0000" className="h-11 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" />
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
            <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Local *</Label>
            <Input required value={form.event_location} onChange={(e) => updateField('event_location', e.target.value)} placeholder="Cidade, salão, buffet..." className="h-11 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Data *</Label>
            <Input required type="date" value={form.event_date} onChange={(e) => updateField('event_date', e.target.value)} className="h-11 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Horário *</Label>
            <Input required type="time" value={form.event_time} onChange={(e) => updateField('event_time', e.target.value)} className="h-11 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Quantidade de Convidados *</Label>
            <Input required type="number" min="1" value={form.guest_count} onChange={(e) => updateField('guest_count', e.target.value)} placeholder="Ex: 150" className="h-11 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" />
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
