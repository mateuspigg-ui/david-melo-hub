import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Plus, Search, Receipt, MoreVertical, Paperclip, Upload, FileText, Trash2 } from "lucide-react";
import { addMonths, differenceInCalendarDays, format, startOfDay } from "date-fns";
import { maskCurrencyInput, parseCurrencyInput } from "@/lib/currencyInput";

const currencyFmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const PAID_STATUS_VALUES = ["pago", "paid"] as const;
const PENDING_STATUS_VALUES = ["nao_pago", "pending", "pendente"] as const;

const normalizeStatus = (status: string | null | undefined) => String(status || "").toLowerCase();
const isAccountPaid = (status: string | null | undefined, paidAt?: string | null) =>
  PAID_STATUS_VALUES.includes(normalizeStatus(status) as (typeof PAID_STATUS_VALUES)[number]) || !!paidAt;
const isAccountPending = (status: string | null | undefined, paidAt?: string | null) => {
  if (isAccountPaid(status, paidAt)) return false;
  return PENDING_STATUS_VALUES.includes(normalizeStatus(status) as (typeof PENDING_STATUS_VALUES)[number]) || !status;
};

const LATE_FEE_RATE = 0.02;
const DAILY_INTEREST_RATE = 0.00033;
const INTEREST_GRACE_DAYS = 1;

const getDaysOverdue = (dueDateIso: string) => {
  const today = startOfDay(new Date());
  const due = startOfDay(new Date(`${dueDateIso}T12:00:00`));
  if (Number.isNaN(due.getTime())) return 0;
  return Math.max(0, differenceInCalendarDays(today, due));
};

const getUpdatedAmount = (amount: number, dueDateIso: string, isPaid: boolean) => {
  if (isPaid) return amount;
  const overdueDays = getDaysOverdue(dueDateIso);
  if (overdueDays <= 0) return amount;

  const fee = amount * LATE_FEE_RATE;
  const daysWithInterest = Math.max(0, overdueDays - INTEREST_GRACE_DAYS);
  const interest = amount * DAILY_INTEREST_RATE * daysWithInterest;
  return amount + fee + interest;
};

const getFriendlyAccountsPayableError = (error: any) => {
  const message = String(error?.message || "");
  if (/schema cache|could not find.*accounts_payable/i.test(message)) {
    return "A tabela de contas a pagar ainda não foi aplicada no banco. Execute as migrations do Supabase.";
  }
  if (/row-level security|permission denied/i.test(message)) {
    return "Seu usuário não tem permissão para cadastrar despesas. Solicite perfil administrador ou gerente.";
  }
  return message || "Não foi possível programar a despesa.";
};

type AccountPayable = {
  id: string;
  description: string;
  amount: number;
  due_date: string;
  payment_status: string;
  paid_at: string | null;
  supplier_id: string | null;
  category_id: string | null;
  created_at: string;
  suppliers?: { company_name: string; cpf_cnpj?: string | null; address?: string | null; phone?: string | null; pix_details?: string | null } | null;
  accounts_payable_categories?: { name: string } | null;
  accounts_payable_cost_centers?: { name: string } | null;
  company_id?: string | null;
  cost_center_id?: string | null;
};

type PayableAttachment = {
  id: string;
  account_payable_id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  content_type: string | null;
  created_at: string;
};

type UploadQueueItem = {
  id: string;
  fileName: string;
  status: "waiting" | "uploading" | "saving" | "done" | "error" | "cancelled";
  progress: number;
  message?: string;
  file?: File;
};

