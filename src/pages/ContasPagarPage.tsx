import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Plus, Search, Receipt, Trash2, Check } from "lucide-react";
import { format, isPast, isToday } from "date-fns";

const currencyFmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

type AccountPayable = {
  id: string;
  description: string;
  amount: number;
  due_date: string;
  payment_status: string;
  paid_at: string | null;
  supplier_id: string | null;
  created_at: string;
  suppliers?: { company_name: string } | null;
};

export default function ContasPagarPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ description: "", amount: "", due_date: "", supplier_id: "" });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["accounts_payable"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts_payable")
        .select("*, suppliers(company_name)")
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

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("accounts_payable").insert({
        description: form.description,
        amount: parseFloat(form.amount),
        due_date: form.due_date,
        supplier_id: form.supplier_id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts_payable"] });
      setDialogOpen(false);
      setForm({ description: "", amount: "", due_date: "", supplier_id: "" });
      toast({ title: "Conta criada com sucesso" });
    },
    onError: () => toast({ title: "Erro ao criar conta", variant: "destructive" }),
  });

  const markPaidMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("accounts_payable")
        .update({ payment_status: "pago", paid_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts_payable"] });
      toast({ title: "Conta marcada como paga" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accounts_payable").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts_payable"] });
      toast({ title: "Conta excluída" });
    },
  });

  const filtered = items.filter((item) => {
    const matchSearch = `${item.description} ${item.suppliers?.company_name || ""}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || item.payment_status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPending = items.filter((i) => i.payment_status === "nao_pago").reduce((s, i) => s + i.amount, 0);
  const totalOverdue = items.filter((i) => i.payment_status === "nao_pago" && isPast(new Date(i.due_date + "T23:59:59")) && !isToday(new Date(i.due_date + "T12:00:00"))).reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-8 animate-fade-in max-w-[1600px] mx-auto p-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div>
          <h1 className="text-4xl font-display text-foreground tracking-tighter uppercase flex items-center gap-3">
            <Receipt className="h-8 w-8 text-gold" />
            Contas a Pagar
          </h1>
          <p className="text-sm text-muted-foreground mt-1 font-body font-medium">Controle estratégico de despesas e obrigações</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="bg-gradient-gold hover:opacity-90 text-white font-bold h-11 px-8 rounded-lg shadow-gold uppercase text-[11px] tracking-widest">
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
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por descrição ou fornecedor..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            className="pl-11 bg-secondary/30 border-border/40 focus:border-gold h-11 rounded-xl shadow-sm" 
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48 bg-secondary/30 border-border/40 h-11 rounded-xl font-medium focus:ring-gold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-white border-border/40 shadow-2xl">
            <SelectItem value="all" className="font-medium text-xs font-bold uppercase">Todos os Status</SelectItem>
            <SelectItem value="nao_pago" className="font-medium text-xs font-bold uppercase text-gold">Pendentes</SelectItem>
            <SelectItem value="pago" className="font-medium text-xs font-bold uppercase text-emerald-500">Pagos</SelectItem>
          </SelectContent>
        </Select>
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
            const overdue = item.payment_status === "nao_pago" && isPast(new Date(item.due_date + "T23:59:59")) && !isToday(new Date(item.due_date + "T12:00:00"));
            return (
              <div key={item.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-6 bg-white rounded-2xl border transition-all duration-300 hover:scale-[1.01] hover:shadow-xl group ${overdue ? "border-destructive/30 bg-destructive/[0.02]" : "border-border/40 premium-shadow"}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors shadow-sm ${overdue ? "bg-destructive/10 text-destructive" : "bg-gold/10 text-gold group-hover:bg-gold group-hover:text-white"}`}>
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground text-sm tracking-tight leading-tight uppercase line-clamp-1">{item.description}</h4>
                    <div className="flex items-center gap-2 mt-1.5">
                       <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider opacity-70">
                        {item.suppliers?.company_name || "Sem fornecedor"}
                      </p>
                      <span className="text-muted-foreground/30 text-[10px]">•</span>
                      <p className={`text-[10px] font-bold uppercase tracking-wider ${overdue ? "text-destructive" : "text-muted-foreground opacity-70"}`}>
                        Vencimento: {format(new Date(item.due_date + "T12:00:00"), "dd MMM yyyy")}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between sm:justify-end gap-6 mt-4 sm:mt-0">
                  <div className="text-right">
                    <p className={`text-lg font-display tabular-nums tracking-tighter ${overdue ? "text-destructive" : "text-foreground"}`}>{currencyFmt(item.amount)}</p>
                    {overdue && <p className="text-[8px] font-black text-destructive uppercase tracking-[0.2em] mt-0.5 animate-pulse">Título Vencido</p>}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {item.payment_status === "pago" ? (
                      <Badge className="bg-emerald-500 text-white border-0 font-bold uppercase text-[9px] tracking-widest px-3 py-1">Auditado / Pago</Badge>
                    ) : (
                      <Button size="icon" variant="outline" className="h-10 w-10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500 hover:text-white rounded-xl shadow-sm transition-all shadow-emerald-500/10" onClick={() => markPaidMutation.mutate(item.id)}>
                        <Check className="w-5 h-5" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-10 w-10 text-destructive/40 hover:text-destructive hover:bg-destructive/5 rounded-xl transition-colors" onClick={() => deleteMutation.mutate(item.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] p-0 rounded-2xl shadow-2xl border-border/40 bg-background overflow-hidden flex flex-col">
          <div className="bg-gradient-gold p-8 text-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-display text-white">Programar Despesa</DialogTitle>
              <p className="text-white/80 text-xs mt-1 font-medium font-body tracking-wide uppercase">Insira os detalhes técnicos para auditoria financeira.</p>
            </DialogHeader>
          </div>
          <div className="p-6 md:p-8 space-y-6 overflow-y-auto min-h-0">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Descrição do Título *</Label>
              <Textarea 
                value={form.description} 
                onChange={(e) => setForm({ ...form, description: e.target.value })} 
                placeholder="Ex: Pagamento de serviço de buffet, limpeza do local..."
                className="bg-secondary/30 border-border/40 focus:border-gold min-h-[80px] py-3 shadow-inner" 
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Valor do Título *</Label>
                <Input 
                  type="number" 
                  value={form.amount} 
                  onChange={(e) => setForm({ ...form, amount: e.target.value })} 
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
              <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Empresa / Fornecedor</Label>
              <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                <SelectTrigger className="bg-secondary/30 border-border/40 focus:ring-gold h-11 rounded-lg">
                  <SelectValue placeholder="Selecionar da base de dados" />
                </SelectTrigger>
                <SelectContent className="bg-white shadow-2xl border-border/40">
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id} className="font-bold text-xs uppercase">{s.company_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-border/10">
              <Button variant="ghost" onClick={() => setDialogOpen(false)} className="text-muted-foreground font-bold uppercase text-[10px] tracking-widest">Cancelar</Button>
              <Button onClick={() => createMutation.mutate()} disabled={!form.description || !form.amount || !form.due_date} className="bg-gold hover:bg-gold-light text-white font-bold h-11 px-10 rounded-lg shadow-gold uppercase text-[11px] tracking-widest">
                Efetuar Registro
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
