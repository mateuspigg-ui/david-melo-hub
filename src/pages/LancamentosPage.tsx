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
import logoImg from "@/assets/logo.png";

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
  const [visibleCount, setVisibleCount] = useState(10);

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-select"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("companies")
        .select("id, legal_name, trade_name, cnpj, ie, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_zip, phone")
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
            valor_baixado: p.entry_paid_at ? Number((p as any).entry_paid_amount ?? p.entry_amount ?? 0) : 0,
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
            valor_baixado: isPaid ? Number((inst as any).paid_amount ?? inst.amount ?? 0) : 0,
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

  const getSelectedCompany = () => {
    if (companyFilter === "all") return null;
    return (companies as any[]).find((c) => c.id === companyFilter) || null;
  };

  const buildCompanyAddress = (c: any) => {
    const parts: string[] = [];
    if (c.address_street) parts.push(c.address_street);
    if (c.address_number) parts.push(c.address_number);
    if (c.address_complement) parts.push(c.address_complement);
    return parts.join(", ");
  };

  const buildCompanyBairroCidadeUf = (c: any) => {
    const bairro = c.address_neighborhood || "";
    const cidade = c.address_city || "";
    const uf = c.address_state || "";
    const bairroStr = bairro ? `BAIRRO: ${bairro}` : "";
    const cidadeStr = cidade && uf ? `CIDADE: ${cidade} / ${uf}` : cidade ? `CIDADE: ${cidade}` : "";
    return [bairroStr, cidadeStr].filter(Boolean).join("  |  ");
  };

  const handleExportCsv = () => {
    setIsExporting(true);
    try {
      const company = getSelectedCompany();
      const lines: string[] = [];
      const now = format(new Date(), "dd/MM/yyyy HH:mm:ss");

      if (company) {
        lines.push(`EMPRESA: ${company.trade_name || company.legal_name || ""}`);
        if (company.cnpj) lines.push(`CNPJ: ${company.cnpj}`);
        if (company.ie) lines.push(`IE: ${company.ie}`);
        const logradouro = buildCompanyAddress(company);
        if (logradouro) lines.push(`LOGRADOURO: ${logradouro}`);
        const bairroCidade = buildCompanyBairroCidadeUf(company);
        if (bairroCidade) lines.push(bairroCidade);
        if (company.address_zip) lines.push(`CEP: ${company.address_zip}`);
        if (company.phone) lines.push(`TELEFONE: ${company.phone}`);
      } else {
        lines.push("EMPRESA: DAVID MELO PRODUCOES");
      }

      lines.push("");
      lines.push("Lancamentos:");
      const periodoParts: string[] = [];
      if (dateFrom) periodoParts.push(format(new Date(dateFrom + "T12:00:00"), "dd/MM/yyyy"));
      if (dateTo) periodoParts.push(format(new Date(dateTo + "T12:00:00"), "dd/MM/yyyy"));
      if (periodoParts.length === 2) lines.push(`Periodo de Vencimento: ${periodoParts[0]} ate ${periodoParts[1]}`);
      else if (periodoParts.length === 1) lines.push(`A partir de: ${periodoParts[0]}`);
      lines.push(`Emitido em: ${now}`);
      lines.push("");
      lines.push("David Melo Producoes - ERP For ME");
      lines.push("");

      const tableHeader = ["Pessoa", "Descricao", "Centro de Custo", "N Documento", "Status", "Vencimento", "Valor total", "Valor baixado", "Valor em aberto"];
      lines.push(tableHeader.map((c) => `"${c}"`).join(";"));

      for (const l of filtered) {
        const row = [
          l.cliente_fornecedor,
          l.descricao,
          l.centro_custo,
          l.documento,
          getStatusLabel(l.status),
          l.vencimento ? format(new Date(l.vencimento + "T12:00:00"), "dd/MM/yyyy") : "",
          l.valor_total.toFixed(2).replace(".", ","),
          l.valor_baixado.toFixed(2).replace(".", ","),
          l.valor_aberto.toFixed(2).replace(".", ","),
        ];
        lines.push(row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"));
      }

      const csv = lines.join("\n");
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

      // Load logo as base64
      let logoBase64 = "";
      try {
        const resp = await fetch(logoImg);
        const blob = await resp.blob();
        logoBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      } catch {}

      const company = getSelectedCompany();
      const now = format(new Date(), "dd/MM/yyyy HH:mm:ss");
      const pageW = doc.internal.pageSize.getWidth();
      const gold: [number, number, number] = [197, 160, 89];

      // Header line
      doc.setDrawColor(...gold);
      doc.setLineWidth(0.8);
      doc.line(14, 8, pageW - 14, 8);

      // Logo on the left
      const logoX = 14;
      const logoY = 10;
      const logoW = 35;
      const logoH = 30;
      if (logoBase64) {
        try {
          doc.addImage(logoBase64, "PNG", logoX, logoY, logoW, logoH);
        } catch {}
      }

      const rightColX = logoBase64 ? 55 : 14;
      let y = 14;

      if (company) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(60, 60, 60);
        doc.text(`EMPRESA: ${company.trade_name || company.legal_name || ""}`, rightColX, y);

        y += 6;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        if (company.cnpj) { doc.text(`CNPJ: ${company.cnpj}`, rightColX, y); y += 5; }
        if (company.ie) { doc.text(`IE: ${company.ie}`, rightColX, y); y += 5; }
        const logradouro = buildCompanyAddress(company);
        if (logradouro) { doc.text(`LOGRADOURO: ${logradouro}`, rightColX, y); y += 5; }
        const bairroCidade = buildCompanyBairroCidadeUf(company);
        if (bairroCidade) { doc.text(bairroCidade, rightColX, y); y += 5; }
        if (company.address_zip) { doc.text(`CEP: ${company.address_zip}`, rightColX, y); y += 5; }
        if (company.phone) { doc.text(`TELEFONE: ${company.phone}`, rightColX, y); }
      } else {
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(60, 60, 60);
        doc.text("DAVID MELO PRODUCOES", rightColX, y + 2);
      }

      // Timestamp right-aligned
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 120);
      doc.text(now, pageW - 14, 14, { align: "right" });

      // Bottom header line
      const headerEndY = Math.max(y + 4, 42);
      doc.setDrawColor(...gold);
      doc.setLineWidth(0.4);
      doc.line(14, headerEndY, pageW - 14, headerEndY);

      // Title
      let titleY = headerEndY + 7;
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(40, 40, 40);
      doc.text("Lancamentos:", 14, titleY);

      // Period
      titleY += 6;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      const periodoParts: string[] = [];
      if (dateFrom) periodoParts.push(format(new Date(dateFrom + "T12:00:00"), "dd/MM/yyyy"));
      if (dateTo) periodoParts.push(format(new Date(dateTo + "T12:00:00"), "dd/MM/yyyy"));
      if (periodoParts.length === 2) {
        doc.text(`Periodo de Vencimento: ${periodoParts[0]} ate ${periodoParts[1]}`, 14, titleY);
      } else if (periodoParts.length === 1) {
        doc.text(`A partir de: ${periodoParts[0]}`, 14, titleY);
      }

      // Table
      const tableStartY = titleY + 6;
      const rows = filtered.map((l) => [
        l.tipo === "entrada" ? "Entrada" : "Saida",
        l.cliente_fornecedor.substring(0, 35),
        l.descricao.substring(0, 30),
        l.centro_custo.substring(0, 22),
        l.documento.substring(0, 18),
        getStatusLabel(l.status),
        l.vencimento ? format(new Date(l.vencimento + "T12:00:00"), "dd/MM/yyyy") : "",
        currencyFmt(l.valor_total),
        currencyFmt(l.valor_baixado),
        currencyFmt(l.valor_aberto),
      ]);

      autoTable(doc, {
        startY: tableStartY,
        head: [["Tipo", "Pessoa", "Descricao", "Centro Custo", "Documento", "Status", "Vencimento", "Valor total", "Valor baixado", "Valor em aberto"]],
        body: rows,
        styles: { fontSize: 7, cellPadding: 2, textColor: [40, 40, 40] },
        headStyles: { fillColor: gold, textColor: 255, fontStyle: "bold", fontSize: 7 },
        alternateRowStyles: { fillColor: [249, 245, 235] },
        columnStyles: {
          0: { cellWidth: 16 },
          7: { halign: "right" },
          8: { halign: "right" },
          9: { halign: "right" },
        },
        didDrawPage: (data: any) => {
          const pageH = doc.internal.pageSize.getHeight();
          // Footer line
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.3);
          doc.line(14, pageH - 20, pageW - 14, pageH - 20);

          // Totals footer
          const totReceitas = { valor: 0, baixado: 0, aberto: 0 };
          const totDespesas = { valor: 0, baixado: 0, aberto: 0 };
          for (const l of filtered) {
            if (l.tipo === "entrada") {
              totReceitas.valor += l.valor_total;
              totReceitas.baixado += l.valor_baixado;
              totReceitas.aberto += l.valor_aberto;
            } else {
              totDespesas.valor += l.valor_total;
              totDespesas.baixado += l.valor_baixado;
              totDespesas.aberto += l.valor_aberto;
            }
          }

          const footerY = pageH - 16;
          doc.setFontSize(8);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(40, 40, 40);
          doc.text("Total de Receitas", 14, footerY);
          doc.text("Total de Despesas", 14, footerY + 6);

          doc.setFont("helvetica", "normal");
          doc.setTextColor(60, 60, 60);
          const col2 = pageW - 90;
          const col3 = pageW - 55;
          const col4 = pageW - 14;

          doc.text(currencyFmt(totReceitas.valor), col2, footerY, { align: "right" });
          doc.text(currencyFmt(totReceitas.baixado), col3, footerY, { align: "right" });
          doc.text(currencyFmt(totReceitas.aberto), col4, footerY, { align: "right" });

          doc.text(currencyFmt(totDespesas.valor), col2, footerY + 6, { align: "right" });
          doc.text(currencyFmt(totDespesas.baixado), col3, footerY + 6, { align: "right" });
          doc.text(currencyFmt(totDespesas.aberto), col4, footerY + 6, { align: "right" });

          // Page number
          doc.setFontSize(7);
          doc.setFont("helvetica", "italic");
          doc.setTextColor(140, 140, 140);
          doc.text(`Pagina ${doc.getCurrentPageInfo().pageNumber}`, pageW - 14, pageH - 6, { align: "right" });
        },
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
    setVisibleCount(10);
  };

  return (
    <div className="space-y-4 animate-fade-in max-w-[1700px] mx-auto pb-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 px-2">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="h-6 w-1 bg-gold rounded-full" />
            <h1 className="text-3xl md:text-4xl font-display text-foreground tracking-tighter uppercase leading-none">Lancamentos</h1>
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-gold/80 pl-4">David Melo Producoes • Fluxo Financeiro Unificado</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleExportCsv} disabled={isExporting || isLoading} className="h-9 px-4 rounded-xl uppercase text-[10px] tracking-widest font-bold border-border/40 hover:bg-gold/5 hover:border-gold/30 hover:text-gold transition-all">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" /> CSV
          </Button>
          <Button variant="outline" onClick={handleExportPdf} disabled={isExporting || isLoading} className="h-9 px-4 rounded-xl uppercase text-[10px] tracking-widest font-bold border-border/40 hover:bg-gold/5 hover:border-gold/30 hover:text-gold transition-all">
            <FileText className="w-3.5 h-3.5 mr-1.5" /> PDF
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-2">
        <div className="group relative bg-white rounded-2xl p-3.5 border border-border/30 premium-shadow overflow-hidden">
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center border border-emerald-100 shrink-0">
              <ArrowDownCircle size={14} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Entradas</p>
              <p className="text-lg font-display tracking-tight text-emerald-700">{currencyFmt(totals.totalEntradas)}</p>
            </div>
          </div>
        </div>
        <div className="group relative bg-white rounded-2xl p-3.5 border border-border/30 premium-shadow overflow-hidden">
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center border border-red-100 shrink-0">
              <ArrowUpCircle size={14} className="text-red-500" />
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Saidas</p>
              <p className="text-lg font-display tracking-tight text-red-600">{currencyFmt(totals.totalSaidas)}</p>
            </div>
          </div>
        </div>
        <div className="group relative bg-white rounded-2xl p-3.5 border border-border/30 premium-shadow overflow-hidden">
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center border border-gold/20 shrink-0">
              <DollarSign size={14} className="text-gold" />
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Baixado</p>
              <p className="text-lg font-display tracking-tight text-foreground">{currencyFmt(totals.totalBaixado)}</p>
            </div>
          </div>
        </div>
        <div className="group relative bg-white rounded-2xl p-3.5 border border-border/30 premium-shadow overflow-hidden">
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center border border-amber-100 shrink-0">
              <DollarSign size={14} className="text-amber-600" />
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">Aberto</p>
              <p className="text-lg font-display tracking-tight text-amber-700">{currencyFmt(totals.totalAberto)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-border/30 p-4 premium-shadow space-y-3">
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3 items-end">
          <div className="relative md:col-span-2 xl:col-span-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 rounded-lg bg-white border-border/40 focus:border-gold/50 text-xs" />
          </div>
          <div className="space-y-1 xl:col-span-2">
            <Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Tipo</Label>
            <Select value={tipoFilter} onValueChange={(v: any) => setTipoFilter(v)}>
              <SelectTrigger className="h-9 rounded-lg bg-white border-border/40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="entrada">Entradas</SelectItem>
                <SelectItem value="saida">Saidas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 xl:col-span-2">
            <Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 rounded-lg bg-white border-border/40 text-xs"><SelectValue /></SelectTrigger>
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
            <div className="space-y-1 xl:col-span-2">
              <Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Empresa</Label>
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="h-9 rounded-lg bg-white border-border/40 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {(companies as any[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.trade_name || c.legal_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1 xl:col-span-1">
            <Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">De</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 rounded-lg bg-white border-border/40 text-xs" />
          </div>
          <div className="space-y-1 xl:col-span-1">
            <Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Ate</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 rounded-lg bg-white border-border/40 text-xs" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-border/30 premium-shadow overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 text-gold animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold animate-pulse">Carregando lancamentos...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-12 h-12 rounded-xl bg-secondary/30 flex items-center justify-center">
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
                    <th className="text-left py-2.5 px-5 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 w-[100px]">Tipo</th>
                    <th className="text-left py-2.5 px-5 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 min-w-[180px]">Cliente / Fornecedor</th>
                    <th className="text-left py-2.5 px-5 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 min-w-[160px]">Descricao</th>
                    <th className="text-left py-2.5 px-5 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 hidden xl:table-cell">Centro de Custo</th>
                    <th className="text-left py-2.5 px-5 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 hidden lg:table-cell">Documento</th>
                    <th className="text-left py-2.5 px-5 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 w-[120px]">Status</th>
                    <th className="text-left py-2.5 px-5 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 cursor-pointer hover:text-gold transition-colors w-[120px]" onClick={() => handleSort("vencimento")}>
                      <span className="flex items-center gap-1.5">Vencimento <ArrowUpDown size={10} className="opacity-40" /></span>
                    </th>
                    <th className="text-right py-2.5 px-5 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 cursor-pointer hover:text-gold transition-colors w-[130px]" onClick={() => handleSort("valor")}>
                      <span className="flex items-center justify-end gap-1.5">Valor <ArrowUpDown size={10} className="opacity-40" /></span>
                    </th>
                    <th className="text-right py-2.5 px-5 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 hidden md:table-cell w-[130px]">Baixado</th>
                    <th className="text-right py-2.5 px-5 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 hidden md:table-cell w-[130px]">Em Aberto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/15">
                  {filtered.slice(0, visibleCount).map((l, idx) => {
                    const s = String(l.status || "").toLowerCase();
                    const isPago = s === "paid" || s === "pago" || s === "recebido";
                    const isVencido = s === "vencido" || s === "overdue" || s === "atrasado";
                    const isPendente = s === "pending" || s === "pendente";
                    const valorColor = isPago ? "text-emerald-700" : isVencido ? "text-red-600" : isPendente ? "text-amber-600" : l.tipo === "entrada" ? "text-emerald-700" : "text-red-600";
                    const baixadoColor = isPago ? "text-emerald-600" : "text-muted-foreground";
                    const abertoColor = l.valor_aberto > 0.01 ? (isVencido ? "text-red-600" : "text-amber-600") : "text-muted-foreground/40";
                    return (
                    <tr key={l.id} className={cn("group hover:bg-gold/[0.02] transition-all duration-200", idx % 2 === 0 ? "bg-white" : "bg-secondary/[0.08]")}>
                      <td className="py-2.5 px-5">
                        <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border", l.tipo === "entrada" ? "bg-emerald-50/80 text-emerald-700 border-emerald-200/50" : "bg-red-50/80 text-red-600 border-red-200/50")}>
                          {l.tipo === "entrada" ? <ArrowDownCircle size={11} /> : <ArrowUpCircle size={11} />}
                          {l.tipo === "entrada" ? "Entrada" : "Saida"}
                        </div>
                      </td>
                      <td className="py-2.5 px-5">
                        <span className="text-[13px] font-semibold text-foreground leading-tight">{l.cliente_fornecedor}</span>
                      </td>
                      <td className="py-2.5 px-5">
                        <span className="text-[12px] text-muted-foreground leading-tight">{l.descricao}</span>
                      </td>
                      <td className="py-2.5 px-5 hidden xl:table-cell">
                        <span className="text-[12px] text-muted-foreground">{l.centro_custo || <span className="text-muted-foreground/40">-</span>}</span>
                      </td>
                      <td className="py-2.5 px-5 hidden lg:table-cell">
                        <span className="text-[12px] text-muted-foreground font-medium">{l.documento || <span className="text-muted-foreground/40">-</span>}</span>
                      </td>
                      <td className="py-2.5 px-5">
                        <span className={cn("inline-flex items-center rounded-lg px-2.5 py-1 text-[9px] font-black uppercase tracking-widest", getStatusStyle(l.status))}>
                          {getStatusLabel(l.status)}
                        </span>
                      </td>
                      <td className="py-2.5 px-5">
                        <span className="text-[12px] font-medium text-foreground tabular-nums">
                          {l.vencimento ? format(new Date(l.vencimento + "T12:00:00"), "dd/MM/yyyy") : <span className="text-muted-foreground/40">-</span>}
                        </span>
                      </td>
                      <td className={cn("py-2.5 px-5 text-right font-display text-[14px] font-bold tabular-nums", valorColor)}>
                        {currencyFmt(l.valor)}
                      </td>
                      <td className={cn("py-2.5 px-5 text-right font-display text-[13px] tabular-nums hidden md:table-cell", baixadoColor)}>
                        {currencyFmt(l.valor_baixado)}
                      </td>
                      <td className={cn("py-2.5 px-5 text-right font-display text-[13px] font-semibold tabular-nums hidden md:table-cell", abertoColor)}>
                        {currencyFmt(l.valor_aberto)}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {visibleCount < filtered.length && (
              <div className="px-4 py-3 flex items-center justify-between border-t border-border/10 bg-secondary/5">
                <span className="text-[11px] font-bold text-muted-foreground">
                  Mostrando {Math.min(visibleCount, filtered.length)} de {filtered.length} lancamentos
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setVisibleCount((prev) => prev + 10)}
                  className="h-8 px-4 rounded-lg text-[10px] font-bold uppercase tracking-widest text-gold hover:bg-gold/10">
                  Mostrar mais
                </Button>
              </div>
            )}

            {/* Footer */}
            <div className="px-4 py-2.5 bg-gradient-to-r from-secondary/20 via-secondary/10 to-secondary/20 border-t border-border/20">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
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
