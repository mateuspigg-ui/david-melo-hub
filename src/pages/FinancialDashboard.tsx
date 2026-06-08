import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays } from 'date-fns';
import {
  DollarSign, TrendingUp, Calendar, Landmark, Receipt,
  ArrowDownCircle, ArrowUpCircle, Eye, EyeOff, FileText, ExternalLink, Loader2, ChevronRight, ArrowRight, Wallet,
  ArrowRightLeft, ArrowUpRight, ArrowDownLeft
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import CalendarTab from '@/components/CalendarTab';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { maskCurrencyInput, parseCurrencyInput } from '@/lib/currencyInput';
import { toast } from '@/hooks/use-toast';

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const FinancialDashboard = () => {
  const qc = useQueryClient();
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showValues, setShowValues] = useState(true);
  const [transferOpen, setTransferOpen] = useState(false);

  const { data: companies = [] } = useQuery({
    queryKey: ['companies-select'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('companies')
        .select('id, legal_name, trade_name, cnpj')
        .order('trade_name', { ascending: true });
      if (error) {
        if (/could not find the table|schema cache/i.test(String(error?.message || ''))) return [];
        throw error;
      }
      return data || [];
    },
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bank-accounts-dashboard', selectedCompany],
    queryFn: async () => {
      let query = (supabase as any).from('bank_accounts').select('*');
      if (selectedCompany !== 'all') query = query.eq('company_id', selectedCompany);
      const { data, error } = await query.order('bank_name');
      if (error) { if (/could not find the table|schema cache/i.test(String(error?.message || ''))) return []; throw error; }
      return data || [];
    },
  });

  const { data: bankTx = [] } = useQuery({
    queryKey: ['bank-tx-dashboard', selectedCompany],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('bank_transactions').select('bank_account_id, amount');
      if (error) return []; return data || [];
    },
  });

  const { data: payablePayments = [] } = useQuery({
    queryKey: ['payable-payments-dashboard', selectedCompany],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('accounts_payable').select('bank_account_id, paid_amount, amount, payment_status, paid_at').not('bank_account_id', 'is', null);
      if (error) return []; return data || [];
    },
  });

  const { data: entryPayments = [] } = useQuery({
    queryKey: ['entry-payments-dashboard', selectedCompany],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('payments').select('entry_bank_account_id, entry_paid_amount, entry_amount, entry_paid_at').not('entry_bank_account_id', 'is', null).not('entry_paid_at', 'is', null);
      if (error) return []; return data || [];
    },
  });

  const { data: installmentPayments = [] } = useQuery({
    queryKey: ['installment-payments-dashboard', selectedCompany],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('payment_installments').select('bank_account_id, paid_amount, amount, paid_at').not('bank_account_id', 'is', null).not('paid_at', 'is', null);
      if (error) return []; return data || [];
    },
  });

  const balanceMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of bankTx) map[t.bank_account_id] = (map[t.bank_account_id] || 0) + Number(t.amount || 0);
    for (const p of payablePayments) { if (p.payment_status === 'pago' || p.paid_at) map[p.bank_account_id] = (map[p.bank_account_id] || 0) - Number(p.paid_amount || p.amount || 0); }
    for (const ep of entryPayments) { map[ep.entry_bank_account_id] = (map[ep.entry_bank_account_id] || 0) + Number(ep.entry_paid_amount || ep.entry_amount || 0); }
    for (const ip of installmentPayments) { map[ip.bank_account_id] = (map[ip.bank_account_id] || 0) + Number(ip.paid_amount || ip.amount || 0); }
    return map;
  }, [bankTx, payablePayments, entryPayments, installmentPayments]);

  const getBalance = (accountId: string) => {
    const initial = bankAccounts?.find((a: any) => a.id === accountId)?.default_initial_balance || 0;
    return (balanceMap[accountId] || 0) + Number(initial);
  };

  const transferMutation = useMutation({
    mutationFn: async ({ fromId, toId, amount, description, date }: { fromId: string; toId: string; amount: number; description: string; date: string }) => {
      const { error: e1 } = await (supabase as any).from('bank_transactions').insert({
        bank_account_id: fromId, amount: -amount, transaction_date: date,
        description: description || 'Transferencia para outra conta', source: 'transfer',
      });
      if (e1) throw e1;
      const { error: e2 } = await (supabase as any).from('bank_transactions').insert({
        bank_account_id: toId, amount, transaction_date: date,
        description: description || 'Transferencia de outra conta', source: 'transfer',
      });
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-accounts-dashboard'] });
      qc.invalidateQueries({ queryKey: ['bank-tx-dashboard'] });
      setTransferOpen(false);
      toast({ title: 'Transferencia realizada', style: { backgroundColor: '#C5A059', color: '#fff' } });
    },
    onError: (e: any) => toast({ title: 'Erro na transferencia', description: e.message, variant: 'destructive' }),
  });

  const { data: payments = [], isLoading: loadingPayments } = useQuery({
    queryKey: ['dash-payments', selectedCompany],
    queryFn: async () => {
      let query: any = supabase.from('payments').select('*, payment_installments(*)');
      if (selectedCompany !== 'all') query = query.eq('company_id', selectedCompany);
      const { data, error } = await query; if (error) throw error; return data || [];
    },
  });

  const { data: payables = [], isLoading: loadingPayables } = useQuery({
    queryKey: ['dash-payables', selectedCompany],
    queryFn: async () => {
      let query = (supabase as any).from('accounts_payable').select('*');
      if (selectedCompany !== 'all') query = query.eq('company_id', selectedCompany);
      const { data, error } = await query; if (error) throw error; return data || [];
    },
  });

  const today = format(new Date(), 'yyyy-MM-dd');

  const stats = useMemo(() => {
    const dateFromStr = dateFrom || '0000-01-01';
    const dateToStr = dateTo || '9999-12-31';
    let receitaEmAberto = 0, receitaVencida = 0, receitaTotal = 0, receitaMovHoje = 0;

    for (const p of payments) {
      const installments = (p.payment_installments || []) as any[];
      if (installments.length > 0) {
        for (const inst of installments) {
          if (inst.status === 'paid' || inst.paid_at) continue;
          const dueDate = inst.due_date as string;
          if (!dueDate || dueDate < dateFromStr || dueDate > dateToStr) continue;
          const amount = Number(inst.amount || 0);
          receitaTotal += amount;
          if (dueDate < today) receitaVencida += amount; else receitaEmAberto += amount;
          if (dueDate === today) receitaMovHoje += amount;
        }
      } else if (p.has_entry_payment && !p.entry_paid_at) {
        const entryDate = p.entry_date as string;
        if (!entryDate || entryDate < dateFromStr || entryDate > dateToStr) continue;
        const amount = Number(p.entry_amount || 0);
        receitaTotal += amount;
        if (entryDate < today) receitaVencida += amount; else receitaEmAberto += amount;
        if (entryDate === today) receitaMovHoje += amount;
      }
    }

    let despesaEmAberto = 0, despesaVencida = 0, despesaTotal = 0, despesaMovHoje = 0;
    for (const ap of payables) {
      if (ap.payment_status === 'pago' || ap.payment_status === 'paid' || ap.paid_at) continue;
      const dueDate = ap.due_date as string;
      if (!dueDate || dueDate < dateFromStr || dueDate > dateToStr) continue;
      const amount = Number(ap.amount || 0);
      const totalLiquido = amount - Number(ap.discount || 0) + Number(ap.interest || 0) + Number(ap.fine || 0);
      despesaTotal += totalLiquido;
      if (dueDate < today) despesaVencida += totalLiquido; else despesaEmAberto += totalLiquido;
      if (dueDate === today) despesaMovHoje += totalLiquido;
    }

    const totalBank = bankAccounts.reduce((sum: number, acc: any) => sum + getBalance(acc.id), 0);
    return {
      receitaEmAberto, receitaVencida, receitaTotal, despesaEmAberto, despesaVencida, despesaTotal,
      receitaMovHoje, despesaMovHoje, saldoHoje: totalBank,
      movPrevistasHoje: receitaMovHoje - despesaMovHoje, saldoPrevisto: totalBank + receitaMovHoje - despesaMovHoje,
    };
  }, [payments, payables, bankAccounts, today, dateFrom, dateTo]);

  const dateLabel = `${dateFrom ? format(new Date(dateFrom + 'T12:00:00'), 'dd/MM/yyyy') : '?'} ate ${dateTo ? format(new Date(dateTo + 'T12:00:00'), 'dd/MM/yyyy') : '?'}`;
  const isLoading = loadingPayments || loadingPayables;

  return (
    <div className="space-y-8 animate-fade-in max-w-[1700px] mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 px-2">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 bg-gold rounded-full" />
            <h1 className="text-4xl md:text-5xl font-display text-foreground tracking-tighter uppercase leading-none">Dashboard Financeiro</h1>
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.4em] text-gold/80 pl-4">David Melo Produções • Controle de Fluxo</p>
        </div>
      </div>

      {companies.length > 0 && (
        <div className="px-2">
          <div className="bg-white rounded-2xl border border-border/30 p-4 max-w-xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Empresa / CNPJ</p>
            <select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)} className="h-11 w-full rounded-xl border border-border/40 px-3 text-sm">
              <option value="all">Consolidado (todas as empresas)</option>
              {companies.map((company: any) => (
                <option key={company.id} value={company.id}>{(company.trade_name || company.legal_name || 'Empresa')} {company.cnpj ? `- ${company.cnpj}` : ''}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <Tabs defaultValue="dashboard" className="px-2">
        <TabsList className="bg-white rounded-xl border border-border/30 p-1 h-12">
          <TabsTrigger value="dashboard" className="text-[10px] font-bold uppercase tracking-widest rounded-lg px-6 data-[state=active]:bg-gold data-[state=active]:text-white"><Receipt size={14} className="mr-2" />Dashboard</TabsTrigger>
          <TabsTrigger value="calendario" className="text-[10px] font-bold uppercase tracking-widest rounded-lg px-6 data-[state=active]:bg-gold data-[state=active]:text-white"><Calendar size={14} className="mr-2" />Calendário</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-8 space-y-8">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-10 h-10 text-gold animate-spin" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold animate-pulse">Carregando dados...</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Pagamentos e Recebimentos */}
                <div className="lg:col-span-2">
                  <div className="relative overflow-hidden rounded-3xl border border-gold/10 bg-gradient-to-br from-white via-white to-gold/[0.02] shadow-[0_20px_60px_-15px_rgba(197,160,89,0.12)]">
                    {/* Decorative elements */}
                    <div className="absolute -top-24 -right-24 w-48 h-48 bg-gradient-to-br from-gold/8 to-transparent rounded-full blur-2xl" />
                    <div className="absolute -bottom-16 -left-16 w-32 h-32 bg-gradient-to-tr from-gold/5 to-transparent rounded-full blur-xl" />

                    <div className="relative px-10 pt-8 pb-6">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <div className="absolute inset-0 bg-gold/20 rounded-2xl blur-lg" />
                            <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-gold via-gold/90 to-gold/70 flex items-center justify-center shadow-lg shadow-gold/20">
                              <Receipt size={20} className="text-white" />
                            </div>
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-foreground tracking-tight">Pagamentos e Recebimentos</h3>
                            <p className="text-[11px] text-muted-foreground/50 mt-0.5 font-medium">Valores por parcela no período</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 bg-gradient-to-r from-gold/10 via-gold/5 to-transparent border border-gold/15 rounded-2xl px-5 py-2.5 shadow-inner shadow-gold/5">
                          <Calendar size={14} className="text-gold" />
                          <span className="text-[12px] text-foreground/80 font-semibold tabular-nums">{dateLabel}</span>
                        </div>
                      </div>

                      {/* Filters */}
                      <div className="relative mb-8 p-5 bg-gradient-to-r from-secondary/30 via-secondary/20 to-secondary/30 rounded-2xl border border-border/10 backdrop-blur-sm">
                        <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />
                        <div className="flex flex-wrap items-end gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">Periodo inicial</Label>
                            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10 rounded-xl border-border/30 text-[13px] px-4 bg-white/80 focus:ring-2 focus:ring-gold/20 focus:border-gold/40 transition-all shadow-sm" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">Periodo final</Label>
                            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10 rounded-xl border-border/30 text-[13px] px-4 bg-white/80 focus:ring-2 focus:ring-gold/20 focus:border-gold/40 transition-all shadow-sm" />
                          </div>
                          <div className="flex items-center gap-5 ml-auto pb-1">
                          
                          </div>
                        </div>
                      </div>

                      {/* Table */}
                      <div className="overflow-hidden rounded-2xl border border-border/15 shadow-lg shadow-black/[0.03]">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-gradient-to-r from-foreground/[0.03] via-foreground/[0.02] to-foreground/[0.03]">
                              <th className="text-left py-4 px-6 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50 w-[180px]">Tipo</th>
                              <th className="text-right py-4 px-6 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50">Em Aberto</th>
                              <th className="text-right py-4 px-6 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50">Vencidos</th>
                              <th className="text-right py-4 px-6 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50">Total</th>
                              <th className="text-center py-4 px-6 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50 w-[60px]"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/10">
                            <tr className="group hover:bg-gradient-to-r hover:from-emerald-50/40 hover:via-emerald-50/20 hover:to-transparent transition-all duration-500">
                              <td className="py-5 px-6">
                                <div className="flex items-center gap-3.5">
                                  <div className="relative">
                                    <div className="absolute inset-0 bg-emerald-500/10 rounded-xl blur-md group-hover:blur-lg transition-all" />
                                    <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-50 via-emerald-100/80 to-emerald-50 flex items-center justify-center border border-emerald-200/50 shadow-sm">
                                      <ArrowDownCircle size={18} className="text-emerald-600" />
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-[14px] font-semibold text-foreground">A Receber</p>
                                    <p className="text-[10px] text-muted-foreground/40 font-medium mt-0.5">Receitas pendentes</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-5 px-6 text-right">
                                <span className="font-display text-[15px] tabular-nums text-foreground/70">{fmt(stats.receitaEmAberto)}</span>
                              </td>
                              <td className="py-5 px-6 text-right">
                                <span className="inline-flex items-center gap-1 font-display text-[15px] tabular-nums text-emerald-600 font-medium">
                                  {stats.receitaVencida > 0 && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                                  {fmt(stats.receitaVencida)}
                                </span>
                              </td>
                              <td className="py-5 px-6 text-right">
                                <span className="font-display text-[15px] tabular-nums text-foreground font-bold">{fmt(stats.receitaTotal)}</span>
                              </td>
                              <td className="py-5 px-6 text-center">
                                <button className="p-2 rounded-xl hover:bg-gold/10 transition-all opacity-0 group-hover:opacity-100 duration-300 hover:shadow-md hover:shadow-gold/10">
                                  <FileText size={15} className="text-gold/40 group-hover:text-gold transition-colors" />
                                </button>
                              </td>
                            </tr>
                            <tr className="group hover:bg-gradient-to-r hover:from-red-50/40 hover:via-red-50/20 hover:to-transparent transition-all duration-500">
                              <td className="py-5 px-6">
                                <div className="flex items-center gap-3.5">
                                  <div className="relative">
                                    <div className="absolute inset-0 bg-red-500/10 rounded-xl blur-md group-hover:blur-lg transition-all" />
                                    <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-red-50 via-red-100/80 to-red-50 flex items-center justify-center border border-red-200/50 shadow-sm">
                                      <ArrowUpCircle size={18} className="text-red-400" />
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-[14px] font-semibold text-foreground">A Pagar</p>
                                    <p className="text-[10px] text-muted-foreground/40 font-medium mt-0.5">Despesas pendentes</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-5 px-6 text-right">
                                <span className="font-display text-[15px] tabular-nums text-foreground/70">{fmt(stats.despesaEmAberto)}</span>
                              </td>
                              <td className="py-5 px-6 text-right">
                                <span className="inline-flex items-center gap-1 font-display text-[15px] tabular-nums text-red-400 font-medium">
                                  {stats.despesaVencida > 0 && <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />}
                                  {fmt(stats.despesaVencida)}
                                </span>
                              </td>
                              <td className="py-5 px-6 text-right">
                                <span className="font-display text-[15px] tabular-nums text-foreground font-bold">{fmt(stats.despesaTotal)}</span>
                              </td>
                              <td className="py-5 px-6 text-center">
                                <button className="p-2 rounded-xl hover:bg-gold/10 transition-all opacity-0 group-hover:opacity-100 duration-300 hover:shadow-md hover:shadow-gold/10">
                                  <FileText size={15} className="text-gold/40 group-hover:text-gold transition-colors" />
                                </button>
                              </td>
                            </tr>
                            <tr className="relative">
                              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
                              <td className="py-5 px-6 pl-16">
                                <p className="text-[14px] font-bold text-foreground">Total</p>
                              </td>
                              <td className="py-5 px-6 text-right">
                                <span className="font-display text-[15px] tabular-nums text-foreground font-bold">{fmt(stats.receitaEmAberto + stats.despesaEmAberto)}</span>
                              </td>
                              <td className="py-5 px-6 text-right">
                                <span className="font-display text-[15px] tabular-nums text-foreground font-bold">{fmt(stats.receitaVencida + stats.despesaVencida)}</span>
                              </td>
                              <td className="py-5 px-6 text-right">
                                <div className="inline-flex items-center gap-2 bg-gradient-to-r from-gold/10 to-gold/5 px-4 py-1.5 rounded-xl border border-gold/15">
                                  <span className="font-display text-[16px] tabular-nums text-gold font-black">{fmt(stats.receitaTotal + stats.despesaTotal)}</span>
                                </div>
                              </td>
                              <td></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Saldo das contas */}
                <div className="lg:col-span-1">
                  <div className="relative overflow-hidden rounded-3xl border border-gold/10 bg-gradient-to-br from-white via-white to-gold/[0.02] shadow-[0_20px_60px_-15px_rgba(197,160,89,0.12)] h-full flex flex-col">
                    {/* Decorative */}
                    <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br from-gold/8 to-transparent rounded-full blur-2xl" />

                    <div className="relative px-8 pt-8 pb-6 flex-1 flex flex-col">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-7">
                        <div className="flex items-center gap-3.5">
                          <div className="relative">
                            <div className="absolute inset-0 bg-gold/20 rounded-2xl blur-lg" />
                            <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-gold via-gold/90 to-gold/70 flex items-center justify-center shadow-lg shadow-gold/20">
                              <Wallet size={18} className="text-white" />
                            </div>
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-foreground tracking-tight">Saldo das contas</h3>
                            <p className="text-[11px] text-muted-foreground/50 mt-0.5 font-medium">{format(new Date(), 'dd/MM/yyyy')}</p>
                          </div>
                        </div>
                        <button onClick={() => setShowValues(!showValues)} className="w-9 h-9 rounded-xl bg-secondary/30 flex items-center justify-center border border-border/15 hover:bg-gold/5 hover:border-gold/20 transition-all duration-200">
                          {showValues ? <Eye size={15} className="text-muted-foreground/50" /> : <EyeOff size={15} className="text-muted-foreground/50" />}
                        </button>
                      </div>

                      {/* Accounts */}
                      <div className="flex-1 overflow-y-auto -mx-2 px-2">
                        <div className="space-y-2">
                          {bankAccounts.length === 0 ? (
                            <div className="text-center py-12">
                              <div className="relative inline-block mb-3">
                                <div className="absolute inset-0 bg-gold/10 rounded-2xl blur-lg" />
                                <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-secondary/50 to-secondary/30 flex items-center justify-center border border-border/15">
                                  <Landmark size={22} className="text-muted-foreground/25" />
                                </div>
                              </div>
                              <p className="text-[13px] text-muted-foreground/40 font-medium">Nenhuma conta</p>
                            </div>
                          ) : (
                            bankAccounts.map((acc: any) => {
                              const balance = getBalance(acc.id);
                              const isNegative = balance < -0.01;
                              return (
                                <div key={acc.id} className="group/item relative p-4 rounded-2xl bg-gradient-to-r from-secondary/10 to-transparent hover:from-gold/5 hover:to-transparent border border-transparent hover:border-gold/10 transition-all duration-300 cursor-pointer">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <div className={cn("w-2 h-2 rounded-full", isNegative ? "bg-red-400" : "bg-emerald-500")} />
                                        <p className="text-[13px] font-semibold text-foreground truncate group-hover/item:text-gold transition-colors">{acc.bank_name || 'Sem banco'}</p>
                                      </div>
                                      <div className="ml-4 mt-1.5">
                                        {(acc.agency || acc.account_number) && (
                                          <p className="text-[10px] text-muted-foreground/40 tabular-nums font-medium">
                                            {acc.agency && `Ag. ${acc.agency}`}
                                            {acc.agency && acc.account_number && <span className="mx-1 text-border/30">·</span>}
                                            {acc.account_number && `Cc ${acc.account_number}${acc.account_digit || ''}`}
                                          </p>
                                        )}
                                        {acc.description && <p className="text-[10px] text-muted-foreground/25 mt-0.5 truncate">{acc.description}</p>}
                                      </div>
                                    </div>
                                    <span className={cn(
                                      "text-[14px] font-display font-bold tabular-nums whitespace-nowrap",
                                      isNegative ? "text-red-400" : "text-foreground"
                                    )}>
                                      {showValues ? fmt(balance) : '···'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Total */}
                      {bankAccounts.length > 0 && (
                        <div className="mt-5 pt-5 border-t border-border/10 relative">
                          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-gold" />
                              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50">Saldo Total</p>
                            </div>
                            <div className="bg-gradient-to-r from-gold/10 to-gold/5 px-4 py-1.5 rounded-xl border border-gold/15">
                              <p className="text-[16px] font-display font-black tabular-nums text-gold">
                                {showValues ? fmt(stats.saldoHoje) : '···'}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Quick Links */}
                      <div className="mt-6 space-y-2">
                        <div className="h-px bg-gradient-to-r from-transparent via-border/20 to-transparent" />
                        <a href="/conciliacao" className="flex items-center justify-between p-3.5 rounded-2xl hover:bg-gradient-to-r hover:from-gold/5 hover:to-transparent border border-transparent hover:border-gold/10 transition-all duration-300 group/link">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-gold/10 to-gold/5 flex items-center justify-center border border-gold/10">
                              <ExternalLink size={13} className="text-gold/60" />
                            </div>
                            <span className="text-[12px] text-muted-foreground/60 font-medium group-hover/link:text-gold transition-colors">Conciliação bancária</span>
                          </div>
                          <ArrowRight size={14} className="text-muted-foreground/20 group-hover/link:text-gold/50 group-hover/link:translate-x-0.5 transition-all" />
                        </a>
                        <button type="button" onClick={() => setTransferOpen(true)} className="w-full flex items-center justify-between p-3.5 rounded-2xl hover:bg-gradient-to-r hover:from-gold/5 hover:to-transparent border border-transparent hover:border-gold/10 transition-all duration-300 group/link cursor-pointer">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-gold/10 to-gold/5 flex items-center justify-center border border-gold/10">
                              <ArrowRightLeft size={13} className="text-gold/60" />
                            </div>
                            <span className="text-[12px] text-muted-foreground/60 font-medium group-hover/link:text-gold transition-colors">Transferência entre contas</span>
                          </div>
                          <ArrowRight size={14} className="text-muted-foreground/20 group-hover/link:text-gold/50 group-hover/link:translate-x-0.5 transition-all" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Saldo Hoje */}
                <div className="relative overflow-hidden rounded-3xl border border-emerald-200/30 bg-gradient-to-br from-white via-emerald-50/20 to-emerald-50/40 shadow-[0_20px_60px_-15px_rgba(16,185,129,0.12)] group hover:shadow-[0_25px_70px_-15px_rgba(16,185,129,0.18)] transition-all duration-500">
                  <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br from-emerald-500/8 to-transparent rounded-full blur-2xl" />
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-emerald-400/40 via-emerald-500 to-emerald-400/40" />
                  <div className="relative p-7">
                    <div className="flex items-center justify-between mb-6">
                      <div className="relative">
                        <div className="absolute inset-0 bg-emerald-500/15 rounded-2xl blur-lg group-hover:blur-xl transition-all" />
                        <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-50 via-emerald-100/80 to-emerald-50 flex items-center justify-center border border-emerald-200/50 shadow-sm group-hover:scale-110 transition-transform duration-500">
                          <Landmark size={20} className="text-emerald-600" />
                        </div>
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-600/70 bg-emerald-100/50 px-3 py-1.5 rounded-xl border border-emerald-200/30">Hoje</span>
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50 mb-1.5">Saldo Hoje</p>
                    <p className="text-[26px] font-display font-black tracking-tight text-foreground tabular-nums leading-none">{fmt(stats.saldoHoje)}</p>
                  </div>
                </div>

                {/* Movimentações previstas */}
                <div className="relative overflow-hidden rounded-3xl border border-gold/15 bg-gradient-to-br from-white via-gold/[0.02] to-gold/[0.04] shadow-[0_20px_60px_-15px_rgba(197,160,89,0.12)] group hover:shadow-[0_25px_70px_-15px_rgba(197,160,89,0.18)] transition-all duration-500">
                  <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br from-gold/8 to-transparent rounded-full blur-2xl" />
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-gold/40 via-gold to-gold/40" />
                  <div className="relative p-7">
                    <div className="flex items-center justify-between mb-6">
                      <div className="relative">
                        <div className="absolute inset-0 bg-gold/15 rounded-2xl blur-lg group-hover:blur-xl transition-all" />
                        <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-gold/10 via-gold/15 to-gold/10 flex items-center justify-center border border-gold/20 shadow-sm group-hover:scale-110 transition-transform duration-500">
                          <TrendingUp size={20} className="text-gold" />
                        </div>
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-gold/70 bg-gold/10 px-3 py-1.5 rounded-xl border border-gold/15">Previsão</span>
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50 mb-1.5">Movimentações previstas para hoje</p>
                    <p className={cn(
                      "text-[26px] font-display font-black tracking-tight tabular-nums leading-none",
                      stats.movPrevistasHoje >= 0 ? "text-emerald-600" : "text-red-400"
                    )}>{fmt(stats.movPrevistasHoje)}</p>
                  </div>
                </div>

                {/* Saldo previsto */}
                <div className="relative overflow-hidden rounded-3xl border border-amber-200/30 bg-gradient-to-br from-white via-amber-50/20 to-amber-50/40 shadow-[0_20px_60px_-15px_rgba(245,158,11,0.12)] group hover:shadow-[0_25px_70px_-15px_rgba(245,158,11,0.18)] transition-all duration-500">
                  <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br from-amber-500/8 to-transparent rounded-full blur-2xl" />
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-amber-400/40 via-amber-500 to-amber-400/40" />
                  <div className="relative p-7">
                    <div className="flex items-center justify-between mb-6">
                      <div className="relative">
                        <div className="absolute inset-0 bg-amber-500/15 rounded-2xl blur-lg group-hover:blur-xl transition-all" />
                        <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-50 via-amber-100/80 to-amber-50 flex items-center justify-center border border-amber-200/50 shadow-sm group-hover:scale-110 transition-transform duration-500">
                          <DollarSign size={20} className="text-amber-500" />
                        </div>
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-amber-600/70 bg-amber-100/50 px-3 py-1.5 rounded-xl border border-amber-200/30">Projetado</span>
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50 mb-1.5">Saldo previsto para hoje</p>
                    <p className={cn(
                      "text-[26px] font-display font-black tracking-tight tabular-nums leading-none",
                      stats.saldoPrevisto >= 0 ? "text-emerald-600" : "text-red-400"
                    )}>{fmt(stats.saldoPrevisto)}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="calendario" className="mt-8">
          <CalendarTab selectedCompany={selectedCompany} />
        </TabsContent>
      </Tabs>

      <TransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        accounts={bankAccounts}
        getBalance={getBalance}
        onSubmit={transferMutation.mutate}
        isPending={transferMutation.isPending}
      />
    </div>
  );
};

function TransferDialog({ open, onOpenChange, accounts, getBalance, onSubmit, isPending }: {
  open: boolean; onOpenChange: (v: boolean) => void; accounts: any[]; getBalance: (id: string) => number;
  onSubmit: (data: { fromId: string; toId: string; amount: number; description: string; date: string }) => void; isPending: boolean;
}) {
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const fromAccount = accounts.find((a: any) => a.id === fromId);
  const toAccount = accounts.find((a: any) => a.id === toId);
  const parsedAmount = parseCurrencyInput(amount);

  const filteredTo = accounts.filter((a: any) => a.id !== fromId);

  const fromBalance = fromId ? getBalance(fromId) : 0;
  const toBalance = toId ? getBalance(toId) : 0;
  const fromResult = fromBalance - (Number.isFinite(parsedAmount) ? parsedAmount : 0);
  const toResult = toBalance + (Number.isFinite(parsedAmount) ? parsedAmount : 0);

  const handleSubmit = () => {
    if (!fromId || !toId || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast({ title: 'Preencha todos os campos', variant: 'destructive' });
      return;
    }
    onSubmit({ fromId, toId, amount: parsedAmount, description: description || 'Transferencia entre contas', date });
  };

  const handleSwap = () => {
    setFromId(toId);
    setToId(fromId);
  };

  const fmtLocal = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setFromId(''); setToId(''); setAmount(''); setDescription(''); } }}>
      <DialogContent className="max-w-lg rounded-[28px] p-0 overflow-hidden">
        <div className="bg-gradient-to-r from-gold via-gold-light to-gold p-8 text-white">
          <DialogTitle className="text-2xl font-display text-white tracking-tight">
            Transferência entre contas
          </DialogTitle>
          <p className="text-white/70 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Movimentação interna de fundos</p>
        </div>
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Conta origem</Label>
            <Select value={fromId} onValueChange={(v) => { setFromId(v); if (v === toId) setToId(''); }}>
              <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Selecionar conta origem" /></SelectTrigger>
              <SelectContent>{accounts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.bank_name} - {a.account_number}{a.account_digit ? `-${a.account_digit}` : ''}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-center">
            <button type="button" onClick={handleSwap} className="w-8 h-8 rounded-full border border-border/30 flex items-center justify-center hover:bg-gold/10 hover:border-gold/30 transition-all">
              <ArrowRightLeft size={14} className="text-gold rotate-90" />
            </button>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Conta destino</Label>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Selecionar conta destino" /></SelectTrigger>
              <SelectContent>{filteredTo.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.bank_name} - {a.account_number}{a.account_digit ? `-${a.account_digit}` : ''}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Valor</Label>
              <Input value={amount} onChange={(e) => setAmount(maskCurrencyInput(e.target.value))} className="h-12 rounded-xl font-bold" placeholder="0,00" />
            </div>
          </div>

          {fromId && (
            <div className="border border-border/20 rounded-xl overflow-hidden">
              <div className="grid grid-cols-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 border-b border-border/10">
                <div className="py-2 px-4">Conta</div>
                <div className="py-2 px-4 text-right">Saldo resultante</div>
              </div>
              <div className="grid grid-cols-2 items-center border-b border-border/10 bg-red-50/30">
                <div className="py-3 px-4 flex items-center gap-2">
                  <ArrowUpRight size={14} className="text-red-500" />
                  <span className="font-bold text-sm">{fromAccount?.bank_name} {fromAccount?.account_number}</span>
                </div>
                <div className="py-3 px-4 text-right font-black text-sm text-red-500 tabular-nums">{fmtLocal(fromResult)}</div>
              </div>
              {toId && (
                <div className="grid grid-cols-2 items-center bg-emerald-50/30">
                  <div className="py-3 px-4 flex items-center gap-2">
                    <ArrowDownLeft size={14} className="text-emerald-500" />
                    <span className="font-bold text-sm">{toAccount?.bank_name} {toAccount?.account_number}</span>
                  </div>
                  <div className="py-3 px-4 text-right font-black text-sm text-emerald-600 tabular-nums">{fmtLocal(toResult)}</div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Comentário</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[60px] rounded-xl" placeholder="Comentário sobre esta transferência" />
            <p className="text-[9px] text-muted-foreground/60 italic">* Comentários são visíveis apenas no extrato consolidado</p>
          </div>
        </div>
        <div className="p-6 pt-0 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl uppercase text-[10px] font-bold tracking-widest">Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending || !fromId || !toId || !Number.isFinite(parsedAmount) || parsedAmount <= 0} className="bg-gradient-to-r from-gold to-gold-light text-white font-bold h-11 px-8 rounded-xl uppercase text-[10px] tracking-widest">
            {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRightLeft size={14} className="mr-2" />}
            Transferir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default FinancialDashboard;
