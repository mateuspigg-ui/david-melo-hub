import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, FileSpreadsheet, FileText, Filter, ArrowUpDown, ArrowDownCircle, ArrowUpCircle, Loader2, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const currencyFmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

type Lancamento = {
  id: string;
  tipo: "entrada" | "saida";
  cliente_fornecedor: string;
  descricao: string;
  centro_custo: string;
  documento: string;
  status: string;
  vencimento: string;
  valor: number;
  valor_total: number;
  valor_baixado: number;
  valor_aberto: number;
  empresa_id: string | null;
  empresa_nome: string;
  original: any;
};

const getStatusLabel = (status: string) => {
  const s = String(status || "").toLowerCase();
  if (s === "paid" || s === "pago") return "Pago";
  if (s === "recebido") return "Recebido";
  if (s === "pending" || s === "pendente") return "Pendente";
  if (s === "vencido" || s === "overdue" || s === "atrasado") return "Vencido";
  if (s === "parcial" || s === "partial") return "Parcial";
  return status || "-";
};

const getStatusStyle = (status: string) => {
  const s = String(status || "").toLowerCase();
  if (s === "paid" || s === "pago" || s === "recebido")
    return "bg-emerald-50 text-emerald-700 border border-emerald-200/60";
  if (s === "pending" || s === "pendente")
    return "bg-amber-50 text-amber-700 border border-amber-200/60";
  if (s === "vencido" || s === "overdue" || s === "atrasado")
    return "bg-red-50 text-red-700 border border-red-200/60";
  if (s === "parcial" || s === "partial")
    return "bg-sky-50 text-sky-700 border border-sky-200/60";
  return "bg-secondary text-muted-foreground border border-border/30";
};

