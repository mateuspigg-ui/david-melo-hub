import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { maskCurrencyInput, parseCurrencyInput, formatCurrencyInput } from "@/lib/currencyInput";
import { Plus, Trash2 } from "lucide-react";

const currencyFmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

type Props = { open: boolean; onOpenChange: (v: boolean) => void; paymentId: string; onSaved?: () => void };

type InstallmentPlanItem = {
  installment_number: number;
  due_date: string;
  amount: string;
  status?: string;
  paid_at?: string | null;
};

export default function EditRecebimentoDialog({ open, onOpenChange, paymentId, onSaved }: Props) {
  const qc = useQueryClient();

  const [totalEventValue, setTotalEventValue] = useState("");
  const [installmentCount, setInstallmentCount] = useState("1");
  const [hasEntry, setHasEntry] = useState(false);
  const [entryAmount, setEntryAmount] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [clientId, setClientId] = useState("");
  const [eventId, setEventId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [installmentPlan, setInstallmentPlan] = useState<InstallmentPlanItem[]>([]);
  const [additionalValue, setAdditionalValue] = useState("");
  const [additionalDescription, setAdditionalDescription] = useState("");

  const { data: payment } = useQuery({
    queryKey: ["cal-edit-rec", paymentId],
    queryFn: async () => {
      const { data } = await supabase.from("payments").select("*").eq("id", paymentId).single();
      return data as any;
    },
    enabled: open && !!paymentId,
  });

  const { data: installments = [] } = useQuery({
    queryKey: ["cal-edit-rec-inst", paymentId],
    queryFn: async () => {
      const { data } = await supabase.from("payment_installments").select("*").eq("payment_id", paymentId).order("installment_number");
      return data || [];
    },
    enabled: open && !!paymentId,
  });

  const { data: clients = [] } = useQuery({ queryKey: ["clients-cal-rec"], queryFn: async () => { const { data } = await supabase.from("clients").select("id, first_name, last_name").order("first_name"); return data || []; }, enabled: open });
  const { data: companies = [] } = useQuery({ queryKey: ["companies-cal-rec"], queryFn: async () => { const { data } = await (supabase as any).from("companies").select("id, legal_name, trade_name").order("trade_name"); return data || []; }, enabled: open });
  const { data: allEvents = [] } = useQuery({ queryKey: ["events-cal-rec"], queryFn: async () => { const { data } = await supabase.from("events").select("id, title, client_id").order("title"); return data || []; }, enabled: open });

  const eventsByClient = (allEvents as any[]).filter((e) => !clientId || e.client_id === clientId);

  useEffect(() => {
    if (payment && installments.length && open) {
      setTotalEventValue(payment.total_event_value != null ? formatCurrencyInput(payment.total_event_value) : "");
      setInstallmentCount(String(payment.installment_count ?? installments.length ?? 1));
      setHasEntry(!!payment.has_entry_payment);
      setEntryAmount(payment.entry_amount != null ? formatCurrencyInput(payment.entry_amount) : "");
      setEntryDate(payment.entry_date || "");
      setClientId(payment.client_id || "");
      setEventId(payment.event_id || "");
      setCompanyId(payment.company_id || "");
      setAdditionalValue(payment.additional_value != null ? formatCurrencyInput(payment.additional_value) : "");
      setAdditionalDescription(payment.additional_description || "");
      setInstallmentPlan(installments.map((inst: any) => ({
        installment_number: inst.installment_number,
        due_date: inst.due_date,
        amount: formatCurrencyInput(inst.amount),
        status: inst.status,
        paid_at: inst.paid_at,
      })));
    }
  }, [payment, installments, open]);

  const updateInstallment = (idx: number, field: string, value: string) => {
    setInstallmentPlan((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const totalValue = parseCurrencyInput(totalEventValue) || 0;
      const entryAmt = hasEntry ? (parseCurrencyInput(entryAmount) || 0) : 0;

      const { error: updateErr } = await (supabase as any).from("payments").update({
        total_event_value: totalValue,
        installment_count: installmentPlan.length || Number(installmentCount),
        has_entry_payment: hasEntry,
        entry_amount: entryAmt,
        entry_date: entryDate || null,
        client_id: clientId || null,
        event_id: eventId || null,
        company_id: companyId || null,
        additional_value: parseCurrencyInput(additionalValue) || 0,
        additional_description: additionalDescription || "",
      }).eq("id", paymentId);
      if (updateErr) throw updateErr;

      await supabase.from("payment_installments").delete().eq("payment_id", paymentId);

      if (installmentPlan.length > 0) {
        const inserts = installmentPlan.map((inst) => ({
          payment_id: paymentId,
          installment_number: inst.installment_number,
          due_date: inst.due_date,
          amount: parseCurrencyInput(inst.amount) || 0,
          status: inst.status || "pending",
        }));
        const { error: insertErr } = await (supabase as any).from("payment_installments").insert(inserts);
        if (insertErr) throw insertErr;
      }
    },
    onSuccess: () => { toast({ title: "Recebimento atualizado" }); qc.invalidateQueries({ queryKey: ["payments"] }); qc.invalidateQueries({ queryKey: ["installments"] }); onSaved?.(); onOpenChange(false); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] p-0 rounded-3xl shadow-[0_25px_60px_-12px_rgba(0,0,0,0.25)] border border-border/30 bg-background overflow-hidden flex flex-col">
        <div className="relative bg-gradient-to-r from-gold via-gold-light to-gold p-8 text-white overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djZoNnYtNmgtNnptMC0zMHY2aDZ2LTZoLTZ6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30" />
          <div className="relative flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl font-display text-white tracking-tight">Editar Recebimento</DialogTitle>
              <p className="text-white/70 text-xs mt-2 font-medium tracking-wide uppercase">Atualize os dados do recebimento</p>
            </div>
          </div>
        </div>

        <div className="p-6 overflow-y-auto min-h-0 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Cliente</Label>
              <Select value={clientId || "none"} onValueChange={(v) => { setClientId(v === "none" ? "" : v); setEventId(""); }}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem cliente</SelectItem>
                  {(clients as any[]).map((c) => <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Evento</Label>
              <Select value={eventId || "none"} onValueChange={(v) => setEventId(v === "none" ? "" : v)}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem evento</SelectItem>
                  {eventsByClient.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {companies.length > 0 && (
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Empresa</Label>
                <Select value={companyId || "none"} onValueChange={(v) => setCompanyId(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem vinculo</SelectItem>
                    {(companies as any[]).map((c) => <SelectItem key={c.id} value={c.id}>{c.trade_name || c.legal_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Valor Total (R$)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gold font-bold text-sm">R$</span>
                <Input value={totalEventValue} onChange={(e) => setTotalEventValue(maskCurrencyInput(e.target.value))} className="h-11 rounded-xl pl-10 font-bold text-gold" placeholder="0,00" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Parcelas</Label>
              <Input type="number" min="1" value={installmentCount} onChange={(e) => setInstallmentCount(e.target.value)} className="h-11 rounded-xl" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={hasEntry} onCheckedChange={setHasEntry} />
            <Label className="text-sm font-bold">Havera entrada?</Label>
          </div>

          {hasEntry && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gold/5 rounded-xl border border-gold/20">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Valor Entrada</Label>
                <Input value={entryAmount} onChange={(e) => setEntryAmount(maskCurrencyInput(e.target.value))} className="h-11 rounded-xl" placeholder="0,00" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Data Entrada</Label>
                <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="h-11 rounded-xl" />
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-gold/20 overflow-hidden">
            <div className="px-4 py-3 bg-gold/5 border-b border-gold/20">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gold">Adicional (pós-contrato)</span>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Valor Adicional (R$)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gold font-bold text-sm">R$</span>
                  <Input value={additionalValue} onChange={(e) => setAdditionalValue(maskCurrencyInput(e.target.value))} className="h-11 rounded-xl pl-10 font-bold text-gold" placeholder="0,00" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Descrição do Adicional</Label>
                <Input value={additionalDescription} onChange={(e) => setAdditionalDescription(e.target.value)} className="h-11 rounded-xl" placeholder="Ex: Acréscimo de serviço, item adicional..." />
              </div>
              {Number(parseCurrencyInput(additionalValue) || 0) > 0 && (
                <div className="flex items-center justify-between p-3 bg-gold/5 rounded-xl border border-gold/10">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Valor Final do Contrato</span>
                  <span className="text-lg font-bold text-gold">{currencyFmt((parseCurrencyInput(totalEventValue) || 0) + (parseCurrencyInput(additionalValue) || 0))}</span>
                </div>
              )}
            </div>
          </div>

          {installmentPlan.length > 0 && (
            <div className="rounded-2xl border border-gold/20 overflow-hidden">
              <div className="px-4 py-3 bg-gold/5 border-b border-gold/20 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gold">Parcelamento</span>
                <span className="text-xs font-bold text-gold">{installmentPlan.length}x parcelas</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gold/10">
                      <th className="text-left py-2 px-4 font-bold text-gold/60 uppercase tracking-wider w-10">#</th>
                      <th className="text-left py-2 px-4 font-bold text-gold/60 uppercase tracking-wider">Data</th>
                      <th className="text-right py-2 px-4 font-bold text-gold/60 uppercase tracking-wider">Valor</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {installmentPlan.map((inst, idx) => (
                      <tr key={idx} className="border-b border-gold/5 last:border-0 hover:bg-gold/5 transition-colors">
                        <td className="py-2 px-4 font-bold text-gold">{String(idx + 1).padStart(2, "0")}</td>
                        <td className="py-2 px-4"><Input type="date" value={inst.due_date} onChange={(e) => updateInstallment(idx, "due_date", e.target.value)} className="h-9 rounded-lg text-xs w-40" /></td>
                        <td className="py-2 px-4">
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gold font-bold text-xs">R$</span>
                            <Input value={inst.amount} onChange={(e) => updateInstallment(idx, "amount", maskCurrencyInput(e.target.value))} className="h-9 rounded-lg text-xs pl-9 font-bold text-gold w-36" />
                          </div>
                        </td>
                        <td className="py-2 px-4 text-right">
                          <Button variant="ghost" size="icon" onClick={() => setInstallmentPlan((prev) => prev.filter((_, i) => i !== idx))} className="h-8 w-8 text-destructive/60 hover:text-destructive rounded-lg">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 bg-gold/5 border-t border-gold/20 flex justify-between items-center">
                <Button variant="outline" size="sm" onClick={() => setInstallmentPlan((prev) => [...prev, { installment_number: prev.length + 1, due_date: "", amount: "", status: "pending" }])} className="rounded-xl text-[10px] font-bold uppercase tracking-widest border-gold/30 text-gold hover:bg-gold/5">
                  <Plus size={12} className="mr-1" /> Adicionar parcela
                </Button>
                <span className="text-xs font-bold text-gold">
                  Total: {currencyFmt(installmentPlan.reduce((sum, inst) => sum + (parseCurrencyInput(inst.amount) || 0), 0))}
                </span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-border/10">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground uppercase text-[10px] font-bold tracking-widest">Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="bg-gradient-to-r from-gold to-gold-light text-white font-bold h-11 px-10 rounded-xl uppercase text-[11px] tracking-widest">
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
