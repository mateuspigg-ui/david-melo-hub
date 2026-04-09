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
      const totalValue = Number(String(form.total_event_value).replace(',', '.'));
      const count = Number(form.installment_count);
      const hasEntry = form.has_entry_payment;
      const entryAmount = hasEntry ? Number(String(form.entry_amount).replace(',', '.')) : null;

      if (!Number.isFinite(totalValue) || totalValue <= 0) {
        throw new Error('Informe um valor total válido maior que zero.');
      }

      if (!Number.isInteger(count) || count < 1) {
        throw new Error('Informe uma quantidade de parcelas válida (mínimo 1).');
      }

      if (hasEntry) {
        if (!Number.isFinite(entryAmount as number) || (entryAmount as number) <= 0) {
          throw new Error('Informe um valor de entrada válido.');
        }
        if ((entryAmount as number) > totalValue) {
          throw new Error('O valor de entrada não pode ser maior que o valor total.');
        }
        if (!form.entry_date) {
          throw new Error('Informe a data da entrada.');
        }
      }

      const paymentId = crypto.randomUUID();

      const { error } = await supabase
        .from('payments')
        .insert({
          id: paymentId,
          total_event_value: totalValue,
          installment_count: count,
          has_entry_payment: hasEntry,
          entry_amount: entryAmount,
          entry_date: hasEntry && form.entry_date ? form.entry_date : null,
          client_id: form.client_id || null,
          event_id: form.event_id || null,
        });
      if (error) throw error;

      // Generate installments
      const remaining = hasEntry && entryAmount ? totalValue - entryAmount : totalValue;
      if (remaining < 0) {
        throw new Error('Não foi possível calcular as parcelas. Verifique os valores informados.');
      }
      const perInstallment = remaining / count;
      const today = new Date();
      const installmentsData = Array.from({ length: count }, (_, i) => {
        const due = new Date(today);
        due.setMonth(due.getMonth() + i + 1);
        return {
          payment_id: paymentId,
          installment_number: i + 1,
          due_date: due.toISOString().split("T")[0],
          amount: Math.round(perInstallment * 100) / 100,
          status: "pending",
        };
      });

      const { error: instError } = await supabase.from('payment_installments').insert(installmentsData);
      if (instError) {
        await supabase.from('payments').delete().eq('id', paymentId);
        throw instError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      // Sync Dashboard
      qc.invalidateQueries({ queryKey: ["dashboard_kpis"] });
      qc.invalidateQueries({ queryKey: ["dashboard_metrics"] });
      
      setDialogOpen(false);
      resetForm();
      toast({ title: "Pagamento criado com sucesso", style: { backgroundColor: '#C5A059', color: '#fff' } });
    },
    onError: (e: any) => toast({ title: "Erro ao criar pagamento", description: e?.message || 'Verifique os dados informados.', variant: "destructive" }),
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
      qc.invalidateQueries({ queryKey: ["dashboard_kpis"] });
      toast({ title: "Mês auditado e baixado com sucesso!", style: { backgroundColor: '#10b981', color: '#fff' } });
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
      qc.invalidateQueries({ queryKey: ["dashboard_kpis"] });
      qc.invalidateQueries({ queryKey: ["dashboard_metrics"] });
      setExpandedId(null);
      toast({ title: "Contrato removido do ecossistema.", variant: "destructive" });
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
    <div className="space-y-8 animate-fade-in max-w-[1600px] mx-auto p-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div>
          <h1 className="text-4xl font-display text-foreground tracking-tighter uppercase flex items-center gap-3">
            <DollarSign className="h-8 w-8 text-gold" />
            Gestão de Recebíveis
          </h1>
          <p className="text-sm text-muted-foreground mt-1 font-body font-medium">Controle estratégico de contratos e parcelas</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="bg-gradient-gold hover:opacity-90 text-white font-bold h-11 px-8 rounded-lg shadow-gold uppercase text-[11px] tracking-widest">
          <Plus className="w-4 h-4 mr-2" /> Novo Contrato
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input 
          placeholder="Buscar por cliente ou evento..." 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
          className="pl-11 bg-secondary/30 border-border/40 focus:border-gold h-11 rounded-xl shadow-sm" 
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-white rounded-2xl animate-pulse border border-border/40 premium-shadow" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white premium-shadow rounded-2xl p-20 border border-border/40 text-center flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
            <DollarSign className="w-8 h-8 text-muted-foreground/30" />
          </div>
          <p className="text-foreground font-bold text-lg">Nenhum contrato encontrado</p>
          <p className="text-sm text-muted-foreground/60 mt-1 font-medium">Sua base de contratos ativos está vazia no momento.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((p) => {
            const expanded = expandedId === p.id;
            return (
              <div key={p.id} className="bg-white rounded-2xl border border-border/40 premium-shadow overflow-hidden transition-all duration-300">
                <div
                  className="flex items-center justify-between p-6 cursor-pointer hover:bg-secondary/20 transition-colors"
                  onClick={() => setExpandedId(expanded ? null : p.id)}
                >
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center shadow-sm">
                      <DollarSign className="w-6 h-6 text-gold" />
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground text-base tracking-tight leading-tight uppercase">
                        {p.clients ? `${p.clients.first_name} ${p.clients.last_name}` : "Sem cliente vinculado"}
                      </h4>
                      <div className="flex items-center gap-2 mt-1.5">
                        <p className="text-[10px] font-bold text-gold uppercase tracking-wider">
                          {p.events?.title || "Evento s/ Título"}
                        </p>
                        <span className="text-muted-foreground/30 text-[10px]">•</span>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider opacity-60">
                          {p.installment_count} parcela{p.installment_count !== 1 ? 's' : ''} programada{p.installment_count !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="font-display text-foreground text-xl tracking-tighter">{currencyFmt(p.total_event_value)}</p>
                      {p.has_entry_payment && p.entry_amount && (
                        <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest mt-0.5">Entrada: {currencyFmt(p.entry_amount)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 text-destructive/40 hover:text-destructive hover:bg-destructive/5 rounded-xl transition-colors"
                        onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(p.id); }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center transition-all ${expanded ? 'bg-gold/10 text-gold' : 'bg-secondary/50 text-muted-foreground'}`}>
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>
                </div>

                {expanded && (
                  <div className="bg-secondary/10 border-t border-border/20 p-6 space-y-3 shadow-inner">
                    <div className="flex items-center justify-between mb-2">
                       <h5 className="text-[10px] font-bold text-foreground/50 uppercase tracking-[0.2em]">Cronograma de Liquidação</h5>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                      {installments.map((inst) => (
                        <div key={inst.id} className="flex items-center justify-between p-4 rounded-xl bg-white border border-border/20 shadow-sm transition-all hover:border-gold/30">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-secondary/30 flex items-center justify-center">
                              <Calendar className="w-4 h-4 text-muted-foreground/60" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-foreground uppercase tracking-tight">Parcela {inst.installment_number.toString().padStart(2, '0')}</p>
                              <p className={`text-[9px] font-bold uppercase tracking-wider mt-0.5 ${inst.status === 'paid' ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                                {format(new Date(inst.due_date + "T12:00:00"), "dd MMM yyyy", { locale: ptBR })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="font-bold text-sm tracking-tighter">{currencyFmt(inst.amount)}</span>
                            {inst.status === "paid" ? (
                              <Badge className="bg-emerald-500 text-white border-none font-bold uppercase text-[8px] tracking-widest px-2.5 py-0.5">Auditado</Badge>
                            ) : (
                              <Button size="sm" variant="outline" className="h-8 border-gold/30 text-gold hover:bg-gold text-white font-bold uppercase text-[9px] tracking-widest rounded-lg transition-all" onClick={() => markPaidMutation.mutate(inst.id)}>
                                Baixar / OK
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] p-0 rounded-2xl shadow-2xl border-border/40 bg-background overflow-hidden font-body flex flex-col">
          <div className="bg-gradient-gold p-8 text-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-display text-white">Novo Contrato Comercial</DialogTitle>
              <p className="text-white/80 text-xs mt-1 font-medium font-body tracking-wide uppercase">Defina o cronograma financeiro deste evento.</p>
            </DialogHeader>
          </div>
          <div className="p-6 md:p-8 space-y-6 overflow-y-auto min-h-0">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Valor Total *</Label>
                <Input 
                  type="number" 
                  placeholder="0,00" 
                  value={form.total_event_value} 
                  onChange={(e) => setForm({ ...form, total_event_value: e.target.value })} 
                  className="bg-secondary/30 border-border/40 focus:border-gold h-11 h-11 font-bold text-gold" 
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Parcelas Máx.</Label>
                <Input 
                  type="number" 
                  min="1" 
                  value={form.installment_count} 
                  onChange={(e) => setForm({ ...form, installment_count: e.target.value })} 
                  className="bg-secondary/30 border-border/40 focus:border-gold h-11 h-11 font-medium" 
                />
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 bg-secondary/20 rounded-xl border border-border/10">
              <Switch checked={form.has_entry_payment} onCheckedChange={(v) => setForm({ ...form, has_entry_payment: v })} />
              <Label className="text-xs font-bold text-foreground">Haverá Pagamento de Entrada?</Label>
            </div>

            {form.has_entry_payment && (
              <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 p-4 bg-secondary/10 rounded-xl border border-border/10">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Valor Entrada</Label>
                  <Input 
                    type="number" 
                    value={form.entry_amount} 
                    onChange={(e) => setForm({ ...form, entry_amount: e.target.value })} 
                    className="bg-background border-border/40 h-10 text-xs font-bold" 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Data Entrada</Label>
                  <Input 
                    type="date" 
                    value={form.entry_date} 
                    onChange={(e) => setForm({ ...form, entry_date: e.target.value })} 
                    className="bg-background border-border/40 h-10 text-xs" 
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Titular do Contrato</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger className="bg-secondary/30 border-border/40 h-11 rounded-lg">
                  <SelectValue placeholder="Selecionar cliente" />
                </SelectTrigger>
                <SelectContent className="bg-white shadow-2xl border-border/40">
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="font-bold text-xs uppercase">{c.first_name} {c.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Evento Relacionado</Label>
              <Select value={form.event_id} onValueChange={(v) => setForm({ ...form, event_id: v })}>
                <SelectTrigger className="bg-secondary/30 border-border/40 h-11 rounded-lg">
                  <SelectValue placeholder="Vincular evento ativo" />
                </SelectTrigger>
                <SelectContent className="bg-white shadow-2xl border-border/40">
                  {events.map((e) => (
                    <SelectItem key={e.id} value={e.id} className="font-bold text-xs uppercase">{e.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-border/10">
              <Button variant="ghost" onClick={() => setDialogOpen(false)} className="text-muted-foreground font-bold uppercase text-[10px] tracking-widest">Cancelar</Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!form.total_event_value || createMutation.isPending || (form.has_entry_payment && (!form.entry_amount || !form.entry_date))}
                className="bg-gold hover:bg-gold-light text-white font-bold h-11 px-10 rounded-lg shadow-gold uppercase text-[11px] tracking-widest transition-all"
              >
                Gerar Contrato
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
