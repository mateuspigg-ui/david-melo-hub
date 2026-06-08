import { useEffect, useMemo, useState } from "react";
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
import { ArrowDownCircle, Calendar, Check, ChevronDown, FileText, LayoutGrid, Landmark, List, Pencil, Plus, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { formatCurrencyInput, maskCurrencyInput, parseCurrencyInput } from "@/lib/currencyInput";
import { cn } from "@/lib/utils";
import { LinkInstallmentsDialog } from "@/components/LinkInstallmentsDialog";

const currencyFmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const PAID_STATUS_VALUES = ["paid", "pago"] as const;
const PENDING_STATUS_VALUES = ["pending", "pendente"] as const;
const INTERNAL_ACTIVITY_TYPES = ["Reunião", "Degustação", "Atendimento ao Cliente", "Formatação de Festas"];

type Payment = {
  id: string;
  total_event_value: number;
  installment_count: number;
  has_entry_payment: boolean | null;
  entry_amount: number | null;
  entry_date: string | null;
  entry_paid_at: string | null;
  entry_bank_account_id?: string | null;
  entry_paid_amount?: number | null;
  entry_payment_method?: string | null;
  client_id: string | null;
  event_id: string | null;
  company_id?: string | null;
  additional_value?: number | null;
  additional_description?: string | null;
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
  paid_amount?: number | null;
  payment_method?: string | null;
};

const PAYMENT_METHOD_OPTIONS = ["pix", "dinheiro", "cartao_credito", "transferencia"] as const;
const PAYMENT_METHOD_LABEL: Record<(typeof PAYMENT_METHOD_OPTIONS)[number], string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  cartao_credito: "Cartao de credito",
  transferencia: "Transferencia",
};

const PAYMENT_METHOD_BADGE_CLASS: Record<string, string> = {
  pix: "bg-blue-50 text-blue-600 border-blue-200",
  dinheiro: "bg-amber-50 text-amber-700 border-amber-200",
  cartao_credito: "bg-purple-50 text-purple-600 border-purple-200",
  transferencia: "bg-slate-50 text-slate-600 border-slate-200",
};

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

type InstallmentPlanItem = {
  installment_number: number;
  due_date: string;
  amount: string;
  status?: string;
  paid_at?: string | null;
};

type InvoiceRecord = {
  id: string;
  payment_id: string | null;
  status: "draft" | "processing" | "authorized" | "rejected" | "cancelled";
  invoice_number: string | null;
  error_message: string | null;
  pdf_url: string | null;
  xml_url: string | null;
  cancelled_at?: string | null;
};

const normalizeStatus = (status: string | null | undefined) => String(status || "").toLowerCase();
const isInstallmentPaid = (status: string | null | undefined, paidAt?: string | null) =>
  PAID_STATUS_VALUES.includes(normalizeStatus(status) as (typeof PAID_STATUS_VALUES)[number]) || !!paidAt;

