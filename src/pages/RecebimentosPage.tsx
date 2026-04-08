import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Search, ArrowDownCircle, Check } from "lucide-react";
import { format, isPast, isToday } from "date-fns";

const currencyFmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

type InstallmentRow = {
  id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  status: string;
  paid_at: string | null;
  payment_id: string;
  payments: {
    total_event_value: number;
    clients: { first_name: string; last_name: string } | null;
    events: { title: string } | null;
  } | null;
};

export default function RecebimentosPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: installments = [], isLoading } = useQuery({
    queryKey: ["receivables"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_installments")
        .select("*, payments(total_event_value, clients(first_name, last_name), events(title))")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data as InstallmentRow[];
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("payment_installments")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["receivables"] });
      toast({ title: "Recebimento confirmado" });
    },
  });

  const filtered = installments.filter((inst) => {
    const clientName = inst.payments?.clients ? `${inst.payments.clients.first_name} ${inst.payments.clients.last_name}` : "";
    const eventTitle = inst.payments?.events?.title || "";
    const matchSearch = `${clientName} ${eventTitle}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || inst.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPending = installments.filter((i) => i.status === "pending").reduce((s, i) => s + i.amount, 0);
  const totalReceived = installments.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display text-foreground">Recebimentos</h1>
        <p className="text-sm text-muted-foreground mt-1">Valores a receber de clientes</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-xl p-4 border border-border/50">
          <p className="text-xs text-muted-foreground">A Receber</p>
          <p className="text-xl font-display text-gold mt-1">{currencyFmt(totalPending)}</p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border/50">
          <p className="text-xs text-muted-foreground">Recebido</p>
          <p className="text-xl font-display text-emerald-400 mt-1">{currencyFmt(totalReceived)}</p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por cliente ou evento..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card border-border/50" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 bg-card border-border/50"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="paid">Recebido</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-14 bg-card rounded-xl animate-pulse border border-border/50" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-xl p-12 border border-border/50 text-center">
          <ArrowDownCircle className="w-10 h-10 mx-auto text-gold/40 mb-2" />
          <p className="text-muted-foreground">Nenhum recebimento encontrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((inst) => {
            const overdue = inst.status === "pending" && isPast(new Date(inst.due_date + "T23:59:59")) && !isToday(new Date(inst.due_date + "T12:00:00"));
            const clientName = inst.payments?.clients ? `${inst.payments.clients.first_name} ${inst.payments.clients.last_name}` : "Sem cliente";
            return (
              <div key={inst.id} className={`flex items-center justify-between p-4 bg-card rounded-xl border transition-colors ${overdue ? "border-destructive/40" : "border-border/50"}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${overdue ? "bg-destructive/10" : "bg-gold/10"}`}>
                    <ArrowDownCircle className={`w-4 h-4 ${overdue ? "text-destructive" : "text-gold"}`} />
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-sm">{clientName}</p>
                    <p className="text-xs text-muted-foreground">
                      {inst.payments?.events?.title || "Sem evento"} · Parcela {inst.installment_number} · {format(new Date(inst.due_date + "T12:00:00"), "dd/MM/yyyy")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-display text-sm">{currencyFmt(inst.amount)}</span>
                  {inst.status === "paid" ? (
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-0">Recebido</Badge>
                  ) : (
                    <Button size="sm" variant="outline" className="text-xs border-gold/30 text-gold hover:bg-gold/10" onClick={() => markPaidMutation.mutate(inst.id)}>
                      <Check className="w-3 h-3 mr-1" /> Confirmar
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