export default function ContasPagarPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("due_date");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [costCenterDialogOpen, setCostCenterDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<AccountPayable | null>(null);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [attachmentsTarget, setAttachmentsTarget] = useState<AccountPayable | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentTypeFilter, setAttachmentTypeFilter] = useState("all");
  const [attachmentSortBy, setAttachmentSortBy] = useState("date_desc");
  const [attachmentSearch, setAttachmentSearch] = useState("");
  const [attachmentsVisibleCount, setAttachmentsVisibleCount] = useState(12);
  const attachmentSearchRef = useRef<HTMLInputElement | null>(null);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const cancelUploadRef = useRef(false);
  const progressTimersRef = useRef<Record<string, any>>({});
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCostCenterName, setNewCostCenterName] = useState("");
  const [supplierForm, setSupplierForm] = useState({ company_name: "", cpf_cnpj: "", address: "", phone: "", pix_details: "", instagram: "" });
  const [form, setForm] = useState({
    description: "",
    amount: "",
    due_date: "",
    supplier_id: "",
    company_id: "",
    category_id: "",
    cost_center_id: "",
    expense_type: "single",
    recurrence_mode: "repeat",
    recurrence_months: "2",
  });
  const isMissingCompanyIdColumnError = (error: any) => /company_id.*does not exist|schema cache|could not find.*company_id/i.test(String(error?.message || ""));
  const isMissingCostCenterIdColumnError = (error: any) => /cost_center_id.*does not exist|schema cache|could not find.*cost_center_id/i.test(String(error?.message || ""));

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["accounts_payable"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts_payable")
        .select("*, suppliers(company_name, cpf_cnpj, address, phone, pix_details), accounts_payable_categories(name), accounts_payable_cost_centers(name)")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data as AccountPayable[];
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-select"],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("id, company_name").order("company_name");
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

  const { data: categories = [] } = useQuery({
    queryKey: ["accounts-payable-categories"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("accounts_payable_categories")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) {
        if (/could not find the table|schema cache/i.test(String(error?.message || ""))) return [];
        throw error;
      }
      return data || [];
    },
  });

  const { data: costCenters = [] } = useQuery({
    queryKey: ["accounts-payable-cost-centers"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("accounts_payable_cost_centers")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) {
        if (/could not find the table|schema cache/i.test(String(error?.message || ""))) return [];
        throw error;
      }
      return data || [];
    },
  });

  const { data: attachments = [], refetch: refetchAttachments, isFetching: isFetchingAttachments } = useQuery({
    queryKey: ["accounts_payable_attachments", attachmentsTarget?.id || "none"],
    enabled: !!attachmentsTarget?.id,
    queryFn: async () => {
      if (!attachmentsTarget?.id) return [];
      const { data, error } = await (supabase as any)
        .from("accounts_payable_attachments")
        .select("*")
        .eq("account_payable_id", attachmentsTarget.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PayableAttachment[];
    },
  });

  const { data: attachmentCounts = {} } = useQuery({
    queryKey: ["accounts_payable_attachments_counts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("accounts_payable_attachments")
        .select("account_payable_id");
      if (error) throw error;
      const next: Record<string, number> = {};
      for (const row of data || []) {
        const key = String(row.account_payable_id || "");
        if (!key) continue;
        next[key] = (next[key] || 0) + 1;
      }
      return next;
    },
  });

  const attachmentsTotalSize = useMemo(
    () => attachments.reduce((sum, file) => sum + Number(file.file_size || 0), 0),
    [attachments]
  );

  const filteredAttachments = useMemo(() => {
    const byType = attachments.filter((file) => {
      const name = String(file.file_name || "").toLowerCase();
      const term = attachmentSearch.trim().toLowerCase();
      if (term && !name.includes(term)) return false;
      const type = String(file.content_type || "").toLowerCase();
      if (attachmentTypeFilter === "image") return type.startsWith("image/");
      if (attachmentTypeFilter === "pdf") return type === "application/pdf";
      return true;
    });

    const sorted = [...byType].sort((a, b) => {
      if (attachmentSortBy === "date_asc") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (attachmentSortBy === "name_asc") return String(a.file_name || "").localeCompare(String(b.file_name || ""), "pt-BR");
      if (attachmentSortBy === "size_desc") return Number(b.file_size || 0) - Number(a.file_size || 0);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return sorted;
  }, [attachments, attachmentSortBy, attachmentTypeFilter, attachmentSearch]);

  const visibleAttachments = useMemo(
    () => filteredAttachments.slice(0, attachmentsVisibleCount),
    [filteredAttachments, attachmentsVisibleCount]
  );

  useEffect(() => {
    if (!attachmentsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/") return;
      const target = event.target as HTMLElement | null;
      const isTypingField = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (isTypingField) return;
      event.preventDefault();
      attachmentSearchRef.current?.focus();
      attachmentSearchRef.current?.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [attachmentsOpen]);

  useEffect(() => {
    setAttachmentsVisibleCount(12);
  }, [attachmentSearch, attachmentTypeFilter, attachmentSortBy, attachmentsTarget?.id]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const parsedAmount = parseCurrencyInput(form.amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        throw new Error("Informe um valor válido maior que zero para a despesa.");
      }

      const recurrenceMonths = Math.max(1, Number(form.recurrence_months || "1"));
      const scheduleCount = form.expense_type === "recurring" ? recurrenceMonths : 1;
      if (!Number.isInteger(scheduleCount) || scheduleCount < 1) {
        throw new Error("Informe um numero valido de meses para recorrencia.");
      }

      const baseDate = new Date(`${form.due_date}T12:00:00`);
      if (Number.isNaN(baseDate.getTime())) {
        throw new Error("Informe uma data de vencimento valida.");
      }

      const totalCents = Math.round(parsedAmount * 100);
      const splitBaseCents = Math.floor(totalCents / scheduleCount);
      const splitRemainder = totalCents - (splitBaseCents * scheduleCount);

      const normalizedDescription = form.description.trim() || "Despesa sem titulo";

      const payloads = Array.from({ length: scheduleCount }, (_, index) => {
        const dueDate = addMonths(baseDate, index).toISOString().split("T")[0];
        const isSplit = form.expense_type === "recurring" && form.recurrence_mode === "split";
        const amountCents = isSplit
          ? splitBaseCents + (index === scheduleCount - 1 ? splitRemainder : 0)
          : totalCents;
        const nextDescription = isSplit
          ? `${normalizedDescription} (${index + 1}/${scheduleCount})`
          : normalizedDescription;

        return {
          description: nextDescription,
          amount: amountCents / 100,
          due_date: dueDate,
        supplier_id: form.supplier_id || null,
        category_id: form.category_id || null,
        company_id: form.company_id || null,
        cost_center_id: form.cost_center_id || null,
        payment_status: "nao_pago",
        paid_at: null,
      };
      });

      let { error } = await supabase.from("accounts_payable").insert(payloads as any);
      if (error && isMissingCompanyIdColumnError(error)) {
        const retryNoCompany = await supabase.from("accounts_payable").insert(payloads.map((p) => ({ ...p, company_id: undefined })) as any);
        error = retryNoCompany.error;
      }
      if (error && isMissingCostCenterIdColumnError(error)) {
        const retryNoCostCenter = await supabase.from("accounts_payable").insert(payloads.map((p) => ({ ...p, cost_center_id: undefined })) as any);
        error = retryNoCostCenter.error;
      }
      if (!error) return;

      const looksLikeStatusMismatch = /status|pending|pendente|pago|nao_pago|paid/i.test(String(error.message || ""));
      if (!looksLikeStatusMismatch) throw error;

      let lastError: any = error;
      for (const status of PENDING_STATUS_VALUES) {
        const { error: fallbackError } = await supabase
          .from("accounts_payable")
          .insert(payloads.map((p) => ({ ...p, payment_status: status })) as any);
        if (!fallbackError) return;
        lastError = fallbackError;
      }

      throw lastError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts_payable"] });
      qc.invalidateQueries({ queryKey: ["dashboard_metrics"] });
      setDialogOpen(false);
      setForm({ description: "", amount: "", due_date: "", supplier_id: "", company_id: "", category_id: "", cost_center_id: "", expense_type: "single", recurrence_mode: "repeat", recurrence_months: "2" });
      toast({ title: "Conta criada com sucesso" });
    },
    onError: (e: any) => toast({
      title: "Erro ao criar conta",
      description: getFriendlyAccountsPayableError(e),
      variant: "destructive",
    }),
  });

  const togglePaidMutation = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      if (isAccountPaid(currentStatus)) {
        let lastError: any = null;

        for (const pendingStatus of PENDING_STATUS_VALUES) {
          const { error } = await supabase
            .from("accounts_payable")
            .update({ payment_status: pendingStatus, paid_at: null } as any)
            .eq("id", id);
          if (!error) return;
          lastError = error;
        }

        if (lastError) throw lastError;
        return;
      }

      const paidAt = new Date().toISOString();
      let lastError: any = null;

      for (const paidStatus of PAID_STATUS_VALUES) {
        const { error } = await supabase
          .from("accounts_payable")
          .update({ payment_status: paidStatus, paid_at: paidAt } as any)
          .eq("id", id);
        if (!error) return;
        lastError = error;
      }

      if (lastError) throw lastError;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["accounts_payable"] });
      qc.invalidateQueries({ queryKey: ["dashboard_metrics"] });
      toast({ title: isAccountPaid(variables.currentStatus) ? 'Baixa desfeita com sucesso' : 'Conta marcada como paga' });
    },
    onError: (e: any) => toast({ title: 'Erro ao atualizar conta', description: e?.message || 'Não foi possível efetivar baixa.', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accounts_payable").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts_payable"] });
      qc.invalidateQueries({ queryKey: ["dashboard_metrics"] });
      setDeleteConfirmOpen(false);
      setPendingDeleteItem(null);
      toast({ title: "Conta excluída" });
    },
  });

  const filtered = items.filter((item) => {
    const matchSearch = `${item.description} ${item.suppliers?.company_name || ""} ${item.suppliers?.cpf_cnpj || ""} ${item.accounts_payable_categories?.name || ""} ${item.accounts_payable_cost_centers?.name || ""}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all"
      || (statusFilter === "pago" && isAccountPaid(item.payment_status, item.paid_at))
      || (statusFilter === "nao_pago" && isAccountPending(item.payment_status, item.paid_at));
    const matchCompany = companyFilter === "all" || String((item as any).company_id || "") === companyFilter;
    const matchCategory = categoryFilter === "all" || String(item.category_id || "") === categoryFilter;
    const matchDateFrom = !dateFrom || String(item.due_date || "") >= dateFrom;
    const matchDateTo = !dateTo || String(item.due_date || "") <= dateTo;
    return matchSearch && matchStatus && matchCompany && matchCategory && matchDateFrom && matchDateTo;
  }).sort((a, b) => {
    if (sortBy === "category") {
      const categoryA = String(a.accounts_payable_categories?.name || "");
      const categoryB = String(b.accounts_payable_categories?.name || "");
      const byCategory = categoryA.localeCompare(categoryB, "pt-BR", { sensitivity: "base" });
      if (byCategory !== 0) return byCategory;
    }
    return String(a.due_date || "").localeCompare(String(b.due_date || ""));
  });

  const handleExportPayablesCsv = () => {
    const header = ["fornecedor", "documento", "descricao", "categoria", "centro_de_custo", "vencimento", "valor", "status"];
    const rows = filtered.map((item) => [
      item.suppliers?.company_name || "",
      item.suppliers?.cpf_cnpj || "",
      item.description || "",
      item.accounts_payable_categories?.name || "",
      item.accounts_payable_cost_centers?.name || "",
      item.due_date || "",
      Number(item.amount || 0).toFixed(2),
      isAccountPaid(item.payment_status, item.paid_at) ? "pago" : "nao_pago",
    ]);
    const csv = [header, ...rows].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `contas_pagar_${format(new Date(), "yyyyMMdd_HHmm")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const createSupplierMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        company_name: supplierForm.company_name.trim(),
        cpf_cnpj: supplierForm.cpf_cnpj.trim() || null,
        address: supplierForm.address.trim() || null,
        phone: supplierForm.phone.trim() || null,
        pix_details: supplierForm.pix_details.trim() || null,
        instagram: supplierForm.instagram.trim() || null,
      };
      const { data, error } = await (supabase as any).from("suppliers").insert(payload).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["suppliers-select"] });
      setForm((prev) => ({ ...prev, supplier_id: data?.id || prev.supplier_id }));
      setSupplierDialogOpen(false);
      setSupplierForm({ company_name: "", cpf_cnpj: "", address: "", phone: "", pix_details: "", instagram: "" });
      toast({ title: "Fornecedor cadastrado" });
    },
    onError: (e: any) => toast({ title: "Erro ao cadastrar fornecedor", description: e?.message || "Não foi possível cadastrar fornecedor.", variant: "destructive" }),
  });

  const createCategoryMutation = useMutation({
    mutationFn: async () => {
      const name = newCategoryName.trim();
      if (!name) throw new Error("Informe o nome da categoria.");
      const { data, error } = await (supabase as any)
        .from("accounts_payable_categories")
        .insert({ name })
        .select("id, name")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["accounts-payable-categories"] });
      setForm((prev) => ({ ...prev, category_id: data?.id || prev.category_id }));
      setCategoryDialogOpen(false);
      setNewCategoryName("");
      toast({ title: "Categoria cadastrada" });
    },
    onError: (e: any) => toast({ title: "Erro ao cadastrar categoria", description: e?.message || "Não foi possível cadastrar categoria.", variant: "destructive" }),
  });

  const createCostCenterMutation = useMutation({
    mutationFn: async () => {
      const name = newCostCenterName.trim();
      if (!name) throw new Error("Informe o nome do centro de custo.");
      const { data, error } = await (supabase as any)
        .from("accounts_payable_cost_centers")
        .insert({ name })
        .select("id, name")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["accounts-payable-cost-centers"] });
      setForm((prev) => ({ ...prev, cost_center_id: data?.id || prev.cost_center_id }));
      setCostCenterDialogOpen(false);
      setNewCostCenterName("");
      toast({ title: "Centro de custo cadastrado" });
    },
    onError: (e: any) => toast({ title: "Erro ao cadastrar centro de custo", description: e?.message || "Não foi possível cadastrar centro de custo.", variant: "destructive" }),
  });

  const handlePrintPayable = (item: AccountPayable) => {
    const supplierName = item.suppliers?.company_name || "Sem fornecedor";
    const supplierDoc = item.suppliers?.cpf_cnpj || "-";
    const supplierAddress = item.suppliers?.address || "-";
    const supplierPhone = item.suppliers?.phone || "-";
    const categoryName = item.accounts_payable_categories?.name || "Sem categoria";
    const costCenterName = item.accounts_payable_cost_centers?.name || "Sem centro de custo";
    const dueDate = item.due_date ? format(new Date(`${item.due_date}T12:00:00`), "dd/MM/yyyy") : "-";
    const issueDate = format(new Date(), "dd/MM/yyyy");
    const issuedAt = format(new Date(), "dd/MM/yyyy HH:mm:ss");
    const titleNumber = String(item.id || "").slice(0, 8).toUpperCase();
    const observations = item.description || "Sem observacoes.";

    const printWindow = window.open("", "_blank", "width=980,height=720");
    if (!printWindow) {
      toast({ title: "Nao foi possivel abrir visualizacao de impressao", variant: "destructive" });
      return;
    }

    const html = `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Lancamento - ${titleNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
            .block { border: 2px solid #222; padding: 14px; margin-bottom: 16px; }
            .header { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 14px; }
            .title { text-align: center; font-size: 40px; margin: 20px 0 24px; }
            .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px; }
            .label { font-weight: 700; }
            .obs { min-height: 160px; white-space: pre-wrap; }
            @media print { body { margin: 12mm; } }
          </style>
        </head>
        <body>
          <div class="block header">
            <div><span class="label">EMPRESA/PESSOA:</span> ${supplierName}</div>
            <div><span class="label">EMITIDO EM:</span> ${issuedAt}</div>
            <div><span class="label">CPF/CNPJ:</span> ${supplierDoc}</div>
            <div><span class="label">TELEFONE:</span> ${supplierPhone}</div>
            <div style="grid-column: 1 / -1;"><span class="label">ENDERECO:</span> ${supplierAddress}</div>
          </div>

          <div class="title">Lancamento</div>

          <div class="block">
            <div class="label">Dados do titulo:</div>
            <div class="row">
              <div><span class="label">Numero do titulo:</span> ${titleNumber}</div>
              <div><span class="label">Data emissao:</span> ${issueDate}</div>
            </div>
            <div class="row">
              <div><span class="label">Pessoa:</span> ${supplierName}</div>
              <div><span class="label">Data vencimento:</span> ${dueDate}</div>
            </div>
            <div style="margin-top: 8px;"><span class="label">Categoria / Centro de Custo:</span> ${categoryName} / ${costCenterName}</div>
            <div style="margin-top: 8px;"><span class="label">Valor do titulo:</span> ${currencyFmt(Number(item.amount || 0))}</div>
          </div>

          <div class="block obs">
            <div class="label">Observacoes:</div>
            <div style="margin-top: 12px;">${observations}</div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  const uploadOneAttachment = async (file: File, targetId: string, queueId: string) => {
    const clearProgressTimer = () => {
      const timer = progressTimersRef.current[queueId];
      if (timer) {
        clearInterval(timer);
        delete progressTimersRef.current[queueId];
      }
    };

    const runProgress = (start: number, end: number, step: number, ms: number) => {
      clearProgressTimer();
      setUploadQueue((prev) => prev.map((item) => (item.id === queueId ? { ...item, progress: Math.max(item.progress, start) } : item)));
      progressTimersRef.current[queueId] = setInterval(() => {
        setUploadQueue((prev) => prev.map((item) => {
          if (item.id !== queueId) return item;
          const next = Math.min(end, item.progress + step);
          return { ...item, progress: next };
        }));
      }, ms);
    };

    try {
      runProgress(8, 72, 4, 180);
      const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${targetId}/${Date.now()}_${sanitized}`;
      const { error: uploadError } = await (supabase as any).storage.from("payable-attachments").upload(path, file, {
        upsert: false,
        contentType: file.type,
      });
      if (uploadError) throw uploadError;

      runProgress(76, 94, 3, 120);
      setUploadQueue((prev) => prev.map((item) => (item.id === queueId ? { ...item, status: "saving" } : item)));

      const { data: publicData } = (supabase as any).storage.from("payable-attachments").getPublicUrl(path);
      const fileUrl = publicData?.publicUrl;
      if (!fileUrl) throw new Error("Nao foi possivel obter URL do anexo.");

      const { error: insertError } = await (supabase as any).from("accounts_payable_attachments").insert({
        account_payable_id: targetId,
        file_name: file.name,
        file_url: fileUrl,
        file_size: file.size,
        content_type: file.type,
      });
      if (insertError) throw insertError;

      clearProgressTimer();
      setUploadQueue((prev) => prev.map((item) => (item.id === queueId ? { ...item, status: "done", progress: 100 } : item)));
      return true;
    } catch (error: any) {
      clearProgressTimer();
      setUploadQueue((prev) => prev.map((item) => (item.id === queueId ? { ...item, status: "error", message: error?.message || "Falha no envio" } : item)));
      return false;
    }
  };

  const handleAttachmentUpload = async (incomingFiles: FileList | File[] | null) => {
    if (!incomingFiles || !attachmentsTarget?.id) return;
    const files = Array.from(incomingFiles);
    if (files.length === 0) return;
    const maxSize = 5 * 1024 * 1024;
    const allowed = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"];
    const validFiles = files.filter((file) => file.size <= maxSize && allowed.includes(file.type));
    const invalidCount = files.length - validFiles.length;
    if (invalidCount > 0) {
      toast({
        title: "Alguns arquivos foram ignorados",
        description: `${invalidCount} arquivo(s) fora do limite de 5MB ou formato permitido.`,
        variant: "destructive",
      });
    }
    if (validFiles.length === 0) return;

    cancelUploadRef.current = false;
    setUploadingAttachment(true);
    const queued = validFiles.map((file, index) => ({ id: `${Date.now()}-${index}-${file.name}`, fileName: file.name, status: "waiting" as const, progress: 0, file }));
    setUploadQueue(queued);
    let sentCount = 0;
    let cancelledCount = 0;
    try {
      for (let index = 0; index < validFiles.length; index += 1) {
        if (cancelUploadRef.current) {
          cancelledCount += 1;
          continue;
        }
        const file = validFiles[index];
        const queueId = queued[index].id;
        setUploadQueue((prev) => prev.map((item) => (item.id === queueId ? { ...item, status: "uploading" } : item)));
        const ok = await uploadOneAttachment(file, attachmentsTarget.id, queueId);
        if (ok) sentCount += 1;
      }

      if (cancelUploadRef.current) {
        setUploadQueue((prev) => prev.map((item) => (
          item.status === "waiting" ? { ...item, status: "cancelled", message: "Cancelado pelo usuario", progress: 0 } : item
        )));
      }

      await refetchAttachments();
      if (sentCount > 0) toast({ title: `${sentCount} anexo(s) enviado(s)` });
      if (cancelledCount > 0 || cancelUploadRef.current) toast({ title: "Envio cancelado", description: "Os proximos arquivos da fila foram interrompidos." });
    } catch (e: any) {
      toast({ title: "Erro ao enviar anexo", description: e?.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setUploadingAttachment(false);
      Object.keys(progressTimersRef.current).forEach((key) => {
        clearInterval(progressTimersRef.current[key]);
        delete progressTimersRef.current[key];
      });
      setTimeout(() => setUploadQueue([]), 1800);
    }
  };

  const retryAttachmentUpload = async (queueId: string) => {
    if (!attachmentsTarget?.id) return;
    const queueItem = uploadQueue.find((item) => item.id === queueId);
    if (!queueItem?.file) return;
    setUploadingAttachment(true);
    setUploadQueue((prev) => prev.map((item) => (item.id === queueId ? { ...item, status: "uploading", message: undefined, progress: 4 } : item)));
    const ok = await uploadOneAttachment(queueItem.file, attachmentsTarget.id, queueId);
    if (ok) {
      await refetchAttachments();
      toast({ title: "Anexo reenviado" });
    }
    setUploadingAttachment(false);
  };

  const cancelAttachmentQueue = () => {
    cancelUploadRef.current = true;
  };

  const handleDeleteAttachment = async (file: PayableAttachment) => {
    const publicPrefix = "/storage/v1/object/public/payable-attachments/";
    const idx = file.file_url.indexOf(publicPrefix);
    const storagePath = idx >= 0 ? file.file_url.slice(idx + publicPrefix.length) : null;
    try {
      if (storagePath) {
        await (supabase as any).storage.from("payable-attachments").remove([storagePath]);
      }
      const { error } = await (supabase as any).from("accounts_payable_attachments").delete().eq("id", file.id);
      if (error) throw error;
      await refetchAttachments();
      toast({ title: "Anexo removido" });
    } catch (e: any) {
      toast({ title: "Erro ao excluir anexo", description: e?.message || "Tente novamente.", variant: "destructive" });
    }
  };

  const openAttachmentsModal = (item: AccountPayable) => {
    setAttachmentsTarget(item);
    setAttachmentTypeFilter("all");
    setAttachmentSortBy("date_desc");
    setAttachmentSearch("");
    setAttachmentsVisibleCount(12);
    setAttachmentsOpen(true);
  };

  const clearAttachmentFilters = () => {
    setAttachmentSearch("");
    setAttachmentTypeFilter("all");
    setAttachmentSortBy("date_desc");
    setAttachmentsVisibleCount(12);
  };

  const renderAttachmentName = (fileName: string) => {
    const term = attachmentSearch.trim();
    if (!term) return fileName;
    const lowerName = fileName.toLowerCase();
    const lowerTerm = term.toLowerCase();
    const start = lowerName.indexOf(lowerTerm);
    if (start < 0) return fileName;
    const end = start + term.length;
    return (
      <>
        {fileName.slice(0, start)}
        <span className="bg-gold/20 text-foreground px-0.5 rounded">{fileName.slice(start, end)}</span>
        {fileName.slice(end)}
      </>
    );
  };

  const totalPending = items
    .filter((i) => isAccountPending(i.payment_status, i.paid_at))
    .reduce((s, i) => s + i.amount, 0);
  const totalOverdue = items
    .filter((i) => isAccountPending(i.payment_status, i.paid_at) && getDaysOverdue(i.due_date) > 0)
    .reduce((s, i) => s + i.amount, 0);
  const totalOverdueUpdated = items
    .filter((i) => isAccountPending(i.payment_status, i.paid_at) && getDaysOverdue(i.due_date) > 0)
    .reduce((s, i) => s + getUpdatedAmount(i.amount, i.due_date, false), 0);

  return (
    <div className="space-y-8 animate-fade-in max-w-[1600px] mx-auto p-2 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 px-2">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 bg-gold rounded-full" />
            <h1 className="text-4xl md:text-5xl font-display text-foreground tracking-tighter uppercase leading-none">Contas a Pagar</h1>
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.4em] text-gold/80 pl-4">David Melo Produções • Controle de Despesas</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="bg-gradient-gold hover:opacity-90 text-white font-bold h-12 px-8 rounded-xl shadow-gold uppercase text-[11px] tracking-widest">
          <Plus className="w-4 h-4 mr-2" /> Programar Despesa
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-white premium-shadow rounded-2xl p-6 border border-border/40 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-2 h-full bg-gold/40" />
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Total Pendente</p>
          <p className="text-3xl font-display text-foreground mt-1 group-hover:text-gold transition-colors">{currencyFmt(totalPending)}</p>
        </div>
        <div className="bg-white premium-shadow rounded-2xl p-6 border border-border/40 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-2 h-full bg-destructive/40" />
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold font-bold text-destructive">Total Vencido</p>
          <p className="text-3xl font-display text-foreground mt-1 group-hover:text-destructive transition-colors">{currencyFmt(totalOverdue)}</p>
          <p className="text-[10px] font-bold text-destructive/80 mt-1 uppercase tracking-wider">Atualizado: {currencyFmt(totalOverdueUpdated)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-border/30 rounded-2xl p-3 md:p-4 premium-shadow">
        <div className="grid grid-cols-1 lg:grid-cols-[auto_minmax(170px,190px)_180px_180px_minmax(240px,1fr)_minmax(220px,260px)] gap-3 items-center">
          <div className="inline-flex rounded-xl border border-border/40 overflow-hidden">
            <Button type="button" variant="ghost" className="rounded-none h-11 px-5" onClick={() => window.print()}>Imprimir</Button>
            <Button type="button" variant="ghost" className="rounded-none h-11 px-5 border-l border-border/40" onClick={handleExportPayablesCsv}>Exportar</Button>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full bg-secondary/20 border-border/40 h-11 rounded-xl font-medium focus:ring-gold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border-border/40 shadow-2xl">
              <SelectItem value="all" className="font-medium text-xs font-bold uppercase">Todos os Status</SelectItem>
              <SelectItem value="nao_pago" className="font-medium text-xs font-bold uppercase text-gold">Pendentes</SelectItem>
              <SelectItem value="pago" className="font-medium text-xs font-bold uppercase text-emerald-500">Pagos</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="bg-secondary/20 border-border/40 h-11 rounded-xl" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="bg-secondary/20 border-border/40 h-11 rounded-xl" />
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Pessoa ou N. Documento"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-11 bg-secondary/20 border-border/40 h-11 rounded-xl"
            />
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-full bg-secondary/20 border-border/40 h-11 rounded-xl font-medium focus:ring-gold">
              <SelectValue placeholder="Filtrar" />
            </SelectTrigger>
            <SelectContent className="bg-white border-border/40 shadow-2xl">
              <SelectItem value="due_date" className="font-medium text-xs font-bold uppercase">Ordenar por vencimento</SelectItem>
              <SelectItem value="category" className="font-medium text-xs font-bold uppercase">Ordenar por categoria</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {companies.length > 0 && (
          <div className="mt-3 grid grid-cols-1 xl:grid-cols-[minmax(360px,1.3fr)_minmax(260px,1fr)] gap-3">
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-full bg-secondary/20 border-border/40 h-11 rounded-xl font-medium focus:ring-gold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border-border/40 shadow-2xl">
              <SelectItem value="all" className="font-medium text-xs font-bold uppercase">Todas empresas</SelectItem>
              {companies.map((company: any) => (
                  <SelectItem key={company.id} value={company.id} className="font-medium text-xs font-bold">
                    {company.trade_name || company.legal_name || "Empresa"}
                  </SelectItem>
              ))}
            </SelectContent>
          </Select>

        {categories.length > 0 && (
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full bg-secondary/20 border-border/40 h-11 rounded-xl font-medium focus:ring-gold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border-border/40 shadow-2xl">
              <SelectItem value="all" className="font-medium text-xs font-bold uppercase">Todas categorias</SelectItem>
              {categories.map((category: any) => (
                <SelectItem key={category.id} value={category.id} className="font-medium text-xs font-bold uppercase">
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-white rounded-2xl animate-pulse border border-border/40 premium-shadow" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white premium-shadow rounded-2xl p-20 border border-border/40 text-center flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
            <Receipt className="w-8 h-8 text-muted-foreground/30" />
          </div>
          <p className="text-foreground font-bold text-lg">Nenhum registro encontrado</p>
          <p className="text-sm text-muted-foreground/60 mt-1 font-medium">Sua lista de pendências financeiras está vazia.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => {
            const overdueDays = getDaysOverdue(item.due_date);
            const overdue = isAccountPending(item.payment_status, item.paid_at) && overdueDays > 0;
            const updatedAmount = getUpdatedAmount(item.amount, item.due_date, isAccountPaid(item.payment_status, item.paid_at));
            const count = attachmentCounts[item.id] || 0;
            return (
              <div key={item.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-6 bg-white rounded-2xl border transition-all duration-300 hover:scale-[1.01] hover:shadow-xl group ${overdue ? "border-destructive/30 bg-destructive/[0.02]" : "border-border/40 premium-shadow"}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors shadow-sm ${overdue ? "bg-destructive/10 text-destructive" : "bg-gold/10 text-gold group-hover:bg-gold group-hover:text-white"}`}>
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground text-sm tracking-tight leading-tight uppercase line-clamp-1">{item.suppliers?.company_name || "Sem fornecedor"}</h4>
                    <div className="flex items-center gap-2 mt-1.5">
                       <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider opacity-70">
                         {item.description || "Sem titulo"}
                        </p>
                       <span className="text-muted-foreground/30 text-[10px]">•</span>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider opacity-70">
                          {item.accounts_payable_categories?.name || "Sem categoria"}
                        </p>
                        <span className="text-muted-foreground/30 text-[10px]">•</span>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider opacity-70">
                          {item.accounts_payable_cost_centers?.name || "Sem centro de custo"}
                        </p>
                        <span className="text-muted-foreground/30 text-[10px]">•</span>
                       <p className={`text-[10px] font-bold uppercase tracking-wider ${overdue ? "text-destructive" : "text-muted-foreground opacity-70"}`}>
                         Vencimento: {format(new Date(item.due_date + "T12:00:00"), "dd MMM yyyy")}
                      </p>
                     </div>
                     <div className="mt-2">
                       <Button
                         type="button"
                         variant="ghost"
                         className="h-7 px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                         onClick={() => {
                           openAttachmentsModal(item);
                         }}
                       >
                         <Paperclip className="w-3 h-3 mr-1" /> {count} anexo{count === 1 ? "" : "s"}
                       </Button>
                     </div>
                   </div>
                 </div>
                
                <div className="flex items-center justify-between sm:justify-end gap-6 mt-4 sm:mt-0">
                  <div className="text-right">
                    <p className={`text-lg font-display tabular-nums tracking-tighter ${overdue ? "text-destructive" : "text-foreground"}`}>{currencyFmt(item.amount)}</p>
                    {overdue && (
                      <>
                        <p className="text-[8px] font-black text-destructive uppercase tracking-[0.2em] mt-0.5 animate-pulse">{overdueDays} dia(s) em atraso</p>
                        <p className="text-[10px] font-bold text-destructive">Atualizado: {currencyFmt(updatedAmount)}</p>
                      </>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-10 w-10 rounded-xl border border-border/30 bg-white hover:bg-secondary/60">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          onClick={() => {
                            setForm({
                              description: item.description || "",
                              amount: maskCurrencyInput(String(item.amount || "")),
                              due_date: item.due_date || "",
                              supplier_id: item.supplier_id || "",
                              company_id: item.company_id || "",
                              category_id: item.category_id || "",
                              cost_center_id: item.cost_center_id || "",
                              expense_type: "single",
                              recurrence_mode: "repeat",
                              recurrence_months: "2",
                            });
                            setDialogOpen(true);
                            toast({ title: "Dados carregados para edição" });
                          }}
                        >
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => togglePaidMutation.mutate({ id: item.id, currentStatus: item.payment_status })}>
                          {isAccountPaid(item.payment_status, item.paid_at) ? "Desfazer baixa" : "Baixar"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setForm((prev) => ({
                              ...prev,
                              description: item.description || "",
                              amount: maskCurrencyInput(String(item.amount || "")),
                              due_date: item.due_date || "",
                              supplier_id: item.supplier_id || "",
                              company_id: item.company_id || "",
                              category_id: item.category_id || "",
                              cost_center_id: item.cost_center_id || "",
                              expense_type: "single",
                              recurrence_mode: "repeat",
                              recurrence_months: "2",
                            }));
                            setDialogOpen(true);
                            toast({ title: "Despesa duplicada para novo registro" });
                          }}
                        >
                          Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openAttachmentsModal(item)}>Anexos</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handlePrintPayable(item)}>Imprimir</DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            setPendingDeleteItem(item);
                            setDeleteConfirmOpen(true);
                          }}
                        >
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[92vh] p-0 rounded-[28px] shadow-2xl border-border/40 bg-background overflow-hidden flex flex-col">
          <div className="bg-gradient-gold p-8 md:p-10 text-white">
            <DialogHeader>
              <DialogTitle className="text-2xl md:text-3xl font-display text-white">Programar Despesa</DialogTitle>
              <p className="text-white/80 text-xs mt-1 font-medium font-body tracking-wide uppercase">Insira os detalhes técnicos para auditoria financeira.</p>
            </DialogHeader>
          </div>
          <div className="p-6 md:p-10 space-y-6 overflow-y-auto min-h-0 bg-gradient-to-b from-background to-secondary/10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Empresa / Fornecedor</Label>
              <div className="flex gap-2">
                <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                  <SelectTrigger className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg flex-1">
                    <SelectValue placeholder="Selecionar da base de dados" />
                  </SelectTrigger>
                  <SelectContent className="bg-white shadow-2xl border-border/40">
                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id} className="font-bold text-xs uppercase">{s.company_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setSupplierDialogOpen(true)}>Novo</Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Tipo da Despesa</Label>
              <Select value={form.expense_type} onValueChange={(v) => setForm({ ...form, expense_type: v })}>
                <SelectTrigger className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white shadow-2xl border-border/40">
                  <SelectItem value="single" className="font-bold text-xs uppercase">Unica</SelectItem>
                  <SelectItem value="recurring" className="font-bold text-xs uppercase">Recorrente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.expense_type === "recurring" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl border border-gold/20 bg-gold/5 lg:col-span-2">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Modelo</Label>
                  <Select value={form.recurrence_mode} onValueChange={(v) => setForm({ ...form, recurrence_mode: v })}>
                    <SelectTrigger className="bg-white border-border/40 focus:ring-gold h-11 rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white shadow-2xl border-border/40">
                      <SelectItem value="split" className="font-bold text-xs uppercase">Dividida em meses</SelectItem>
                      <SelectItem value="repeat" className="font-bold text-xs uppercase">Repete todo mes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Quantidade de meses</Label>
                  <Input
                    type="number"
                    min="2"
                    value={form.recurrence_months}
                    onChange={(e) => setForm({ ...form, recurrence_months: e.target.value })}
                    className="bg-white border-border/40 focus:border-gold h-11 font-medium"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2 lg:col-span-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Descrição do Título</Label>
              <Textarea 
                value={form.description} 
                onChange={(e) => setForm({ ...form, description: e.target.value })} 
                placeholder="Opcional. Ex: Pagamento de serviço de buffet"
                className="bg-secondary/30 border-border/40 focus:border-gold min-h-[80px] py-3 shadow-inner" 
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:col-span-2">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Valor do Título *</Label>
                <Input 
                  type="text"
                  inputMode="numeric"
                  value={form.amount} 
                  onChange={(e) => setForm({ ...form, amount: maskCurrencyInput(e.target.value) })} 
                  className="bg-secondary/30 border-border/40 focus:border-gold h-11 font-bold text-gold" 
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Data Vencimento *</Label>
                <Input 
                  type="date" 
                  value={form.due_date} 
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })} 
                  className="bg-secondary/30 border-border/40 focus:border-gold h-11 font-medium" 
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Categoria</Label>
              <div className="flex gap-2">
                <Select value={form.category_id || "none"} onValueChange={(v) => setForm({ ...form, category_id: v === "none" ? "" : v })}>
                  <SelectTrigger className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg flex-1">
                    <SelectValue placeholder="Selecionar categoria" />
                  </SelectTrigger>
                  <SelectContent className="bg-white shadow-2xl border-border/40">
                    <SelectItem value="none" className="font-bold text-xs uppercase">Sem categoria</SelectItem>
                    {categories.map((c: any) => <SelectItem key={c.id} value={c.id} className="font-bold text-xs uppercase">{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setCategoryDialogOpen(true)}>Novo</Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Centro de Custo</Label>
              <div className="flex gap-2">
                <Select value={form.cost_center_id || "none"} onValueChange={(v) => setForm({ ...form, cost_center_id: v === "none" ? "" : v })}>
                  <SelectTrigger className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg flex-1">
                    <SelectValue placeholder="Selecionar centro de custo" />
                  </SelectTrigger>
                  <SelectContent className="bg-white shadow-2xl border-border/40">
                    <SelectItem value="none" className="font-bold text-xs uppercase">Sem centro de custo</SelectItem>
                    {costCenters.map((c: any) => <SelectItem key={c.id} value={c.id} className="font-bold text-xs uppercase">{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setCostCenterDialogOpen(true)}>Novo</Button>
              </div>
            </div>

            {companies.length > 0 && (
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Empresa / CNPJ</Label>
                <Select value={form.company_id || "none"} onValueChange={(v) => setForm({ ...form, company_id: v === "none" ? "" : v })}>
                  <SelectTrigger className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg">
                    <SelectValue placeholder="Selecionar empresa" />
                  </SelectTrigger>
                  <SelectContent className="bg-white shadow-2xl border-border/40">
                    <SelectItem value="none" className="font-bold text-xs uppercase">Sem vínculo</SelectItem>
                    {companies.map((company: any) => (
                      <SelectItem key={company.id} value={company.id} className="font-bold text-xs">
                        {company.trade_name || company.legal_name || "Empresa"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            </div>

            <div className="sticky bottom-0 z-10 flex justify-end gap-3 pt-6 border-t border-border/10 bg-background/95 backdrop-blur">
              <Button variant="ghost" onClick={() => setDialogOpen(false)} className="text-muted-foreground font-bold uppercase text-[10px] tracking-widest">Cancelar</Button>
              <Button onClick={() => createMutation.mutate()} disabled={!form.amount || !form.due_date} className="bg-gold hover:bg-gold-light text-white font-bold h-11 px-10 rounded-lg shadow-gold uppercase text-[11px] tracking-widest">
                Efetuar Registro
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Fornecedor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={supplierForm.company_name} onChange={(e) => setSupplierForm({ ...supplierForm, company_name: e.target.value })} placeholder="Nome / Razão social" />
            <Input value={supplierForm.cpf_cnpj} onChange={(e) => setSupplierForm({ ...supplierForm, cpf_cnpj: e.target.value })} placeholder="CNPJ / CPF" />
            <Input value={supplierForm.address} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })} placeholder="Endereço" />
            <Input value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} placeholder="Telefone" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSupplierDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => createSupplierMutation.mutate()} disabled={!supplierForm.company_name.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Categoria</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nome da categoria</Label>
            <Input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="Ex: Agua, Luz, Prolabore" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCategoryDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => createCategoryMutation.mutate()} disabled={!newCategoryName.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={costCenterDialogOpen} onOpenChange={setCostCenterDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Centro de Custo</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nome do centro de custo</Label>
            <Input value={newCostCenterName} onChange={(e) => setNewCostCenterName(e.target.value)} placeholder="Ex: Operacional, Marketing, Comercial" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCostCenterDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => createCostCenterMutation.mutate()} disabled={!newCostCenterName.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              Deseja realmente excluir a despesa de <strong>{pendingDeleteItem?.suppliers?.company_name || "fornecedor"}</strong>?
            </p>
            <p className="text-muted-foreground">Essa ação não pode ser desfeita.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setDeleteConfirmOpen(false); setPendingDeleteItem(null); }}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!pendingDeleteItem) return;
                deleteMutation.mutate(pendingDeleteItem.id);
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={attachmentsOpen} onOpenChange={setAttachmentsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Anexos da Despesa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-border/40 p-4 bg-secondary/10">
              <p className="text-xs font-bold uppercase tracking-wider">{attachmentsTarget?.suppliers?.company_name || "Fornecedor"}</p>
              <p className="text-xs text-muted-foreground mt-1">{attachmentsTarget?.description || "Sem titulo"}</p>
            </div>

            <div className="rounded-xl border border-dashed border-border/50 p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-bold">Enviar arquivo</p>
                  <p className="text-xs text-muted-foreground">PDF ou imagem ate 5MB (recibo, extrato, comprovante)</p>
                </div>
                <label className="inline-flex">
                  <input
                    type="file"
                    multiple
                    accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      void handleAttachmentUpload(e.target.files || null);
                      e.currentTarget.value = "";
                    }}
                    disabled={uploadingAttachment}
                  />
                  <Button type="button" variant="outline" className="h-10" disabled={uploadingAttachment}>
                    <Upload className="w-4 h-4 mr-2" /> {uploadingAttachment ? "Enviando..." : "Adicionar arquivos"}
                  </Button>
                </label>
                {uploadingAttachment && (
                  <Button type="button" variant="ghost" className="h-10" onClick={cancelAttachmentQueue}>
                    Cancelar fila
                  </Button>
                )}
              </div>
              {uploadQueue.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {uploadQueue.map((item) => (
                    <div key={item.id} className="text-[11px] flex items-center justify-between bg-secondary/20 rounded-md px-2 py-1">
                      <div className="min-w-0 pr-2 flex-1">
                        <span className="truncate block">{item.fileName}</span>
                        <div className="h-1.5 rounded-full bg-secondary/40 mt-1 overflow-hidden">
                          <div className="h-full bg-gold transition-all duration-200" style={{ width: `${item.progress}%` }} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={item.status === "error" ? "text-destructive" : "text-muted-foreground"}>
                          {item.status === "uploading" && "Enviando"}
                          {item.status === "waiting" && "Na fila"}
                          {item.status === "saving" && "Salvando"}
                          {item.status === "done" && "Concluido"}
                          {item.status === "error" && "Falha"}
                          {item.status === "cancelled" && "Cancelado"}
                        </span>
                        <span className="text-muted-foreground w-10 text-right">{item.progress}%</span>
                        {(item.status === "error" || item.status === "cancelled") && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => void retryAttachmentUpload(item.id)}
                            disabled={uploadingAttachment}
                          >
                            Tentar novamente
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="w-full">
                <Input
                  ref={attachmentSearchRef}
                  value={attachmentSearch}
                  onChange={(e) => setAttachmentSearch(e.target.value)}
                  placeholder="Buscar anexo por nome (atalho: /)"
                  className="h-9 bg-secondary/20 border-border/40"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant={attachmentTypeFilter === "all" ? "default" : "outline"} onClick={() => setAttachmentTypeFilter("all")}>Todos</Button>
                <Button type="button" size="sm" variant={attachmentTypeFilter === "image" ? "default" : "outline"} onClick={() => setAttachmentTypeFilter("image")}>Imagens</Button>
                <Button type="button" size="sm" variant={attachmentTypeFilter === "pdf" ? "default" : "outline"} onClick={() => setAttachmentTypeFilter("pdf")}>PDF</Button>
              </div>
              <Select value={attachmentSortBy} onValueChange={setAttachmentSortBy}>
                <SelectTrigger className="w-[220px] h-9 bg-secondary/20 border-border/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date_desc">Mais recentes</SelectItem>
                  <SelectItem value="date_asc">Mais antigos</SelectItem>
                  <SelectItem value="name_asc">Nome (A-Z)</SelectItem>
                  <SelectItem value="size_desc">Maior arquivo</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" size="sm" variant="ghost" onClick={clearAttachmentFilters}>Limpar</Button>
            </div>

            <div className="text-[11px] text-muted-foreground flex items-center justify-between">
              <span>{filteredAttachments.length} de {attachments.length} anexo(s)</span>
              {isFetchingAttachments ? <span>Atualizando lista...</span> : <span>Ordenado por: {attachmentSortBy === "date_desc" ? "mais recentes" : attachmentSortBy === "date_asc" ? "mais antigos" : attachmentSortBy === "name_asc" ? "nome" : "tamanho"}</span>}
            </div>

            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {filteredAttachments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {attachments.length === 0 ? "Nenhum anexo enviado." : "Nenhum anexo encontrado com os filtros atuais."}
                </p>
              ) : visibleAttachments.map((file) => {
                const isImage = String(file.content_type || "").startsWith("image/");
                return (
                  <div key={file.id} className="flex items-center justify-between p-3 rounded-xl border border-border/30 bg-white gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {isImage ? (
                        <div className="w-12 h-12 rounded-lg overflow-hidden border border-border/30 bg-secondary/20 shrink-0">
                          <img src={file.file_url} alt={file.file_name} className="w-full h-full object-cover" loading="lazy" />
                        </div>
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-secondary/30 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{renderAttachmentName(file.file_name)}</p>
                        <p className="text-[11px] text-muted-foreground">{file.file_size ? `${(file.file_size / 1024 / 1024).toFixed(2)} MB` : "-"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => window.open(file.file_url, "_blank", "noopener,noreferrer")}>
                        <Paperclip className="w-4 h-4 mr-1" /> Abrir
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDeleteAttachment(file)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredAttachments.length > visibleAttachments.length && (
              <div className="flex justify-center">
                <Button type="button" variant="outline" onClick={() => setAttachmentsVisibleCount((prev) => prev + 12)}>
                  Mostrar mais ({filteredAttachments.length - visibleAttachments.length} restantes)
                </Button>
              </div>
            )}

            <div className="text-[11px] text-muted-foreground">Total anexado: {(attachmentsTotalSize / 1024 / 1024).toFixed(2)} MB</div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAttachmentsOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