export default function LancamentosPage() {
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tipoFilter, setTipoFilter] = useState<"all" | "entrada" | "saida">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortField, setSortField] = useState<"vencimento" | "valor">("vencimento");
  const [sortAsc, setSortAsc] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

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

  const { data: costCenters = [] } = useQuery({
    queryKey: ["cost-centers-all"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("accounts_payable_cost_centers")
        .select("id, name")
        .order("name");
      return data || [];
    },
  });

  const { data: recebimentos = [], isLoading: loadingRecebimentos } = useQuery({
    queryKey: ["lancamentos-recebimentos"],
    queryFn: async () => {
      const { data: payments, error } = await supabase
        .from("payments")
        .select("*, clients(first_name, last_name), events(title)")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const { data: installments } = await supabase
        .from("payment_installments")
        .select("*")
        .order("due_date", { ascending: true });

      const result: Lancamento[] = [];

      for (const p of payments || []) {
        const clientName = p.clients ? `${p.clients.first_name} ${p.clients.last_name}` : "Sem cliente";
        const eventTitle = p.events?.title || "";
        const description = eventTitle || "Recebimento";

        if (p.has_entry_payment && Number(p.entry_amount || 0) > 0) {
          const entryStatus = p.entry_paid_at ? "pago" : "pendente";
          result.push({
            id: `rec-entry-${p.id}`,
            tipo: "entrada",
            cliente_fornecedor: clientName,
            descricao: `${description} - Entrada`,
            centro_custo: "",
            documento: "",
            status: entryStatus,
            vencimento: p.entry_date || "",
            valor: Number(p.entry_amount || 0),
            valor_total: Number(p.entry_amount || 0),
            valor_baixado: p.entry_paid_at ? Number(p.entry_paid_amount ?? p.entry_amount ?? 0) : 0,
            valor_aberto: p.entry_paid_at ? 0 : Number(p.entry_amount || 0),
            empresa_id: (p as any).company_id || null,
            empresa_nome: "",
            original: p,
          });
        }

        const pInstallments = (installments || []).filter((i: any) => i.payment_id === p.id);
        for (const inst of pInstallments) {
          const isPaid = inst.status === "paid" || inst.paid_at;
          result.push({
            id: `rec-inst-${inst.id}`,
            tipo: "entrada",
            cliente_fornecedor: clientName,
            descricao: `${description} - Parcela ${String(inst.installment_number).padStart(2, "0")}`,
            centro_custo: "",
            documento: "",
            status: isPaid ? "pago" : "pendente",
            vencimento: inst.due_date || "",
            valor: Number(inst.amount || 0),
            valor_total: Number(inst.amount || 0),
            valor_baixado: isPaid ? Number(inst.paid_amount ?? inst.amount ?? 0) : 0,
            valor_aberto: isPaid ? 0 : Number(inst.amount || 0),
            empresa_id: (p as any).company_id || null,
            empresa_nome: "",
            original: inst,
          });
        }

        const additionalValue = Number((p as any).additional_value || 0);
        if (additionalValue > 0) {
          result.push({
            id: `rec-additional-${p.id}`,
            tipo: "entrada",
            cliente_fornecedor: clientName,
            descricao: `${description} - ${(p as any).additional_description || "Adicional"}`,
            centro_custo: "",
            documento: "",
            status: "pendente",
            vencimento: "",
            valor: additionalValue,
            valor_total: additionalValue,
            valor_baixado: 0,
            valor_aberto: additionalValue,
            empresa_id: (p as any).company_id || null,
            empresa_nome: "",
            original: p,
          });
        }
      }
      return result;
    },
  });

  const { data: saidas = [], isLoading: loadingSaidas } = useQuery({
    queryKey: ["lancamentos-saidas"],
    queryFn: async () => {
      const { data: payables, error } = await supabase
        .from("accounts_payable")
        .select("*, suppliers(company_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const result: Lancamento[] = [];
      for (const ap of payables || []) {
        const supplierName = (ap as any).suppliers?.company_name || "Sem fornecedor";
        const amount = Number(ap.amount || 0);
        const discount = Number((ap as any).discount || 0);
        const interest = Number((ap as any).interest || 0);
        const fine = Number((ap as any).fine || 0);
        const paidAmount = Number((ap as any).paid_amount || 0);
        const totalLiquido = amount - discount + interest + fine;

        let status = "pendente";
        if (ap.payment_status === "pago" || ap.payment_status === "paid" || ap.paid_at) {
          status = "pago";
        } else if (ap.due_date && ap.due_date < format(new Date(), "yyyy-MM-dd")) {
          status = "vencido";
        }

        const aberto = status === "pago" ? 0 : Math.max(0, totalLiquido - paidAmount);

        const costCenterName = (ap as any).cost_center_id
          ? costCenters.find((c: any) => c.id === (ap as any).cost_center_id)?.name || ""
          : "";

        result.push({
          id: `pag-${ap.id}`,
          tipo: "saida",
          cliente_fornecedor: supplierName,
          descricao: ap.description || "Despesa",
          centro_custo: costCenterName,
          documento: (ap as any).document_number || "",
          status,
          vencimento: ap.due_date || "",
          valor: totalLiquido,
          valor_total: totalLiquido,
          valor_baixado: paidAmount,
          valor_aberto: aberto,
          empresa_id: (ap as any).company_id || null,
          empresa_nome: "",
          original: ap,
        });
      }
      return result;
    },
  });

  const allLancamentos = useMemo(() => {
    const companyMap = new Map<string, string>();
    for (const c of companies as any[]) {
      companyMap.set(c.id, c.trade_name || c.legal_name || "");
    }
    return [...(recebimentos || []), ...(saidas || [])].map((l) => ({
      ...l,
      empresa_nome: l.empresa_id ? companyMap.get(l.empresa_id) || "" : "",
    }));
  }, [recebimentos, saidas, companies]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allLancamentos.filter((l) => {
      if (tipoFilter !== "all" && l.tipo !== tipoFilter) return false;
      if (companyFilter !== "all" && l.empresa_id !== companyFilter) return false;
      if (statusFilter !== "all") {
        const s = String(l.status || "").toLowerCase();
        if (statusFilter === "pago" && !["pago", "recebido", "paid"].includes(s)) return false;
        if (statusFilter === "pendente" && !["pendente", "pending"].includes(s)) return false;
        if (statusFilter === "vencido" && !["vencido", "overdue", "atrasado"].includes(s)) return false;
        if (statusFilter === "parcial" && !["parcial", "partial"].includes(s)) return false;
      }
      if (dateFrom && l.vencimento && l.vencimento < dateFrom) return false;
      if (dateTo && l.vencimento && l.vencimento > dateTo) return false;
      if (q) {
        const text = `${l.cliente_fornecedor} ${l.descricao} ${l.centro_custo} ${l.documento} ${l.empresa_nome}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      let cmp = 0;
      if (sortField === "vencimento") {
        cmp = (a.vencimento || "9999").localeCompare(b.vencimento || "9999");
      } else {
        cmp = a.valor - b.valor;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [allLancamentos, search, companyFilter, statusFilter, tipoFilter, dateFrom, dateTo, sortField, sortAsc]);

  const totals = useMemo(() => {
    let totalEntradas = 0;
    let totalSaidas = 0;
    let totalBaixado = 0;
    let totalAberto = 0;
    for (const l of filtered) {
      if (l.tipo === "entrada") totalEntradas += l.valor;
      else totalSaidas += l.valor;
      totalBaixado += l.valor_baixado;
      totalAberto += l.valor_aberto;
    }
    return { totalEntradas, totalSaidas, totalBaixado, totalAberto };
  }, [filtered]);

  const handleExportCsv = () => {
    setIsExporting(true);
    try {
      const header = ["Tipo", "Cliente/Fornecedor", "Descricao", "Centro de Custo", "N Documento", "Status", "Vencimento", "Valor", "Valor Total", "Baixado", "Em Aberto", "Empresa"];
      const rows = filtered.map((l) => [
        l.tipo === "entrada" ? "Entrada" : "Saida",
        l.cliente_fornecedor, l.descricao, l.centro_custo, l.documento,
        getStatusLabel(l.status),
        l.vencimento ? format(new Date(l.vencimento + "T12:00:00"), "dd/MM/yyyy") : "",
        l.valor.toFixed(2), l.valor_total.toFixed(2), l.valor_baixado.toFixed(2), l.valor_aberto.toFixed(2),
        l.empresa_nome,
      ]);
      const csv = [header, ...rows].map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `lancamentos-${format(new Date(), "yyyy-MM-dd")}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      doc.setFontSize(16);
      doc.text("Lancamentos Financeiros", 14, 15);
      doc.setFontSize(9);
      doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 22);
      const rows = filtered.map((l) => [
        l.tipo === "entrada" ? "Entrada" : "Saida",
        l.cliente_fornecedor.substring(0, 30),
        l.descricao.substring(0, 25),
        l.centro_custo.substring(0, 20),
        l.documento.substring(0, 15),
        getStatusLabel(l.status),
        l.vencimento ? format(new Date(l.vencimento + "T12:00:00"), "dd/MM/yyyy") : "",
        currencyFmt(l.valor), currencyFmt(l.valor_total), currencyFmt(l.valor_baixado), currencyFmt(l.valor_aberto),
      ]);
      autoTable(doc, {
        startY: 28,
        head: [["Tipo", "Cliente/Forn.", "Descricao", "Centro Custo", "Documento", "Status", "Vencimento", "Valor", "V. Total", "Baixado", "Aberto"]],
        body: rows,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [197, 160, 89], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [249, 245, 235] },
        columnStyles: { 0: { cellWidth: 15 }, 7: { halign: "right" }, 8: { halign: "right" }, 9: { halign: "right" }, 10: { halign: "right" } },
      });
      doc.save(`lancamentos-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSort = (field: "vencimento" | "valor") => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const isLoading = loadingRecebimentos || loadingSaidas;

  const hasActiveFilters = search || tipoFilter !== "all" || statusFilter !== "all" || companyFilter !== "all" || dateFrom || dateTo;

  const resetFilters = () => {
    setSearch("");
    setTipoFilter("all");
    setStatusFilter("all");
    setCompanyFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-[1700px] mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 px-2">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 bg-gold rounded-full" />
            <h1 className="text-4xl md:text-5xl font-display text-foreground tracking-tighter uppercase leading-none">Lancamentos</h1>
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.4em] text-gold/80 pl-4">David Melo Producoes • Fluxo Financeiro Unificado</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={handleExportCsv} disabled={isExporting || isLoading} className="h-12 px-6 rounded-xl uppercase text-[11px] tracking-widest font-bold border-border/40 hover:bg-gold/5 hover:border-gold/30 hover:text-gold transition-all">
            <FileSpreadsheet className="w-4 h-4 mr-2" /> Exportar CSV
          </Button>
          <Button variant="outline" onClick={handleExportPdf} disabled={isExporting || isLoading} className="h-12 px-6 rounded-xl uppercase text-[11px] tracking-widest font-bold border-border/40 hover:bg-gold/5 hover:border-gold/30 hover:text-gold transition-all">
            <FileText className="w-4 h-4 mr-2" /> Exportar PDF
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 px-2">
        <div className="group relative bg-white rounded-[24px] p-6 border border-border/30 premium-shadow overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-lg">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-emerald-500/8 to-transparent rounded-full -mr-8 -mt-8 group-hover:scale-110 transition-transform duration-500" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center border border-emerald-100">
                <ArrowDownCircle size={18} className="text-emerald-600" />
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">Entradas</span>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Total Entradas</p>
            <p className="text-2xl font-display mt-1 tracking-tight text-emerald-700">{currencyFmt(totals.totalEntradas)}</p>
          </div>
        </div>
        <div className="group relative bg-white rounded-[24px] p-6 border border-border/30 premium-shadow overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-lg">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-red-500/8 to-transparent rounded-full -mr-8 -mt-8 group-hover:scale-110 transition-transform duration-500" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center border border-red-100">
                <ArrowUpCircle size={18} className="text-red-500" />
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest text-red-600 bg-red-50 px-2.5 py-1 rounded-lg border border-red-100">Saidas</span>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Total Saidas</p>
            <p className="text-2xl font-display mt-1 tracking-tight text-red-600">{currencyFmt(totals.totalSaidas)}</p>
          </div>
        </div>
        <div className="group relative bg-white rounded-[24px] p-6 border border-border/30 premium-shadow overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-lg">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-gold/8 to-transparent rounded-full -mr-8 -mt-8 group-hover:scale-110 transition-transform duration-500" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center border border-gold/20">
                <DollarSign size={18} className="text-gold" />
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest text-gold bg-gold/5 px-2.5 py-1 rounded-lg border border-gold/15">Baixado</span>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Total Baixado</p>
            <p className="text-2xl font-display mt-1 tracking-tight text-foreground">{currencyFmt(totals.totalBaixado)}</p>
          </div>
        </div>
        <div className="group relative bg-white rounded-[24px] p-6 border border-border/30 premium-shadow overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-lg">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-amber-500/8 to-transparent rounded-full -mr-8 -mt-8 group-hover:scale-110 transition-transform duration-500" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center border border-amber-100">
                <DollarSign size={18} className="text-amber-600" />
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">Aberto</span>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Em Aberto</p>
            <p className="text-2xl font-display mt-1 tracking-tight text-amber-700">{currencyFmt(totals.totalAberto)}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-[24px] border border-border/30 p-6 premium-shadow space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center border border-gold/20">
              <Filter size={14} className="text-gold" />
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.15em] text-foreground/70">Filtros e Organizacao</p>
          </div>
          {hasActiveFilters && (
            <Button type="button" size="sm" variant="ghost" onClick={resetFilters} className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-gold h-8 rounded-lg">
              Limpar filtros
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4 items-end">
          <div className="relative md:col-span-2 xl:col-span-3">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar cliente, descricao, documento..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-11 h-12 rounded-xl bg-white border-border/40 focus:border-gold/50 transition-all focus:ring-4 focus:ring-gold/5 premium-shadow" />
          </div>
          <div className="space-y-1.5 xl:col-span-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tipo</Label>
            <Select value={tipoFilter} onValueChange={(v: any) => setTipoFilter(v)}>
              <SelectTrigger className="h-12 rounded-xl bg-white border-border/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="entrada">Entradas</SelectItem>
                <SelectItem value="saida">Saidas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 xl:col-span-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-12 rounded-xl bg-white border-border/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pago">Pago / Recebido</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="vencido">Vencido</SelectItem>
                <SelectItem value="parcial">Parcial</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {companies.length > 0 && (
            <div className="space-y-1.5 xl:col-span-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Empresa</Label>
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="h-12 rounded-xl bg-white border-border/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {(companies as any[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.trade_name || c.legal_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5 xl:col-span-1">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">De</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-12 rounded-xl bg-white border-border/40" />
          </div>
          <div className="space-y-1.5 xl:col-span-1">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Ate</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-12 rounded-xl bg-white border-border/40" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-[24px] border border-border/30 premium-shadow overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-10 h-10 text-gold animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold animate-pulse">Carregando lancamentos...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-secondary/30 flex items-center justify-center">
              <DollarSign className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-foreground">Nenhum lancamento encontrado</p>
              <p className="text-xs text-muted-foreground mt-1">Ajuste os filtros ou cadastre novos lancamentos</p>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/30 bg-gradient-to-r from-secondary/30 via-secondary/20 to-secondary/30">
                    <th className="text-left py-4 px-5 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 w-[100px]">Tipo</th>
                    <th className="text-left py-4 px-5 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 min-w-[180px]">Cliente / Fornecedor</th>
                    <th className="text-left py-4 px-5 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 min-w-[160px]">Descricao</th>
                    <th className="text-left py-4 px-5 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 hidden xl:table-cell">Centro de Custo</th>
                    <th className="text-left py-4 px-5 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 hidden lg:table-cell">Documento</th>
                    <th className="text-left py-4 px-5 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 w-[120px]">Status</th>
                    <th className="text-left py-4 px-5 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 cursor-pointer hover:text-gold transition-colors w-[120px]" onClick={() => handleSort("vencimento")}>
                      <span className="flex items-center gap-1.5">Vencimento <ArrowUpDown size={10} className="opacity-40" /></span>
                    </th>
                    <th className="text-right py-4 px-5 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 cursor-pointer hover:text-gold transition-colors w-[130px]" onClick={() => handleSort("valor")}>
                      <span className="flex items-center justify-end gap-1.5">Valor <ArrowUpDown size={10} className="opacity-40" /></span>
                    </th>
                    <th className="text-right py-4 px-5 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 hidden md:table-cell w-[130px]">Baixado</th>
                    <th className="text-right py-4 px-5 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 hidden md:table-cell w-[130px]">Em Aberto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/15">
                  {filtered.map((l, idx) => (
                    <tr key={l.id} className={cn("group hover:bg-gold/[0.02] transition-all duration-200", idx % 2 === 0 ? "bg-white" : "bg-secondary/[0.08]")}>
                      <td className="py-4 px-5">
                        <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border", l.tipo === "entrada" ? "bg-emerald-50/80 text-emerald-700 border-emerald-200/50" : "bg-red-50/80 text-red-600 border-red-200/50")}>
                          {l.tipo === "entrada" ? <ArrowDownCircle size={11} /> : <ArrowUpCircle size={11} />}
                          {l.tipo === "entrada" ? "Entrada" : "Saida"}
                        </div>
                      </td>
                      <td className="py-4 px-5">
                        <span className="text-[13px] font-semibold text-foreground leading-tight">{l.cliente_fornecedor}</span>
                      </td>
                      <td className="py-4 px-5">
                        <span className="text-[12px] text-muted-foreground leading-tight">{l.descricao}</span>
                      </td>
                      <td className="py-4 px-5 hidden xl:table-cell">
                        <span className="text-[12px] text-muted-foreground">{l.centro_custo || <span className="text-muted-foreground/40">-</span>}</span>
                      </td>
                      <td className="py-4 px-5 hidden lg:table-cell">
                        <span className="text-[12px] text-muted-foreground font-medium">{l.documento || <span className="text-muted-foreground/40">-</span>}</span>
                      </td>
                      <td className="py-4 px-5">
                        <span className={cn("inline-flex items-center rounded-lg px-2.5 py-1 text-[9px] font-black uppercase tracking-widest", getStatusStyle(l.status))}>
                          {getStatusLabel(l.status)}
                        </span>
                      </td>
                      <td className="py-4 px-5">
                        <span className="text-[12px] font-medium text-foreground tabular-nums">
                          {l.vencimento ? format(new Date(l.vencimento + "T12:00:00"), "dd/MM/yyyy") : <span className="text-muted-foreground/40">-</span>}
                        </span>
                      </td>
                      <td className={cn("py-4 px-5 text-right font-display text-[14px] font-bold tabular-nums", l.tipo === "entrada" ? "text-emerald-700" : "text-red-600")}>
                        {currencyFmt(l.valor)}
                      </td>
                      <td className="py-4 px-5 text-right font-display text-[13px] text-muted-foreground tabular-nums hidden md:table-cell">
                        {currencyFmt(l.valor_baixado)}
                      </td>
                      <td className={cn("py-4 px-5 text-right font-display text-[13px] font-semibold tabular-nums hidden md:table-cell", l.valor_aberto > 0.01 ? "text-amber-600" : "text-muted-foreground/40")}>
                        {currencyFmt(l.valor_aberto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gradient-to-r from-secondary/20 via-secondary/10 to-secondary/20 border-t border-border/20">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-bold text-muted-foreground">{filtered.length} lancamento{filtered.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="flex flex-wrap items-center gap-5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Entradas:</span>
                    <span className="text-[12px] font-bold text-emerald-700 font-display tabular-nums">{currencyFmt(totals.totalEntradas)}</span>
                  </div>
                  <div className="w-px h-4 bg-border/40" />
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Saidas:</span>
                    <span className="text-[12px] font-bold text-red-600 font-display tabular-nums">{currencyFmt(totals.totalSaidas)}</span>
                  </div>
                  <div className="w-px h-4 bg-border/40" />
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gold" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Baixado:</span>
                    <span className="text-[12px] font-bold text-foreground font-display tabular-nums">{currencyFmt(totals.totalBaixado)}</span>
                  </div>
                  <div className="w-px h-4 bg-border/40" />
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Aberto:</span>
                    <span className="text-[12px] font-bold text-amber-600 font-display tabular-nums">{currencyFmt(totals.totalAberto)}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
