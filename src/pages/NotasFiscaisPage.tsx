import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { FileText, Search } from "lucide-react";
import { format } from "date-fns";

type InvoiceRecord = {
  id: string;
  payment_id: string | null;
  status: "draft" | "processing" | "authorized" | "rejected" | "cancelled";
  invoice_number: string | null;
  error_message: string | null;
  pdf_url: string | null;
  xml_url: string | null;
  cancelled_at: string | null;
  created_at: string | null;
};

type PaymentLite = {
  id: string;
  company_id: string | null;
  client_id: string | null;
  event_id: string | null;
  clients?: { first_name: string; last_name: string } | null;
  events?: { title: string } | null;
};

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

export default function NotasFiscaisPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices-select"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("invoices")
        .select("id, payment_id, status, invoice_number, error_message, pdf_url, xml_url, cancelled_at, created_at")
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

  const { data: payments = [] } = useQuery({
    queryKey: ["payments-lite-for-invoices"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("payments")
        .select("id, company_id, client_id, event_id, clients(first_name, last_name), events(title)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PaymentLite[];
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-select"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("companies")
        .select("id, legal_name, trade_name")
        .order("trade_name", { ascending: true });
      if (error) {
        if (/could not find the table|schema cache/i.test(String(error?.message || ""))) return [];
        throw error;
      }
      return data || [];
    },
  });

  const paymentById = useMemo(() => {
    const map = new Map<string, PaymentLite>();
    for (const payment of payments) {
      map.set(payment.id, payment);
    }
    return map;
  }, [payments]);

  const companyById = useMemo(() => {
    const map = new Map<string, string>();
    for (const company of companies as any[]) {
      map.set(company.id, company.trade_name || company.legal_name || "Empresa");
    }
    return map;
  }, [companies]);

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

  const filteredInvoices = useMemo(() => {
    const queryText = search.trim().toLowerCase();
    return invoices.filter((invoice) => {
      if (statusFilter !== "all" && invoice.status !== statusFilter) return false;

      const payment = invoice.payment_id ? paymentById.get(invoice.payment_id) : null;
      const companyName = payment?.company_id ? companyById.get(payment.company_id) || "" : "";
      if (companyFilter !== "all" && String(payment?.company_id || "") !== companyFilter) return false;

      if (!queryText) return true;

      const clientName = payment?.clients ? `${payment.clients.first_name} ${payment.clients.last_name}` : "";
      const eventName = payment?.events?.title || "";
      const invoiceNumber = invoice.invoice_number || "";
      const haystack = `${clientName} ${eventName} ${companyName} ${invoiceNumber}`.toLowerCase();
      return haystack.includes(queryText);
    });
  }, [invoices, search, statusFilter, companyFilter, paymentById, companyById]);

  return (
    <div className="space-y-8 animate-fade-in max-w-[1700px] mx-auto p-2 pb-10">
      <div className="space-y-2 px-2">
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 bg-gold rounded-full" />
          <h1 className="text-4xl md:text-5xl font-display text-foreground tracking-tighter uppercase leading-none">Notas Fiscais</h1>
        </div>
        <p className="text-[11px] font-black uppercase tracking-[0.4em] text-gold/80 pl-4">David Melo Produções • Gestão de NFSe</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(300px,1fr)_220px_240px] gap-3 items-end">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, evento, empresa ou número..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-11 h-12 rounded-xl bg-white border-border/30 premium-shadow"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Status NF</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-12 rounded-xl bg-white border-border/30"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="draft">Rascunho</SelectItem>
              <SelectItem value="processing">Processando</SelectItem>
              <SelectItem value="authorized">Autorizada</SelectItem>
              <SelectItem value="rejected">Rejeitada</SelectItem>
              <SelectItem value="cancelled">Cancelada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {companies.length > 0 && (
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Empresa</Label>
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="h-12 rounded-xl bg-white border-border/30"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas empresas</SelectItem>
                {(companies as any[]).map((company) => (
                  <SelectItem key={company.id} value={company.id}>{company.trade_name || company.legal_name || "Empresa"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-24 bg-white rounded-2xl border border-border/40 animate-pulse" />)}</div>
      ) : filteredInvoices.length === 0 ? (
        <div className="bg-white premium-shadow rounded-2xl p-20 border border-border/40 text-center">
          <p className="font-bold text-lg">Nenhuma nota fiscal encontrada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredInvoices.map((invoice) => {
            const payment = invoice.payment_id ? paymentById.get(invoice.payment_id) : null;
            const clientName = payment?.clients
              ? `${payment.clients.first_name} ${payment.clients.last_name}`.trim()
              : "Cliente não identificado";
            const eventName = payment?.events?.title || "Evento sem título";
            const companyName = payment?.company_id ? companyById.get(payment.company_id) || "Empresa" : "Empresa não vinculada";

            return (
              <div key={invoice.id} className="bg-white rounded-2xl border border-border/40 premium-shadow p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[9px] uppercase tracking-wider font-black", getInvoiceStatusClass(invoice.status))}>
                        <FileText className="w-3 h-3 mr-1" /> NF {getInvoiceStatusLabel(invoice.status)}
                      </span>
                      {invoice.invoice_number && (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Nº {invoice.invoice_number}</span>
                      )}
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                        {invoice.created_at ? format(new Date(invoice.created_at), "dd/MM/yyyy HH:mm") : "Sem data"}
                      </span>
                    </div>
                    <p className="text-sm font-bold uppercase">{eventName}</p>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{clientName} • {companyName}</p>
                    {invoice.status === "rejected" && invoice.error_message && (
                      <p className="text-[11px] font-bold text-destructive/90 uppercase tracking-wide">Motivo: {invoice.error_message}</p>
                    )}
                    {invoice.status === "cancelled" && invoice.cancelled_at && (
                      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Cancelada em {format(new Date(invoice.cancelled_at), "dd/MM/yyyy HH:mm")}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {invoice.status === "authorized" && invoice.pdf_url && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider"
                        onClick={() => window.open(invoice.pdf_url!, "_blank", "noopener,noreferrer")}
                      >
                        PDF
                      </Button>
                    )}
                    {invoice.status === "authorized" && invoice.xml_url && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider"
                        onClick={() => window.open(invoice.xml_url!, "_blank", "noopener,noreferrer")}
                      >
                        XML
                      </Button>
                    )}
                    {invoice.status === "authorized" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={cancelInvoiceMutation.isPending}
                        className="h-8 px-3 rounded-lg text-[9px] font-black uppercase tracking-wider border-destructive/30 text-destructive hover:bg-destructive hover:text-white"
                        onClick={() => {
                          const reason = window.prompt("Informe o motivo do cancelamento:", "Cancelamento solicitado pelo cliente") || "";
                          if (!reason.trim()) return;
                          if (!window.confirm("Confirmar cancelamento desta NF?")) return;
                          cancelInvoiceMutation.mutate({ invoice, reason: reason.trim() });
                        }}
                      >
                        Cancelar NF
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
