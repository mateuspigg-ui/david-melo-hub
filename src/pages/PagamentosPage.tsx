import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Plus, Search, DollarSign, Calendar, ChevronDown, ChevronUp, Trash2, Pencil } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrencyInput, maskCurrencyInput, parseCurrencyInput } from "@/lib/currencyInput";

type Payment = {
  id: string;
  total_event_value: number;
  installment_count: number;
  has_entry_payment: boolean | null;
  entry_amount: number | null;
  entry_date: string | null;
  entry_paid_at: string | null;
  client_id: string | null;
  event_id: string | null;
  created_at: string;
  clients?: { first_name: string; last_name: string } | null;
  events?: { title: string } | null;
};

type Installment = {
  id: string;
  payment_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  status: string;
  paid_at: string | null;
};

type InstallmentPlanItem = {
  installment_number: number;
  due_date: string;
  amount: string;
  status?: string;
  paid_at?: string | null;
};

const currencyFmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const PAID_STATUS_VALUES = ["paid", "pago"] as const;
const PENDING_STATUS_VALUES = ["pending", "pendente"] as const;

const normalizeStatus = (status: string | null | undefined) => String(status || "").toLowerCase();
const isInstallmentPaid = (status: string | null | undefined, paidAt?: string | null) =>
  PAID_STATUS_VALUES.includes(normalizeStatus(status) as (typeof PAID_STATUS_VALUES)[number]) || !!paidAt;

