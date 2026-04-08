import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Plus, Search, DollarSign, Calendar, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Payment = {
  id: string;
  total_event_value: number;
  installment_count: number;
  has_entry_payment: boolean | null;
  entry_amount: number | null;
  entry_date: string | null;
  client_id: string | null;
  event_id: string | null;
  created_at: string;
  clients?: { first_name: string; last_name: string } | null;
  events?: { title: string } | null;
};

type Installment = {
  id: string;
  payment_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  status: string;
  paid_at: string | null;
};

const currencyFmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function PagamentosPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // form state
  const [form, setForm] = useState({
    total_event_value: "",
    installment_count: "1",
    has_entry_payment: false,
    entry_amount: "",
    entry_date: "",
    client_id: "",
    event_id: "",
  });

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, clients(first_name, last_name), events(title)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Payment[];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-select"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, first_name, last_name").order("first_name");
      return data || [];
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["events-select"],
    queryFn: async () => {
      const { data } = await supabase.from("events").select("id, title").order("title");
      return data || [];
    },
  });

  const { data: installments = [] } = useQuery({
    queryKey: ["installments", expandedId],
    enabled: !!expandedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_installments")
        .select("*")
        .eq("payment_id", expandedId!)
        .order("installment_number");
      if (error) throw error;
      return data as Installment[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const totalValue = parseFloat(form.total_event_value);
      const count = parseInt(form.installment_count);
      const hasEntry = form.has_entry_payment;
      const entryAmount = hasEntry ? parseFloat(form.entry_amount) : null;

      const { data: payment, error } = await supabase
        .from("payments")
        .insert({
          total_event_value: totalValue,
          installment_count: count,
          has_entry_payment: hasEntry,
          entry_amount: entryAmount,
          entry_date: hasEntry && form.entry_date ? form.entry_date : null,
          client_id: form.client_id || null,
          event_id: form.event_id || null,
        })
        .select()
        .single();
      if (error) throw error;

      // Generate installments
      const remaining = hasEntry && entryAmount ? totalValue - entryAmount : totalValue;
      const perInstallment = remaining / count;
      const today = new Date();
      const installmentsData = Array.from({ length: count }, (_, i) => {
        const due = new Date(today);
        due.setMonth(due.getMonth() + i + 1);
        return {
          payment_id: payment.id,
          installment_number: i + 1,
          due_date: due.toISOString().split("T")[0],
          amount: Math.round(perInstallment * 100) / 100,
          status: "pending",
        };
      });

      const { error: instError } = await supabase.from("payment_installments").insert(installmentsData);
      if (instError) throw instError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Pagamento criado com sucesso" });
    },
    onError: () => toast({ title: "Erro ao criar pagamento", variant: "destructive" }),
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
      qc.invalidateQueries({ queryKey: ["installments"] });
      toast({ title: "Parcela marcada como paga" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("payment_installments").delete().eq("payment_id", id);
      const { error } = await supabase.from("payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      setExpandedId(null);
      toast({ title: "Pagamento excluído" });
    },
  });

  const resetForm = () =>
    setForm({ total_event_value: "", installment_count: "1", has_entry_payment: false, entry_amount: "", entry_date: "", client_id: "", event_id: "" });

  const filtered = payments.filter((p) => {
    const clientName = p.clients ? `${p.clients.first_name} ${p.clients.last_name}` : "";
    const eventTitle = p.events?.title || "";
    return `${clientName} ${eventTitle}`.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-foreground">Pagamentos</h1>
          <p className="text-sm text-muted-foreground mt-1">Controle de pagamentos e parcelas</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="bg-gold hover:bg-gold-light text-dark font-medium">
          <Plus className="w-4 h-4 mr-2" /> Novo Pagamento
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por cliente ou evento..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card border-border/50" />
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-card rounded-xl animate-pulse border border-border/50" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-xl p-12 border border-border/50 text-center">
          <DollarSign className="w-10 h-10 mx-auto text-gold/40 mb-2" />
          <p className="text-muted-foreground">Nenhum pagamento encontrado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const expanded = expandedId === p.id;
            return (
              <div key={p.id} className="bg-card rounded-xl border border-border/50 overflow-hidden transition-all">
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedId(expanded ? null : p.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-gold" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        {p.clients ? `${p.clients.first_name} ${p.clients.last_name}` : "Sem cliente"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.events?.title || "Sem evento"} · {p.installment_count} parcela(s)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-display text-gold text-lg">{currencyFmt(p.total_event_value)}</p>
                      {p.has_entry_payment && p.entry_amount && (
                        <p className="text-xs text-muted-foreground">Entrada: {currencyFmt(p.entry_amount)}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(p.id); }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-border/50 p-4 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Parcelas</p>
                    {installments.map((inst) => (
                      <div key={inst.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/20">
                        <div className="flex items-center gap-3">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">Parcela {inst.installment_number}</p>
                            <p className="text-xs text-muted-foreground">
                              Vence em {format(new Date(inst.due_date + "T12:00:00"), "dd/MM/yyyy")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-sm">{currencyFmt(inst.amount)}</span>
                          {inst.status === "paid" ? (
                            <Badge className="bg-emerald-500/20 text-emerald-400 border-0">Pago</Badge>
                          ) : (
                            <Button size="sm" variant="outline" className="text-xs border-gold/30 text-gold hover:bg-gold/10" onClick={() => markPaidMutation.mutate(inst.id)}>
                              Marcar pago
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border/50 max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground">Novo Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Valor total do evento</Label>
              <Input type="number" placeholder="0,00" value={form.total_event_value} onChange={(e) => setForm({ ...form, total_event_value: e.target.value })} className="bg-muted/30 border-border/50" />
            </div>
            <div>
              <Label>Número de parcelas</Label>
              <Input type="number" min="1" value={form.installment_count} onChange={(e) => setForm({ ...form, installment_count: e.target.value })} className="bg-muted/30 border-border/50" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.has_entry_payment} onCheckedChange={(v) => setForm({ ...form, has_entry_payment: v })} />
              <Label>Pagamento de entrada</Label>
            </div>
            {form.has_entry_payment && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Valor da entrada</Label>
                  <Input type="number" value={form.entry_amount} onChange={(e) => setForm({ ...form, entry_amount: e.target.value })} className="bg-muted/30 border-border/50" />
                </div>
                <div>
                  <Label>Data da entrada</Label>
                  <Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} className="bg-muted/30 border-border/50" />
                </div>
              </div>
            )}
            <div>
              <Label>Cliente</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger className="bg-muted/30 border-border/50"><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Evento</Label>
              <Select value={form.event_id} onValueChange={(v) => setForm({ ...form, event_id: v })}>
                <SelectTrigger className="bg-muted/30 border-border/50"><SelectValue placeholder="Selecionar evento" /></SelectTrigger>
                <SelectContent>
                  {events.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.total_event_value} className="bg-gold hover:bg-gold-light text-dark">
              Criar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
