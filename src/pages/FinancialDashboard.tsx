import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays } from 'date-fns';
import {
  DollarSign, TrendingUp, Calendar, Landmark, Receipt,
  ArrowDownCircle, ArrowUpCircle, Eye, EyeOff, FileText, ExternalLink, Loader2
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

  const getBalance = (accountId: string) => {
    const initial = bankAccounts?.find((a: any) => a.id === accountId)?.default_initial_balance || 0;
    return (balanceMap[accountId] || 0) + Number(initial);
  };

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
          // Filtrar por período: parcela com vencimento dentro do range
          if (!dueDate || dueDate < dateFromStr || dueDate > dateToStr) continue;
          if (instPaid) continue;
          const amount = Number(inst.amount || 0);
          receitaTotal += amount;
          if (dueDate < today) {
            receitaVencida += amount;
          } else {
            receitaEmAberto += amount;
          }
          if (dueDate === today) {
            receitaMovHoje += amount;
          }
        }
      } else if (p.has_entry_payment && !p.entry_paid_at) {
        // Sem parcelas: usa entrada como única parcela
        const entryDate = p.entry_date as string;
        if (!entryDate || entryDate < dateFromStr || entryDate > dateToStr) continue;
        const amount = Number(p.entry_amount || 0);
        receitaTotal += amount;
        if (entryDate < today) {
          receitaVencida += amount;
        } else {
          receitaEmAberto += amount;
        }
        if (entryDate === today) {
          receitaMovHoje += amount;
        }
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
      if (dueDate < today) {
        despesaVencida += totalLiquido;
      } else {
        despesaEmAberto += totalLiquido;
      }
      if (dueDate === today) {
        despesaMovHoje += totalLiquido;
      }
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
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Pagamentos e Recebimentos */}
                <div className="lg:col-span-2">
                  <div className="bg-white rounded-2xl border border-border/20 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                    {/* Header */}
                    <div className="px-8 pt-7 pb-5 border-b border-border/10">
                      <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-3">
                          <div className="h-6 w-[3px] bg-gold rounded-full" />
                          <h3 className="text-base font-semibold text-foreground tracking-tight">Pagamentos e Recebimentos</h3>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-secondary/40 px-3 py-1.5 rounded-lg">
                          <Calendar size={12} className="text-gold" />
                          <span className="font-medium">{dateLabel}</span>
                        </div>
                      </div>
                      {/* Filters */}
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="space-y-1">
                          <Label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">De</Label>
                          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 rounded-lg border-border/30 text-[13px] px-3 bg-secondary/20 focus:bg-white transition-colors" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Ate</Label>
                          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 rounded-lg border-border/30 text-[13px] px-3 bg-secondary/20 focus:bg-white transition-colors" />
                        </div>
                        <div className="flex items-center gap-4 ml-auto pb-0.5">
                          <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Exibir:</span>
                          <label className="flex items-center gap-1.5 cursor-pointer group">
                            <input type="radio" checked={showValues} onChange={() => setShowValues(true)} className="w-3.5 h-3.5 accent-[#C5A059]" />
                            <span className="text-[12px] text-foreground/70 group-hover:text-foreground transition-colors">Valor Bruto</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer group">
                            <input type="radio" checked={!showValues} onChange={() => setShowValues(false)} className="w-3.5 h-3.5 accent-[#C5A059]" />
                            <span className="text-[12px] text-foreground/70 group-hover:text-foreground transition-colors">Valor Líquido</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Table */}
                    <div className="px-8 py-2">
                      <table className="w-full">
                        <thead>
                          <tr>
                            <th className="text-left py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 w-[140px]"></th>
                            <th className="text-right py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">Em Aberto</th>
                            <th className="text-right py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">Vencidos</th>
                            <th className="text-right py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">Total</th>
                            <th className="text-center py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 w-[60px]"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/10">
                          <tr className="group hover:bg-secondary/20 transition-colors">
                            <td className="py-4 text-sm font-medium text-foreground flex items-center gap-2.5">
                              <span className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center border border-emerald-100/80">
                                <ArrowDownCircle size={14} className="text-emerald-600" />
                              </span>
                              A Receber
                            </td>
                            <td className="py-4 text-right font-display text-[13px] tabular-nums text-foreground/80">{showValues ? fmt(stats.receitaEmAberto) : '*****'}</td>
                            <td className="py-4 text-right font-display text-[13px] tabular-nums text-emerald-600">{showValues ? fmt(stats.receitaVencida) : '*****'}</td>
                            <td className="py-4 text-right font-display text-[13px] tabular-nums text-foreground font-semibold">{showValues ? fmt(stats.receitaTotal) : '*****'}</td>
                            <td className="py-4 text-center">
                              <button className="p-1.5 rounded-lg hover:bg-gold/10 transition-colors opacity-0 group-hover:opacity-100">
                                <FileText size={14} className="text-gold/60" />
                              </button>
                            </td>
                          </tr>
                          <tr className="group hover:bg-secondary/20 transition-colors">
                            <td className="py-4 text-sm font-medium text-foreground flex items-center gap-2.5">
                              <span className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center border border-red-100/80">
                                <ArrowUpCircle size={14} className="text-red-400" />
                              </span>
                              A Pagar
                            </td>
                            <td className="py-4 text-right font-display text-[13px] tabular-nums text-foreground/80">{showValues ? fmt(stats.despesaEmAberto) : '*****'}</td>
                            <td className="py-4 text-right font-display text-[13px] tabular-nums text-red-400">{showValues ? fmt(stats.despesaVencida) : '*****'}</td>
                            <td className="py-4 text-right font-display text-[13px] tabular-nums text-foreground font-semibold">{showValues ? fmt(stats.despesaTotal) : '*****'}</td>
                            <td className="py-4 text-center">
                              <button className="p-1.5 rounded-lg hover:bg-gold/10 transition-colors opacity-0 group-hover:opacity-100">
                                <FileText size={14} className="text-gold/60" />
                              </button>
                            </td>
                          </tr>
                          <tr className="bg-secondary/30">
                            <td className="py-3.5 text-[13px] font-semibold text-foreground">Total</td>
                            <td className="py-3.5 text-right font-display text-[13px] tabular-nums text-foreground font-semibold">{showValues ? fmt(stats.receitaEmAberto + stats.despesaEmAberto) : '*****'}</td>
                            <td className="py-3.5 text-right font-display text-[13px] tabular-nums text-foreground font-semibold">{showValues ? fmt(stats.receitaVencida + stats.despesaVencida) : '*****'}</td>
                            <td className="py-3.5 text-right font-display text-[13px] tabular-nums text-foreground font-bold">{showValues ? fmt(stats.receitaTotal + stats.despesaTotal) : '*****'}</td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Right: Saldo das contas */}
                <div>
                  <div className="bg-white rounded-2xl border border-border/20 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden h-full flex flex-col">
                    {/* Header */}
                    <div className="px-6 pt-7 pb-4 border-b border-border/10">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-6 w-[3px] bg-gold rounded-full" />
                          <h3 className="text-base font-semibold text-foreground tracking-tight">Saldo das contas</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setShowValues(!showValues)} className="text-muted-foreground/40 hover:text-gold transition-colors">
                            {showValues ? <Eye size={15} /> : <EyeOff size={15} />}
                          </button>
                          <span className="text-[11px] text-muted-foreground/60 font-medium">{format(new Date(), 'dd/MM/yyyy')}</span>
                        </div>
                      </div>
                    </div>

                    {/* Accounts List */}
                    <div className="flex-1 overflow-y-auto">
                      <div className="divide-y divide-border/8">
                        {bankAccounts.length === 0 ? (
                          <p className="text-[13px] text-muted-foreground/50 text-center py-12">Nenhuma conta cadastrada</p>
                        ) : (
                          bankAccounts.map((acc: any) => {
                            const balance = getBalance(acc.id);
                            const isNegative = balance < -0.01;
                            return (
                              <div key={acc.id} className="px-6 py-4 hover:bg-secondary/15 transition-colors group">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="min-w-0">
                                    <p className="text-[13px] font-semibold text-foreground truncate">{acc.bank_name || 'Sem banco'}</p>
                                    {(acc.agency || acc.account_number) && (
                                      <p className="text-[11px] text-muted-foreground/50 mt-0.5 tabular-nums">
                                        {acc.agency && `Ag. ${acc.agency}`}
                                        {acc.agency && acc.account_number ? ' | ' : ''}
                                        {acc.account_number && `Cc ${acc.account_number}${acc.account_digit || ''}`}
                                      </p>
                                    )}
                                    {acc.description && <p className="text-[10px] text-muted-foreground/35 mt-0.5 truncate">{acc.description}</p>}
                                  </div>
                                  <span className={cn(
                                    "text-[13px] font-display font-semibold tabular-nums whitespace-nowrap",
                                    isNegative ? "text-red-400" : "text-foreground"
                                  )}>
                                    {showValues ? fmt(balance) : '*****'}
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
                      <div className="px-6 py-4 border-t border-border/10 bg-secondary/10">
                        <div className="flex items-center justify-between">
                          <span className="text-[13px] font-semibold text-foreground">Total</span>
                          <span className="text-[13px] font-display font-bold tabular-nums text-foreground">
                            {showValues ? fmt(stats.saldoHoje) : '*****'}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Links */}
                    <div className="px-6 py-5 border-t border-border/10">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/40 mb-3">Atalhos</p>
                      <div className="space-y-1.5">
                        <a href="/conciliacao" className="flex items-center gap-2 text-[12px] text-muted-foreground/60 hover:text-gold font-medium transition-colors py-1">
                          <ExternalLink size={12} />
                          Conciliação bancária
                        </a>
                        <a href="/contas-bancarias" className="flex items-center gap-2 text-[12px] text-muted-foreground/60 hover:text-gold font-medium transition-colors py-1">
                          <ExternalLink size={12} />
                          Transferência entre contas
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="bg-white rounded-2xl border border-border/20 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6 flex items-center justify-between group hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-all duration-300">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">Saldo Hoje</p>
                    <p className="text-xl font-display mt-1.5 tracking-tight text-foreground tabular-nums">{fmt(stats.saldoHoje)}</p>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-emerald-50/80 flex items-center justify-center border border-emerald-100/60">
                    <Landmark size={18} className="text-emerald-600/80" />
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-border/20 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6 flex items-center justify-between group hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-all duration-300">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">Movimentações previstas para hoje</p>
                    <p className={cn(
                      "text-xl font-display mt-1.5 tracking-tight tabular-nums",
                      stats.movPrevistasHoje >= 0 ? "text-emerald-600" : "text-red-400"
                    )}>{fmt(stats.movPrevistasHoje)}</p>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-gold/5 flex items-center justify-center border border-gold/10">
                    <TrendingUp size={18} className="text-gold/70" />
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-border/20 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6 flex items-center justify-between group hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-all duration-300">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">Saldo previsto para hoje</p>
                    <p className={cn(
                      "text-xl font-display mt-1.5 tracking-tight tabular-nums",
                      stats.saldoPrevisto >= 0 ? "text-emerald-600" : "text-red-400"
                    )}>{fmt(stats.saldoPrevisto)}</p>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-amber-50/80 flex items-center justify-center border border-amber-100/60">
                    <DollarSign size={18} className="text-amber-500/80" />
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