export default function RecebimentosPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "due_today" | "overdue" | "pending" | "paid">("all");
  const [dateFilterMode, setDateFilterMode] = useState<"all" | "today" | "custom">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"bloco" | "lista">("bloco");
  const [sortMode, setSortMode] = useState<"next_due" | "highest_pending" | "client_az">("next_due");
  const [clientDetailsOpen, setClientDetailsOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(null);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [linkInstallmentsOpen, setLinkInstallmentsOpen] = useState(false);

  const [contractOpen, setContractOpen] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [pendingInstallment, setPendingInstallment] = useState<Installment | null>(null);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState("");
  const [selectedInstallmentPaidDate, setSelectedInstallmentPaidDate] = useState("");
  const [selectedInstallmentPaidAmount, setSelectedInstallmentPaidAmount] = useState("");
  const [selectedInstallmentPaymentMethod, setSelectedInstallmentPaymentMethod] = useState("");
  const [entryAccountPickerOpen, setEntryAccountPickerOpen] = useState(false);
  const [pendingEntryPayment, setPendingEntryPayment] = useState<Payment | null>(null);
  const [selectedEntryBankAccountId, setSelectedEntryBankAccountId] = useState("");
  const [selectedEntryPaidDate, setSelectedEntryPaidDate] = useState("");
  const [selectedEntryPaidAmount, setSelectedEntryPaidAmount] = useState("");
  const [selectedEntryPaymentMethod, setSelectedEntryPaymentMethod] = useState("");
  const [installmentPlan, setInstallmentPlan] = useState<InstallmentPlanItem[]>([]);
  const [supportsEntryPaidAt, setSupportsEntryPaidAt] = useState(true);

  const toDateInputValue = (value?: string | null) => {
    if (!value) return format(new Date(), "yyyy-MM-dd");
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return format(new Date(), "yyyy-MM-dd");
    return format(parsed, "yyyy-MM-dd");
  };

  const toIsoFromDateInput = (value?: string) => {
    if (!value) return new Date().toISOString();
    return new Date(`${value}T12:00:00`).toISOString();
  };

  const syncEventPaymentStatus = async (eventId?: string | null) => {
    if (!eventId) return;

    const { data: eventPayments, error: paymentsError } = await supabase
      .from("payments")
      .select("id, has_entry_payment, entry_amount, entry_paid_at")
      .eq("event_id", eventId);
    if (paymentsError) throw paymentsError;

    const paymentsList = (eventPayments || []) as any[];
    if (!paymentsList.length) {
      await supabase.from("events").update({ payment_status: "pending" } as any).eq("id", eventId);
      return;
    }

    const paymentIds = paymentsList.map((p) => p.id);
    const { data: allInstallments, error: installmentsError } = await supabase
      .from("payment_installments")
      .select("payment_id, amount, status, paid_at")
      .in("payment_id", paymentIds);
    if (installmentsError) throw installmentsError;

    const installmentsByPayment = new Map<string, any[]>();
    for (const inst of allInstallments || []) {
      const key = (inst as any).payment_id;
      const list = installmentsByPayment.get(key) || [];
      list.push(inst);
      installmentsByPayment.set(key, list);
    }

    let totalDue = 0;
    let totalPaid = 0;

    for (const payment of paymentsList) {
      if (payment.has_entry_payment && Number(payment.entry_amount || 0) > 0) {
        totalDue += Number(payment.entry_amount || 0);
        if (payment.entry_paid_at) totalPaid += Number(payment.entry_amount || 0);
      }

      const paymentInstallments = installmentsByPayment.get(payment.id) || [];
      for (const inst of paymentInstallments) {
        totalDue += Number((inst as any).amount || 0);
        if (isInstallmentPaid((inst as any).status, (inst as any).paid_at)) {
          totalPaid += Number((inst as any).amount || 0);
        }
      }
    }

    let nextStatus = "pending";
    if (totalPaid > 0 && totalPaid + 0.01 < totalDue) nextStatus = "partial";
    if (totalDue > 0 && totalPaid + 0.01 >= totalDue) nextStatus = "paid";

    const { error: updateEventError } = await supabase
      .from("events")
      .update({ payment_status: nextStatus } as any)
      .eq("id", eventId);
    if (updateEventError) throw updateEventError;
  };

  const [contractForm, setContractForm] = useState({
    total_event_value: "",
    installment_count: "1",
    has_entry_payment: false,
    entry_amount: "",
    entry_date: "",
    client_id: "",
    event_id: "",
    company_id: "",
    additional_value: "",
    additional_description: "",
  });

  const isMissingEntryPaidAtColumnError = (error: any) => /entry_paid_at.*does not exist|schema cache|could not find.*entry_paid_at/i.test(String(error?.message || ""));
  const isMissingEntryBankAccountColumnError = (error: any) => /entry_bank_account_id.*does not exist|schema cache|could not find.*entry_bank_account_id/i.test(String(error?.message || ""));
  const isMissingInstallmentBankAccountColumnError = (error: any) => /bank_account_id.*does not exist|schema cache|could not find.*bank_account_id/i.test(String(error?.message || ""));
  const isMissingEntryPaidAmountColumnError = (error: any) => /entry_paid_amount.*does not exist|schema cache|could not find.*entry_paid_amount/i.test(String(error?.message || ""));
  const isMissingEntryPaymentMethodColumnError = (error: any) => /entry_payment_method.*does not exist|schema cache|could not find.*entry_payment_method/i.test(String(error?.message || ""));
  const isMissingInstallmentPaidAmountColumnError = (error: any) => /paid_amount.*does not exist|schema cache|could not find.*paid_amount/i.test(String(error?.message || ""));
  const isMissingInstallmentPaymentMethodColumnError = (error: any) => /payment_method.*does not exist|schema cache|could not find.*payment_method/i.test(String(error?.message || ""));
  const isMissingCompanyIdColumnError = (error: any) => /company_id.*does not exist|schema cache|could not find.*company_id/i.test(String(error?.message || ""));

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
        .select("id, title, client_id, budget_value, event_date, event_type")
        .order("event_date", { ascending: false });
      return (data || []).filter((evt: any) => !INTERNAL_ACTIVITY_TYPES.includes(String(evt.event_type || "")));
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

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-select"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("companies")
        .select("id, legal_name, trade_name, cnpj")
        .order("trade_name", { ascending: true });
      if (error) {
        if (/could not find the table|schema cache/i.test(String(error?.message || ""))) return [];
        throw error;
      }
      return data || [];
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices-select"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("invoices")
        .select("id, payment_id, status, invoice_number, error_message, pdf_url, xml_url, cancelled_at")
        .order("created_at", { ascending: false });
      if (error) {
        if (/could not find the table|schema cache/i.test(String(error?.message || ""))) return [];
        throw error;
      }
      return (data || []) as InvoiceRecord[];
    },
    refetchInterval: (query) => {
      const current = (query.state.data as InvoiceRecord[] | undefined) || [];
      return current.some((invoice) => invoice.status === "processing") ? 8000 : false;
    },
  });

  const invoiceByPaymentId = useMemo(() => {
    const map = new Map<string, InvoiceRecord>();
    for (const invoice of invoices) {
      if (!invoice.payment_id) continue;
      if (!map.has(invoice.payment_id)) map.set(invoice.payment_id, invoice);
    }
    return map;
  }, [invoices]);

  const getInvoiceStatusLabel = (status?: string | null) => {
    if (status === "authorized") return "Autorizada";
    if (status === "processing") return "Processando";
    if (status === "rejected") return "Rejeitada";
    if (status === "cancelled") return "Cancelada";
    if (status === "draft") return "Rascunho";
    return "Não emitida";
  };

  const getInvoiceStatusClass = (status?: string | null) => {
    if (status === "authorized") return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (status === "processing") return "bg-amber-100 text-amber-700 border-amber-200";
    if (status === "rejected") return "bg-destructive/10 text-destructive border-destructive/20";
    if (status === "cancelled") return "bg-slate-100 text-slate-700 border-slate-200";
    return "bg-secondary text-muted-foreground border-border/30";
  };

  useEffect(() => {
    let active = true;
    const checkEntryColumn = async () => {
      const { error } = await (supabase as any)
        .from("payments")
        .select("id, entry_paid_at")
        .limit(1);
      if (!active) return;
      if (error && isMissingEntryPaidAtColumnError(error)) {
        setSupportsEntryPaidAt(false);
      }
    };
    void checkEntryColumn();
    return () => {
      active = false;
    };
  }, []);

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
    const todayIso = format(new Date(), "yyyy-MM-dd");
    const base = payments.filter((p) => {
      const clientName = p.clients ? `${p.clients.first_name} ${p.clients.last_name}` : "";
      const eventName = p.events?.title || "";
      const textMatch = !q || `${clientName} ${eventName}`.toLowerCase().includes(q);
      if (!textMatch) return false;
      if (companyFilter !== "all" && String((p as any).company_id || "") !== companyFilter) return false;

      const paymentInstallments = installmentsByPayment.get(p.id) || [];
      const hasPendingEntry = Boolean(p.has_entry_payment && Number(p.entry_amount || 0) > 0 && !p.entry_paid_at);
      const pendingInstallments = paymentInstallments.filter((inst) => !isInstallmentPaid(inst.status, inst.paid_at));
      const hasPendingInstallments = pendingInstallments.length > 0;
      const hasPending = hasPendingEntry || hasPendingInstallments;

      const hasOverdue = pendingInstallments.some((inst) => {
        const dueDate = new Date(`${inst.due_date}T23:59:59`);
        return isPast(dueDate) && !isToday(new Date(`${inst.due_date}T12:00:00`));
      });

      const hasDueToday = pendingInstallments.some((inst) => isToday(new Date(`${inst.due_date}T12:00:00`)))
        || Boolean(hasPendingEntry && p.entry_date && isToday(new Date(`${p.entry_date}T12:00:00`)));

      if (statusFilter === "overdue" && !hasOverdue) return false;
      if (statusFilter === "due_today" && !hasDueToday) return false;
      if (statusFilter === "pending" && !hasPending) return false;
      if (statusFilter === "paid" && hasPending) return false;

      const datePool = [
        ...(p.entry_date ? [p.entry_date] : []),
        ...paymentInstallments.map((inst) => inst.due_date),
      ].filter(Boolean);

      if (dateFilterMode === "today") {
        if (!datePool.some((date) => date === todayIso)) return false;
      }

      if (dateFilterMode === "custom") {
        if (dateFrom && !datePool.some((date) => date >= dateFrom)) return false;
        if (dateTo && !datePool.some((date) => date <= dateTo)) return false;
      }

      return true;
    });

    const getNextPendingDueDate = (payment: Payment) => {
      const pendingDates = (installmentsByPayment.get(payment.id) || [])
        .filter((inst) => !isInstallmentPaid(inst.status, inst.paid_at))
        .map((inst) => new Date(`${inst.due_date}T12:00:00`).getTime())
        .filter((value) => Number.isFinite(value));
      if (!pendingDates.length) return Number.POSITIVE_INFINITY;
      return Math.min(...pendingDates);
    };

    const getPendingAmount = (payment: Payment) => {
      const pendingInstallments = (installmentsByPayment.get(payment.id) || [])
        .filter((inst) => !isInstallmentPaid(inst.status, inst.paid_at))
        .reduce((sum, inst) => sum + Number(inst.amount || 0), 0);
      const pendingEntry = payment.has_entry_payment && Number(payment.entry_amount || 0) > 0 && !payment.entry_paid_at
        ? Number(payment.entry_amount || 0)
        : 0;
      return pendingInstallments + pendingEntry;
    };

    return base.sort((a, b) => {
      if (sortMode === "client_az") {
        const nameA = `${a.clients?.first_name || ""} ${a.clients?.last_name || ""}`.trim().toLowerCase();
        const nameB = `${b.clients?.first_name || ""} ${b.clients?.last_name || ""}`.trim().toLowerCase();
        return nameA.localeCompare(nameB, "pt-BR");
      }
      if (sortMode === "highest_pending") {
        return getPendingAmount(b) - getPendingAmount(a);
      }
      return getNextPendingDueDate(a) - getNextPendingDueDate(b);
    });
  }, [payments, search, installmentsByPayment, statusFilter, dateFilterMode, dateFrom, dateTo, companyFilter, sortMode]);

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

  const selectedClientGroup = useMemo(
    () => groupedByClient.find((group) => group.clientId === selectedClientId) || null,
    [groupedByClient, selectedClientId]
  );
  const selectedClientStats = useMemo(() => {
    if (!selectedClientGroup) return { pending: 0, received: 0, contracts: 0 };
    const installments = selectedClientGroup.payments.flatMap((p) => installmentsByPayment.get(p.id) || []);
    const pending = installments.filter((i) => !isInstallmentPaid(i.status, i.paid_at)).reduce((s, i) => s + Number(i.amount || 0), 0);
    const received = installments.filter((i) => isInstallmentPaid(i.status, i.paid_at)).reduce((s, i) => s + Number(i.paid_amount ?? i.amount ?? 0), 0);
    const entryReceived = selectedClientGroup.payments.reduce((s, p) => {
      if (p.has_entry_payment && p.entry_paid_at) return s + Number(p.entry_paid_amount ?? p.entry_amount ?? 0);
      return s;
    }, 0);
    const entryPending = selectedClientGroup.payments.reduce((s, p) => {
      if (p.has_entry_payment && !p.entry_paid_at && p.entry_amount) return s + Number(p.entry_amount);
      return s;
    }, 0);
    return { pending: pending + entryPending, received: received + entryReceived, contracts: selectedClientGroup.payments.length };
  }, [selectedClientGroup, installmentsByPayment]);

  const hasActiveFilters = search.trim() || statusFilter !== "all" || dateFilterMode !== "all" || dateFrom || dateTo || companyFilter !== "all";
  const resetFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setDateFilterMode("all");
    setDateFrom("");
    setDateTo("");
    setCompanyFilter("all");
    setSortMode("next_due");
  };

  const totals = useMemo(() => {
    let pending = 0;
    let received = 0;
    for (const inst of installments) {
      if (!filteredPayments.some((p) => p.id === inst.payment_id)) continue;
      if (isInstallmentPaid(inst.status, inst.paid_at)) received += Number(inst.paid_amount ?? inst.amount ?? 0);
      else pending += inst.amount;
    }
    for (const p of filteredPayments) {
      if (!p.has_entry_payment || !p.entry_amount) continue;
      if (p.entry_paid_at) received += Number(p.entry_paid_amount ?? p.entry_amount ?? 0);
      else pending += p.entry_amount;
    }
    return { pending, received };
  }, [filteredPayments, installments]);

  const recalculateOpenInstallments = async (paymentId: string) => {
    const payment = payments.find((item) => item.id === paymentId);
    if (!payment) return;

    const { data: rows, error } = await (supabase as any)
      .from("payment_installments")
      .select("id, amount, status, paid_at, paid_amount")
      .eq("payment_id", paymentId)
      .order("installment_number", { ascending: true });
    if (error) throw error;

    const allInstallments = (rows || []) as unknown as Installment[];
    const openInstallments = allInstallments.filter((inst) => !isInstallmentPaid(inst.status, inst.paid_at));
    if (!openInstallments.length) return;

    const paidInstallmentsTotal = allInstallments
      .filter((inst) => isInstallmentPaid(inst.status, inst.paid_at))
      .reduce((sum, inst) => sum + Number(inst.paid_amount ?? inst.amount ?? 0), 0);

    const entryPaidValue = payment.has_entry_payment && payment.entry_paid_at
      ? Number(payment.entry_paid_amount ?? payment.entry_amount ?? 0)
      : 0;

    const remainingValue = Math.max(0, Number(payment.total_event_value || 0) - entryPaidValue - paidInstallmentsTotal);
    const totalCents = Math.round(remainingValue * 100);
    const baseCents = Math.floor(totalCents / openInstallments.length);
    const remainderCents = totalCents - (baseCents * openInstallments.length);

    for (let index = 0; index < openInstallments.length; index += 1) {
      const inst = openInstallments[index];
      const cents = baseCents + (index === openInstallments.length - 1 ? remainderCents : 0);
      const { error: updateError } = await supabase
        .from("payment_installments")
        .update({ amount: cents / 100 } as any)
        .eq("id", inst.id);
      if (updateError) throw updateError;
    }
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
      };
    });
  };

  useEffect(() => {
    if (!contractOpen) return;

    const totalValue = parseCurrencyInput(contractForm.total_event_value);
    const count = Number(contractForm.installment_count || "1");
    const hasEntry = contractForm.has_entry_payment;
    const entryAmount = hasEntry ? parseCurrencyInput(contractForm.entry_amount) : 0;

    if (!Number.isFinite(totalValue) || totalValue <= 0 || !Number.isInteger(count) || count < 1) {
      setInstallmentPlan([]);
      return;
    }

    const remaining = totalValue - (hasEntry ? entryAmount : 0);
    if (!Number.isFinite(remaining) || remaining < 0) {
      setInstallmentPlan([]);
      return;
    }

    if (editingPayment && installmentPlan.length === count) return;

    setInstallmentPlan(buildDefaultInstallments(count, remaining, hasEntry ? contractForm.entry_date : undefined));
  }, [
    contractOpen,
    editingPayment,
    installmentPlan.length,
    contractForm.total_event_value,
    contractForm.installment_count,
    contractForm.has_entry_payment,
    contractForm.entry_amount,
    contractForm.entry_date,
  ]);

  const updateInstallment = (index: number, field: "due_date" | "amount", value: string) => {
    setInstallmentPlan((prev) => {
      if (field === "due_date") {
        return prev.map((item, i) => (i === index ? { ...item, due_date: value } : item));
      }

      const next = prev.map((item, i) => (i === index ? { ...item, amount: maskCurrencyInput(value) } : item));
      const totalValue = parseCurrencyInput(contractForm.total_event_value);
      const entryAmount = contractForm.has_entry_payment ? parseCurrencyInput(contractForm.entry_amount) : 0;
      const remainingTotal = totalValue - (contractForm.has_entry_payment ? entryAmount : 0);

      if (!Number.isFinite(remainingTotal) || remainingTotal <= 0) return next;
      if (index >= next.length - 1) return next;

      const usedUntilIndex = next
        .slice(0, index + 1)
        .reduce((sum, item) => sum + parseCurrencyInput(item.amount), 0);

      const remainingCount = next.length - (index + 1);
      const remainingValue = remainingTotal - usedUntilIndex;
      const evenValue = remainingCount > 0 ? Math.round((remainingValue / remainingCount) * 100) / 100 : 0;

      if (!Number.isFinite(evenValue)) return next;

      return next.map((item, i) => {
        if (i <= index) return item;
        return { ...item, amount: formatCurrencyInput(evenValue) };
      });
    });
  };

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

      const paymentId = editingPayment?.id || crypto.randomUUID();
      if (editingPayment?.id) {
        const { error: paymentError } = await supabase
          .from("payments")
          .update({
            total_event_value: totalValue,
            installment_count: count,
            has_entry_payment: hasEntry,
            entry_amount: hasEntry ? entryAmount : null,
            entry_date: hasEntry ? contractForm.entry_date : null,
            client_id: contractForm.client_id,
            event_id: contractForm.event_id || null,
            company_id: contractForm.company_id || null,
            additional_value: parseCurrencyInput(contractForm.additional_value) || 0,
            additional_description: contractForm.additional_description || "",
          } as any)
          .eq("id", editingPayment.id);
        if (paymentError) {
          if (isMissingCompanyIdColumnError(paymentError)) {
            const retry = await supabase
              .from("payments")
              .update({
                total_event_value: totalValue,
                installment_count: count,
                has_entry_payment: hasEntry,
                entry_amount: hasEntry ? entryAmount : null,
                entry_date: hasEntry ? contractForm.entry_date : null,
                client_id: contractForm.client_id,
                event_id: contractForm.event_id || null,
                additional_value: parseCurrencyInput(contractForm.additional_value) || 0,
                additional_description: contractForm.additional_description || "",
              } as any)
              .eq("id", editingPayment.id);
            if (retry.error) throw retry.error;
          } else {
            throw paymentError;
          }
        }
      } else {
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
            company_id: contractForm.company_id || null,
            additional_value: parseCurrencyInput(contractForm.additional_value) || 0,
            additional_description: contractForm.additional_description || "",
          } as any);
        if (paymentError) {
          if (isMissingCompanyIdColumnError(paymentError)) {
            const retry = await supabase
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
                additional_value: parseCurrencyInput(contractForm.additional_value) || 0,
                additional_description: contractForm.additional_description || "",
              } as any);
            if (retry.error) throw retry.error;
          } else {
            throw paymentError;
          }
        }
      }

      const remaining = totalValue - (hasEntry ? entryAmount : 0);
      const sourcePlan: InstallmentPlanItem[] = installmentPlan.length === count
        ? installmentPlan
        : buildDefaultInstallments(count, remaining, hasEntry ? contractForm.entry_date : undefined);

      const installmentsData = sourcePlan.map((item) => ({
        payment_id: paymentId,
        installment_number: item.installment_number,
        due_date: item.due_date,
        amount: parseCurrencyInput(item.amount),
        status: item.status || "pending",
        paid_at: item.paid_at || null,
      }));

      const hasInvalidInstallments = installmentsData.some(
        (item) => !item.due_date || !Number.isFinite(item.amount) || item.amount <= 0
      );
      if (hasInvalidInstallments) {
        throw new Error("Preencha data e valor válidos para todas as parcelas.");
      }

      const installmentsSum = installmentsData.reduce((acc, curr) => acc + curr.amount, 0);
      if (Math.abs(installmentsSum - remaining) > 0.01) {
        throw new Error(`A soma das parcelas (${currencyFmt(installmentsSum)}) deve ser igual ao saldo a parcelar (${currencyFmt(remaining)}).`);
      }

      if (editingPayment?.id) {
        const { error: deleteInstError } = await supabase.from("payment_installments").delete().eq("payment_id", paymentId);
        if (deleteInstError) throw deleteInstError;
      }

      const { error: instError } = await supabase.from("payment_installments").insert(installmentsData as any);
      if (instError) {
        if (!editingPayment?.id) {
          await supabase.from("payments").delete().eq("id", paymentId);
        }
        throw instError;
      }
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["payment_installments_all"] });
      qc.invalidateQueries({ queryKey: ["dashboard_kpis"] });
      qc.invalidateQueries({ queryKey: ["dashboard_metrics"] });
      await syncEventPaymentStatus(contractForm.event_id || editingPayment?.event_id || null);
      setContractOpen(false);
      setContractForm({ total_event_value: "", installment_count: "1", has_entry_payment: false, entry_amount: "", entry_date: "", client_id: "", event_id: "", company_id: "", additional_value: "", additional_description: "" });
      setInstallmentPlan([]);
      setEditingPayment(null);
      toast({ title: editingPayment ? "Pagamento atualizado com sucesso" : "Contrato criado com sucesso" });
    },
    onError: (e: any) => toast({ title: editingPayment ? "Erro ao atualizar pagamento" : "Erro ao criar contrato", description: e?.message || "Tente novamente.", variant: "destructive" }),
  });

  const openEditPayment = (payment: Payment) => {
    const paymentInstallments = installmentsByPayment.get(payment.id) || [];
    setEditingPayment(payment);
    setContractForm({
      total_event_value: payment.total_event_value != null ? formatCurrencyInput(payment.total_event_value) : "",
      installment_count: String(payment.installment_count ?? paymentInstallments.length ?? 1),
      has_entry_payment: !!payment.has_entry_payment,
      entry_amount: payment.entry_amount != null ? formatCurrencyInput(payment.entry_amount) : "",
      entry_date: payment.entry_date || "",
      client_id: payment.client_id || "",
      event_id: payment.event_id || "",
      company_id: (payment as any).company_id || "",
      additional_value: (payment as any).additional_value != null ? formatCurrencyInput((payment as any).additional_value) : "",
      additional_description: (payment as any).additional_description || "",
    });
    setInstallmentPlan(
      paymentInstallments.length
        ? paymentInstallments.map((inst) => ({
            installment_number: inst.installment_number,
            due_date: inst.due_date,
            amount: formatCurrencyInput(inst.amount),
            status: inst.status,
            paid_at: inst.paid_at,
          }))
        : []
    );
    setContractOpen(true);
  };

  const deletePaymentMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error: instError } = await supabase.from("payment_installments").delete().eq("payment_id", paymentId);
      if (instError) throw instError;
      const { error } = await supabase.from("payments").delete().eq("id", paymentId);
      if (error) throw error;
    },
    onSuccess: async (_, paymentId) => {
      const payment = payments.find((p) => p.id === paymentId) || null;
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["payment_installments_all"] });
      qc.invalidateQueries({ queryKey: ["dashboard_kpis"] });
      qc.invalidateQueries({ queryKey: ["dashboard_metrics"] });
      await syncEventPaymentStatus(payment?.event_id || null);
      toast({ title: "Recebimento excluído com sucesso" });
    },
    onError: (e: any) => toast({ title: "Erro ao excluir recebimento", description: e?.message || "Tente novamente.", variant: "destructive" }),
  });

  const deleteClientMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const { error: eventsError } = await supabase.from("events").update({ client_id: null } as any).eq("client_id", clientId);
      if (eventsError) throw eventsError;
      const { error: paymentsError } = await supabase.from("payments").update({ client_id: null } as any).eq("client_id", clientId);
      if (paymentsError) throw paymentsError;
      const { error } = await supabase.from("clients").delete().eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients-select"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["events-select"] });
      toast({ title: "Cliente excluído com sucesso" });
    },
    onError: (e: any) => toast({ title: "Erro ao excluir cliente", description: e?.message || "Verifique vínculos existentes.", variant: "destructive" }),
  });

  const toggleEntryMutation = useMutation({
    mutationFn: async ({ paymentId, currentPaidAt, bankAccountId, paidDate, paidAmount, paymentMethod }: { paymentId: string; currentPaidAt: string | null; bankAccountId?: string | null; paidDate?: string; paidAmount?: number | null; paymentMethod?: string | null }) => {
      const paidAt = toIsoFromDateInput(paidDate);
      const payload = currentPaidAt
        ? { entry_paid_at: null, entry_bank_account_id: null, entry_paid_amount: null, entry_payment_method: null }
        : { entry_paid_at: paidAt, entry_bank_account_id: bankAccountId || null, entry_paid_amount: paidAmount ?? null, entry_payment_method: paymentMethod || null };

      let { error } = await supabase
        .from("payments")
        .update(payload as any)
        .eq("id", paymentId);

      if (error && (isMissingEntryBankAccountColumnError(error) || isMissingEntryPaidAmountColumnError(error) || isMissingEntryPaymentMethodColumnError(error))) {
          const retry = await supabase
            .from("payments")
            .update({ entry_paid_at: currentPaidAt ? null : paidAt } as any)
            .eq("id", paymentId);
        error = retry.error;
      }

      if (error) {
        if (isMissingEntryPaidAtColumnError(error)) {
          setSupportsEntryPaidAt(false);
          throw new Error("A coluna entry_paid_at ainda não existe no banco. Aplique a migration para validar a entrada.");
        }
        throw error;
      }
      setSupportsEntryPaidAt(true);
    },
    onSuccess: async (_, variables) => {
      const payment = payments.find((p) => p.id === variables.paymentId) || null;
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["dashboard_kpis"] });
      qc.invalidateQueries({ queryKey: ["dashboard_metrics"] });
      await syncEventPaymentStatus(payment?.event_id || null);
      toast({ title: "Entrada atualizada com sucesso" });
    },
    onError: (e: any) => {
      const description = isMissingEntryPaidAtColumnError(e)
        ? "Baixa da entrada indisponível neste banco até aplicar a migration da coluna entry_paid_at."
        : e?.message || "Tente novamente.";
      toast({ title: "Erro ao atualizar entrada", description, variant: "destructive" });
    },
  });

  const toggleInstallmentMutation = useMutation({
    mutationFn: async ({ installment, bankAccountId, paidDate, paidAmount, paymentMethod }: { installment: Installment; bankAccountId?: string | null; paidDate?: string; paidAmount?: number | null; paymentMethod?: string | null }) => {
      const currentlyPaid = isInstallmentPaid(installment.status, installment.paid_at);
      const paidAt = toIsoFromDateInput(paidDate);

      if (currentlyPaid) {
        let lastError: any = null;
        for (const fallbackStatus of PAID_STATUS_VALUES) {
          const { error } = await supabase
            .from("payment_installments")
            .update({ status: fallbackStatus, paid_at: paidAt, bank_account_id: bankAccountId || null, paid_amount: paidAmount ?? null, payment_method: paymentMethod || null } as any)
            .eq("id", installment.id);
          if (!error) {
            await recalculateOpenInstallments(installment.payment_id);
            return;
          }
          lastError = error;
        }
        if (lastError && (isMissingInstallmentBankAccountColumnError(lastError) || isMissingInstallmentPaidAmountColumnError(lastError) || isMissingInstallmentPaymentMethodColumnError(lastError))) {
          for (const fallbackStatus of PAID_STATUS_VALUES) {
            const { error } = await supabase
              .from("payment_installments")
              .update({ status: fallbackStatus, paid_at: paidAt } as any)
              .eq("id", installment.id);
            if (!error) {
              await recalculateOpenInstallments(installment.payment_id);
              return;
            }
            lastError = error;
          }
        }
        if (lastError) throw lastError;
        return;
      }

      let lastError: any = null;
      for (const fallbackStatus of PAID_STATUS_VALUES) {
        const { error } = await supabase
          .from("payment_installments")
          .update({ status: fallbackStatus, paid_at: paidAt, bank_account_id: bankAccountId || null, paid_amount: paidAmount ?? null, payment_method: paymentMethod || null } as any)
          .eq("id", installment.id);
        if (!error) {
          await recalculateOpenInstallments(installment.payment_id);
          return;
        }
        lastError = error;
      }
      if (lastError && (isMissingInstallmentBankAccountColumnError(lastError) || isMissingInstallmentPaidAmountColumnError(lastError) || isMissingInstallmentPaymentMethodColumnError(lastError))) {
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
    onSuccess: async (_, variables) => {
      const payment = payments.find((p) => p.id === variables.installment.payment_id) || null;
      qc.invalidateQueries({ queryKey: ["payment_installments_all"] });
      qc.invalidateQueries({ queryKey: ["dashboard_kpis"] });
      qc.invalidateQueries({ queryKey: ["dashboard_metrics"] });
      await syncEventPaymentStatus(payment?.event_id || null);
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar parcela", description: e?.message || "Tente novamente.", variant: "destructive" }),
  });

  const unpayInstallmentMutation = useMutation({
    mutationFn: async (installment: Installment) => {
      let lastError: any = null;
      for (const fallbackStatus of PENDING_STATUS_VALUES) {
        const { error } = await supabase
          .from("payment_installments")
          .update({ status: fallbackStatus, paid_at: null, bank_account_id: null, paid_amount: null, payment_method: null } as any)
          .eq("id", installment.id);
        if (!error) {
          await recalculateOpenInstallments(installment.payment_id);
          return;
        }
        lastError = error;
      }
      if (lastError && (isMissingInstallmentBankAccountColumnError(lastError) || isMissingInstallmentPaidAmountColumnError(lastError) || isMissingInstallmentPaymentMethodColumnError(lastError))) {
        for (const fallbackStatus of PENDING_STATUS_VALUES) {
          const { error } = await supabase
            .from("payment_installments")
            .update({ status: fallbackStatus, paid_at: null } as any)
            .eq("id", installment.id);
          if (!error) {
            await recalculateOpenInstallments(installment.payment_id);
            return;
          }
          lastError = error;
        }
      }
      if (lastError) throw lastError;
    },
    onSuccess: async (_, variables) => {
      const payment = payments.find((p) => p.id === variables.payment_id) || null;
      qc.invalidateQueries({ queryKey: ["payment_installments_all"] });
      qc.invalidateQueries({ queryKey: ["dashboard_kpis"] });
      qc.invalidateQueries({ queryKey: ["dashboard_metrics"] });
      await syncEventPaymentStatus(payment?.event_id || null);
      toast({ title: "Baixa desfeita com sucesso" });
    },
    onError: (e: any) => toast({ title: "Erro ao desfazer baixa", description: e?.message || "Tente novamente.", variant: "destructive" }),
  });

  const issueInvoiceMutation = useMutation({
    mutationFn: async (payment: Payment) => {
      if (!payment.client_id) throw new Error("Este recebimento não possui cliente vinculado.");
      if (!(payment as any).company_id) throw new Error("Vincule uma empresa ao contrato antes de emitir a nota.");

      const firstInstallment = (installmentsByPayment.get(payment.id) || [])[0];
      const { error } = await supabase.functions.invoke("invoice-issue", {
        body: {
          payment_id: payment.id,
          company_id: (payment as any).company_id,
          client_id: payment.client_id,
          items: [
            {
              description: payment.events?.title || "Serviços de evento",
              quantity: 1,
              unit_amount: Number(firstInstallment?.amount || payment.total_event_value || 0),
            },
          ],
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices-select"] });
      toast({ title: "Emissão de NF iniciada" });
    },
    onError: (e: any) => {
      toast({ title: "Erro ao emitir nota", description: e?.message || "Tente novamente.", variant: "destructive" });
    },
  });

  const cancelInvoiceMutation = useMutation({
    mutationFn: async ({ invoice, reason }: { invoice: InvoiceRecord; reason: string }) => {
      const { error } = await supabase.functions.invoke("invoice-cancel", {
        body: {
          invoice_id: invoice.id,
          reason,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices-select"] });
      toast({ title: "Nota fiscal cancelada" });
    },
    onError: (e: any) => {
      toast({ title: "Erro ao cancelar nota", description: e?.message || "Tente novamente.", variant: "destructive" });
    },
  });

  const eventsByClient = useMemo(() => {
    if (!contractForm.client_id) return events;
    return events.filter((evt: any) => evt.client_id === contractForm.client_id);
  }, [events, contractForm.client_id]);

  const openEntryAccountPicker = (payment: Payment) => {
    setPendingEntryPayment(payment);
    setSelectedEntryBankAccountId(payment.entry_bank_account_id || "");
    setSelectedEntryPaidDate(toDateInputValue(payment.entry_paid_at));
    setSelectedEntryPaidAmount(formatCurrencyInput(payment.entry_paid_amount ?? payment.entry_amount ?? 0));
    setSelectedEntryPaymentMethod(payment.entry_payment_method || "");
    setEntryAccountPickerOpen(true);
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-[1700px] mx-auto p-2 pb-10">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 px-2">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 bg-gold rounded-full" />
            <h1 className="text-4xl md:text-5xl font-display text-foreground tracking-tighter uppercase leading-none">Recebimentos</h1>
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.4em] text-gold/80 pl-4">David Melo Produções • Fluxo de Recebíveis e Contratos</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex bg-white/90 border border-border/30 rounded-xl p-1 shadow-sm">
            <Button type="button" size="sm" variant={viewMode === "bloco" ? "default" : "ghost"} onClick={() => setViewMode("bloco")} className={cn("h-9 px-3", viewMode === "bloco" && "bg-gold text-white hover:bg-gold") }>
              <LayoutGrid className="w-4 h-4 mr-2" /> Blocos
            </Button>
            <Button type="button" size="sm" variant={viewMode === "lista" ? "default" : "ghost"} onClick={() => setViewMode("lista")} className={cn("h-9 px-3", viewMode === "lista" && "bg-gold text-white hover:bg-gold") }>
              <List className="w-4 h-4 mr-2" /> Lista
            </Button>
          </div>
          <Button onClick={() => { setEditingPayment(null); setContractForm({ total_event_value: "", installment_count: "1", has_entry_payment: false, entry_amount: "", entry_date: "", client_id: "", event_id: "", company_id: "", additional_value: "", additional_description: "" }); setInstallmentPlan([]); setContractOpen(true); }} className="h-12 px-6 rounded-xl bg-gradient-gold text-white uppercase text-[11px] tracking-widest font-bold">
            <Plus className="w-4 h-4 mr-2" /> Novo Contrato
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white premium-shadow rounded-2xl p-6 border border-border/30 relative overflow-hidden">
          <div className="absolute left-0 top-0 h-full w-1.5 bg-gold/50" />
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">A Receber</p>
          <p className="text-3xl font-display mt-1 tracking-tight">{currencyFmt(totals.pending)}</p>
        </div>
        <div className="bg-white premium-shadow rounded-2xl p-6 border border-border/30 relative overflow-hidden">
          <div className="absolute left-0 top-0 h-full w-1.5 bg-emerald-500/50" />
          <p className="text-[10px] uppercase tracking-widest text-emerald-600 font-bold">Recebido</p>
          <p className="text-3xl font-display mt-1 tracking-tight">{currencyFmt(totals.received)}</p>
        </div>
        <div className="bg-white premium-shadow rounded-2xl p-6 border border-border/30 relative overflow-hidden">
          <div className="absolute left-0 top-0 h-full w-1.5 bg-sky-500/40" />
          <p className="text-[10px] uppercase tracking-widest text-sky-700 font-bold">Clientes filtrados</p>
          <p className="text-3xl font-display mt-1 tracking-tight">{groupedByClient.length}</p>
        </div>
        <div className="bg-white premium-shadow rounded-2xl p-6 border border-border/30 relative overflow-hidden">
          <div className="absolute left-0 top-0 h-full w-1.5 bg-amber-500/40" />
          <p className="text-[10px] uppercase tracking-widest text-amber-700 font-bold">Contratos filtrados</p>
          <p className="text-3xl font-display mt-1 tracking-tight">{filteredPayments.length}</p>
        </div>
      </div>

      <div className="bg-white border border-border/30 rounded-2xl p-4 md:p-5 premium-shadow space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
            <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Filtros e organização</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant={statusFilter === "overdue" ? "default" : "outline"} className={cn("h-8 rounded-lg text-[10px] uppercase tracking-wider", statusFilter === "overdue" && "bg-destructive text-white hover:bg-destructive/90")} onClick={() => setStatusFilter(statusFilter === "overdue" ? "all" : "overdue")}>Atrasados</Button>
            <Button type="button" size="sm" variant={statusFilter === "due_today" ? "default" : "outline"} className={cn("h-8 rounded-lg text-[10px] uppercase tracking-wider", statusFilter === "due_today" && "bg-gold text-white hover:bg-gold")} onClick={() => setStatusFilter(statusFilter === "due_today" ? "all" : "due_today")}>Vencem hoje</Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 rounded-lg text-[10px] uppercase tracking-wider" disabled={!hasActiveFilters} onClick={resetFilters}>Limpar filtros</Button>
          </div>
        </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3 items-end">
        <div className="relative md:col-span-2 xl:col-span-3">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente ou evento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-11 h-12 rounded-xl bg-white border-border/30 premium-shadow"
          />
        </div>

        <div className="space-y-1 xl:col-span-2">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Situação</Label>
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="h-12 rounded-xl bg-white border-border/30"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="due_today">Vencem hoje</SelectItem>
              <SelectItem value="overdue">Em atraso</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="paid">Pagos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1 xl:col-span-2">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Período</Label>
          <Select value={dateFilterMode} onValueChange={(v: any) => setDateFilterMode(v)}>
            <SelectTrigger className="h-12 rounded-xl bg-white border-border/30"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas datas</SelectItem>
              <SelectItem value="today">Data de hoje</SelectItem>
              <SelectItem value="custom">Intervalo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {companies.length > 0 && (
          <div className="space-y-1 xl:col-span-2">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Empresa / CNPJ</Label>
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="h-12 rounded-xl bg-white border-border/30"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas empresas</SelectItem>
                {companies.map((company: any) => (
                  <SelectItem key={company.id} value={company.id}>{company.trade_name || company.legal_name || "Empresa"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1 xl:col-span-1">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Ordenar por</Label>
          <Select value={sortMode} onValueChange={(v: any) => setSortMode(v)}>
            <SelectTrigger className="h-12 rounded-xl bg-white border-border/30"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="next_due">Próximo vencimento</SelectItem>
              <SelectItem value="highest_pending">Maior valor pendente</SelectItem>
              <SelectItem value="client_az">Cliente A-Z</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1 xl:col-span-1">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">De</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} disabled={dateFilterMode !== "custom"} className="h-12 rounded-xl bg-white border-border/30" />
        </div>

        <div className="space-y-1 xl:col-span-1">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Até</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} disabled={dateFilterMode !== "custom"} className="h-12 rounded-xl bg-white border-border/30" />
        </div>
      </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-24 bg-white rounded-2xl border border-border/40 animate-pulse" />)}</div>
      ) : groupedByClient.length === 0 ? (
        <div className="bg-white premium-shadow rounded-2xl p-20 border border-border/40 text-center">
          <p className="font-bold text-lg">Nenhum cliente encontrado</p>
        </div>
      ) : (
        <div className={cn("space-y-4", viewMode === "lista" && "bg-white border border-border/30 rounded-2xl p-3 premium-shadow") }>
          {groupedByClient.map((group) => {
            const clientInstallments = group.payments.flatMap((p) => installmentsByPayment.get(p.id) || []);
            const clientPending = clientInstallments.filter((i) => !isInstallmentPaid(i.status, i.paid_at)).reduce((s, i) => s + i.amount, 0);
            const clientReceived = clientInstallments.filter((i) => isInstallmentPaid(i.status, i.paid_at)).reduce((s, i) => s + i.amount, 0);
            const clientTotal = clientPending + clientReceived;
            const receivedPct = clientTotal > 0 ? Math.min(100, (clientReceived / clientTotal) * 100) : 0;
            return (
              <div key={group.clientId} className={cn("rounded-2xl border border-border/40 overflow-hidden bg-gradient-to-br from-white via-white to-amber-50/30", viewMode === "bloco" ? "premium-shadow" : "shadow-none border-border/20") }>
                <button
                  className={cn("w-full text-left", viewMode === "bloco" ? "p-6" : "p-4")}
                  onClick={() => {
                    setSelectedClientId(group.clientId);
                    setExpandedPaymentId(null);
                    setClientDetailsOpen(true);
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="h-12 w-12 rounded-xl bg-gold/15 text-gold flex items-center justify-center font-black text-sm shrink-0">{getInitials(group.clientName || "C")}</div>
                      <div className="space-y-2 min-w-0">
                        <h3 className="text-xl font-display uppercase truncate">{group.clientName}</h3>
                        <div className="flex flex-wrap gap-2">
                          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{group.payments.length} contrato{group.payments.length > 1 ? "s" : ""}</span>
                          <span className="text-[10px] uppercase tracking-widest text-gold font-bold">A receber {currencyFmt(clientPending)}</span>
                          <span className="text-[10px] uppercase tracking-widest text-emerald-600 font-bold">Recebido {currencyFmt(clientReceived)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {group.clientId && !group.clientId.startsWith("sem-cliente-") && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Excluir cliente ${group.clientName}?`)) {
                            deleteClientMutation.mutate(group.clientId);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      )}
                      <ArrowDownCircle className="w-5 h-5 text-gold" />
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="h-2 rounded-full bg-secondary/60 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${receivedPct}%` }} />
                    </div>
                    <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{receivedPct.toFixed(1)}% do cliente já recebido</p>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={clientDetailsOpen} onOpenChange={setClientDetailsOpen}>
        <DialogContent className="max-w-6xl rounded-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{selectedClientGroup?.clientName || "Cliente"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pb-2">
            <div className="rounded-xl border border-border/30 bg-secondary/10 p-4 transition-all hover:-translate-y-0.5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Contratos</p>
              <p className="text-2xl font-display mt-1">{selectedClientStats.contracts}</p>
            </div>
            <div className="rounded-xl border border-border/30 bg-amber-50 p-4 transition-all hover:-translate-y-0.5">
              <p className="text-[10px] uppercase tracking-widest text-amber-700 font-bold">A receber</p>
              <p className="text-2xl font-display mt-1">{currencyFmt(selectedClientStats.pending)}</p>
            </div>
            <div className="rounded-xl border border-border/30 bg-emerald-50 p-4 transition-all hover:-translate-y-0.5">
              <p className="text-[10px] uppercase tracking-widest text-emerald-700 font-bold">Recebido</p>
              <p className="text-2xl font-display mt-1">{currencyFmt(selectedClientStats.received)}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.8fr)] gap-4 overflow-hidden">
            <div className="overflow-y-auto pr-1 space-y-4 max-h-[58vh]">
              {selectedClientGroup?.payments.map((payment) => {
              const paymentExpanded = expandedPaymentId === payment.id;
              const paymentInstallments = installmentsByPayment.get(payment.id) || [];
              const invoice = invoiceByPaymentId.get(payment.id);
              const canIssueInvoice = !invoice || invoice.status === "rejected" || invoice.status === "cancelled";
              return (
                <div key={payment.id} className="bg-white border border-border/30 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <button
                    className="w-full flex items-center justify-between p-4 text-left"
                    onClick={() => setExpandedPaymentId(paymentExpanded ? null : payment.id)}
                  >
                    <div>
                      <p className="text-sm font-bold uppercase">{payment.events?.title || "Evento sem título"}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Total {currencyFmt(payment.total_event_value)}</p>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[9px] uppercase tracking-wider font-black", getInvoiceStatusClass(invoice?.status))}>
                          <FileText className="w-3 h-3 mr-1" /> NF {getInvoiceStatusLabel(invoice?.status)}
                        </span>
                        {invoice?.invoice_number && <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Nº {invoice.invoice_number}</span>}
                        {invoice?.status === "rejected" && invoice?.error_message && <span className="text-[9px] font-bold text-destructive/80 uppercase tracking-wider">Motivo: {invoice.error_message}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" size="sm" variant="outline" disabled={issueInvoiceMutation.isPending || !canIssueInvoice} className="h-8 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider border-gold/30 text-gold hover:bg-gold hover:text-white" onClick={(e) => { e.stopPropagation(); issueInvoiceMutation.mutate(payment); }}>
                        {invoice?.status === "rejected" || invoice?.status === "cancelled" ? "Reemitir NF" : "Emitir NF"}
                      </Button>
                      {invoice?.status === "authorized" && invoice?.pdf_url && <Button type="button" size="sm" variant="outline" className="h-8 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider" onClick={(e) => { e.stopPropagation(); window.open(invoice.pdf_url!, "_blank", "noopener,noreferrer"); }}>PDF</Button>}
                      {invoice?.status === "authorized" && invoice?.xml_url && <Button type="button" size="sm" variant="outline" className="h-8 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider" onClick={(e) => { e.stopPropagation(); window.open(invoice.xml_url!, "_blank", "noopener,noreferrer"); }}>XML</Button>}
                      {invoice?.status === "authorized" && <Button type="button" size="sm" variant="outline" disabled={cancelInvoiceMutation.isPending} className="h-8 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider border-destructive/30 text-destructive hover:bg-destructive hover:text-white" onClick={(e) => { e.stopPropagation(); const reason = window.prompt("Informe o motivo do cancelamento:", "Cancelamento solicitado pelo cliente") || ""; if (!reason.trim()) return; if (!window.confirm("Confirmar cancelamento desta NF?")) return; cancelInvoiceMutation.mutate({ invoice, reason: reason.trim() }); }}>Cancelar NF</Button>}
                      <Button type="button" size="sm" variant="ghost" className="h-9 w-9 p-0 text-muted-foreground hover:text-gold" onClick={(e) => { e.stopPropagation(); openEditPayment(payment); }}><Pencil className="w-4 h-4" /></Button>
                      <Button type="button" size="sm" variant="ghost" className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); if (window.confirm(`Excluir recebimento de ${payment.events?.title || "evento"}?`)) { deletePaymentMutation.mutate(payment.id); } }}><Trash2 className="w-4 h-4" /></Button>
                      <ChevronDown className={cn("w-4 h-4 transition-transform", paymentExpanded && "rotate-180")} />
                    </div>
                  </button>

                  {paymentExpanded && (
                    <div className="border-t border-border/20 p-4 space-y-3">
                      {payment.has_entry_payment && Number(payment.entry_amount || 0) > 0 && (
                        <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                          <div className="flex items-center gap-3"><Calendar className="w-4 h-4 text-emerald-600" /><div className="flex-1 min-w-0"><p className="text-[10px] uppercase tracking-wider font-bold">Entrada</p><p className="text-xs text-muted-foreground">{payment.entry_date ? format(new Date(payment.entry_date + "T12:00:00"), "dd/MM/yyyy") : "-"}</p>{payment.entry_paid_at && <p className="text-[11px] text-emerald-700 font-semibold mt-1">Baixado em {format(new Date(payment.entry_paid_at), "dd/MM/yyyy")}</p>}{payment.entry_paid_at && (() => { const accId = (payment as any).entry_bank_account_id; if (accId) { const acc = bankAccounts.find((b: any) => b.id === accId); return acc ? <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1"><Landmark size={10} className="text-gold shrink-0" />{acc.bank_name} {acc.account_number}{acc.account_digit ? `-${acc.account_digit}` : ''}</p> : null; } return <p className="text-[10px] text-amber-600 mt-1 font-semibold cursor-pointer hover:underline" onClick={() => setLinkInstallmentsOpen(true)}>Conta nao vinculada</p>; })()}</div></div>
                          <div className="flex items-center gap-3"><p className="font-display">{currencyFmt(Number(payment.entry_amount || 0))}</p><Button size="sm" variant="outline" disabled={!supportsEntryPaidAt} className={cn("h-8 border-none font-black uppercase text-[9px] tracking-[0.15em] rounded-xl transition-all shadow-sm", payment.entry_paid_at ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-white text-emerald-700 hover:bg-emerald-50")} onClick={() => { if (payment.entry_paid_at) { toggleEntryMutation.mutate({ paymentId: payment.id, currentPaidAt: payment.entry_paid_at }); return; } openEntryAccountPicker(payment); }}>{!supportsEntryPaidAt ? "Indisponível" : payment.entry_paid_at ? "Baixado" : "Validar"}</Button></div>
                        </div>
                      )}

                      {paymentInstallments.map((inst) => {
                        const paid = isInstallmentPaid(inst.status, inst.paid_at);
                        const overdue = !paid && isPast(new Date(inst.due_date + "T23:59:59")) && !isToday(new Date(inst.due_date + "T12:00:00"));
                        const dueToday = !paid && isToday(new Date(inst.due_date + "T12:00:00"));
                        return (
                          <div key={inst.id} className={cn("relative flex items-center justify-between p-4 rounded-xl border pl-8", overdue ? "border-destructive/30 bg-destructive/[0.03]" : dueToday ? "border-gold/40 bg-gold/5" : "border-border/30") }>
                            <div className={cn("absolute left-3 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full", paid ? "bg-emerald-500" : overdue ? "bg-destructive" : dueToday ? "bg-gold" : "bg-slate-300")} />
                            <div className="flex-1 min-w-0"><p className="text-[11px] font-bold uppercase tracking-wider">Parcela {String(inst.installment_number).padStart(2, "0")}</p><p className="text-xs text-muted-foreground">Vencimento {format(new Date(inst.due_date + "T12:00:00"), "dd/MM/yyyy")}</p>{paid && inst.paid_at && <p className="text-[11px] text-emerald-700 font-semibold mt-1">Baixado em {format(new Date(inst.paid_at), "dd/MM/yyyy")}</p>}{paid && (() => { if (inst.bank_account_id) { const acc = bankAccounts.find((b: any) => b.id === inst.bank_account_id); return acc ? <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1"><Landmark size={10} className="text-gold shrink-0" />{acc.bank_name} {acc.account_number}{acc.account_digit ? `-${acc.account_digit}` : ''}</p> : null; } return <p className="text-[10px] text-amber-600 mt-1 font-semibold cursor-pointer hover:underline" onClick={() => setLinkInstallmentsOpen(true)}>Conta nao vinculada</p>; })()}</div>
                            <div className="flex flex-col items-end gap-1"><p className="font-display">{currencyFmt(inst.amount)}</p><Button size="sm" variant="outline" className={cn("h-8 border-none font-black uppercase text-[9px] tracking-[0.15em] rounded-xl transition-all shadow-sm", paid ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-secondary text-foreground/80 hover:bg-gold hover:text-white")} onClick={() => { setPendingInstallment(inst); setSelectedBankAccountId(inst.bank_account_id || ""); setSelectedInstallmentPaidDate(toDateInputValue(inst.paid_at || new Date().toISOString())); setSelectedInstallmentPaidAmount(formatCurrencyInput(inst.paid_amount ?? inst.amount ?? 0)); setSelectedInstallmentPaymentMethod(inst.payment_method || ""); setAccountPickerOpen(true); }}>{paid ? "Baixado" : <><Check className="w-3 h-3 mr-1" /> Baixar</>}</Button>{paid && <button type="button" className="text-[9px] text-destructive/60 hover:text-destructive font-bold uppercase tracking-wider cursor-pointer" onClick={() => unpayInstallmentMutation.mutate(inst)}>Desfazer</button>}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            </div>

            <aside className="hidden lg:flex flex-col gap-3 rounded-2xl border border-border/30 bg-secondary/10 p-4 h-fit sticky top-0">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Visao rapida</p>
              <div className="rounded-xl bg-white border border-border/20 p-4">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Saldo do cliente</p>
                <p className="text-2xl font-display mt-1 text-gold">{currencyFmt(selectedClientStats.pending)}</p>
              </div>
              <div className="rounded-xl bg-white border border-border/20 p-4">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Contratos ativos</p>
                <p className="text-2xl font-display mt-1">{selectedClientStats.contracts}</p>
              </div>
              <div className="rounded-xl border border-dashed border-border/50 p-4 bg-white/70">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Dica de operacao</p>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">Use o botao de baixa para registrar conta, data, valor e forma de pagamento. As proximas parcelas serao recalculadas automaticamente pelo saldo restante.</p>
              </div>
            </aside>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={contractOpen} onOpenChange={setContractOpen}>
        <DialogContent className="max-w-2xl rounded-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle>{editingPayment ? "Editar pagamento" : "Novo contrato"}</DialogTitle></DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-1">
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
              {companies.length > 0 && (
                <div className="space-y-1">
                  <Label>Empresa / CNPJ</Label>
                  <Select value={contractForm.company_id || "none"} onValueChange={(v) => setContractForm({ ...contractForm, company_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem vínculo</SelectItem>
                      {companies.map((company: any) => (
                        <SelectItem key={company.id} value={company.id}>{company.trade_name || company.legal_name || "Empresa"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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

            <div className="rounded-xl border border-gold/20 overflow-hidden">
              <div className="px-4 py-2 bg-gold/5 border-b border-gold/20">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gold">Adicional (pós-contrato)</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="space-y-1">
                  <Label>Valor adicional (R$)</Label>
                  <Input value={contractForm.additional_value} onChange={(e) => setContractForm({ ...contractForm, additional_value: maskCurrencyInput(e.target.value) })} placeholder="0,00" />
                </div>
                <div className="space-y-1">
                  <Label>Descrição do adicional</Label>
                  <Input value={contractForm.additional_description} onChange={(e) => setContractForm({ ...contractForm, additional_description: e.target.value })} placeholder="Ex: Acréscimo de serviço..." />
                </div>
                {Number(parseCurrencyInput(contractForm.additional_value) || 0) > 0 && (
                  <div className="flex items-center justify-between p-2 bg-gold/5 rounded-lg border border-gold/10">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Valor final do contrato</span>
                    <span className="text-sm font-bold text-gold">{currencyFmt((parseCurrencyInput(contractForm.total_event_value) || 0) + (parseCurrencyInput(contractForm.additional_value) || 0))}</span>
                  </div>
                )}
              </div>
            </div>

            {installmentPlan.length > 0 && (
              <div className="space-y-3 p-4 bg-secondary/10 rounded-xl border border-border/10">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Parcelas (edite data e valor)</Label>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{installmentPlan.length} parcela{installmentPlan.length > 1 ? "s" : ""}</span>
                </div>
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {installmentPlan.map((item, index) => (
                    <div key={item.installment_number} className="grid grid-cols-1 md:grid-cols-[120px_1fr_180px] gap-2 items-center bg-white border border-border/20 rounded-lg p-3">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Parcela {String(item.installment_number).padStart(2, "0")}</span>
                      <Input
                        type="date"
                        value={item.due_date}
                        onChange={(e) => updateInstallment(index, "due_date", e.target.value)}
                        className="h-10 text-sm bg-secondary/20"
                      />
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={item.amount}
                        onChange={(e) => updateInstallment(index, "amount", e.target.value)}
                        className="h-10 text-base font-bold bg-secondary/20"
                        placeholder="0,00"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="sticky bottom-0 z-10 pt-3 border-t border-border/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <Button variant="ghost" onClick={() => { setContractOpen(false); setEditingPayment(null); }}>Cancelar</Button>
            <Button onClick={() => createContractMutation.mutate()} disabled={createContractMutation.isPending}>{editingPayment ? "Salvar alterações" : "Cadastrar contrato"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={accountPickerOpen} onOpenChange={(open) => {
        setAccountPickerOpen(open);
        if (!open) {
          setPendingInstallment(null);
          setSelectedBankAccountId("");
          setSelectedInstallmentPaidDate("");
          setSelectedInstallmentPaidAmount("");
          setSelectedInstallmentPaymentMethod("");
        }
      }}>
        <DialogContent className="max-w-md rounded-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Check size={18} className="text-gold" /> Baixar Parcela</DialogTitle><p className="text-xs text-muted-foreground mt-1">Selecione a conta bancaria para vincular o recebimento automaticamente.</p></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Conta bancaria</Label>
              <Select value={selectedBankAccountId} onValueChange={setSelectedBankAccountId}>
                <SelectTrigger className={cn("h-11", selectedBankAccountId ? "border-emerald-300 bg-emerald-50/50" : "")}><SelectValue placeholder="Escolher conta para vincular" /></SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((acc: any) => (
                    <SelectItem key={acc.id} value={acc.id}>{acc.bank_name} • Ag {acc.agency} • Cc {acc.account_number}{acc.account_digit ? `-${acc.account_digit}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Data do pagamento</Label>
              <Input type="date" value={selectedInstallmentPaidDate} onChange={(e) => setSelectedInstallmentPaidDate(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Valor pago</Label>
              <Input value={selectedInstallmentPaidAmount} onChange={(e) => setSelectedInstallmentPaidAmount(maskCurrencyInput(e.target.value))} placeholder="0,00" inputMode="numeric" className="h-10" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Forma de pagamento</Label>
              <Select value={selectedInstallmentPaymentMethod} onValueChange={setSelectedInstallmentPaymentMethod}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Escolher forma" /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_OPTIONS.map((method) => (
                    <SelectItem key={method} value={method}>{PAYMENT_METHOD_LABEL[method]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 z-10 pt-3 border-t border-border/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <Button variant="ghost" onClick={() => setAccountPickerOpen(false)}>Cancelar</Button>
            <Button
              disabled={!pendingInstallment || !selectedInstallmentPaidDate || parseCurrencyInput(selectedInstallmentPaidAmount) <= 0 || !selectedInstallmentPaymentMethod || (bankAccounts.length > 0 && !selectedBankAccountId)}
              onClick={() => {
                if (!pendingInstallment) return;
                toggleInstallmentMutation.mutate({
                  installment: pendingInstallment,
                  bankAccountId: selectedBankAccountId || null,
                  paidDate: selectedInstallmentPaidDate,
                  paidAmount: parseCurrencyInput(selectedInstallmentPaidAmount),
                  paymentMethod: selectedInstallmentPaymentMethod,
                });
                setAccountPickerOpen(false);
                setPendingInstallment(null);
                setSelectedBankAccountId("");
                setSelectedInstallmentPaidDate("");
                setSelectedInstallmentPaidAmount("");
                setSelectedInstallmentPaymentMethod("");
              }}
            >
              Confirmar baixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={entryAccountPickerOpen} onOpenChange={(open) => {
        setEntryAccountPickerOpen(open);
        if (!open) {
          setPendingEntryPayment(null);
          setSelectedEntryBankAccountId("");
          setSelectedEntryPaidDate("");
          setSelectedEntryPaidAmount("");
          setSelectedEntryPaymentMethod("");
        }
      }}>
        <DialogContent className="max-w-md rounded-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle>Conta de recebimento da entrada</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Conta bancária</Label>
            <Select value={selectedEntryBankAccountId} onValueChange={setSelectedEntryBankAccountId}>
              <SelectTrigger><SelectValue placeholder="Escolher conta" /></SelectTrigger>
              <SelectContent>
                {bankAccounts.map((acc: any) => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.bank_name} • Ag {acc.agency} • Cc {acc.account_number}{acc.account_digit ? `-${acc.account_digit}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="space-y-1 pt-2">
              <Label>Data do pagamento</Label>
              <Input type="date" value={selectedEntryPaidDate} onChange={(e) => setSelectedEntryPaidDate(e.target.value)} />
            </div>
            <div className="space-y-1 pt-2">
              <Label>Valor pago</Label>
              <Input value={selectedEntryPaidAmount} onChange={(e) => setSelectedEntryPaidAmount(maskCurrencyInput(e.target.value))} placeholder="0,00" inputMode="numeric" />
            </div>
            <div className="space-y-1 pt-2">
              <Label>Forma de pagamento</Label>
              <Select value={selectedEntryPaymentMethod} onValueChange={setSelectedEntryPaymentMethod}>
                <SelectTrigger><SelectValue placeholder="Escolher forma" /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_OPTIONS.map((method) => (
                    <SelectItem key={method} value={method}>{PAYMENT_METHOD_LABEL[method]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 z-10 pt-3 border-t border-border/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <Button variant="ghost" onClick={() => setEntryAccountPickerOpen(false)}>Cancelar</Button>
            <Button
              disabled={!pendingEntryPayment || !selectedEntryPaidDate || parseCurrencyInput(selectedEntryPaidAmount) <= 0 || !selectedEntryPaymentMethod || (bankAccounts.length > 0 && !selectedEntryBankAccountId)}
              onClick={() => {
                if (!pendingEntryPayment) return;
                toggleEntryMutation.mutate({
                  paymentId: pendingEntryPayment.id,
                  currentPaidAt: pendingEntryPayment.entry_paid_at,
                  bankAccountId: selectedEntryBankAccountId || null,
                  paidDate: selectedEntryPaidDate,
                  paidAmount: parseCurrencyInput(selectedEntryPaidAmount),
                  paymentMethod: selectedEntryPaymentMethod,
                });
                setEntryAccountPickerOpen(false);
                setPendingEntryPayment(null);
                setSelectedEntryBankAccountId("");
                setSelectedEntryPaidDate("");
                setSelectedEntryPaidAmount("");
                setSelectedEntryPaymentMethod("");
              }}
            >
              Confirmar baixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LinkInstallmentsDialog open={linkInstallmentsOpen} onOpenChange={setLinkInstallmentsOpen} />
    </div>
  );
}
