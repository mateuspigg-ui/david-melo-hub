import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { format, isPast, isToday } from "date-fns";
import { ArrowDownCircle, Calendar, Check, ChevronDown, Plus, Search, UserPlus } from "lucide-react";
import { formatCurrencyInput, maskCurrencyInput, parseCurrencyInput } from "@/lib/currencyInput";
import { cn } from "@/lib/utils";

const currencyFmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const PAID_STATUS_VALUES = ["paid", "pago"] as const;
const PENDING_STATUS_VALUES = ["pending", "pendente"] as const;

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
  bank_account_id?: string | null;
};

const normalizeStatus = (status: string | null | undefined) => String(status || "").toLowerCase();
const isInstallmentPaid = (status: string | null | undefined, paidAt?: string | null) =>
  PAID_STATUS_VALUES.includes(normalizeStatus(status) as (typeof PAID_STATUS_VALUES)[number]) || !!paidAt;

export default function RecebimentosPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(null);

  const [contractOpen, setContractOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [pendingInstallment, setPendingInstallment] = useState<Installment | null>(null);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState("");

  const [contractForm, setContractForm] = useState({
    total_event_value: "",
    installment_count: "1",
    has_entry_payment: false,
    entry_amount: "",
    entry_date: "",
    client_id: "",
    event_id: "",
  });

  const [clientForm, setClientForm] = useState({ first_name: "", last_name: "", phone: "", email: "" });

  const isMissingEntryPaidAtColumnError = (error: any) => /entry_paid_at.*does not exist|schema cache|could not find.*entry_paid_at/i.test(String(error?.message || ""));
  const isMissingInstallmentBankAccountColumnError = (error: any) => /bank_account_id.*does not exist|schema cache|could not find.*bank_account_id/i.test(String(error?.message || ""));

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, clients(first_name, last_name), events(title)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Payment[];
    },
  });

  const { data: installments = [] } = useQuery({
    queryKey: ["payment_installments_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_installments")
        .select("*")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data || []) as Installment[];
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

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bank_accounts_select"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("bank_accounts")
        .select("id, bank_name, agency, account_number, account_digit, status")
        .eq("status", "active")
        .order("bank_name", { ascending: true });
      return data || [];
    },
  });

  const installmentsByPayment = useMemo(() => {
    const map = new Map<string, Installment[]>();
    for (const inst of installments) {
      const list = map.get(inst.payment_id) || [];
      list.push(inst);
      map.set(inst.payment_id, list);
    }
    return map;
  }, [installments]);

  const filteredPayments = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return payments;
    return payments.filter((p) => {
      const clientName = p.clients ? `${p.clients.first_name} ${p.clients.last_name}` : "";
      const eventName = p.events?.title || "";
      return `${clientName} ${eventName}`.toLowerCase().includes(q);
    });
  }, [payments, search]);

  const groupedByClient = useMemo(() => {
    const map = new Map<string, { clientName: string; payments: Payment[] }>();
    for (const payment of filteredPayments) {
      const key = payment.client_id || `sem-cliente-${payment.id}`;
      const clientName = payment.clients ? `${payment.clients.first_name} ${payment.clients.last_name}`.trim() : "Cliente não identificado";
      if (!map.has(key)) map.set(key, { clientName, payments: [] });
      map.get(key)!.payments.push(payment);
    }
    return Array.from(map.entries()).map(([clientId, value]) => ({ clientId, ...value }));
  }, [filteredPayments]);

  const totals = useMemo(() => {
    let pending = 0;
    let received = 0;
    for (const inst of installments) {
      if (!filteredPayments.some((p) => p.id === inst.payment_id)) continue;
      if (isInstallmentPaid(inst.status, inst.paid_at)) received += inst.amount;
      else pending += inst.amount;
    }
    for (const p of filteredPayments) {
      if (!p.has_entry_payment || !p.entry_amount) continue;
      if (p.entry_paid_at) received += p.entry_amount;
      else pending += p.entry_amount;
    }
    return { pending, received };
  }, [filteredPayments, installments]);

  const createClientMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        first_name: clientForm.first_name.trim(),
        last_name: clientForm.last_name.trim() || "",
        phone: clientForm.phone.trim() || null,
        email: clientForm.email.trim() || null,
      };
      if (!payload.first_name) throw new Error("Informe o nome do cliente.");
      const { data, error } = await supabase.from("clients").insert(payload as any).select("id, first_name, last_name").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["clients-select"] });
      setClientOpen(false);
      setClientForm({ first_name: "", last_name: "", phone: "", email: "" });
      setContractForm((prev) => ({ ...prev, client_id: created.id }));
      toast({ title: "Cliente cadastrado com sucesso" });
    },
    onError: (e: any) => toast({ title: "Erro ao cadastrar cliente", description: e?.message || "Tente novamente.", variant: "destructive" }),
  });

  const createContractMutation = useMutation({
    mutationFn: async () => {
      const totalValue = parseCurrencyInput(contractForm.total_event_value);
      const count = Number(contractForm.installment_count || "1");
      const hasEntry = contractForm.has_entry_payment;
      const entryAmount = hasEntry ? parseCurrencyInput(contractForm.entry_amount) : 0;

      if (!contractForm.client_id) throw new Error("Selecione um cliente.");
      if (!Number.isFinite(totalValue) || totalValue <= 0) throw new Error("Informe o valor total do contrato.");
      if (!Number.isInteger(count) || count < 1) throw new Error("Informe a quantidade de parcelas.");
      if (hasEntry && (!contractForm.entry_date || entryAmount <= 0 || entryAmount > totalValue)) {
        throw new Error("Entrada inválida para este contrato.");
      }

      const paymentId = crypto.randomUUID();
      const { error: paymentError } = await supabase
        .from("payments")
        .insert({
          id: paymentId,
          total_event_value: totalValue,
          installment_count: count,
          has_entry_payment: hasEntry,
          entry_amount: hasEntry ? entryAmount : null,
          entry_date: hasEntry ? contractForm.entry_date : null,
          client_id: contractForm.client_id,
          event_id: contractForm.event_id || null,
        } as any);
      if (paymentError) throw paymentError;

      const remaining = totalValue - (hasEntry ? entryAmount : 0);
      const amount = Math.round((remaining / count) * 100) / 100;
      const baseDate = hasEntry && contractForm.entry_date ? new Date(`${contractForm.entry_date}T12:00:00`) : new Date();

      const installmentsData = Array.from({ length: count }, (_, i) => {
        const due = new Date(baseDate);
        due.setMonth(due.getMonth() + i + 1);
        return {
          payment_id: paymentId,
          installment_number: i + 1,
          due_date: due.toISOString().split("T")[0],
          amount,
          status: "pending",
          paid_at: null,
        };
      });

      const { error: instError } = await supabase.from("payment_installments").insert(installmentsData as any);
      if (instError) {
        await supabase.from("payments").delete().eq("id", paymentId);
        throw instError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["payment_installments_all"] });
      qc.invalidateQueries({ queryKey: ["dashboard_kpis"] });
      qc.invalidateQueries({ queryKey: ["dashboard_metrics"] });
      setContractOpen(false);
      setContractForm({ total_event_value: "", installment_count: "1", has_entry_payment: false, entry_amount: "", entry_date: "", client_id: "", event_id: "" });
      toast({ title: "Contrato criado com sucesso" });
    },
    onError: (e: any) => toast({ title: "Erro ao criar contrato", description: e?.message || "Tente novamente.", variant: "destructive" }),
  });

  const toggleEntryMutation = useMutation({
    mutationFn: async ({ paymentId, currentPaidAt }: { paymentId: string; currentPaidAt: string | null }) => {
      const { error } = await supabase
        .from("payments")
        .update({ entry_paid_at: currentPaidAt ? null : new Date().toISOString() } as any)
        .eq("id", paymentId);
      if (error) {
        if (isMissingEntryPaidAtColumnError(error)) return;
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["dashboard_kpis"] });
      qc.invalidateQueries({ queryKey: ["dashboard_metrics"] });
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar entrada", description: e?.message || "Tente novamente.", variant: "destructive" }),
  });

  const toggleInstallmentMutation = useMutation({
    mutationFn: async ({ installment, bankAccountId }: { installment: Installment; bankAccountId?: string | null }) => {
      const currentlyPaid = isInstallmentPaid(installment.status, installment.paid_at);
      if (currentlyPaid) {
        let lastError: any = null;
        for (const fallbackStatus of PENDING_STATUS_VALUES) {
          const { error } = await supabase
            .from("payment_installments")
            .update({ status: fallbackStatus, paid_at: null, bank_account_id: null } as any)
            .eq("id", installment.id);
          if (!error) return;
          lastError = error;
        }
        if (lastError && isMissingInstallmentBankAccountColumnError(lastError)) {
          for (const fallbackStatus of PENDING_STATUS_VALUES) {
            const { error } = await supabase
              .from("payment_installments")
              .update({ status: fallbackStatus, paid_at: null } as any)
              .eq("id", installment.id);
            if (!error) return;
            lastError = error;
          }
        }
        if (lastError) throw lastError;
        return;
      }

      const paidAt = new Date().toISOString();
      let lastError: any = null;
      for (const fallbackStatus of PAID_STATUS_VALUES) {
        const { error } = await supabase
          .from("payment_installments")
          .update({ status: fallbackStatus, paid_at: paidAt, bank_account_id: bankAccountId || null } as any)
          .eq("id", installment.id);
        if (!error) return;
        lastError = error;
      }
      if (lastError && isMissingInstallmentBankAccountColumnError(lastError)) {
        for (const fallbackStatus of PAID_STATUS_VALUES) {
          const { error } = await supabase
            .from("payment_installments")
            .update({ status: fallbackStatus, paid_at: paidAt } as any)
            .eq("id", installment.id);
          if (!error) return;
          lastError = error;
        }
      }
      if (lastError) throw lastError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment_installments_all"] });
      qc.invalidateQueries({ queryKey: ["dashboard_kpis"] });
      qc.invalidateQueries({ queryKey: ["dashboard_metrics"] });
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar parcela", description: e?.message || "Tente novamente.", variant: "destructive" }),
  });

  const eventsByClient = useMemo(() => {
    if (!contractForm.client_id) return events;
    return events.filter((evt: any) => evt.client_id === contractForm.client_id);
  }, [events, contractForm.client_id]);

  return (
    <div className="space-y-8 animate-fade-in max-w-[1700px] mx-auto p-2">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-display text-foreground tracking-tighter uppercase flex items-center gap-3">
            <ArrowDownCircle className="h-8 w-8 text-gold" /> Recebimentos
          </h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium">Central única para clientes, contratos e baixas de parcelas</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => setClientOpen(true)} className="h-12 px-5 rounded-xl uppercase text-[11px] tracking-widest font-bold">
            <UserPlus className="w-4 h-4 mr-2" /> Cadastrar Cliente
          </Button>
          <Button onClick={() => setContractOpen(true)} className="h-12 px-6 rounded-xl bg-gradient-gold text-white uppercase text-[11px] tracking-widest font-bold">
            <Plus className="w-4 h-4 mr-2" /> Novo Contrato
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-white premium-shadow rounded-2xl p-6 border border-border/40">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">A Receber</p>
          <p className="text-3xl font-display mt-1">{currencyFmt(totals.pending)}</p>
        </div>
        <div className="bg-white premium-shadow rounded-2xl p-6 border border-border/40">
          <p className="text-[10px] uppercase tracking-widest text-emerald-600 font-bold">Recebido</p>
          <p className="text-3xl font-display mt-1">{currencyFmt(totals.received)}</p>
        </div>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar cliente ou evento..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-11 h-12 rounded-xl bg-secondary/30 border-border/40"
        />
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-24 bg-white rounded-2xl border border-border/40 animate-pulse" />)}</div>
      ) : groupedByClient.length === 0 ? (
        <div className="bg-white premium-shadow rounded-2xl p-20 border border-border/40 text-center">
          <p className="font-bold text-lg">Nenhum cliente encontrado</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByClient.map((group) => {
            const clientExpanded = expandedClientId === group.clientId;
            return (
              <div key={group.clientId} className="bg-white rounded-2xl border border-border/40 premium-shadow overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-6 text-left"
                  onClick={() => setExpandedClientId(clientExpanded ? null : group.clientId)}
                >
                  <div>
                    <h3 className="text-xl font-display uppercase">{group.clientName}</h3>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{group.payments.length} contrato{group.payments.length > 1 ? "s" : ""}</p>
                  </div>
                  <ChevronDown className={cn("w-5 h-5 transition-transform", clientExpanded && "rotate-180")} />
                </button>

                {clientExpanded && (
                  <div className="border-t border-border/20 p-5 space-y-4 bg-secondary/10">
                    {group.payments.map((payment) => {
                      const paymentExpanded = expandedPaymentId === payment.id;
                      const paymentInstallments = installmentsByPayment.get(payment.id) || [];
                      return (
                        <div key={payment.id} className="bg-white border border-border/30 rounded-xl overflow-hidden">
                          <button
                            className="w-full flex items-center justify-between p-4 text-left"
                            onClick={() => setExpandedPaymentId(paymentExpanded ? null : payment.id)}
                          >
                            <div>
                              <p className="text-sm font-bold uppercase">{payment.events?.title || "Evento sem título"}</p>
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Total {currencyFmt(payment.total_event_value)}</p>
                            </div>
                            <ChevronDown className={cn("w-4 h-4 transition-transform", paymentExpanded && "rotate-180")} />
                          </button>

                          {paymentExpanded && (
                            <div className="border-t border-border/20 p-4 space-y-3">
                              {payment.has_entry_payment && Number(payment.entry_amount || 0) > 0 && (
                                <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                                  <div className="flex items-center gap-3">
                                    <Calendar className="w-4 h-4 text-emerald-600" />
                                    <div>
                                      <p className="text-[10px] uppercase tracking-wider font-bold">Entrada</p>
                                      <p className="text-xs text-muted-foreground">{payment.entry_date ? format(new Date(payment.entry_date + "T12:00:00"), "dd/MM/yyyy") : "-"}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <p className="font-display">{currencyFmt(Number(payment.entry_amount || 0))}</p>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => toggleEntryMutation.mutate({ paymentId: payment.id, currentPaidAt: payment.entry_paid_at })}
                                    >
                                      {payment.entry_paid_at ? "Liquidado" : "Validar"}
                                    </Button>
                                  </div>
                                </div>
                              )}

                              {paymentInstallments.map((inst) => {
                                const paid = isInstallmentPaid(inst.status, inst.paid_at);
                                const overdue = !paid && isPast(new Date(inst.due_date + "T23:59:59")) && !isToday(new Date(inst.due_date + "T12:00:00"));
                                return (
                                  <div key={inst.id} className={cn("flex items-center justify-between p-4 rounded-xl border", overdue ? "border-destructive/30 bg-destructive/[0.03]" : "border-border/30") }>
                                    <div>
                                      <p className="text-[11px] font-bold uppercase tracking-wider">Parcela {String(inst.installment_number).padStart(2, "0")}</p>
                                      <p className="text-xs text-muted-foreground">Vencimento {format(new Date(inst.due_date + "T12:00:00"), "dd/MM/yyyy")}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <p className="font-display">{currencyFmt(inst.amount)}</p>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          if (paid) {
                                            toggleInstallmentMutation.mutate({ installment: inst });
                                            return;
                                          }
                                          setPendingInstallment(inst);
                                          setSelectedBankAccountId("");
                                          setAccountPickerOpen(true);
                                        }}
                                      >
                                        {paid ? "Desfazer" : <><Check className="w-3 h-3 mr-1" /> Baixar</>}
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={clientOpen} onOpenChange={setClientOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle>Novo cliente</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Nome</Label><Input value={clientForm.first_name} onChange={(e) => setClientForm({ ...clientForm, first_name: e.target.value })} /></div>
            <div className="space-y-1"><Label>Sobrenome</Label><Input value={clientForm.last_name} onChange={(e) => setClientForm({ ...clientForm, last_name: e.target.value })} /></div>
            <div className="space-y-1"><Label>Telefone</Label><Input value={clientForm.phone} onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })} /></div>
            <div className="space-y-1"><Label>Email</Label><Input value={clientForm.email} onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setClientOpen(false)}>Cancelar</Button>
            <Button onClick={() => createClientMutation.mutate()} disabled={createClientMutation.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={contractOpen} onOpenChange={setContractOpen}>
        <DialogContent className="max-w-2xl rounded-2xl">
          <DialogHeader><DialogTitle>Novo contrato</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Cliente</Label>
                <Select value={contractForm.client_id} onValueChange={(v) => setContractForm({ ...contractForm, client_id: v, event_id: "" })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Evento</Label>
                <Select value={contractForm.event_id} onValueChange={(v) => {
                  const evt = events.find((e: any) => e.id === v);
                  setContractForm((prev) => ({ ...prev, event_id: v, total_event_value: evt?.budget_value ? formatCurrencyInput(evt.budget_value) : prev.total_event_value }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{eventsByClient.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Valor total</Label>
                <Input value={contractForm.total_event_value} onChange={(e) => setContractForm({ ...contractForm, total_event_value: maskCurrencyInput(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label>Parcelas</Label>
                <Input type="number" min="1" value={contractForm.installment_count} onChange={(e) => setContractForm({ ...contractForm, installment_count: e.target.value })} />
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30">
              <Switch checked={contractForm.has_entry_payment} onCheckedChange={(v) => setContractForm({ ...contractForm, has_entry_payment: v })} />
              <Label>Haverá entrada?</Label>
            </div>

            {contractForm.has_entry_payment && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Valor entrada</Label>
                  <Input value={contractForm.entry_amount} onChange={(e) => setContractForm({ ...contractForm, entry_amount: maskCurrencyInput(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <Label>Data entrada</Label>
                  <Input type="date" value={contractForm.entry_date} onChange={(e) => setContractForm({ ...contractForm, entry_date: e.target.value })} />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setContractOpen(false)}>Cancelar</Button>
            <Button onClick={() => createContractMutation.mutate()} disabled={createContractMutation.isPending}>Cadastrar contrato</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={accountPickerOpen} onOpenChange={setAccountPickerOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle>Conta de recebimento</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Conta bancária</Label>
            <Select value={selectedBankAccountId} onValueChange={setSelectedBankAccountId}>
              <SelectTrigger><SelectValue placeholder="Escolher conta" /></SelectTrigger>
              <SelectContent>
                {bankAccounts.map((acc: any) => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.bank_name} • Ag {acc.agency} • Cc {acc.account_number}{acc.account_digit ? `-${acc.account_digit}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAccountPickerOpen(false)}>Cancelar</Button>
            <Button
              disabled={!pendingInstallment || (bankAccounts.length > 0 && !selectedBankAccountId)}
              onClick={() => {
                if (!pendingInstallment) return;
                toggleInstallmentMutation.mutate({ installment: pendingInstallment, bankAccountId: selectedBankAccountId || null });
                setAccountPickerOpen(false);
                setPendingInstallment(null);
                setSelectedBankAccountId("");
              }}
            >
              Confirmar baixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
