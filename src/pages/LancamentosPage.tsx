import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, FileSpreadsheet, FileText, Filter, ArrowUpDown, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { maskCurrencyInput, parseCurrencyInput, formatCurrencyInput } from "@/lib/currencyInput";

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

const STATUS_COLORS: Record<string, string> = {
  recebido: "bg-emerald-100 text-emerald-700 border-emerald-200",
  pago: "bg-emerald-100 text-emerald-700 border-emerald-200",
  pendente: "bg-amber-100 text-amber-700 border-amber-200",
  vencido: "bg-red-100 text-red-700 border-red-200",
  atrasado: "bg-red-100 text-red-700 border-red-200",
  parcial: "bg-blue-100 text-blue-700 border-blue-200",
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

const getStatusClass = (status: string) => {
  const s = String(status || "").toLowerCase();
  if (s === "paid" || s === "pago" || s === "recebido") return STATUS_COLORS.pago;
  if (s === "pending" || s === "pendente") return STATUS_COLORS.pendente;
  if (s === "vencido" || s === "overdue" || s === "atrasado") return STATUS_COLORS.vencido;
  if (s === "parcial" || s === "partial") return STATUS_COLORS.parcial;
  return "bg-secondary text-muted-foreground border-border/30";
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

      const instByPayment = new Map<string, any[]>();
      for (const inst of installments || []) {
        const list = instByPayment.get(inst.payment_id) || [];
        list.push(inst);
        instByPayment.set(inst.payment_id, list);
      }

      const result: Lancamento[] = [];
      for (const p of payments || []) {
        const clientName = p.clients ? `${p.clients.first_name} ${p.clients.last_name}` : "Sem cliente";
        const eventTitle = p.events?.title || "";
        const description = eventTitle || "Recebimento";
        const totalValue = Number(p.total_event_value || 0);
        const additionalValue = Number((p as any).additional_value || 0);
        const effectiveTotal = totalValue + additionalValue;

        const pInstallments = instByPayment.get(p.id) || [];
        const paidInstallments = pInstallments.filter((i) => i.status === "paid" || i.paid_at);
        const pendingInstallments = pInstallments.filter((i) => i.status !== "paid" && !i.paid_at);

        const entryPaid = p.has_entry_payment && p.entry_paid_at;
        const entryPending = p.has_entry_payment && !p.entry_paid_at && Number(p.entry_amount || 0) > 0;

        const totalBaixado = (paidInstallments.reduce((s, i) => s + Number(i.paid_amount ?? i.amount ?? 0), 0))
          + (entryPaid ? Number((p as any).entry_paid_amount ?? p.entry_amount ?? 0) : 0);
        const totalAberto = (pendingInstallments.reduce((s, i) => s + Number(i.amount || 0), 0))
          + (entryPending ? Number(p.entry_amount || 0) : 0)
          + additionalValue;

        let status = "pendente";
        if (totalAberto <= 0.01 && effectiveTotal > 0) status = "recebido";
        else if (totalBaixado > 0 && totalAberto > 0) status = "parcial";

        const nextDuePending = pendingInstallments
          .filter((i) => i.due_date)
          .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
        const vencimento = nextDuePending?.due_date || "";

        result.push({
          id: `rec-${p.id}`,
          tipo: "entrada",
          cliente_fornecedor: clientName,
          descricao: description,
          centro_custo: "",
          documento: "",
          status,
          vencimento,
          valor: effectiveTotal,
          valor_total: effectiveTotal,
          valor_baixado: totalBaixado,
          valor_aberto: totalAberto,
          empresa_id: (p as any).company_id || null,
          empresa_nome: "",
          original: p,
        });
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

    const merged = [...(recebimentos || []), ...(saidas || [])].map((l) => ({
      ...l,
      empresa_nome: l.empresa_id ? companyMap.get(l.empresa_id) || "" : "",
    }));

    return merged;
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
      const header = [
        "Tipo", "Cliente/Fornecedor", "Descrição", "Centro de Custo",
        "Nº Documento", "Status", "Vencimento", "Valor", "Valor Total",
        "Valor Baixado", "Valor em Aberto", "Empresa"
      ];
      const rows = filtered.map((l) => [
        l.tipo === "entrada" ? "Entrada" : "Saída",
        l.cliente_fornecedor,
        l.descricao,
        l.centro_custo,
        l.documento,
        getStatusLabel(l.status),
        l.vencimento ? format(new Date(l.vencimento + "T12:00:00"), "dd/MM/yyyy") : "",
        l.valor.toFixed(2),
        l.valor_total.toFixed(2),
        l.valor_baixado.toFixed(2),
        l.valor_aberto.toFixed(2),
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
        currencyFmt(l.valor),
        currencyFmt(l.valor_total),
        currencyFmt(l.valor_baixado),
        currencyFmt(l.valor_aberto),
      ]);

      autoTable(doc, {
        startY: 28,
        head: [["Tipo", "Cliente/Forn.", "Descricao", "Centro Custo", "Documento", "Status", "Vencimento", "Valor", "V. Total", "V. Baixado", "V. Aberto"]],
        body: rows,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [197, 160, 89], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [249, 245, 235] },
        columnStyles: {
          0: { cellWidth: 15 },
          7: { halign: "right" },
          8: { halign: "right" },
          9: { halign: "right" },
          10: { halign: "right" },
        },
      });

      doc.save(`lancamentos-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    } finally {
      setIsExporting(false);
    }
  };

  const isLoading = loadingRecebimentos || loadingSaidas;

  return (
    <div className="space-y-8 animate-fade-in max-w-[1700px] mx-auto p-2 pb-10">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 px-2">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 bg-gold rounded-full" />
            <h1 className="text-4xl md:text-5xl font-display text-foreground tracking-tighter uppercase leading-none">Lancamentos</h1>
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.4em] text-gold/80 pl-4">David Melo Producoes • Fluxo Financeiro Unificado</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={handleExportCsv} disabled={isExporting || isLoading} className="h-12 px-5 rounded-xl uppercase text-[11px] tracking-widest font-bold">
            <FileSpreadsheet className="w-4 h-4 mr-2" /> CSV
          </Button>
          <Button variant="outline" onClick={handleExportPdf} disabled={isExporting || isLoading} className="h-12 px-5 rounded-xl uppercase text-[11px] tracking-widest font-bold">
            <FileText className="w-4 h-4 mr-2" /> PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 px-2">
        <div className="bg-white premium-shadow rounded-2xl p-5 border border-border/30 relative overflow-hidden">
          <div className="absolute left-0 top-0 h-full w-1.5 bg-emerald-500/50" />
          <p className="text-[10px] uppercase tracking-widest text-emerald-600 font-bold">Total Entradas</p>
          <p className="text-2xl font-display mt-1 tracking-tight text-emerald-700">{currencyFmt(totals.totalEntradas)}</p>
        </div>
        <div className="bg-white premium-shadow rounded-2xl p-5 border border-border/30 relative overflow-hidden">
          <div className="absolute left-0 top-0 h-full w-1.5 bg-red-500/50" />
          <p className="text-[10px] uppercase tracking-widest text-red-600 font-bold">Total Saidas</p>
          <p className="text-2xl font-display mt-1 tracking-tight text-red-700">{currencyFmt(totals.totalSaidas)}</p>
        </div>
        <div className="bg-white premium-shadow rounded-2xl p-5 border border-border/30 relative overflow-hidden">
          <div className="absolute left-0 top-0 h-full w-1.5 bg-gold/50" />
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Total Baixado</p>
          <p className="text-2xl font-display mt-1 tracking-tight">{currencyFmt(totals.totalBaixado)}</p>
        </div>
        <div className="bg-white premium-shadow rounded-2xl p-5 border border-border/30 relative overflow-hidden">
          <div className="absolute left-0 top-0 h-full w-1.5 bg-amber-500/50" />
          <p className="text-[10px] uppercase tracking-widest text-amber-700 font-bold">Em Aberto</p>
          <p className="text-2xl font-display mt-1 tracking-tight text-amber-700">{currencyFmt(totals.totalAberto)}</p>
        </div>
      </div>

      <div className="bg-white border border-border/30 rounded-2xl p-4 md:p-5 premium-shadow space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Filtros</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          <div className="relative md:col-span-2 xl:col-span-2">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-11 h-11 rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Tipo</Label>
            <Select value={tipoFilter} onValueChange={(v: any) => setTipoFilter(v)}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="entrada">Entradas</SelectItem>
                <SelectItem value="saida">Saidas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
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
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Empresa</Label>
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {(companies as any[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.trade_name || c.legal_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">De</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-11 rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Ate</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-11 rounded-xl" />
          </div>
        </div>
      </div>

      <div className="bg-white border border-border/30 rounded-2xl premium-shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/30 bg-secondary/30">
                <th className="text-left py-3 px-4 font-black uppercase tracking-widest text-muted-foreground w-16">Tipo</th>
                <th className="text-left py-3 px-4 font-black uppercase tracking-widest text-muted-foreground">Cliente / Fornecedor</th>
                <th className="text-left py-3 px-4 font-black uppercase tracking-widest text-muted-foreground">Descricao</th>
                <th className="text-left py-3 px-4 font-black uppercase tracking-widest text-muted-foreground">Centro de Custo</th>
                <th className="text-left py-3 px-4 font-black uppercase tracking-widest text-muted-foreground">N Documento</th>
                <th className="text-left py-3 px-4 font-black uppercase tracking-widest text-muted-foreground">Status</th>
                <th className="text-left py-3 px-4 font-black uppercase tracking-widest text-muted-foreground cursor-pointer hover:text-gold" onClick={() => { if (sortField === "vencimento") setSortAsc(!sortAsc); else { setSortField("vencimento"); setSortAsc(true); } }}>
                  <span className="flex items-center gap-1">Vencimento <ArrowUpDown size={10} /></span>
                </th>
                <th className="text-right py-3 px-4 font-black uppercase tracking-widest text-muted-foreground cursor-pointer hover:text-gold" onClick={() => { if (sortField === "valor") setSortAsc(!sortAsc); else { setSortField("valor"); setSortAsc(true); } }}>
                  <span className="flex items-center justify-end gap-1">Valor <ArrowUpDown size={10} /></span>
                </th>
                <th className="text-right py-3 px-4 font-black uppercase tracking-widest text-muted-foreground">Valor Total</th>
                <th className="text-right py-3 px-4 font-black uppercase tracking-widest text-muted-foreground">Baixado</th>
                <th className="text-right py-3 px-4 font-black uppercase tracking-widest text-muted-foreground">Em Aberto</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={11} className="py-12 text-center text-muted-foreground">Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={11} className="py-12 text-center text-muted-foreground">Nenhum lancamento encontrado</td></tr>
              ) : (
                filtered.map((l) => (
                  <tr key={l.id} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                    <td className="py-3 px-4">
                      <div className={cn("flex items-center gap-1.5", l.tipo === "entrada" ? "text-emerald-600" : "text-red-500")}>
                        {l.tipo === "entrada" ? <ArrowDownCircle size={14} /> : <ArrowUpCircle size={14} />}
                        <span className="text-[10px] font-black uppercase">{l.tipo === "entrada" ? "Entrada" : "Saida"}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-semibold text-foreground max-w-[200px] truncate">{l.cliente_fornecedor}</td>
                    <td className="py-3 px-4 text-muted-foreground max-w-[180px] truncate">{l.descricao}</td>
                    <td className="py-3 px-4 text-muted-foreground max-w-[150px] truncate">{l.centro_custo || "-"}</td>
                    <td className="py-3 px-4 text-muted-foreground">{l.documento || "-"}</td>
                    <td className="py-3 px-4">
                      <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider", getStatusClass(l.status))}>
                        {getStatusLabel(l.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-foreground font-medium">
                      {l.vencimento ? format(new Date(l.vencimento + "T12:00:00"), "dd/MM/yyyy") : "-"}
                    </td>
                    <td className={cn("py-3 px-4 text-right font-bold font-display", l.tipo === "entrada" ? "text-emerald-700" : "text-red-600")}>
                      {currencyFmt(l.valor)}
                    </td>
                    <td className="py-3 px-4 text-right font-display">{currencyFmt(l.valor_total)}</td>
                    <td className="py-3 px-4 text-right font-display text-emerald-600">{currencyFmt(l.valor_baixado)}</td>
                    <td className={cn("py-3 px-4 text-right font-bold font-display", l.valor_aberto > 0 ? "text-amber-600" : "text-muted-foreground")}>
                      {currencyFmt(l.valor_aberto)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-3 bg-secondary/20 border-t border-border/20 flex flex-wrap items-center justify-between gap-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <span>{filtered.length} lancamento{filtered.length !== 1 ? "s" : ""}</span>
            <div className="flex items-center gap-6">
              <span>Entradas: <span className="text-emerald-600">{currencyFmt(totals.totalEntradas)}</span></span>
              <span>Saidas: <span className="text-red-600">{currencyFmt(totals.totalSaidas)}</span></span>
              <span>Baixado: <span className="text-foreground">{currencyFmt(totals.totalBaixado)}</span></span>
              <span>Aberto: <span className="text-amber-600">{currencyFmt(totals.totalAberto)}</span></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
