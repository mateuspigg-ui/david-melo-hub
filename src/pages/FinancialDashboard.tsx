import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays } from 'date-fns';
import {
  DollarSign, TrendingUp, Calendar, Landmark, Receipt,
  ArrowDownCircle, ArrowUpCircle, Eye, EyeOff, FileText, ExternalLink, Loader2, ChevronRight
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import CalendarTab from '@/components/CalendarTab';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const FinancialDashboard = () => {
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showValues, setShowValues] = useState(true);

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
      let query = (supabase as any)
        .from('bank_accounts')
        .select('*');
      if (selectedCompany !== 'all') {
        query = query.eq('company_id', selectedCompany);
      }
      const { data, error } = await query.order('bank_name');
      if (error) {
        if (/could not find the table|schema cache/i.test(String(error?.message || ''))) return [];
        throw error;
      }
      return data || [];
    },
  });

  const { data: bankTx = [] } = useQuery({
    queryKey: ['bank-tx-dashboard', selectedCompany],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('bank_transactions').select('bank_account_id, amount');
      if (error) return [];
      return data || [];
    },
  });

  const { data: payablePayments = [] } = useQuery({
    queryKey: ['payable-payments-dashboard', selectedCompany],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('accounts_payable')
        .select('bank_account_id, paid_amount, amount, payment_status, paid_at')
        .not('bank_account_id', 'is', null);
      if (error) return [];
      return data || [];
    },
  });

  const { data: entryPayments = [] } = useQuery({
    queryKey: ['entry-payments-dashboard', selectedCompany],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('payments')
        .select('entry_bank_account_id, entry_paid_amount, entry_amount, entry_paid_at')
        .not('entry_bank_account_id', 'is', null)
        .not('entry_paid_at', 'is', null);
      if (error) return [];
      return data || [];
    },
  });

  const { data: installmentPayments = [] } = useQuery({
    queryKey: ['installment-payments-dashboard', selectedCompany],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('payment_installments')
        .select('bank_account_id, paid_amount, amount, paid_at')
        .not('bank_account_id', 'is', null)
        .not('paid_at', 'is', null);
      if (error) return [];
      return data || [];
    },
  });

  const balanceMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of bankTx) {
      map[t.bank_account_id] = (map[t.bank_account_id] || 0) + Number(t.amount || 0);
    }
    for (const p of payablePayments) {
      if (p.payment_status === 'pago' || p.paid_at) {
        map[p.bank_account_id] = (map[p.bank_account_id] || 0) - Number(p.paid_amount || p.amount || 0);
      }
    }
    for (const ep of entryPayments) {
      const id = ep.entry_bank_account_id;
      map[id] = (map[id] || 0) + Number(ep.entry_paid_amount || ep.entry_amount || 0);
    }
    for (const ip of installmentPayments) {
      const id = ip.bank_account_id;
      map[id] = (map[id] || 0) + Number(ip.paid_amount || ip.amount || 0);
    }
    return map;
  }, [bankTx, payablePayments, entryPayments, installmentPayments]);

  const getBalance = (accountId: string) => {
    const initial = bankAccounts?.find((a: any) => a.id === accountId)?.default_initial_balance || 0;
    return (balanceMap[accountId] || 0) + Number(initial);
  };

  const { data: payments = [], isLoading: loadingPayments } = useQuery({
    queryKey: ['dash-payments', selectedCompany],
    queryFn: async () => {
      let query = supabase
        .from('payments')
        .select('*, payment_installments(*)');
      if (selectedCompany !== 'all') {
        query = query.eq('company_id', selectedCompany);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: payables = [], isLoading: loadingPayables } = useQuery({
    queryKey: ['dash-payables', selectedCompany],
    queryFn: async () => {
      let query = (supabase as any)
        .from('accounts_payable')
        .select('*');
      if (selectedCompany !== 'all') {
        query = query.eq('company_id', selectedCompany);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const today = format(new Date(), 'yyyy-MM-dd');

  const stats = useMemo(() => {
    const dateFromStr = dateFrom || '0000-01-01';
    const dateToStr = dateTo || '9999-12-31';

    let receitaEmAberto = 0;
    let receitaVencida = 0;
    let receitaTotal = 0;
    let receitaMovHoje = 0;

    for (const p of payments) {
      const installments = (p.payment_installments || []) as any[];
      if (installments.length > 0) {
        for (const inst of installments) {
          const instPaid = inst.status === 'paid' || inst.paid_at;
          const dueDate = inst.due_date as string;
          if (!dueDate || dueDate < dateFromStr || dueDate > dateToStr) continue;
          if (instPaid) continue;
          const amount = Number(inst.amount || 0);
          receitaTotal += amount;
          if (dueDate < today) receitaVencida += amount;
          else receitaEmAberto += amount;
          if (dueDate === today) receitaMovHoje += amount;
        }
      } else if (p.has_entry_payment && !p.entry_paid_at) {
        const entryDate = p.entry_date as string;
        if (!entryDate || entryDate < dateFromStr || entryDate > dateToStr) continue;
        const amount = Number(p.entry_amount || 0);
        receitaTotal += amount;
        if (entryDate < today) receitaVencida += amount;
        else receitaEmAberto += amount;
        if (entryDate === today) receitaMovHoje += amount;
      }
    }

    let despesaEmAberto = 0;
    let despesaVencida = 0;
    let despesaTotal = 0;
    let despesaMovHoje = 0;

    for (const ap of payables) {
      const isPaid = ap.payment_status === 'pago' || ap.payment_status === 'paid' || ap.paid_at;
      const dueDate = ap.due_date as string;
      if (!dueDate || dueDate < dateFromStr || dueDate > dateToStr) continue;
      if (isPaid) continue;
      const amount = Number(ap.amount || 0);
      const discount = Number(ap.discount || 0);
      const interest = Number(ap.interest || 0);
      const fine = Number(ap.fine || 0);
      const totalLiquido = amount - discount + interest + fine;
      despesaTotal += totalLiquido;
      if (dueDate < today) despesaVencida += totalLiquido;
      else despesaEmAberto += totalLiquido;
      if (dueDate === today) despesaMovHoje += totalLiquido;
    }

    const totalBank = bankAccounts.reduce((sum: number, acc: any) => sum + getBalance(acc.id), 0);

    return {
      receitaEmAberto, receitaVencida, receitaTotal,
      despesaEmAberto, despesaVencida, despesaTotal,
      receitaMovHoje, despesaMovHoje,
      saldoHoje: totalBank,
      movPrevistasHoje: receitaMovHoje - despesaMovHoje,
      saldoPrevisto: totalBank + receitaMovHoje - despesaMovHoje,
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
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="h-11 w-full rounded-xl border border-border/40 px-3 text-sm"
            >
              <option value="all">Consolidado (todas as empresas)</option>
              {companies.map((company: any) => (
                <option key={company.id} value={company.id}>
                  {(company.trade_name || company.legal_name || 'Empresa')} {company.cnpj ? `- ${company.cnpj}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <Tabs defaultValue="dashboard" className="px-2">
        <TabsList className="bg-white rounded-xl border border-border/30 p-1 h-12">
          <TabsTrigger value="dashboard" className="text-[10px] font-bold uppercase tracking-widest rounded-lg px-6 data-[state=active]:bg-gold data-[state=active]:text-white">
            <Receipt size={14} className="mr-2" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="calendario" className="text-[10px] font-bold uppercase tracking-widest rounded-lg px-6 data-[state=active]:bg-gold data-[state=active]:text-white">
            <Calendar size={14} className="mr-2" />
            Calendário
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-8 space-y-8">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-10 h-10 text-gold animate-spin" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold animate-pulse">Carregando dados...</p>
            </div>
          ) : (
            <>
              {/* Main Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Pagamentos e Recebimentos */}
                <div className="lg:col-span-2">
                  <div className="relative bg-white rounded-3xl border border-border/20 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                    {/* Gold accent line */}
                    <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-gold/40 via-gold to-gold/40" />

                    <div className="px-10 pt-8 pb-6">
                      {/* Header row */}
                      <div className="flex items-center justify-between mb-8">
                        <div>
                          <h3 className="text-lg font-bold text-foreground tracking-tight">Pagamentos e Recebimentos</h3>
                          <p className="text-[11px] text-muted-foreground/50 mt-1 font-medium">Valores por parcela no período selecionado</p>
                        </div>
                        <div className="flex items-center gap-2 bg-gradient-to-r from-gold/5 to-gold/[0.02] border border-gold/10 rounded-xl px-4 py-2">
                          <Calendar size={13} className="text-gold/70" />
                          <span className="text-[12px] text-foreground/70 font-semibold tabular-nums">{dateLabel}</span>
                        </div>
                      </div>

                      {/* Filters */}
                      <div className="flex flex-wrap items-end gap-3 mb-8 p-4 bg-secondary/20 rounded-2xl border border-border/10">
                        <div className="space-y-1.5">
                          <Label className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">Periodo inicial</Label>
                          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10 rounded-xl border-border/30 text-[13px] px-4 bg-white focus:ring-2 focus:ring-gold/20 focus:border-gold/40 transition-all" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">Periodo final</Label>
                          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10 rounded-xl border-border/30 text-[13px] px-4 bg-white focus:ring-2 focus:ring-gold/20 focus:border-gold/40 transition-all" />
                        </div>
                        <div className="flex items-center gap-5 ml-auto pb-1">
                          <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/60">Exibir valores:</span>
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer group">
                              <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all", showValues ? "border-gold bg-gold" : "border-border/40")}>
                                {showValues && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>
                              <span className={cn("text-[12px] font-medium transition-colors", showValues ? "text-foreground" : "text-muted-foreground/60 group-hover:text-foreground/80")}>Bruto</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer group">
                              <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all", !showValues ? "border-gold bg-gold" : "border-border/40")}>
                                {!showValues && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>
                              <span className={cn("text-[12px] font-medium transition-colors", !showValues ? "text-foreground" : "text-muted-foreground/60 group-hover:text-foreground/80")}>Líquido</span>
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Table */}
                      <div className="overflow-hidden rounded-xl border border-border/15">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-gradient-to-b from-secondary/40 to-secondary/20">
                              <th className="text-left py-3.5 px-6 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50 w-[160px]">Tipo</th>
                              <th className="text-right py-3.5 px-6 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50">Em Aberto</th>
                              <th className="text-right py-3.5 px-6 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50">Vencidos</th>
                              <th className="text-right py-3.5 px-6 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50">Total</th>
                              <th className="text-center py-3.5 px-6 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50 w-[60px]"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/10">
                            <tr className="group hover:bg-gradient-to-r hover:from-gold/[0.02] hover:to-transparent transition-all duration-300">
                              <td className="py-5 px-6">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 flex items-center justify-center border border-emerald-200/50 shadow-sm">
                                    <ArrowDownCircle size={16} className="text-emerald-600" />
                                  </div>
                                  <div>
                                    <p className="text-[13px] font-semibold text-foreground">A Receber</p>
                                    <p className="text-[10px] text-muted-foreground/40 font-medium">Receitas pendentes</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-5 px-6 text-right">
                                <span className="font-display text-[14px] tabular-nums text-foreground/70">{showValues ? fmt(stats.receitaEmAberto) : '*****'}</span>
                              </td>
                              <td className="py-5 px-6 text-right">
                                <span className="font-display text-[14px] tabular-nums text-emerald-600 font-medium">{showValues ? fmt(stats.receitaVencida) : '*****'}</span>
                              </td>
                              <td className="py-5 px-6 text-right">
                                <span className="font-display text-[14px] tabular-nums text-foreground font-bold">{showValues ? fmt(stats.receitaTotal) : '*****'}</span>
                              </td>
                              <td className="py-5 px-6 text-center">
                                <button className="p-2 rounded-xl hover:bg-gold/10 transition-all opacity-0 group-hover:opacity-100 duration-200">
                                  <FileText size={15} className="text-gold/50 group-hover:text-gold transition-colors" />
                                </button>
                              </td>
                            </tr>
                            <tr className="group hover:bg-gradient-to-r hover:from-red-50/30 hover:to-transparent transition-all duration-300">
                              <td className="py-5 px-6">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-50 to-red-100/50 flex items-center justify-center border border-red-200/50 shadow-sm">
                                    <ArrowUpCircle size={16} className="text-red-400" />
                                  </div>
                                  <div>
                                    <p className="text-[13px] font-semibold text-foreground">A Pagar</p>
                                    <p className="text-[10px] text-muted-foreground/40 font-medium">Despesas pendentes</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-5 px-6 text-right">
                                <span className="font-display text-[14px] tabular-nums text-foreground/70">{showValues ? fmt(stats.despesaEmAberto) : '*****'}</span>
                              </td>
                              <td className="py-5 px-6 text-right">
                                <span className="font-display text-[14px] tabular-nums text-red-400 font-medium">{showValues ? fmt(stats.despesaVencida) : '*****'}</span>
                              </td>
                              <td className="py-5 px-6 text-right">
                                <span className="font-display text-[14px] tabular-nums text-foreground font-bold">{showValues ? fmt(stats.despesaTotal) : '*****'}</span>
                              </td>
                              <td className="py-5 px-6 text-center">
                                <button className="p-2 rounded-xl hover:bg-gold/10 transition-all opacity-0 group-hover:opacity-100 duration-200">
                                  <FileText size={15} className="text-gold/50 group-hover:text-gold transition-colors" />
                                </button>
                              </td>
                            </tr>
                            <tr className="bg-gradient-to-r from-secondary/30 via-secondary/20 to-secondary/30">
                              <td className="py-4 px-6">
                                <p className="text-[13px] font-bold text-foreground pl-12">Total</p>
                              </td>
                              <td className="py-4 px-6 text-right">
                                <span className="font-display text-[14px] tabular-nums text-foreground font-bold">{showValues ? fmt(stats.receitaEmAberto + stats.despesaEmAberto) : '*****'}</span>
                              </td>
                              <td className="py-4 px-6 text-right">
                                <span className="font-display text-[14px] tabular-nums text-foreground font-bold">{showValues ? fmt(stats.receitaVencida + stats.despesaVencida) : '*****'}</span>
                              </td>
                              <td className="py-4 px-6 text-right">
                                <span className="font-display text-[15px] tabular-nums text-gold font-black">{showValues ? fmt(stats.receitaTotal + stats.despesaTotal) : '*****'}</span>
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
                  <div className="relative bg-white rounded-3xl border border-border/20 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] h-full flex flex-col">
                    {/* Gold accent line */}
                    <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-gold/40 via-gold to-gold/40" />

                    <div className="px-8 pt-8 pb-5 flex-1 flex flex-col">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h3 className="text-lg font-bold text-foreground tracking-tight">Saldo das contas</h3>
                          <p className="text-[11px] text-muted-foreground/50 mt-1 font-medium">{format(new Date(), 'dd/MM/yyyy')}</p>
                        </div>
                        <button
                          onClick={() => setShowValues(!showValues)}
                          className="w-9 h-9 rounded-xl bg-secondary/30 flex items-center justify-center border border-border/15 hover:bg-gold/5 hover:border-gold/20 transition-all duration-200"
                        >
                          {showValues ? <Eye size={15} className="text-muted-foreground/50" /> : <EyeOff size={15} className="text-muted-foreground/50" />}
                        </button>
                      </div>

                      {/* Accounts List */}
                      <div className="flex-1 overflow-y-auto -mx-2 px-2">
                        <div className="space-y-1">
                          {bankAccounts.length === 0 ? (
                            <div className="text-center py-12">
                              <div className="w-12 h-12 rounded-2xl bg-secondary/30 flex items-center justify-center mx-auto mb-3">
                                <Landmark size={20} className="text-muted-foreground/30" />
                              </div>
                              <p className="text-[13px] text-muted-foreground/40 font-medium">Nenhuma conta cadastrada</p>
                            </div>
                          ) : (
                            bankAccounts.map((acc: any) => {
                              const balance = getBalance(acc.id);
                              const isNegative = balance < -0.01;
                              return (
                                <div key={acc.id} className="group/item p-4 rounded-2xl hover:bg-secondary/25 transition-all duration-200 cursor-pointer">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[13px] font-semibold text-foreground truncate group-hover/item:text-gold transition-colors">{acc.bank_name || 'Sem banco'}</p>
                                      <div className="flex items-center gap-1.5 mt-1">
                                        {(acc.agency || acc.account_number) && (
                                          <p className="text-[10px] text-muted-foreground/45 tabular-nums font-medium">
                                            {acc.agency && `Ag. ${acc.agency}`}
                                            {acc.agency && acc.account_number ? <span className="mx-1 text-border/30">·</span> : ''}
                                            {acc.account_number && `Cc ${acc.account_number}${acc.account_digit || ''}`}
                                          </p>
                                        )}
                                      </div>
                                      {acc.description && <p className="text-[10px] text-muted-foreground/30 mt-0.5 truncate">{acc.description}</p>}
                                    </div>
                                    <div className="text-right">
                                      <span className={cn(
                                        "text-[14px] font-display font-bold tabular-nums whitespace-nowrap",
                                        isNegative ? "text-red-400" : "text-foreground"
                                      )}>
                                        {showValues ? fmt(balance) : '*****'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {/* Total */}
                      {bankAccounts.length > 0 && (
                        <div className="mt-4 pt-5 border-t border-border/10">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50">Saldo Total</p>
                            <p className="text-[16px] font-display font-black tabular-nums text-foreground">
                              {showValues ? fmt(stats.saldoHoje) : '*****'}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Quick Links */}
                      <div className="mt-6 space-y-1">
                        <a href="/conciliacao" className="flex items-center justify-between p-3 rounded-xl hover:bg-secondary/25 transition-all group/link">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-gold/5 flex items-center justify-center border border-gold/10">
                              <ExternalLink size={12} className="text-gold/60" />
                            </div>
                            <span className="text-[12px] text-muted-foreground/60 font-medium group-hover/link:text-gold transition-colors">Conciliação bancária</span>
                          </div>
                          <ChevronRight size={14} className="text-muted-foreground/20 group-hover/link:text-gold/50 transition-colors" />
                        </a>
                        <a href="/contas-bancarias" className="flex items-center justify-between p-3 rounded-xl hover:bg-secondary/25 transition-all group/link">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-gold/5 flex items-center justify-center border border-gold/10">
                              <ExternalLink size={12} className="text-gold/60" />
                            </div>
                            <span className="text-[12px] text-muted-foreground/60 font-medium group-hover/link:text-gold transition-colors">Transferência entre contas</span>
                          </div>
                          <ChevronRight size={14} className="text-muted-foreground/20 group-hover/link:text-gold/50 transition-colors" />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Saldo Hoje */}
                <div className="relative bg-white rounded-3xl border border-border/20 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] group hover:shadow-[0_12px_40px_rgb(0,0,0,0.07)] transition-all duration-500">
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-emerald-400/40 via-emerald-500 to-emerald-400/40" />
                  <div className="p-7">
                    <div className="flex items-center justify-between mb-5">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 flex items-center justify-center border border-emerald-200/40 shadow-sm group-hover:scale-110 transition-transform duration-500">
                        <Landmark size={18} className="text-emerald-600" />
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-600/60 bg-emerald-50/80 px-2.5 py-1 rounded-lg">Hoje</span>
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">Saldo Hoje</p>
                    <p className="text-2xl font-display font-black tracking-tight text-foreground tabular-nums">{fmt(stats.saldoHoje)}</p>
                  </div>
                </div>

                {/* Movimentações previstas */}
                <div className="relative bg-white rounded-3xl border border-border/20 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] group hover:shadow-[0_12px_40px_rgb(0,0,0,0.07)] transition-all duration-500">
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-gold/40 via-gold to-gold/40" />
                  <div className="p-7">
                    <div className="flex items-center justify-between mb-5">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-gold/5 to-gold/10 flex items-center justify-center border border-gold/15 shadow-sm group-hover:scale-110 transition-transform duration-500">
                        <TrendingUp size={18} className="text-gold" />
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-gold/60 bg-gold/5 px-2.5 py-1 rounded-lg">Previsão</span>
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">Movimentações previstas para hoje</p>
                    <p className={cn(
                      "text-2xl font-display font-black tracking-tight tabular-nums",
                      stats.movPrevistasHoje >= 0 ? "text-emerald-600" : "text-red-400"
                    )}>{fmt(stats.movPrevistasHoje)}</p>
                  </div>
                </div>

                {/* Saldo previsto */}
                <div className="relative bg-white rounded-3xl border border-border/20 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] group hover:shadow-[0_12px_40px_rgb(0,0,0,0.07)] transition-all duration-500">
                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-amber-400/40 via-amber-500 to-amber-400/40" />
                  <div className="p-7">
                    <div className="flex items-center justify-between mb-5">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100/50 flex items-center justify-center border border-amber-200/40 shadow-sm group-hover:scale-110 transition-transform duration-500">
                        <DollarSign size={18} className="text-amber-500" />
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-amber-600/60 bg-amber-50/80 px-2.5 py-1 rounded-lg">Projetado</span>
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">Saldo previsto para hoje</p>
                    <p className={cn(
                      "text-2xl font-display font-black tracking-tight tabular-nums",
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
    </div>
  );
};

export default FinancialDashboard;
