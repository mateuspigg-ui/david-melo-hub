import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { maskCurrencyInput, parseCurrencyInput } from "@/lib/currencyInput";
import { Receipt } from "lucide-react";
import { format } from "date-fns";

const currencyFmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const safeNum = (v: any): number => {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseCurrencyInput(v);
  return Number.isFinite(n) ? n : 0;
};

type Props = { open: boolean; onOpenChange: (v: boolean) => void; itemId: string; onSaved?: () => void };

export default function EditContaPagarDialog({ open, onOpenChange, itemId, onSaved }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState("dados");
  const [form, setForm] = useState({ description: "", amount: "", issue_date: "", due_date: "", supplier_id: "", company_id: "", category_id: "", cost_center_id: "" });
  const [paymentBankAccount, setPaymentBankAccount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [paymentDiscount, setPaymentDiscount] = useState("");
  const [paymentInterest, setPaymentInterest] = useState("");
  const [paymentFine, setPaymentFine] = useState("");
  const [paymentDocumentNumber, setPaymentDocumentNumber] = useState("");

  const { data: item } = useQuery({
    queryKey: ["cal-edit-pagar", itemId],
    queryFn: async () => {
      const { data } = await supabase.from("accounts_payable").select("*, suppliers(company_name)").eq("id", itemId).single();
      return data as any;
    },
    enabled: open && !!itemId,
  });

  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers-cal"], queryFn: async () => { const { data } = await supabase.from("suppliers").select("id, company_name").order("company_name"); return data || []; }, enabled: open });
  const { data: companies = [] } = useQuery({ queryKey: ["companies-cal"], queryFn: async () => { const { data } = await (supabase as any).from("companies").select("id, legal_name, trade_name").order("trade_name"); return data || []; }, enabled: open });
  const { data: categories = [] } = useQuery({ queryKey: ["categories-cal"], queryFn: async () => { const { data } = await (supabase as any).from("accounts_payable_categories").select("id, name").order("name"); return data || []; }, enabled: open });
  const { data: costCenters = [] } = useQuery({ queryKey: ["costcenters-cal"], queryFn: async () => { const { data } = await (supabase as any).from("accounts_payable_cost_centers").select("id, name").order("name"); return data || []; }, enabled: open });
  const { data: bankAccounts = [] } = useQuery({ queryKey: ["bank-cal"], queryFn: async () => { const { data } = await (supabase as any).from("bank_accounts").select("id, bank_name, account_number, account_digit, description").order("bank_name"); return data || []; }, enabled: open });

  useEffect(() => {
    if (item && open) {
      setForm({
        description: item.description || "",
        amount: maskCurrencyInput(String(item.amount || "")),
        issue_date: item.issue_date || "",
        due_date: item.due_date || "",
        supplier_id: item.supplier_id || "",
        company_id: item.company_id || "",
        category_id: item.category_id || "",
        cost_center_id: item.cost_center_id || "",
      });
      setPaymentBankAccount(item.bank_account_id || "");
      setPaymentMethod(item.payment_method || "pix");
      setPaymentDiscount(item.discount != null ? maskCurrencyInput(String(item.discount)) : "");
      setPaymentInterest(item.interest != null ? maskCurrencyInput(String(item.interest)) : "");
      setPaymentFine(item.fine != null ? maskCurrencyInput(String(item.fine)) : "");
      setPaymentDocumentNumber(item.document_number || "");
    }
  }, [item, open]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        description: form.description,
        amount: parseCurrencyInput(form.amount),
        issue_date: form.issue_date || null,
        due_date: form.due_date,
        supplier_id: form.supplier_id || null,
        company_id: form.company_id || null,
        category_id: form.category_id || null,
        cost_center_id: form.cost_center_id || null,
      };
      const { error } = await (supabase as any).from("accounts_payable").update(payload).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => { toast({ title: "Despesa atualizada" }); qc.invalidateQueries({ queryKey: ["accounts_payable"] }); onSaved?.(); onOpenChange(false); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const baixaMutation = useMutation({
    mutationFn: async () => {
      if (!item) return;
      const discount = safeNum(paymentDiscount);
      const interest = safeNum(paymentInterest);
      const fine = safeNum(paymentFine);
      const baseAmt = safeNum(item.amount);
      const paidAmount = baseAmt - discount + interest + fine;
      const isPaidNow = !["pago", "paid"].includes(String(item.payment_status || "").toLowerCase()) && !item.paid_at;
      const payload: any = {
        payment_status: isPaidNow ? "pago" : "nao_pago",
        paid_at: isPaidNow ? new Date().toISOString() : null,
        bank_account_id: paymentBankAccount || null,
        payment_method: paymentMethod,
        discount,
        interest,
        fine,
        paid_amount: isPaidNow ? paidAmount : null,
        document_number: paymentDocumentNumber || null,
      };
      const { error } = await (supabase as any).from("accounts_payable").update(payload).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => { toast({ title: "Baixa registrada" }); qc.invalidateQueries({ queryKey: ["accounts_payable"] }); onSaved?.(); onOpenChange(false); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  if (!open) return null;

  const isCurrentlyPaid = item && (["pago", "paid"].includes(String(item.payment_status || "").toLowerCase()) || item.paid_at);
  const totalLiquido = safeNum(item?.amount) - safeNum(paymentDiscount) + safeNum(paymentInterest) + safeNum(paymentFine);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] p-0 rounded-3xl shadow-[0_25px_60px_-12px_rgba(0,0,0,0.25)] border border-border/30 bg-background overflow-hidden flex flex-col">
        <div className="relative bg-gradient-to-r from-gold via-gold-light to-gold p-8 text-white overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djZoNnYtNmgtNnptMC0zMHY2aDZ2LTZoLTZ6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30" />
          <div className="relative flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl font-display text-white tracking-tight">Editar Despesa</DialogTitle>
              <p className="text-white/70 text-xs mt-2 font-medium tracking-wide uppercase">{item?.suppliers?.company_name || "Fornecedor"} • Venc: {item?.due_date ? format(new Date(item.due_date + "T12:00:00"), "dd/MM/yyyy") : ""}</p>
            </div>
            <div className="hidden md:flex h-14 w-14 rounded-2xl bg-white/10 backdrop-blur-sm items-center justify-center border border-white/20">
              <Receipt className="h-7 w-7 text-white" />
            </div>
          </div>
        </div>

        <div className="p-6 overflow-y-auto min-h-0">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2 mb-6 bg-secondary/50 rounded-xl p-1">
              <TabsTrigger value="dados" className="rounded-lg font-bold uppercase text-[10px] tracking-widest data-[state=active]:bg-gold data-[state=active]:text-white">Dados da Despesa</TabsTrigger>
              <TabsTrigger value="baixa" className="rounded-lg font-bold uppercase text-[10px] tracking-widest data-[state=active]:bg-gold data-[state=active]:text-white">Baixa</TabsTrigger>
            </TabsList>

            <TabsContent value="dados" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Fornecedor</Label>
                  <Select value={form.supplier_id || "none"} onValueChange={(v) => setForm({ ...form, supplier_id: v === "none" ? "" : v })}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>{suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.company_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {companies.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Empresa</Label>
                    <Select value={form.company_id || "none"} onValueChange={(v) => setForm({ ...form, company_id: v === "none" ? "" : v })}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem vinculo</SelectItem>
                        {companies.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.trade_name || c.legal_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Data Emissao</Label>
                  <Input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} className="h-11 rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Data Vencimento</Label>
                  <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="h-11 rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Valor</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gold font-bold text-sm">R$</span>
                    <Input value={form.amount} onChange={(e) => setForm({ ...form, amount: maskCurrencyInput(e.target.value) })} className="h-11 rounded-xl pl-10 font-bold text-gold" placeholder="0,00" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Categoria</Label>
                  <Select value={form.category_id || "none"} onValueChange={(v) => setForm({ ...form, category_id: v === "none" ? "" : v })}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem categoria</SelectItem>
                      {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Centro de Custo</Label>
                  <Select value={form.cost_center_id || "none"} onValueChange={(v) => setForm({ ...form, cost_center_id: v === "none" ? "" : v })}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem centro de custo</SelectItem>
                      {costCenters.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Descricao</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-[80px] rounded-xl" placeholder="Descricao da despesa" />
              </div>
              <div className="flex justify-end pt-4 border-t border-border/10">
                <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="bg-gradient-to-r from-gold to-gold-light text-white font-bold h-11 px-10 rounded-xl uppercase text-[11px] tracking-widest">
                  {updateMutation.isPending ? "Salvando..." : "Salvar Alteracoes"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="baixa" className="space-y-6">
              {item && (
                <>
                  <div className="bg-secondary/30 rounded-2xl p-5 space-y-2">
                    <p className="text-sm font-bold">{item.suppliers?.company_name || "Fornecedor"}</p>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                    <div className="flex items-center gap-3 pt-1">
                      <span className="text-2xl font-bold text-gold">{currencyFmt(item.amount)}</span>
                      <span className="text-xs text-muted-foreground">Venc: {format(new Date(item.due_date + "T12:00:00"), "dd/MM/yyyy")}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Conta Bancaria</Label>
                    <Select value={paymentBankAccount} onValueChange={setPaymentBankAccount}>
                      <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Selecionar conta" /></SelectTrigger>
                      <SelectContent>
                        {bankAccounts.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.bank_name} - {b.account_number}{b.account_digit ? `-${b.account_digit}` : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Forma de Pagamento</Label>
                    <div className="grid grid-cols-3 gap-3">
                      {[{ value: "pix", label: "PIX" }, { value: "cartao", label: "Cartao" }, { value: "dinheiro", label: "Dinheiro" }].map((m) => (
                        <Button key={m.value} variant="outline" onClick={() => setPaymentMethod(m.value)} className={`h-12 rounded-xl font-bold uppercase text-[10px] tracking-widest ${paymentMethod === m.value ? "bg-gold text-white border-gold" : "border-border/40"}`}>{m.label}</Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Numero do Documento</Label>
                    <Input value={paymentDocumentNumber} onChange={(e) => setPaymentDocumentNumber(e.target.value)} placeholder="Ex: 21316182000184" className="h-11 rounded-xl" />
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2"><div className="h-5 w-1 bg-gold rounded-full" /><h3 className="text-xs font-bold uppercase tracking-[0.2em] text-foreground/60">Desconto, Juros e Multa</h3></div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2"><Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Desconto</Label><Input value={paymentDiscount} onChange={(e) => setPaymentDiscount(maskCurrencyInput(e.target.value))} className="h-11 rounded-xl" placeholder="0,00" /></div>
                      <div className="space-y-2"><Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Juros</Label><Input value={paymentInterest} onChange={(e) => setPaymentInterest(maskCurrencyInput(e.target.value))} className="h-11 rounded-xl" placeholder="0,00" /></div>
                      <div className="space-y-2"><Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Multa</Label><Input value={paymentFine} onChange={(e) => setPaymentFine(maskCurrencyInput(e.target.value))} className="h-11 rounded-xl" placeholder="0,00" /></div>
                    </div>
                  </div>
                  <div className="bg-gold/5 border border-gold/20 rounded-xl p-4 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-widest text-gold">Total liquido da baixa:</span>
                    <span className="text-xl font-bold text-gold">{currencyFmt(totalLiquido)}</span>
                  </div>
                  <div className="flex justify-end pt-4 border-t border-border/10">
                    <Button onClick={() => baixaMutation.mutate()} disabled={!paymentBankAccount || baixaMutation.isPending} className="bg-gradient-to-r from-gold to-gold-light text-white font-bold h-11 px-10 rounded-xl uppercase text-[11px] tracking-widest">
                      {isCurrentlyPaid ? "Desfazer Baixa" : "Confirmar Baixa"}
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
