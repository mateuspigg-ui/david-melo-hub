import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { maskCurrencyInput, parseCurrencyInput, formatCurrencyInput } from "@/lib/currencyInput";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, format, isSameMonth, isSameDay, isToday,
  eachDayOfInterval, getDay, parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Pencil, Calendar as CalendarIcon, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const currencyFmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

type CalendarEntry = {
  id: string;
  date: string;
  type: "entrada" | "saida";
  description: string;
  amount: number;
  status: "paid" | "pending";
  source: "recebimento" | "conta_pagar";
  entityId: string;
  entityExtra?: any;
};

const PAID_STATUS = ["paid", "pago"] as const;
const isPaid = (s: string | null | undefined, pa: string | null | undefined) =>
  PAID_STATUS.includes((s || "").toLowerCase() as any) || !!pa;

const weekDays = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

const CalendarTab = ({ selectedCompany }: { selectedCompany: string }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [editMode, setEditMode] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<CalendarEntry | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });

  const monthStartStr = format(monthStart, "yyyy-MM-dd");
  const monthEndStr = format(monthEnd, "yyyy-MM-dd");

  const { data: payables = [], isLoading: loadingPayables } = useQuery({
    queryKey: ["calendar-payables", monthStartStr, monthEndStr, selectedCompany],
    queryFn: async () => {
      let q = (supabase as any)
        .from("accounts_payable")
        .select("id, description, amount, due_date, payment_status, paid_at, paid_amount, discount, interest, fine, bank_account_id, payment_method, supplier_id, category_id, company_id, suppliers(company_name)")
        .gte("due_date", monthStartStr)
        .lte("due_date", monthEndStr)
        .order("due_date");
      if (selectedCompany !== "all") q = q.eq("company_id", selectedCompany);
      const { data, error } = await q;
      if (error) return [];
      return (data || []) as any[];
    },
  });

  const { data: receivables = [], isLoading: loadingReceivables } = useQuery({
    queryKey: ["calendar-receivables", monthStartStr, monthEndStr, selectedCompany],
    queryFn: async () => {
      let q = (supabase as any)
        .from("payment_installments")
        .select("id, payment_id, installment_number, due_date, amount, status, paid_at, paid_amount, bank_account_id, payment_method, payments(client_id, company_id, clients(first_name, last_name), events(title))")
        .gte("due_date", monthStartStr)
        .lte("due_date", monthEndStr)
        .order("due_date");
      const { data, error } = await q;
      if (error) return [];
      let results = (data || []) as any[];
      if (selectedCompany !== "all") {
        results = results.filter((r: any) => r.payments?.company_id === selectedCompany);
      }
      return results;
    },
  });

  const entries: CalendarEntry[] = useMemo(() => {
    const items: CalendarEntry[] = [];

    for (const p of payables) {
      items.push({
        id: p.id,
        date: p.due_date,
        type: "saida",
        description: p.description || "Despesa",
        amount: Number(p.amount || 0),
        status: isPaid(p.payment_status, p.paid_at) ? "paid" : "pending",
        source: "conta_pagar",
        entityId: p.id,
        entityExtra: p,
      });
    }

    for (const r of receivables) {
      const clientName = r.payments?.clients
        ? `${r.payments.clients.first_name || ""} ${r.payments.clients.last_name || ""}`.trim()
        : "";
      const eventName = r.payments?.events?.title || "";
      const desc = [clientName, eventName].filter(Boolean).join(" - ") || `Parcela ${r.installment_number}`;

      items.push({
        id: r.id,
        date: r.due_date,
        type: "entrada",
        description: desc,
        amount: Number(r.amount || 0),
        status: isPaid(r.status, r.paid_at) ? "paid" : "pending",
        source: "recebimento",
        entityId: r.id,
        entityExtra: r,
      });
    }

    return items;
  }, [payables, receivables]);

  const entriesByDate = useMemo(() => {
    const map: Record<string, CalendarEntry[]> = {};
    for (const e of entries) {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    }
    return map;
  }, [entries]);

  const dayBalance = (date: string) => {
    const items = entriesByDate[date] || [];
    return items.reduce((sum, i) => sum + (i.type === "entrada" ? i.amount : -i.amount), 0);
  };

  const formatDayTotal = (v: number) => {
    if (v === 0) return null;
    return currencyFmt(v);
  };

  const handleEntryClick = (entry: CalendarEntry) => {
    if (!editMode) return;
    setSelectedEntry(entry);
    setEditModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="h-10 w-10 rounded-xl hover:bg-gold/10"
          >
            <ChevronLeft size={18} />
          </Button>
          <h2 className="text-2xl font-display text-foreground tracking-tight min-w-[200px] text-center capitalize">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="h-10 w-10 rounded-xl hover:bg-gold/10"
          >
            <ChevronRight size={18} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentMonth(new Date())}
            className="rounded-xl text-[10px] font-bold uppercase tracking-widest border-gold/20 hover:bg-gold/10"
          >
            mês atual
          </Button>
        </div>
        <Button
          variant={editMode ? "default" : "outline"}
          size="sm"
          onClick={() => setEditMode(!editMode)}
          className={cn(
            "rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
            editMode
              ? "bg-gold text-white hover:bg-gold/90 shadow-gold-sm"
              : "border-gold/20 hover:bg-gold/10"
          )}
        >
          <Pencil size={14} className="mr-2" />
          {editMode ? "Edição ativa" : "Habilitar edição"}
        </Button>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-[24px] border border-border/30 premium-shadow overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-border/20">
          {weekDays.map((d) => (
            <div key={d} className="py-3 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 border-r border-border/10 last:border-r-0">
              {d}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7">
          {calDays.map((day, idx) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const inMonth = isSameMonth(day, currentMonth);
            const today = isToday(day);
            const dayItems = entriesByDate[dateStr] || [];
            const balance = dayBalance(dateStr);
            const showEntradas = dayItems.filter((i) => i.type === "entrada");
            const showSaidas = dayItems.filter((i) => i.type === "saida");

            return (
              <div
                key={idx}
                className={cn(
                  "min-h-[130px] border-r border-b border-border/10 last:border-r-0 p-2.5 transition-colors relative",
                  !inMonth && "bg-muted/30",
                  inMonth && "bg-white hover:bg-gold/[0.02]",
                  today && "bg-gold/[0.04]",
                )}
              >
                {/* Day number + SALDO */}
                <div className="flex items-start justify-between mb-1.5">
                  <span
                    className={cn(
                      "inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold",
                      today && "bg-gold text-white shadow-gold-sm",
                      !today && inMonth && "text-foreground/80",
                      !inMonth && "text-muted-foreground/30",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                </div>

                {/* SALDO */}
                {dayItems.length > 0 && (
                  <div className={cn(
                    "text-[10px] font-black mb-2 pb-1.5 border-b border-dashed",
                    balance > 0 && "text-blue-600 border-blue-200",
                    balance < 0 && "text-red-500 border-red-200",
                    balance === 0 && "text-muted-foreground/50 border-border/20",
                  )}>
                    <span className="uppercase tracking-wider opacity-60">Saldo: </span>
                    <span className="tabular-nums">{formatDayTotal(balance)}</span>
                  </div>
                )}

                {/* Entries */}
                <div className="space-y-1">
                  {showEntradas.slice(0, 3).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleEntryClick(item)}
                      className={cn(
                        "w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-left transition-all",
                        editMode && "cursor-pointer hover:bg-blue-50 ring-1 ring-blue-200",
                        !editMode && "cursor-default",
                        item.status === "paid" && "opacity-50",
                      )}
                    >
                      <div className="w-4 h-4 rounded bg-blue-500 flex items-center justify-center shrink-0">
                        <ArrowUpCircle size={10} className="text-white" />
                      </div>
                      <span className="text-[10px] font-bold text-blue-600 tabular-nums truncate">
                        {currencyFmt(item.amount)}
                      </span>
                    </button>
                  ))}
                  {showSaidas.slice(0, 3).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleEntryClick(item)}
                      className={cn(
                        "w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-left transition-all",
                        editMode && "cursor-pointer hover:bg-red-50 ring-1 ring-red-200",
                        !editMode && "cursor-default",
                        item.status === "paid" && "opacity-50",
                      )}
                    >
                      <div className="w-4 h-4 rounded bg-red-500 flex items-center justify-center shrink-0">
                        <ArrowDownCircle size={10} className="text-white" />
                      </div>
                      <span className="text-[10px] font-bold text-red-500 tabular-nums truncate">
                        {currencyFmt(item.amount)}
                      </span>
                    </button>
                  ))}
                  {dayItems.length > 6 && (
                    <span className="text-[9px] font-bold text-gold px-1">
                      mais +{dayItems.length - 6}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-6 px-2">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-500 flex items-center justify-center">
            <ArrowUpCircle size={10} className="text-white" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Entradas (Recebimentos)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-red-500 flex items-center justify-center">
            <ArrowDownCircle size={10} className="text-white" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Saídas (Contas a Pagar)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-gold shadow-gold-sm" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Hoje</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Saldo</span>
          <span className="text-[10px] font-bold text-muted-foreground/40">= Entradas - Saídas</span>
        </div>
      </div>

      {/* Edit Modal */}
      {selectedEntry && (
        <EditEntryModal
          open={editModalOpen}
          onOpenChange={setEditModalOpen}
          entry={selectedEntry}
          onSuccess={() => {
            setEditModalOpen(false);
            setSelectedEntry(null);
            queryClient.invalidateQueries({ queryKey: ["calendar-payables"] });
            queryClient.invalidateQueries({ queryKey: ["calendar-receivables"] });
          }}
        />
      )}
    </div>
  );
};

/* =================== EDIT MODAL =================== */
type EditEntryModalProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entry: CalendarEntry;
  onSuccess: () => void;
};

const EditEntryModal = ({ open, onOpenChange, entry, onSuccess }: EditEntryModalProps) => {
  if (entry.source === "conta_pagar") return <EditContaPagarModal open={open} onOpenChange={onOpenChange} entry={entry} onSuccess={onSuccess} />;
  return <EditRecebimentoModal open={open} onOpenChange={onOpenChange} entry={entry} onSuccess={onSuccess} />;
};

/* =================== EDIT CONTA A PAGAR =================== */
const EditContaPagarModal = ({ open, onOpenChange, entry, onSuccess }: EditEntryModalProps) => {
  const queryClient = useQueryClient();
  const data = entry.entityExtra || {};
  const [description, setDescription] = useState(data.description || "");
  const [amount, setAmount] = useState(formatCurrencyInput(data.amount) || "");
  const [dueDate, setDueDate] = useState(data.due_date || "");
  const [status, setStatus] = useState(isPaid(data.payment_status, data.paid_at) ? "pago" : "nao_pago");
  const [discount, setDiscount] = useState(formatCurrencyInput(data.discount) || "");
  const [interest, setInterest] = useState(formatCurrencyInput(data.interest) || "");
  const [fine, setFine] = useState(formatCurrencyInput(data.fine) || "");
  const [paymentMethod, setPaymentMethod] = useState(data.payment_method || "pix");
  const [bankAccountId, setBankAccountId] = useState(data.bank_account_id || "");

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bank-accounts-calendar"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("bank_accounts").select("id, bank_name, description").order("bank_name");
      return data || [];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const parsedAmount = parseCurrencyInput(amount) || 0;
      const payload: any = {
        description,
        amount: parsedAmount,
        due_date: dueDate,
        payment_status: status,
      };
      if (status === "pago") {
        payload.paid_at = new Date().toISOString();
        payload.discount = parseCurrencyInput(discount) || 0;
        payload.interest = parseCurrencyInput(interest) || 0;
        payload.fine = parseCurrencyInput(fine) || 0;
        payload.payment_method = paymentMethod;
        payload.bank_account_id = bankAccountId || null;
        payload.paid_amount = parsedAmount - (parseCurrencyInput(discount) || 0) + (parseCurrencyInput(interest) || 0) + (parseCurrencyInput(fine) || 0);
      } else {
        payload.paid_at = null;
      }
      const { error } = await (supabase as any).from("accounts_payable").update(payload).eq("id", entry.entityId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Despesa atualizada" });
      queryClient.invalidateQueries({ queryKey: ["accounts_payable"] });
      onSuccess();
    },
    onError: (e: any) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl uppercase tracking-tight">Editar Despesa</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Valor (R$)</Label>
              <Input value={amount} onChange={(e) => setAmount(maskCurrencyInput(e.target.value))} className="mt-1" />
            </div>
            <div>
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Vencimento</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nao_pago">Pendente</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {status === "pago" && (
            <div className="space-y-4 p-4 bg-gold/5 rounded-xl border border-gold/20">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Desconto</Label>
                  <Input value={discount} onChange={(e) => setDiscount(maskCurrencyInput(e.target.value))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Juros</Label>
                  <Input value={interest} onChange={(e) => setInterest(maskCurrencyInput(e.target.value))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Multa</Label>
                  <Input value={fine} onChange={(e) => setFine(maskCurrencyInput(e.target.value))} className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Forma de Pagamento</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="cartao">Cartão</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Conta Bancária</Label>
                  <Select value={bankAccountId} onValueChange={setBankAccountId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((b: any) => (
                        <SelectItem key={b.id} value={b.id}>{b.bank_name || b.description}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground uppercase text-[10px] font-bold tracking-widest">Cancelar</Button>
          <Button
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
            className="bg-gradient-to-r from-gold to-gold-light text-white font-bold uppercase text-[10px] tracking-widest"
          >
            {updateMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* =================== EDIT RECEBIMENTO =================== */
const EditRecebimentoModal = ({ open, onOpenChange, entry, onSuccess }: EditEntryModalProps) => {
  const queryClient = useQueryClient();
  const data = entry.entityExtra || {};
  const [status, setStatus] = useState(isPaid(data.status, data.paid_at) ? "paid" : "pending");
  const [bankAccountId, setBankAccountId] = useState(data.bank_account_id || "");
  const [paymentMethod, setPaymentMethod] = useState(data.payment_method || "pix");
  const [paidAmount, setPaidAmount] = useState(formatCurrencyInput(data.paid_amount || data.amount) || "");

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bank-accounts-calendar-rec"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("bank_accounts").select("id, bank_name, description").order("bank_name");
      return data || [];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const payload: any = { status };
      if (status === "paid") {
        payload.paid_at = new Date().toISOString();
        payload.paid_amount = parseCurrencyInput(paidAmount) || entry.amount;
        payload.bank_account_id = bankAccountId || null;
        payload.payment_method = paymentMethod;
      } else {
        payload.paid_at = null;
        payload.paid_amount = null;
        payload.bank_account_id = null;
      }
      const { error } = await (supabase as any).from("payment_installments").update(payload).eq("id", entry.entityId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Recebimento atualizado" });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["installments"] });
      onSuccess();
    },
    onError: (e: any) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl uppercase tracking-tight">Editar Recebimento</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-3 bg-secondary/30 rounded-xl">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Descrição</p>
            <p className="text-sm font-semibold mt-1">{entry.description}</p>
            <p className="text-[10px] font-bold text-muted-foreground mt-1">Vencimento: {format(parseISO(entry.date), "dd/MM/yyyy")}</p>
          </div>
          <div>
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="paid">Recebido</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {status === "paid" && (
            <div className="space-y-4 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
              <div>
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Valor Recebido (R$)</Label>
                <Input value={paidAmount} onChange={(e) => setPaidAmount(maskCurrencyInput(e.target.value))} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Forma de Pagamento</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="cartao_credito">Cartão</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Conta Bancária</Label>
                  <Select value={bankAccountId} onValueChange={setBankAccountId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((b: any) => (
                        <SelectItem key={b.id} value={b.id}>{b.bank_name || b.description}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground uppercase text-[10px] font-bold tracking-widest">Cancelar</Button>
          <Button
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
            className="bg-gradient-to-r from-gold to-gold-light text-white font-bold uppercase text-[10px] tracking-widest"
          >
            {updateMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CalendarTab;
