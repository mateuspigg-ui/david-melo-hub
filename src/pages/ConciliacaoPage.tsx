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
import { Plus, Search, Building2, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";

const currencyFmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

type Reconciliation = {
  id: string;
  transaction_date: string;
  amount: number;
  bank_description: string | null;
  reconciliation_status: string;
  notes: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
};

export default function ConciliacaoPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ transaction_date: "", amount: "", bank_description: "", notes: "" });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["bank_reconciliation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_reconciliation")
        .select("*")
        .order("transaction_date", { ascending: false });
      if (error) throw error;
      return data as Reconciliation[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bank_reconciliation").insert({
        transaction_date: form.transaction_date,
        amount: parseFloat(form.amount),
        bank_description: form.bank_description || null,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank_reconciliation"] });
      setDialogOpen(false);
      setForm({ transaction_date: "", amount: "", bank_description: "", notes: "" });
      toast({ title: "Transação adicionada" });
    },
    onError: () => toast({ title: "Erro ao criar transação", variant: "destructive" }),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, current }: { id: string; current: string }) => {
      const newStatus = current === "conciliado" ? "nao_conciliado" : "conciliado";
      const { error } = await supabase.from("bank_reconciliation").update({ reconciliation_status: newStatus }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank_reconciliation"] });
      toast({ title: "Status atualizado" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bank_reconciliation").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank_reconciliation"] });
      toast({ title: "Transação excluída" });
    },
  });

  const filtered = items.filter((item) => {
    const matchSearch = `${item.bank_description || ""} ${item.notes || ""}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || item.reconciliation_status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalConciliado = items.filter((i) => i.reconciliation_status === "conciliado").reduce((s, i) => s + i.amount, 0);
  const totalNao = items.filter((i) => i.reconciliation_status === "nao_conciliado").reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-foreground">Conciliação Bancária</h1>
          <p className="text-sm text-muted-foreground mt-1">Reconciliação de transações</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="bg-gold hover:bg-gold-light text-dark font-medium">
          <Plus className="w-4 h-4 mr-2" /> Nova Transação
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-xl p-4 border border-border/50">
          <p className="text-xs text-muted-foreground">Conciliado</p>
          <p className="text-xl font-display text-emerald-400 mt-1">{currencyFmt(totalConciliado)}</p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border/50">
          <p className="text-xs text-muted-foreground">Não Conciliado</p>
          <p className="text-xl font-display text-amber-400 mt-1">{currencyFmt(totalNao)}</p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card border-border/50" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48 bg-card border-border/50"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="conciliado">Conciliado</SelectItem>
            <SelectItem value="nao_conciliado">Não Conciliado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 bg-card rounded-xl animate-pulse border border-border/50" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-xl p-12 border border-border/50 text-center">
          <Building2 className="w-10 h-10 mx-auto text-gold/40 mb-2" />
          <p className="text-muted-foreground">Nenhuma transação encontrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div key={item.id} className="flex items-center justify-between p-4 bg-card rounded-xl border border-border/50">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${item.reconciliation_status === "conciliado" ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
                  {item.reconciliation_status === "conciliado" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-amber-400" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-foreground text-sm">{item.bank_description || "Sem descrição"}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(item.transaction_date + "T12:00:00"), "dd/MM/yyyy")}
                    {item.notes && ` · ${item.notes}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`font-display text-sm ${item.amount >= 0 ? "text-emerald-400" : "text-destructive"}`}>
                  {currencyFmt(item.amount)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className={`text-xs ${item.reconciliation_status === "conciliado" ? "border-emerald-500/30 text-emerald-400" : "border-amber-500/30 text-amber-400"}`}
                  onClick={() => toggleStatusMutation.mutate({ id: item.id, current: item.reconciliation_status })}
                >
                  {item.reconciliation_status === "conciliado" ? "Conciliado" : "Conciliar"}
                </Button>
                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(item.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border/50 max-w-md">
          <DialogHeader><DialogTitle className="font-display text-foreground">Nova Transação</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Data</Label><Input type="date" value={form.transaction_date} onChange={(e) => setForm({ ...form, transaction_date: e.target.value })} className="bg-muted/30 border-border/50" /></div>
              <div><Label>Valor</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="bg-muted/30 border-border/50" /></div>
            </div>
            <div><Label>Descrição bancária</Label><Input value={form.bank_description} onChange={(e) => setForm({ ...form, bank_description: e.target.value })} className="bg-muted/30 border-border/50" /></div>
            <div><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="bg-muted/30 border-border/50" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.transaction_date || !form.amount} className="bg-gold hover:bg-gold-light text-dark">Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
