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
    <div className="space-y-8 animate-fade-in max-w-[1600px] mx-auto p-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div>
          <h1 className="text-3xl font-display text-foreground tracking-tight flex items-center gap-3">
            <ArrowDownCircle className="h-8 w-8 text-gold" />
            Fluxo de Recebimentos
          </h1>
          <p className="text-sm text-muted-foreground mt-1 font-body font-medium">Monitoramento de liquidez e entradas pendentes</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-white premium-shadow rounded-2xl p-6 border border-border/40 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-2 h-full bg-gold/40" />
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">A Receber (Projetado)</p>
          <p className="text-3xl font-display text-foreground mt-1 group-hover:text-gold transition-colors">{currencyFmt(totalPending)}</p>
        </div>
        <div className="bg-white premium-shadow rounded-2xl p-6 border border-border/40 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500/40" />
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold text-emerald-600">Total Recebido (Auditado)</p>
          <p className="text-3xl font-display text-foreground mt-1 group-hover:text-emerald-500 transition-colors">{currencyFmt(totalReceived)}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por cliente ou evento..." 
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
            <SelectItem value="pending" className="font-medium text-xs font-bold uppercase text-gold">Pendentes</SelectItem>
            <SelectItem value="paid" className="font-medium text-xs font-bold uppercase text-emerald-500">Recebidos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-white rounded-2xl animate-pulse border border-border/40 premium-shadow" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white premium-shadow rounded-2xl p-20 border border-border/40 text-center flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
            <ArrowDownCircle className="w-8 h-8 text-muted-foreground/30" />
          </div>
          <p className="text-foreground font-bold text-lg">Nenhum registro encontrado</p>
          <p className="text-sm text-muted-foreground/60 mt-1 font-medium">Tente ajustar seus filtros de busca para encontrar o que precisa.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((inst) => {
            const overdue = inst.status === "pending" && isPast(new Date(inst.due_date + "T23:59:59")) && !isToday(new Date(inst.due_date + "T12:00:00"));
            const clientName = inst.payments?.clients ? `${inst.payments.clients.first_name} ${inst.payments.clients.last_name}` : "Cliente Especial";
            return (
              <div key={inst.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-6 bg-white rounded-2xl border transition-all duration-300 hover:scale-[1.01] hover:shadow-xl group ${overdue ? "border-destructive/30 bg-destructive/[0.02]" : "border-border/40 premium-shadow"}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors shadow-sm ${overdue ? "bg-destructive/10 text-destructive" : "bg-gold/10 text-gold group-hover:bg-gold group-hover:text-white"}`}>
                    <ArrowDownCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground text-sm tracking-tight leading-tight uppercase font-display">{clientName}</h4>
                    <div className="flex items-center gap-2 mt-1.5 line-clamp-1">
                      <p className="text-[10px] font-bold text-gold uppercase tracking-wider">
                        {inst.payments?.events?.title || "Evento s/ Título"}
                      </p>
                      <span className="text-muted-foreground/30 text-[10px]">•</span>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider opacity-60">
                        Parcela {inst.installment_number.toString().padStart(2, '0')}
                      </p>
                      <span className="text-muted-foreground/30 text-[10px]">•</span>
                      <p className={`text-[10px] font-bold uppercase tracking-wider ${overdue ? "text-destructive" : "text-muted-foreground opacity-60"}`}>
                        Venc: {format(new Date(inst.due_date + "T12:00:00"), "dd/MM/yyyy")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-6 mt-4 sm:mt-0">
                  <div className="text-right">
                    <p className={`text-lg font-display tabular-nums tracking-tighter ${overdue ? "text-destructive" : "text-foreground"}`}>{currencyFmt(inst.amount)}</p>
                    {overdue && <p className="text-[8px] font-black text-destructive uppercase tracking-[0.2em] mt-0.5 animate-pulse">Título Atrasado</p>}
                  </div>
                  
                  <div className="min-w-[120px] flex justify-end">
                    {inst.status === "paid" ? (
                      <Badge className="bg-emerald-500 text-white border-0 font-bold uppercase text-[9px] tracking-widest px-3 py-1">Confirmado</Badge>
                    ) : (
                      <Button size="sm" variant="outline" className="h-9 border-gold/30 text-gold hover:bg-gold hover:text-white font-bold uppercase text-[9px] tracking-widest rounded-lg px-4 transition-all shadow-sm" onClick={() => markPaidMutation.mutate(inst.id)}>
                        <Check className="w-3 h-3 mr-2" /> Efetivar Baixa
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
