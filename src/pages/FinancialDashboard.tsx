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
        .select('id, bank_name, account_name, balance, company_id');
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
    let receitaEmAberto = 0;
    let receitaVencida = 0;
    let receitaTotal = 0;
    let receitaMovHoje = 0;

    for (const p of payments) {
      const installments = (p.payment_installments || []) as any[];
      for (const inst of installments) {
        const instPaid = inst.status === 'paid' || inst.paid_at;
        if (instPaid) continue;
        const amount = Number(inst.amount || 0);
        const dueDate = inst.due_date as string;
        receitaTotal += amount;
        if (dueDate && dueDate < today) {
          receitaVencida += amount;
        } else {
          receitaEmAberto += amount;
        }
        if (dueDate === today) {
          receitaMovHoje += amount;
        }
      }

      // Entrada (entry payment)
      if (p.has_entry_payment && !p.entry_paid_at) {
        const entryAmount = Number(p.entry_amount || 0);
        const entryDate = p.entry_date as string;
        receitaTotal += entryAmount;
        if (entryDate && entryDate < today) {
          receitaVencida += entryAmount;
        } else {
          receitaEmAberto += entryAmount;
        }
        if (entryDate === today) {
          receitaMovHoje += entryAmount;
        }
      }
    }

    let despesaEmAberto = 0;
    let despesaVencida = 0;
    let despesaTotal = 0;
    let despesaMovHoje = 0;

    for (const ap of payables) {
      const isPaid = ap.payment_status === 'pago' || ap.payment_status === 'paid' || ap.paid_at;
      if (isPaid) continue;
      const amount = Number(ap.amount || 0);
      const discount = Number(ap.discount || 0);
      const interest = Number(ap.interest || 0);
      const fine = Number(ap.fine || 0);
      const totalLiquido = amount - discount + interest + fine;
      despesaTotal += totalLiquido;
      if (ap.due_date && ap.due_date < today) {
        despesaVencida += totalLiquido;
      } else {
        despesaEmAberto += totalLiquido;
      }
      if (ap.due_date === today) {
        despesaMovHoje += totalLiquido;
      }
    }

    const totalBank = bankAccounts.reduce((sum: number, acc: any) => sum + Number(acc.balance || 0), 0);

    return {
      receitaEmAberto, receitaVencida, receitaTotal,
      despesaEmAberto, despesaVencida, despesaTotal,
      receitaMovHoje, despesaMovHoje,
      saldoHoje: totalBank,
      movPrevistasHoje: receitaMovHoje - despesaMovHoje,
      saldoPrevisto: totalBank + receitaMovHoje - despesaMovHoje,
    };
  }, [payments, payables, bankAccounts, today]);

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
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left: Pagamentos e Recebimentos */}
                <div className="lg:col-span-2 bg-white rounded-[32px] border border-border/30 premium-shadow overflow-hidden">
                  <div className="bg-gradient-to-r from-gold to-gold/80 px-8 py-5 flex items-center justify-between">
                    <h3 className="text-white font-bold text-sm drop-shadow-sm">Pagamentos e Recebimentos</h3>
                    <div className="flex items-center gap-2 bg-white/20 rounded-lg px-3 py-1.5 backdrop-blur-sm">
                      <Calendar size={14} className="text-white/90" />
                      <span className="text-white text-xs font-medium">{dateLabel}</span>
                    </div>
                  </div>

                  <div className="p-8 space-y-6">
                    <div className="flex flex-wrap items-end gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">De</Label>
                        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10 rounded-xl border-border/40" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Ate</Label>
                        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10 rounded-xl border-border/40" />
                      </div>
                      <div className="flex items-center gap-3 ml-auto">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Exibir:</span>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" checked={showValues} onChange={() => setShowValues(true)} className="accent-[#C5A059]" />
                          <span className="text-xs font-medium">Valor Bruto</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" checked={!showValues} onChange={() => setShowValues(false)} className="accent-[#C5A059]" />
                          <span className="text-xs font-medium">Valor Líquido</span>
                        </label>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border/20">
                            <th className="text-left py-3 px-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 w-[140px]"></th>
                            <th className="text-right py-3 px-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Em Aberto</th>
                            <th className="text-right py-3 px-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Vencidos</th>
                            <th className="text-right py-3 px-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Total</th>
                            <th className="text-center py-3 px-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 w-[80px]">Detalhes</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-border/10 hover:bg-gold/[0.02] transition-colors">
                            <td className="py-4 px-4 text-sm font-semibold text-emerald-700 flex items-center gap-2">
                              <ArrowDownCircle size={16} className="text-emerald-600" />
                              A Receber
                            </td>
                            <td className="py-4 px-4 text-right font-display text-sm tabular-nums text-foreground">{showValues ? fmt(stats.receitaEmAberto) : '*****'}</td>
                            <td className="py-4 px-4 text-right font-display text-sm tabular-nums text-emerald-700 font-medium">{showValues ? fmt(stats.receitaVencida) : '*****'}</td>
                            <td className="py-4 px-4 text-right font-display text-sm tabular-nums text-foreground font-bold">{showValues ? fmt(stats.receitaTotal) : '*****'}</td>
                            <td className="py-4 px-4 text-center">
                              <button className="p-1.5 rounded-lg hover:bg-gold/10 transition-colors">
                                <FileText size={16} className="text-gold" />
                              </button>
                            </td>
                          </tr>
                          <tr className="border-b border-border/10 hover:bg-gold/[0.02] transition-colors">
                            <td className="py-4 px-4 text-sm font-semibold text-red-500 flex items-center gap-2">
                              <ArrowUpCircle size={16} className="text-red-400" />
                              A Pagar
                            </td>
                            <td className="py-4 px-4 text-right font-display text-sm tabular-nums text-foreground">{showValues ? fmt(stats.despesaEmAberto) : '*****'}</td>
                            <td className="py-4 px-4 text-right font-display text-sm tabular-nums text-red-500 font-medium">{showValues ? fmt(stats.despesaVencida) : '*****'}</td>
                            <td className="py-4 px-4 text-right font-display text-sm tabular-nums text-foreground font-bold">{showValues ? fmt(stats.despesaTotal) : '*****'}</td>
                            <td className="py-4 px-4 text-center">
                              <button className="p-1.5 rounded-lg hover:bg-gold/10 transition-colors">
                                <FileText size={16} className="text-gold" />
                              </button>
                            </td>
                          </tr>
                          <tr className="bg-secondary/20">
                            <td className="py-4 px-4 text-sm font-bold text-foreground">Total</td>
                            <td className="py-4 px-4 text-right font-display text-sm tabular-nums text-foreground font-bold">{showValues ? fmt(stats.receitaEmAberto + stats.despesaEmAberto) : '*****'}</td>
                            <td className="py-4 px-4 text-right font-display text-sm tabular-nums text-foreground font-bold">{showValues ? fmt(stats.receitaVencida + stats.despesaVencida) : '*****'}</td>
                            <td className="py-4 px-4 text-right font-display text-sm tabular-nums text-foreground font-bold">{showValues ? fmt(stats.receitaTotal + stats.despesaTotal) : '*****'}</td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Right: Saldo das contas */}
                <div className="bg-white rounded-[32px] border border-border/30 premium-shadow overflow-hidden">
                  <div className="bg-gradient-to-r from-gold to-gold/80 px-6 py-5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-bold text-sm drop-shadow-sm">Saldo das contas</h3>
                      <button onClick={() => setShowValues(!showValues)} className="text-white/80 hover:text-white transition-colors">
                        {showValues ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white text-xs">{format(new Date(), 'dd/MM/yyyy')}</span>
                      <Calendar size={14} className="text-white/80" />
                    </div>
                  </div>

                  <div className="p-6">
                    <div className="space-y-1 max-h-[320px] overflow-y-auto">
                      {bankAccounts.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma conta cadastrada</p>
                      ) : (
                        bankAccounts.map((acc: any) => (
                          <div key={acc.id} className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-gold/[0.03] transition-colors border-b border-border/10 last:border-0">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{acc.bank_name || 'Sem banco'}</p>
                              {acc.account_name && <p className="text-[10px] text-muted-foreground mt-0.5">{acc.account_name}</p>}
                            </div>
                            <span className="text-sm font-display font-bold tabular-nums text-foreground">
                              {showValues ? fmt(Number(acc.balance || 0)) : '*****'}
                            </span>
                          </div>
                        ))
                      )}
                    </div>

                    {bankAccounts.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-border/20 flex items-center justify-between">
                        <span className="text-sm font-bold text-foreground">Total</span>
                        <span className="text-sm font-display font-bold tabular-nums text-foreground">
                          {showValues ? fmt(stats.saldoHoje) : '*****'}
                        </span>
                      </div>
                    )}

                    <div className="mt-6 p-4 rounded-2xl bg-secondary/30 border border-border/10 space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-foreground/60">Você também pode se interessar:</p>
                      <a href="/conciliacao" className="flex items-center gap-2 text-sm text-gold hover:text-gold/80 font-medium transition-colors">
                        <ExternalLink size={14} />
                        Conciliação bancária
                      </a>
                      <a href="/contas-bancarias" className="flex items-center gap-2 text-sm text-gold hover:text-gold/80 font-medium transition-colors">
                        <ExternalLink size={14} />
                        Transferência entre contas
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="group relative bg-white rounded-[24px] border border-border/30 p-8 premium-shadow flex items-center justify-between overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-lg">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-emerald-500/8 to-transparent rounded-full -mr-8 -mt-8" />
                  <div className="relative z-10">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Saldo Hoje</p>
                    <p className="text-2xl font-display mt-2 tracking-tight text-foreground tabular-nums">{fmt(stats.saldoHoje)}</p>
                  </div>
                  <div className="relative z-10 w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center border border-emerald-100">
                    <Landmark size={20} className="text-emerald-600" />
                  </div>
                </div>

                <div className="group relative bg-white rounded-[24px] border border-border/30 p-8 premium-shadow flex items-center justify-between overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-lg">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-gold/8 to-transparent rounded-full -mr-8 -mt-8" />
                  <div className="relative z-10">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Movimentações previstas para hoje</p>
                    <p className={cn(
                      "text-2xl font-display mt-2 tracking-tight tabular-nums",
                      stats.movPrevistasHoje >= 0 ? "text-emerald-600" : "text-red-500"
                    )}>{fmt(stats.movPrevistasHoje)}</p>
                  </div>
                  <div className="relative z-10 w-12 h-12 rounded-2xl bg-gold/10 flex items-center justify-center border border-gold/20">
                    <TrendingUp size={20} className="text-gold" />
                  </div>
                </div>

                <div className="group relative bg-white rounded-[24px] border border-border/30 p-8 premium-shadow flex items-center justify-between overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-lg">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-amber-500/8 to-transparent rounded-full -mr-8 -mt-8" />
                  <div className="relative z-10">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Saldo previsto para hoje</p>
                    <p className={cn(
                      "text-2xl font-display mt-2 tracking-tight tabular-nums",
                      stats.saldoPrevisto >= 0 ? "text-emerald-600" : "text-red-500"
                    )}>{fmt(stats.saldoPrevisto)}</p>
                  </div>
                  <div className="relative z-10 w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center border border-amber-100">
                    <DollarSign size={20} className="text-amber-600" />
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
