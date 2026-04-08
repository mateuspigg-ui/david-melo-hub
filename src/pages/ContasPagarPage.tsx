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
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-foreground">Contas a Pagar</h1>
          <p className="text-sm text-muted-foreground mt-1">Controle de despesas e fornecedores</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="bg-gold hover:bg-gold-light text-dark font-medium">
          <Plus className="w-4 h-4 mr-2" /> Nova Conta
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-xl p-4 border border-border/50">
          <p className="text-xs text-muted-foreground">Total Pendente</p>
          <p className="text-xl font-display text-gold mt-1">{currencyFmt(totalPending)}</p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border/50">
          <p className="text-xs text-muted-foreground">Total Vencido</p>
          <p className="text-xl font-display text-destructive mt-1">{currencyFmt(totalOverdue)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card border-border/50" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 bg-card border-border/50"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="nao_pago">Pendente</SelectItem>
            <SelectItem value="pago">Pago</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-card rounded-xl animate-pulse border border-border/50" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-xl p-12 border border-border/50 text-center">
          <Receipt className="w-10 h-10 mx-auto text-gold/40 mb-2" />
          <p className="text-muted-foreground">Nenhuma conta encontrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const overdue = item.payment_status === "nao_pago" && isPast(new Date(item.due_date + "T23:59:59")) && !isToday(new Date(item.due_date + "T12:00:00"));
            return (
              <div key={item.id} className={`flex items-center justify-between p-4 bg-card rounded-xl border transition-colors ${overdue ? "border-destructive/40" : "border-border/50"}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${overdue ? "bg-destructive/10" : "bg-gold/10"}`}>
                    <Receipt className={`w-4 h-4 ${overdue ? "text-destructive" : "text-gold"}`} />
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-sm">{item.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.suppliers?.company_name || "Sem fornecedor"} · Vence {format(new Date(item.due_date + "T12:00:00"), "dd/MM/yyyy")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-display text-sm">{currencyFmt(item.amount)}</span>
                  {item.payment_status === "pago" ? (
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-0">Pago</Badge>
                  ) : (
                    <Button size="icon" variant="ghost" className="text-emerald-400 hover:text-emerald-300" onClick={() => markPaidMutation.mutate(item.id)}>
                      <Check className="w-4 h-4" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(item.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border/50 max-w-md">
          <DialogHeader><DialogTitle className="font-display text-foreground">Nova Conta a Pagar</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-muted/30 border-border/50" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Valor</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="bg-muted/30 border-border/50" /></div>
              <div><Label>Vencimento</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="bg-muted/30 border-border/50" /></div>
            </div>
            <div>
              <Label>Fornecedor</Label>
              <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                <SelectTrigger className="bg-muted/30 border-border/50"><SelectValue placeholder="Selecionar fornecedor" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.company_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.description || !form.amount || !form.due_date} className="bg-gold hover:bg-gold-light text-dark">Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