export default function PagamentosPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);

  // form state
  const [form, setForm] = useState({
    total_event_value: "",
    installment_count: "1",
    has_entry_payment: false,
    entry_amount: "",
    entry_date: "",
    client_id: "",
    event_id: "",
  });
  const [installmentPlan, setInstallmentPlan] = useState<InstallmentPlanItem[]>([]);

  const isMissingEntryPaidAtColumnError = (error: any) => {
    const message = String(error?.message || '');
    return /column .*entry_paid_at.* does not exist/i.test(message)
      || /entry_paid_at.*schema cache/i.test(message)
      || /could not find.*entry_paid_at.*payments/i.test(message);
  };

  const buildDefaultInstallments = (count: number, remaining: number, baseDate?: string) => {
    const anchor = baseDate ? new Date(`${baseDate}T12:00:00`) : new Date();
    const safeAnchor = Number.isNaN(anchor.getTime()) ? new Date() : anchor;
    const perInstallment = count > 0 ? remaining / count : 0;
    return Array.from({ length: count }, (_, i) => {
      const due = new Date(safeAnchor);
      due.setMonth(due.getMonth() + i + 1);
      return {
        installment_number: i + 1,
        due_date: due.toISOString().split("T")[0],
        amount: formatCurrencyInput(Math.round(perInstallment * 100) / 100),
        status: 'pending',
        paid_at: null,
      };
    });
  };

  useEffect(() => {
    if (!dialogOpen) return;

    const totalValue = parseCurrencyInput(form.total_event_value);
    const count = Number(form.installment_count);
    const hasEntry = form.has_entry_payment;
    const entryAmount = hasEntry ? parseCurrencyInput(form.entry_amount) : 0;

    if (!Number.isFinite(totalValue) || totalValue <= 0 || !Number.isInteger(count) || count < 1) {
      setInstallmentPlan([]);
      return;
    }

    const remaining = totalValue - (hasEntry ? entryAmount : 0);
    if (!Number.isFinite(remaining) || remaining < 0) {
      setInstallmentPlan([]);
      return;
    }

    const defaults = buildDefaultInstallments(
      count,
      remaining,
      hasEntry && form.entry_date ? form.entry_date : undefined
    );
    setInstallmentPlan(defaults);
  }, [dialogOpen, form.total_event_value, form.installment_count, form.has_entry_payment, form.entry_amount, form.entry_date]);

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, clients(first_name, last_name), events(title)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Payment[];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-select"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, first_name, last_name").order("first_name");
      return data || [];
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["events-select"],
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("id, title, client_id, budget_value, event_date")
        .order("event_date", { ascending: false });
      return data || [];
    },
  });

  const eventsByClient = useMemo(() => {
    if (!form.client_id) return events;
    return events.filter((evt: any) => evt.client_id === form.client_id);
  }, [events, form.client_id]);

  const autoApplyEvent = (eventId: string, clientId?: string) => {
    const source = clientId ? events.filter((evt: any) => evt.client_id === clientId) : events;
    const selectedEvent = source.find((evt: any) => evt.id === eventId) || null;

    setForm((prev) => ({
      ...prev,
      event_id: eventId,
      total_event_value:
        selectedEvent && selectedEvent.budget_value != null
          ? formatCurrencyInput(selectedEvent.budget_value)
          : prev.total_event_value,
    }));
  };

  const handleClientSelect = (clientId: string) => {
    const clientEvents = events.filter((evt: any) => evt.client_id === clientId);
    const preferredEvent =
      clientEvents.find((evt: any) => Number(evt.budget_value || 0) > 0) || clientEvents[0] || null;

    setForm((prev) => ({
      ...prev,
      client_id: clientId,
      event_id: preferredEvent?.id || "",
      total_event_value:
        preferredEvent && preferredEvent.budget_value != null
          ? formatCurrencyInput(preferredEvent.budget_value)
          : prev.total_event_value,
    }));
  };

  const { data: installments = [] } = useQuery({
    queryKey: ["installments", expandedId],
    enabled: !!expandedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_installments")
        .select("*")
        .eq("payment_id", expandedId!)
        .order("installment_number");
      if (error) throw error;
      return data as Installment[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const totalValue = parseCurrencyInput(form.total_event_value);
      const count = Number(form.installment_count);
      const hasEntry = form.has_entry_payment;
      const entryAmount = hasEntry ? parseCurrencyInput(form.entry_amount) : null;

      if (!Number.isFinite(totalValue) || totalValue <= 0) {
        throw new Error('Informe um valor total válido maior que zero.');
      }

      if (!Number.isInteger(count) || count < 1) {
        throw new Error('Informe uma quantidade de parcelas válida (mínimo 1).');
      }

      if (hasEntry) {
        if (!Number.isFinite(entryAmount as number) || (entryAmount as number) <= 0) {
          throw new Error('Informe um valor de entrada válido.');
        }
        if ((entryAmount as number) > totalValue) {
          throw new Error('O valor de entrada não pode ser maior que o valor total.');
        }
        if (!form.entry_date) {
          throw new Error('Informe a data da entrada.');
        }
      }

      const paymentId = editingPayment?.id || crypto.randomUUID();

      if (editingPayment?.id) {
        const { error } = await supabase
          .from('payments')
          .update({
            total_event_value: totalValue,
          installment_count: count,
          has_entry_payment: hasEntry,
          entry_amount: entryAmount,
          entry_date: hasEntry && form.entry_date ? form.entry_date : null,
          client_id: form.client_id || null,
          event_id: form.event_id || null,
        })
          .eq('id', editingPayment.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('payments')
          .insert({
            id: paymentId,
            total_event_value: totalValue,
            installment_count: count,
            has_entry_payment: hasEntry,
            entry_amount: entryAmount,
            entry_date: hasEntry && form.entry_date ? form.entry_date : null,
            client_id: form.client_id || null,
            event_id: form.event_id || null,
          });
        if (error) throw error;
      }

      const remaining = hasEntry && entryAmount ? totalValue - entryAmount : totalValue;
      if (remaining < 0) {
        throw new Error('Não foi possível calcular as parcelas. Verifique os valores informados.');
      }

      const sourcePlan = installmentPlan.length === count
        ? installmentPlan
        : buildDefaultInstallments(count, remaining, hasEntry && form.entry_date ? form.entry_date : undefined);
      const installmentsData = sourcePlan.map((item) => ({
        payment_id: paymentId,
        installment_number: item.installment_number,
        due_date: item.due_date,
        amount: parseCurrencyInput(item.amount),
        status: item.status || 'pending',
        paid_at: item.paid_at || null,
      }));

      const hasInvalidInstallments = installmentsData.some(
        (item) => !item.due_date || !Number.isFinite(item.amount) || item.amount <= 0
      );
      if (hasInvalidInstallments) {
        throw new Error('Preencha data e valor válidos para todas as parcelas.');
      }

      const installmentsSum = installmentsData.reduce((acc, curr) => acc + curr.amount, 0);
      if (Math.abs(installmentsSum - remaining) > 0.01) {
        throw new Error(`A soma das parcelas (${currencyFmt(installmentsSum)}) deve ser igual ao saldo a parcelar (${currencyFmt(remaining)}).`);
      }

      if (editingPayment?.id) {
        const { error: deleteInstallmentsError } = await supabase.from('payment_installments').delete().eq('payment_id', paymentId);
        if (deleteInstallmentsError) throw deleteInstallmentsError;
      }

      const { error: instError } = await supabase.from('payment_installments').insert(installmentsData as any);
      if (instError) {
        const looksLikeStatusMismatch = /status|pending|pendente/i.test(instError.message || '');

        if (looksLikeStatusMismatch) {
          const retryData = installmentsData.map((item) => ({ ...item, status: 'pendente' }));
          const { error: retryError } = await supabase.from('payment_installments').insert(retryData as any);
          if (!retryError) return;
          if (!editingPayment?.id) {
            await supabase.from('payments').delete().eq('id', paymentId);
          }
          throw retryError;
        }

        if (!editingPayment?.id) {
          await supabase.from('payments').delete().eq('id', paymentId);
        }
        throw instError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      // Sync Dashboard
      qc.invalidateQueries({ queryKey: ["dashboard_kpis"] });
      qc.invalidateQueries({ queryKey: ["dashboard_metrics"] });
      
      setDialogOpen(false);
      resetForm();
      toast({ title: editingPayment ? "Contrato atualizado com sucesso" : "Pagamento criado com sucesso", style: { backgroundColor: '#C5A059', color: '#fff' } });
    },
    onError: (e: any) => toast({ title: editingPayment ? "Erro ao atualizar contrato" : "Erro ao criar pagamento", description: e?.message || 'Verifique os dados informados.', variant: "destructive" }),
  });

  const togglePaidMutation = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      if (isInstallmentPaid(currentStatus)) {
        let lastError: any = null;

        for (const fallbackStatus of PENDING_STATUS_VALUES) {
          const { error } = await supabase
            .from("payment_installments")
            .update({ status: fallbackStatus, paid_at: null } as any)
            .eq("id", id);
          if (!error) return;
          lastError = error;
        }

        if (lastError) throw lastError;
        return;
      }

      const paidAt = new Date().toISOString();
      let lastError: any = null;

      for (const fallbackStatus of PAID_STATUS_VALUES) {
        const { error } = await supabase
          .from("payment_installments")
          .update({ status: fallbackStatus, paid_at: paidAt } as any)
          .eq("id", id);
        if (!error) return;
        lastError = error;
      }

      if (lastError) throw lastError;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["installments"] });
      qc.invalidateQueries({ queryKey: ["dashboard_kpis"] });
      qc.invalidateQueries({ queryKey: ["dashboard_metrics"] });
      toast({
        title: isInstallmentPaid(variables.currentStatus) ? 'Baixa desfeita com sucesso' : 'Mês auditado e baixado com sucesso!',
        style: { backgroundColor: '#10b981', color: '#fff' }
      });
    },
    onError: (e: any) => {
      toast({
        title: 'Erro ao efetivar baixa',
        description: e?.message || 'Não foi possível atualizar o status da parcela.',
        variant: 'destructive',
      });
    },
  });

  const toggleEntryPaidMutation = useMutation({
    mutationFn: async ({ id, currentPaidAt }: { id: string; currentPaidAt: string | null }) => {
      const { error } = await supabase
        .from('payments')
        .update({ entry_paid_at: currentPaidAt ? null : new Date().toISOString() } as any)
        .eq('id', id);
      if (error) {
        if (isMissingEntryPaidAtColumnError(error)) {
          throw new Error('A coluna entry_paid_at ainda não existe no banco. Aplique as migrations do Supabase para habilitar baixa da entrada.');
        }
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["dashboard_kpis"] });
      qc.invalidateQueries({ queryKey: ["dashboard_metrics"] });
      toast({ title: 'Entrada atualizada com sucesso' });
    },
    onError: (e: any) => toast({ title: 'Erro ao atualizar entrada', description: e?.message || 'Tente novamente.', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("payment_installments").delete().eq("payment_id", id);
      const { error } = await supabase.from("payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["dashboard_kpis"] });
      qc.invalidateQueries({ queryKey: ["dashboard_metrics"] });
      setExpandedId(null);
      toast({ title: "Contrato removido do ecossistema.", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setForm({ total_event_value: "", installment_count: "1", has_entry_payment: false, entry_amount: "", entry_date: "", client_id: "", event_id: "" });
    setInstallmentPlan([]);
    setEditingPayment(null);
  };

  const openEditDialog = async (payment: Payment) => {
    setEditingPayment(payment);
    setForm({
      total_event_value: payment.total_event_value != null ? formatCurrencyInput(payment.total_event_value) : '',
      installment_count: String(payment.installment_count ?? 1),
      has_entry_payment: !!payment.has_entry_payment,
      entry_amount: payment.entry_amount != null ? formatCurrencyInput(payment.entry_amount) : '',
      entry_date: payment.entry_date || '',
      client_id: payment.client_id || '',
      event_id: payment.event_id || '',
    });

    const { data, error } = await supabase
      .from('payment_installments')
      .select('installment_number, due_date, amount, status, paid_at')
      .eq('payment_id', payment.id)
      .order('installment_number');

    if (error) {
      toast({ title: 'Erro ao carregar parcelas', description: error.message, variant: 'destructive' });
      return;
    }

    setInstallmentPlan(
      (data || []).map((item: any) => ({
        installment_number: item.installment_number,
        due_date: item.due_date,
        amount: item.amount != null ? formatCurrencyInput(item.amount) : '',
        status: item.status,
        paid_at: item.paid_at,
      }))
    );

    setDialogOpen(true);
  };

  const updateInstallment = (index: number, field: 'due_date' | 'amount', value: string) => {
    setInstallmentPlan((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        if (field === 'amount') {
          return { ...item, amount: maskCurrencyInput(value) };
        }
        return { ...item, due_date: value };
      })
    );
  };

  const filtered = payments.filter((p) => {
    const clientName = p.clients ? `${p.clients.first_name} ${p.clients.last_name}` : "";
    const eventTitle = p.events?.title || "";
    return `${clientName} ${eventTitle}`.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-10 animate-fade-in max-w-[1700px] mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 px-2">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 bg-gold rounded-full" />
            <h1 className="text-4xl md:text-5xl font-display text-foreground tracking-tighter uppercase leading-none">Gestão Financeira</h1>
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.4em] text-gold/80 pl-4">David Melo Produções • Fluxo de Recebíveis e Contratos</p>
        </div>
        <Button 
          onClick={() => { resetForm(); setDialogOpen(true); }} 
          className="bg-gradient-gold hover:opacity-90 text-white font-bold h-14 px-8 rounded-2xl shadow-gold uppercase text-[11px] tracking-[0.2em] transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="w-5 h-5 mr-2" /> Novo Contrato
        </Button>
      </div>

      <div className="px-2">
        <div className="relative group max-w-xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-gold transition-colors" />
          <Input 
            placeholder="Buscar por cliente ou evento..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            className="pl-12 bg-white/50 backdrop-blur-sm border-border/30 focus:border-gold/50 h-14 rounded-2xl transition-all focus:ring-4 focus:ring-gold/5 premium-shadow" 
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-6 px-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-white/40 rounded-[32px] animate-pulse border border-border/20 shadow-sm" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mx-2 bg-white/40 backdrop-blur-md rounded-[40px] p-24 border border-border/20 text-center flex flex-col items-center justify-center premium-shadow">
          <div className="w-20 h-20 rounded-3xl bg-secondary/30 flex items-center justify-center mb-6">
            <DollarSign className="w-10 h-10 text-muted-foreground/30" />
          </div>
          <h3 className="text-2xl font-display text-foreground uppercase tracking-tight">Nenhum contrato ativo</h3>
          <p className="text-xs text-muted-foreground/60 mt-2 font-black uppercase tracking-widest max-w-xs leading-relaxed">
            Sua base de recebíveis está limpa. Comece gerando um novo contrato para seus clientes.
          </p>
        </div>
      ) : (
        <div className="space-y-6 px-2">
          {filtered.map((p) => {
            const expanded = expandedId === p.id;
            return (
              <div key={p.id} className={cn(
                "group bg-white rounded-[32px] border transition-all duration-500 relative overflow-hidden",
                expanded ? 'premium-shadow-lg border-gold/20' : 'premium-shadow border-border/30 hover:border-gold/20'
              )}>
                <div className="absolute inset-0 bg-gradient-to-br from-gold/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                
                <div
                  className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between p-8 cursor-pointer gap-8"
                  onClick={() => setExpandedId(expanded ? null : p.id)}
                >
                  <div className="flex items-center gap-6">
                    <div className={cn(
                      "w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-sm shrink-0",
                      expanded ? 'bg-gold text-white rotate-6' : 'bg-gold/10 text-gold'
                    )}>
                      <DollarSign className="w-8 h-8" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-xl font-display text-foreground tracking-tight leading-none uppercase">
                        {p.clients ? `${p.clients.first_name} ${p.clients.last_name}` : "Cliente não identificado"}
                      </h4>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-[10px] font-black text-gold uppercase tracking-[0.15em] bg-gold/5 px-2.5 py-1 rounded-lg border border-gold/10">
                          {p.events?.title || "Evento sem título"}
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-border" />
                          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-60">
                            {p.installment_count} {p.installment_count === 1 ? 'parcela' : 'parcelas'} programada{p.installment_count === 1 ? '' : 's'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between lg:justify-end gap-10">
                    <div className="text-right">
                      <p className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-[0.2em] mb-1">Valor Total</p>
                      <p className="text-3xl font-display text-foreground tracking-tighter leading-none">{currencyFmt(p.total_event_value)}</p>
                      {p.has_entry_payment && p.entry_amount && (
                        <div className="mt-3 flex items-center justify-end gap-2 text-emerald-600">
                          <span className="text-[9px] font-black uppercase tracking-widest">Entrada: {currencyFmt(p.entry_amount)}</span>
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-12 w-12 text-muted-foreground/40 hover:text-gold hover:bg-gold/5 rounded-2xl transition-all"
                        onClick={(e) => { e.stopPropagation(); openEditDialog(p); }}
                      >
                        <Pencil className="w-5 h-5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-12 w-12 text-muted-foreground/40 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all"
                        onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(p.id); }}
                      >
                        <Trash2 className="w-5 h-5" />
                      </Button>
                      <div className={cn(
                        "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                        expanded ? 'bg-gold/10 text-gold' : 'bg-secondary/50 text-muted-foreground/50'
                      )}>
                        <ChevronDown className={cn("w-5 h-5 transition-transform duration-500", expanded && "rotate-180")} />
                      </div>
                    </div>
                  </div>
                </div>

                {expanded && (
                  <div className="relative z-10 bg-secondary/20 border-t border-border/10 p-8 animate-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-2 mb-8">
                      <div className="h-4 w-1 bg-gold rounded-full" />
                      <h5 className="text-[10px] font-black text-foreground/40 uppercase tracking-[0.25em]">Cronograma de Liquidação</h5>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {p.has_entry_payment && p.entry_amount && (
                        <div className="col-span-1 md:col-span-2 lg:col-span-1 flex items-center justify-between p-6 rounded-[24px] bg-emerald-50/50 border border-emerald-200/50 shadow-sm hover:shadow-md transition-all group/entry">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center shadow-sm group-hover/entry:scale-110 transition-transform">
                              <Calendar className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div>
                              <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-1">Entrada</p>
                              <p className="text-sm font-bold text-emerald-900">
                                {p.entry_date ? format(new Date(p.entry_date + "T12:00:00"), "dd 'de' MMMM", { locale: ptBR }) : 'Pendente'}
                              </p>
                            </div>
                          </div>
                          <div className="text-right space-y-3">
                            <p className="text-xl font-display text-emerald-900 tracking-tight leading-none">{currencyFmt(p.entry_amount)}</p>
                            <Button
                              size="sm"
                              variant="outline"
                              className={cn(
                                "h-8 border-none font-black uppercase text-[9px] tracking-[0.15em] rounded-xl transition-all shadow-sm",
                                p.entry_paid_at 
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-700' 
                                  : 'bg-white text-emerald-600 hover:bg-emerald-50'
                              )}
                              onClick={() => toggleEntryPaidMutation.mutate({ id: p.id, currentPaidAt: p.entry_paid_at })}
                            >
                              {p.entry_paid_at ? 'Liquidado' : 'Validar'}
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      {installments.map((inst) => {
                        const paid = isInstallmentPaid(inst.status, inst.paid_at);
                        return (
                          <div key={inst.id} className={cn(
                            "flex items-center justify-between p-6 rounded-[24px] bg-white border transition-all group/inst",
                            paid ? 'border-emerald-100' : 'border-border/30 hover:border-gold/30'
                          )}>
                            <div className="flex items-center gap-4">
                              <div className={cn(
                                "w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm transition-all group-hover/inst:scale-110",
                                paid ? 'bg-emerald-100 text-emerald-600' : 'bg-secondary text-muted-foreground/40'
                              )}>
                                <Calendar className="w-5 h-5" />
                              </div>
                              <div>
                                <p className={cn(
                                  "text-[10px] font-black uppercase tracking-widest mb-1",
                                  paid ? 'text-emerald-700' : 'text-muted-foreground/60'
                                )}>Parcela {inst.installment_number.toString().padStart(2, '0')}</p>
                                <p className="text-sm font-bold text-foreground">
                                  {format(new Date(inst.due_date + "T12:00:00"), "dd 'de' MMM", { locale: ptBR })}
                                </p>
                              </div>
                            </div>
                            <div className="text-right space-y-3">
                              <p className={cn(
                                "text-xl font-display tracking-tight leading-none",
                                paid ? 'text-emerald-800' : 'text-foreground'
                              )}>{currencyFmt(inst.amount)}</p>
                              <Button
                                size="sm"
                                variant="outline"
                                className={cn(
                                  "h-8 border-none font-black uppercase text-[9px] tracking-[0.15em] rounded-xl transition-all shadow-sm",
                                  paid 
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-700' 
                                    : 'bg-secondary text-foreground/70 hover:bg-gold hover:text-white'
                                )}
                                onClick={() => togglePaidMutation.mutate({ id: inst.id, currentStatus: inst.status })}
                              >
                                {paid ? 'Pago' : 'Baixar'}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] p-0 rounded-2xl shadow-2xl border-border/40 bg-background overflow-hidden font-body flex flex-col">
          <div className="bg-gradient-gold p-8 text-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-display text-white">Novo Contrato Comercial</DialogTitle>
              <p className="text-white/80 text-xs mt-1 font-medium font-body tracking-wide uppercase">Defina o cronograma financeiro deste evento.</p>
            </DialogHeader>
          </div>
          <div className="p-6 md:p-8 space-y-6 overflow-y-auto min-h-0">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Titular do Contrato</Label>
              <Select value={form.client_id} onValueChange={handleClientSelect}>
                <SelectTrigger className="bg-secondary/30 border-border/40 h-11 rounded-lg">
                  <SelectValue placeholder="Selecionar cliente" />
                </SelectTrigger>
                <SelectContent className="bg-white shadow-2xl border-border/40">
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="font-bold text-xs uppercase">{c.first_name} {c.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Evento Relacionado</Label>
              <Select value={form.event_id} onValueChange={(v) => autoApplyEvent(v, form.client_id)}>
                <SelectTrigger className="bg-secondary/30 border-border/40 h-11 rounded-lg">
                  <SelectValue placeholder={form.client_id ? "Vincular evento do cliente" : "Selecione o cliente primeiro"} />
                </SelectTrigger>
                <SelectContent className="bg-white shadow-2xl border-border/40">
                  {eventsByClient.map((e: any) => (
                    <SelectItem key={e.id} value={e.id} className="font-bold text-xs uppercase">{e.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Valor Total *</Label>
                <Input 
                  type="text"
                  inputMode="numeric"
                  placeholder="0,00" 
                  value={form.total_event_value} 
                  onChange={(e) => setForm({ ...form, total_event_value: maskCurrencyInput(e.target.value) })} 
                  className="bg-secondary/30 border-border/40 focus:border-gold h-11 h-11 font-bold text-gold" 
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Parcelas Máx.</Label>
                <Input 
                  type="number" 
                  min="1" 
                  value={form.installment_count} 
                  onChange={(e) => setForm({ ...form, installment_count: e.target.value })} 
                  className="bg-secondary/30 border-border/40 focus:border-gold h-11 h-11 font-medium" 
                />
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 bg-secondary/20 rounded-xl border border-border/10">
              <Switch checked={form.has_entry_payment} onCheckedChange={(v) => setForm({ ...form, has_entry_payment: v })} />
              <Label className="text-xs font-bold text-foreground">Haverá Pagamento de Entrada?</Label>
            </div>

            {form.has_entry_payment && (
              <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 p-4 bg-secondary/10 rounded-xl border border-border/10">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Valor Entrada</Label>
                  <Input 
                    type="text"
                    inputMode="numeric"
                    value={form.entry_amount} 
                    onChange={(e) => setForm({ ...form, entry_amount: maskCurrencyInput(e.target.value) })} 
                    className="bg-background border-border/40 h-10 text-xs font-bold" 
                    placeholder="0,00"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Data Entrada</Label>
                  <Input 
                    type="date" 
                    value={form.entry_date} 
                    onChange={(e) => setForm({ ...form, entry_date: e.target.value })} 
                    className="bg-background border-border/40 h-10 text-xs" 
                  />
                </div>
              </div>
            )}

            {installmentPlan.length > 0 && (
              <div className="space-y-3 p-4 bg-secondary/10 rounded-xl border border-border/10">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Plano de Parcelas (Editar Data e Valor)</Label>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{installmentPlan.length} parcela{installmentPlan.length > 1 ? 's' : ''}</span>
                </div>
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {installmentPlan.map((item, index) => (
                    <div key={item.installment_number} className="grid grid-cols-1 md:grid-cols-[120px_1fr_180px] gap-2 items-center bg-white border border-border/20 rounded-lg p-3">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Parcela {item.installment_number.toString().padStart(2, '0')}</span>
                      <Input
                        type="date"
                        value={item.due_date}
                        onChange={(e) => updateInstallment(index, 'due_date', e.target.value)}
                        className="h-10 text-sm bg-secondary/20"
                      />
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={item.amount}
                        onChange={(e) => updateInstallment(index, 'amount', e.target.value)}
                        className="h-10 text-base font-bold bg-secondary/20"
                        placeholder="0,00"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-6 border-t border-border/10">
              <Button variant="ghost" onClick={() => setDialogOpen(false)} className="text-muted-foreground font-bold uppercase text-[10px] tracking-widest">Cancelar</Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!form.total_event_value || saveMutation.isPending || (form.has_entry_payment && (!form.entry_amount || !form.entry_date))}
                className="bg-gold hover:bg-gold-light text-white font-bold h-11 px-10 rounded-lg shadow-gold uppercase text-[11px] tracking-widest transition-all"
              >
                {editingPayment ? 'Salvar Alterações' : 'Gerar Contrato'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
