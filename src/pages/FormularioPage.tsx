import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { publicSupabase } from '@/integrations/supabase/publicClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, ClipboardList, Copy, MessageCircle, Send } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import logo from '@/assets/logo.png';
import { publishLeadAlert } from '@/lib/leadAlerts';
import { buildClientChatUrl, clientChatExampleLink } from '@/lib/clientChatLink';

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
  const [submissionCompleted, setSubmissionCompleted] = useState(false);
  const [submittedChatLink, setSubmittedChatLink] = useState<string | null>(null);
  const publicFormUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

    if (hostname === 'app.davidmelo.com.br') {
      return 'https://app.davidmelo.com.br/#/formulario-publico';
    }

    return origin ? `${origin}/#/formulario-publico` : 'https://app.davidmelo.com.br/#/formulario-publico';
  }, []);

  const mutation = useMutation({
    mutationFn: async () => {
      const db = publicView ? publicSupabase : supabase;
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

      let createdLeadId: string | undefined;
      let chatToken: string | undefined;

      if (publicView) {
        const { data: publicSubmission, error: publicSubmissionError } = await (db as any).rpc('submit_public_budget_form', {
          p_title: payload.title,
          p_first_name: payload.first_name,
          p_last_name: payload.last_name,
          p_phone: payload.phone,
          p_event_type: payload.event_type,
          p_event_location: payload.event_location,
          p_event_date: payload.event_date,
          p_event_time: payload.event_time,
          p_guest_count: payload.guest_count,
          p_notes: payload.notes,
        });

        if (!publicSubmissionError) {
          const row = Array.isArray(publicSubmission) ? publicSubmission[0] : publicSubmission;
          createdLeadId = String((row as any)?.lead_id || '').trim() || undefined;
          chatToken = String((row as any)?.chat_token || '').trim() || undefined;
        } else {
          const { data, error } = await (db as any).from('leads').insert(payload).select('id').single();
          if (error) throw publicSubmissionError;
          createdLeadId = data?.id as string | undefined;
        }
      } else {
        const { data, error } = await (db as any).from('leads').insert(payload).select('id').single();
        if (error) throw error;
        createdLeadId = data?.id as string | undefined;
      }

      if (createdLeadId && !chatToken) {
        try {
          const { data: chatData } = await (db as any).rpc('get_or_create_lead_chat', { p_lead_id: createdLeadId });
          if (chatData && typeof chatData === 'object' && 'token' in chatData) {
            chatToken = String((chatData as { token?: string }).token || '').trim() || undefined;
          }
        } catch {
          chatToken = undefined;
        }

        if (!chatToken) {
          try {
            const { data: leadWithToken } = await (db as any)
              .from('leads')
              .select('chat_token')
              .eq('id', createdLeadId)
              .maybeSingle();

            chatToken = String((leadWithToken as any)?.chat_token || '').trim() || undefined;
          } catch {
            chatToken = undefined;
          }
        }
      }

      return {
        id: createdLeadId,
        chatToken,
      };
    },
    onSuccess: (createdLead?: { id?: string; chatToken?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setForm(initialState);
      publishLeadAlert('new', createdLead?.id);
      if (publicView) {
        setSubmissionCompleted(true);
        setSubmittedChatLink(createdLead?.chatToken ? buildClientChatUrl(createdLead.chatToken) : null);
      }
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
    <div className="p-4 md:p-8 space-y-6 md:space-y-8 animate-fade-in max-w-[1100px] mx-auto min-h-screen">
      <div className="flex items-center gap-4 border-b border-border/10 pb-6">
        <div className={publicView ? 'shrink-0' : 'w-12 h-12 shrink-0'}>
          <img
            src={logo}
            alt="David Melo"
            className={publicView ? 'h-16 md:h-20 w-auto object-contain' : 'w-12 h-12 object-contain'}
          />
        </div>
        <div className="w-12 h-12 rounded-xl bg-gold/10 text-gold flex items-center justify-center">
          <ClipboardList className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-display text-foreground tracking-tight uppercase">FORMULÁRIO DE ORÇAMENTO</h1>
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

      {submissionCompleted && publicView ? (
        <div className="bg-white border border-gold/30 rounded-[24px] p-8 md:p-10 premium-shadow text-center space-y-4">
          <img src={logo} alt="David Melo" className="h-20 md:h-24 w-auto mx-auto object-contain" />
          <div className="mx-auto w-14 h-14 rounded-full bg-gold/15 text-gold flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-display text-foreground tracking-tight uppercase">Obrigado pelo envio!</h2>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Recebemos seu formulário com sucesso e vamos analisar as informações para retornar com a proposta.
          </p>
          <div className="mx-auto max-w-2xl bg-gold/5 border border-gold/20 rounded-2xl px-4 py-5 space-y-2 text-left">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold/90 flex items-center gap-2">
              <MessageCircle className="w-4 h-4" /> Canal de Chat e Upload
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Neste canal você pode enviar fotos de inspirações e anexos, e nossa equipe enviará o orçamento em PDF no mesmo link.
            </p>
            {submittedChatLink ? (
              <a href={submittedChatLink} target="_blank" rel="noreferrer" className="text-xs font-bold text-gold underline break-all">
                {submittedChatLink}
              </a>
            ) : (
              <p className="text-xs text-muted-foreground break-all">
                Exemplo: <span className="font-bold text-gold">https://assessoriavip.com.br{clientChatExampleLink}</span>
              </p>
            )}
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-gold/90">Confirmação de recebimento concluída</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSubmissionCompleted(false);
              setSubmittedChatLink(null);
            }}
            className="mt-2 border-gold/40 text-gold hover:bg-gold hover:text-white"
          >
            Enviar novo formulário
          </Button>
        </div>
      ) : (
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
      )}
    </div>
  );
}
