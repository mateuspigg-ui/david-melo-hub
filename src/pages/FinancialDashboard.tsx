import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, eachDayOfInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  DollarSign, TrendingUp, Calendar, Landmark, Receipt,
  ArrowDownCircle, ArrowUpCircle, Eye, EyeOff, FileText, ExternalLink, Loader2, ChevronRight, ArrowRight, Wallet,
  ArrowRightLeft, ArrowUpRight, ArrowDownLeft
} from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList, ReferenceLine } from 'recharts';
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

  const { data: allInstallments = [] } = useQuery({
    queryKey: ['all-installments-monthly', selectedCompany],
    queryFn: async () => {
      let query: any = supabase.from('payment_installments').select('amount, due_date, status, paid_at, payment_id');
      if (selectedCompany !== 'all') {
        const { data: filteredPayments } = await supabase.from('payments').select('id').eq('company_id', selectedCompany);
        const ids = (filteredPayments || []).map((p: any) => p.id);
        if (ids.length === 0) return [];
        query = query.in('payment_id', ids);
      }
      const { data, error } = await query;
      if (error) return [];
      return data || [];
    },
  });

  const { data: allPayables = [] } = useQuery({
    queryKey: ['all-payables-monthly', selectedCompany],
    queryFn: async () => {
      let query = (supabase as any).from('accounts_payable').select('amount, due_date, payment_status, paid_at, discount, interest, fine');
      if (selectedCompany !== 'all') query = query.eq('company_id', selectedCompany);
      const { data, error } = await query;
      if (error) return [];
      return data || [];
    },
  });

  const { data: bankTxWithDate = [] } = useQuery({
    queryKey: ['bank-tx-dated', selectedCompany],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('bank_transactions').select('bank_account_id, amount, transaction_date');
      if (error) return [];
      return data || [];
    },
  });

  const { data: entryPaymentsDated = [] } = useQuery({
    queryKey: ['entry-payments-dated', selectedCompany],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('payments').select('entry_bank_account_id, entry_paid_amount, entry_amount, entry_paid_at, entry_date').not('entry_bank_account_id', 'is', null);
      if (error) return [];
      return data || [];
    },
  });

  const { data: installmentPaymentsDated = [] } = useQuery({
    queryKey: ['installment-payments-dated', selectedCompany],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('payment_installments').select('bank_account_id, paid_amount, amount, paid_at, due_date, status').not('bank_account_id', 'is', null);
      if (error) return [];
      return data || [];
    },
  });

  const { data: payablePaymentsDated = [] } = useQuery({
    queryKey: ['payable-payments-dated', selectedCompany],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('accounts_payable').select('bank_account_id, paid_amount, amount, payment_status, paid_at, due_date').not('bank_account_id', 'is', null);
      if (error) return [];
      return data || [];
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

  const chartData = useMemo(() => {
    const from = dateFrom || format(subDays(new Date(), 7), 'yyyy-MM-dd');
    const to = dateTo || format(new Date(), 'yyyy-MM-dd');
    const days = eachDayOfInterval({ start: parseISO(from), end: parseISO(to) });
    const map: Record<string, { receber: number; pagar: number }> = {};

    for (const d of days) {
      const key = format(d, 'yyyy-MM-dd');
      map[key] = { receber: 0, pagar: 0 };
    }

    for (const p of payments) {
      const installments = (p.payment_installments || []) as any[];
      for (const inst of installments) {
        if (inst.status === 'paid' || inst.paid_at) continue;
        const due = inst.due_date as string;
        if (map[due] !== undefined) map[due].receber += Number(inst.amount || 0);
      }
      if (p.has_entry_payment && !p.entry_paid_at) {
        const entryDate = p.entry_date as string;
        if (map[entryDate] !== undefined) map[entryDate].receber += Number(p.entry_amount || 0);
      }
    }

    for (const ap of payables) {
      if (ap.payment_status === 'pago' || ap.payment_status === 'paid' || ap.paid_at) continue;
      const due = ap.due_date as string;
      if (map[due] !== undefined) {
        const amount = Number(ap.amount || 0);
        map[due].pagar += amount - Number(ap.discount || 0) + Number(ap.interest || 0) + Number(ap.fine || 0);
      }
    }

    return days.map((d) => {
      const key = format(d, 'yyyy-MM-dd');
      return {
        date: format(d, 'dd/MM'),
        fullDate: format(d, 'dd/MM/yyyy'),
        receber: Math.round(map[key].receber * 100) / 100,
        pagar: Math.round(map[key].pagar * 100) / 100,
      };
    });
  }, [payments, payables, dateFrom, dateTo]);

  const monthlyChartData = useMemo(() => {
    const from = dateFrom || format(subDays(new Date(), 180), 'yyyy-MM-dd');
    const to = dateTo || format(new Date(), 'yyyy-MM-dd');
    const fromMonth = from.substring(0, 7);
    const toMonth = to.substring(0, 7);

    const months: Record<string, { receita: number; despesa: number }> = {};

    const allMonths: string[] = [];
    let current = parseISO(fromMonth + '-01');
    const end = parseISO(toMonth + '-01');
    while (current <= end) {
      const key = format(current, 'yyyy-MM');
      months[key] = { receita: 0, despesa: 0 };
      allMonths.push(key);
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }

    for (const inst of allInstallments) {
      const due = (inst.due_date as string || '').substring(0, 7);
      if (months[due] !== undefined) {
        months[due].receita += Number(inst.amount || 0);
      }
    }

    for (const ap of allPayables) {
      const due = (ap.due_date as string || '').substring(0, 7);
      if (months[due] !== undefined) {
        const amount = Number(ap.amount || 0);
        months[due].despesa += amount - Number(ap.discount || 0) + Number(ap.interest || 0) + Number(ap.fine || 0);
      }
    }

    const monthNames = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

    return allMonths.map((m) => {
      const [y, mon] = m.split('-');
      const idx = parseInt(mon, 10) - 1;
      return {
        month: `${monthNames[idx]}/${y.substring(2)}`,
        fullMonth: `${monthNames[idx]}/${y}`,
        receita: Math.round(months[m].receita * 100) / 100,
        despesa: Math.round(months[m].despesa * 100) / 100,
      };
    });
  }, [allInstallments, allPayables, dateFrom, dateTo]);

  const cashFlowChartData = useMemo(() => {
    const from = dateFrom || format(subDays(new Date(), 7), 'yyyy-MM-dd');
    const to = dateTo || format(new Date(), 'yyyy-MM-dd');
    const days = eachDayOfInterval({ start: parseISO(from), end: parseISO(to) });

    const currentBalance = bankAccounts.reduce((sum: number, acc: any) => sum + getBalance(acc.id), 0);

    const dailyFlow: Record<string, number> = {};
    for (const d of days) dailyFlow[format(d, 'yyyy-MM-dd')] = 0;

    for (const t of bankTxWithDate) {
      const dt = t.transaction_date as string;
      if (dailyFlow[dt] !== undefined) dailyFlow[dt] += Number(t.amount || 0);
    }

    for (const ep of entryPaymentsDated) {
      if (ep.entry_paid_at) {
        const dt = ep.entry_paid_at as string;
        if (dailyFlow[dt] !== undefined) dailyFlow[dt] += Number(ep.entry_paid_amount || ep.entry_amount || 0);
      }
    }

    for (const inst of installmentPaymentsDated) {
      if (inst.paid_at) {
        const dt = inst.paid_at as string;
        if (dailyFlow[dt] !== undefined) dailyFlow[dt] += Number(inst.paid_amount || inst.amount || 0);
      }
    }

    for (const ap of payablePaymentsDated) {
      if (ap.payment_status === 'pago' || ap.paid_at) {
        const dt = (ap.paid_at || ap.due_date) as string;
        if (dailyFlow[dt] !== undefined) dailyFlow[dt] -= Number(ap.paid_amount || ap.amount || 0);
      }
    }

    const allPayments = allInstallments.filter((i: any) => i.status !== 'paid' && !i.paid_at);
    for (const inst of allPayments) {
      const dt = (inst.due_date as string || '').substring(0, 10);
      if (dailyFlow[dt] !== undefined) dailyFlow[dt] += Number(inst.amount || 0);
    }

    const pendingPayables = allPayables.filter((ap: any) => ap.payment_status !== 'pago' && !ap.paid_at);
    for (const ap of pendingPayables) {
      const dt = (ap.due_date as string || '').substring(0, 10);
      if (dailyFlow[dt] !== undefined) {
        const amount = Number(ap.amount || 0);
        dailyFlow[dt] -= amount - Number(ap.discount || 0) + Number(ap.interest || 0) + Number(ap.fine || 0);
      }
    }

    let cumulativeFlow = 0;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const startBalance = currentBalance - Object.values(dailyFlow).reduce((s, v) => s + v, 0);

    return days.map((d) => {
      const key = format(d, 'yyyy-MM-dd');
      cumulativeFlow += dailyFlow[key];
      const balance = startBalance + cumulativeFlow;
      return {
        date: format(d, 'dd/MM'),
        fullDate: format(d, 'dd/MM/yyyy'),
        saldo: Math.round(balance * 100) / 100,
        isToday: key === todayStr,
        isPast: key <= todayStr,
      };
    });
  }, [bankAccounts, bankTxWithDate, entryPaymentsDated, installmentPaymentsDated, payablePaymentsDated, allInstallments, allPayables, dateFrom, dateTo]);

  const isLoading = loadingPayments || loadingPayables;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-gold/[0.01] animate-fade-in">
      <div className="max-w-[1700px] mx-auto px-4 md:px-8 py-10 pb-16">

        {/* Header */}
        <div className="relative mb-10">
          <div className="absolute inset-0 bg-gradient-to-r from-gold/5 via-transparent to-gold/5 rounded-3xl blur-3xl pointer-events-none" />
          <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-gold/20 rounded-2xl blur-xl" />
                  <div className="relative h-10 w-1.5 bg-gradient-to-b from-gold via-gold/80 to-gold/60 rounded-full" />
                </div>
                <div>
                  <h1 className="text-4xl md:text-[42px] font-display text-foreground tracking-[-0.03em] uppercase leading-none font-black">Dashboard Financeiro</h1>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="h-px flex-1 bg-gradient-to-r from-gold/40 to-transparent max-w-[120px]" />
                    <p className="text-[10px] font-black uppercase tracking-[0.5em] text-gold/70">David Melo Produções</p>
                    <div className="h-px flex-1 bg-gradient-to-l from-gold/40 to-transparent max-w-[120px]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Company Selector */}
        {companies.length > 0 && (
          <div className="mb-8">
            <div className="relative group max-w-xl">
              <div className="absolute inset-0 bg-gradient-to-r from-gold/5 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
              <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-border/20 p-5 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.06)] hover:shadow-[0_12px_50px_-12px_rgba(197,160,89,0.12)] transition-all duration-500">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-gold/10 to-gold/5 flex items-center justify-center border border-gold/10">
                    <Landmark size={14} className="text-gold/70" />
                  </div>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">Empresa / CNPJ</p>
                </div>
                <select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)} className="h-12 w-full rounded-xl border border-border/20 px-4 text-sm bg-white/60 focus:ring-2 focus:ring-gold/20 focus:border-gold/30 transition-all font-medium">
                  <option value="all">Consolidado (todas as empresas)</option>
                  {companies.map((company: any) => (
                    <option key={company.id} value={company.id}>{(company.trade_name || company.legal_name || 'Empresa')} {company.cnpj ? `- ${company.cnpj}` : ''}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="dashboard" className="mb-10">
          <div className="relative inline-flex">
            <div className="absolute inset-0 bg-gold/10 rounded-2xl blur-lg pointer-events-none" />
            <TabsList className="relative bg-white/90 backdrop-blur-xl rounded-2xl border border-border/15 p-1.5 h-14 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.06)]">
              <TabsTrigger value="dashboard" className="text-[10px] font-black uppercase tracking-[0.15em] rounded-xl px-8 h-10 data-[state=active]:bg-gradient-to-r data-[state=active]:from-gold data-[state=active]:via-gold/90 data-[state=active]:to-gold/80 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-gold/25 transition-all duration-300">
                <Receipt size={13} className="mr-2" />Dashboard
              </TabsTrigger>
              <TabsTrigger value="calendario" className="text-[10px] font-black uppercase tracking-[0.15em] rounded-xl px-8 h-10 data-[state=active]:bg-gradient-to-r data-[state=active]:from-gold data-[state=active]:via-gold/90 data-[state=active]:to-gold/80 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-gold/25 transition-all duration-300">
                <Calendar size={13} className="mr-2" />Calendário
              </TabsTrigger>
            </TabsList>
          </div>
        </Tabs>

        <TabsContent value="dashboard" className="space-y-10">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-32 gap-5">
              <div className="relative">
                <div className="absolute inset-0 bg-gold/20 rounded-full blur-xl animate-pulse" />
                <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-gold via-gold/80 to-gold/60 flex items-center justify-center shadow-xl shadow-gold/20">
                  <Loader2 className="w-7 h-7 text-white animate-spin" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-gold animate-pulse">Carregando dados...</p>
                <p className="text-[9px] text-muted-foreground/40 mt-1.5">Aguarde um momento</p>
              </div>
            </div>
          ) : (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Saldo Hoje */}
                <div className="group relative overflow-hidden rounded-[28px] border border-emerald-200/20 bg-gradient-to-br from-white via-emerald-50/[0.03] to-emerald-50/[0.06] shadow-[0_8px_40px_-12px_rgba(16,185,129,0.1)] hover:shadow-[0_16px_60px_-12px_rgba(16,185,129,0.18)] transition-all duration-500">
                  <div className="absolute -top-24 -right-24 w-48 h-48 bg-gradient-to-br from-emerald-500/[0.04] to-transparent rounded-full blur-3xl group-hover:from-emerald-500/[0.08] transition-all duration-700 pointer-events-none" />
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent" />
                  <div className="relative p-7">
                    <div className="flex items-center justify-between mb-8">
                      <div className="relative">
                        <div className="absolute inset-0 bg-emerald-500/10 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-500" />
                        <div className="relative w-13 h-13 rounded-2xl bg-gradient-to-br from-emerald-50 via-emerald-100/60 to-emerald-50 flex items-center justify-center border border-emerald-200/40 shadow-sm group-hover:scale-105 transition-transform duration-500">
                          <Landmark size={22} className="text-emerald-600" />
                        </div>
                      </div>
                      <span className="text-[8px] font-black uppercase tracking-[0.25em] text-emerald-600/60 bg-emerald-50/80 px-3.5 py-1.5 rounded-xl border border-emerald-200/30">Hoje</span>
                    </div>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 mb-2">Saldo Hoje</p>
                    <p className="text-[28px] font-display font-black tracking-tight text-foreground tabular-nums leading-none">{fmt(stats.saldoHoje)}</p>
                  </div>
                </div>

                {/* Movimentações previstas */}
                <div className="group relative overflow-hidden rounded-[28px] border border-gold/10 bg-gradient-to-br from-white via-gold/[0.01] to-gold/[0.03] shadow-[0_8px_40px_-12px_rgba(197,160,89,0.1)] hover:shadow-[0_16px_60px_-12px_rgba(197,160,89,0.18)] transition-all duration-500">
                  <div className="absolute -top-24 -right-24 w-48 h-48 bg-gradient-to-br from-gold/[0.04] to-transparent rounded-full blur-3xl group-hover:from-gold/[0.08] transition-all duration-700 pointer-events-none" />
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-gold/50 to-transparent" />
                  <div className="relative p-7">
                    <div className="flex items-center justify-between mb-8">
                      <div className="relative">
                        <div className="absolute inset-0 bg-gold/10 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-500" />
                        <div className="relative w-13 h-13 rounded-2xl bg-gradient-to-br from-gold/10 via-gold/15 to-gold/10 flex items-center justify-center border border-gold/20 shadow-sm group-hover:scale-105 transition-transform duration-500">
                          <TrendingUp size={22} className="text-gold" />
                        </div>
                      </div>
                      <span className="text-[8px] font-black uppercase tracking-[0.25em] text-gold/60 bg-gold/5 px-3.5 py-1.5 rounded-xl border border-gold/15">Previsão</span>
                    </div>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 mb-2">Movimentações previstas para hoje</p>
                    <p className={cn(
                      "text-[28px] font-display font-black tracking-tight tabular-nums leading-none",
                      stats.movPrevistasHoje >= 0 ? "text-emerald-600" : "text-red-400"
                    )}>{fmt(stats.movPrevistasHoje)}</p>
                  </div>
                </div>

                {/* Saldo previsto */}
                <div className="group relative overflow-hidden rounded-[28px] border border-amber-200/20 bg-gradient-to-br from-white via-amber-50/[0.03] to-amber-50/[0.06] shadow-[0_8px_40px_-12px_rgba(245,158,11,0.1)] hover:shadow-[0_16px_60px_-12px_rgba(245,158,11,0.18)] transition-all duration-500">
                  <div className="absolute -top-24 -right-24 w-48 h-48 bg-gradient-to-br from-amber-500/[0.04] to-transparent rounded-full blur-3xl group-hover:from-amber-500/[0.08] transition-all duration-700 pointer-events-none" />
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />
                  <div className="relative p-7">
                    <div className="flex items-center justify-between mb-8">
                      <div className="relative">
                        <div className="absolute inset-0 bg-amber-500/10 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-500" />
                        <div className="relative w-13 h-13 rounded-2xl bg-gradient-to-br from-amber-50 via-amber-100/60 to-amber-50 flex items-center justify-center border border-amber-200/40 shadow-sm group-hover:scale-105 transition-transform duration-500">
                          <DollarSign size={22} className="text-amber-500" />
                        </div>
                      </div>
                      <span className="text-[8px] font-black uppercase tracking-[0.25em] text-amber-600/60 bg-amber-50/80 px-3.5 py-1.5 rounded-xl border border-amber-200/30">Projetado</span>
                    </div>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 mb-2">Saldo previsto para hoje</p>
                    <p className={cn(
                      "text-[28px] font-display font-black tracking-tight tabular-nums leading-none",
                      stats.saldoPrevisto >= 0 ? "text-emerald-600" : "text-red-400"
                    )}>{fmt(stats.saldoPrevisto)}</p>
                  </div>
                </div>
              </div>

              {/* Main Grid: Table + Accounts */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Pagamentos e Recebimentos */}
                <div className="lg:col-span-2">
                  <div className="relative overflow-hidden rounded-[28px] border border-border/15 bg-white/80 backdrop-blur-xl shadow-[0_8px_40px_-12px_rgba(0,0,0,0.06)]">
                    <div className="absolute -top-24 -right-24 w-48 h-48 bg-gradient-to-br from-gold/[0.03] to-transparent rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-gold/40 to-transparent" />

                    <div className="relative px-8 pt-8 pb-6">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <div className="absolute inset-0 bg-gold/15 rounded-2xl blur-xl" />
                            <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-gold via-gold/90 to-gold/70 flex items-center justify-center shadow-lg shadow-gold/15">
                              <Receipt size={18} className="text-white" />
                            </div>
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-foreground tracking-tight">Pagamentos e Recebimentos</h3>
                            <p className="text-[10px] text-muted-foreground/40 mt-0.5 font-medium">Valores por parcela no período</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 bg-gradient-to-r from-gold/8 via-gold/4 to-transparent border border-gold/10 rounded-xl px-4 py-2">
                          <Calendar size={13} className="text-gold/60" />
                          <span className="text-[11px] text-foreground/60 font-semibold tabular-nums">{`${dateFrom ? format(new Date(dateFrom + 'T12:00:00'), 'dd/MM/yyyy') : '?'} — ${dateTo ? format(new Date(dateTo + 'T12:00:00'), 'dd/MM/yyyy') : '?'}`}</span>
                        </div>
                      </div>

                      {/* Filters */}
                      <div className="relative mb-6 p-4 bg-secondary/20 rounded-2xl border border-border/10">
                        <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-gold/15 to-transparent" />
                        <div className="flex flex-wrap items-end gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50">Periodo inicial</Label>
                            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10 rounded-xl border-border/25 text-[13px] px-4 bg-white/70 focus:ring-2 focus:ring-gold/20 focus:border-gold/30 transition-all" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50">Periodo final</Label>
                            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10 rounded-xl border-border/25 text-[13px] px-4 bg-white/70 focus:ring-2 focus:ring-gold/20 focus:border-gold/30 transition-all" />
                          </div>
                        </div>
                      </div>

                      {/* Table */}
                      <div className="overflow-hidden rounded-2xl border border-border/10">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-gradient-to-r from-foreground/[0.02] to-foreground/[0.01]">
                              <th className="text-left py-3.5 px-5 text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/40 w-[180px]">Tipo</th>
                              <th className="text-right py-3.5 px-5 text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/40">Em Aberto</th>
                              <th className="text-right py-3.5 px-5 text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/40">Vencidos</th>
                              <th className="text-right py-3.5 px-5 text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/40">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/8">
                            <tr className="group hover:bg-emerald-50/30 transition-colors duration-300">
                              <td className="py-4 px-5">
                                <div className="flex items-center gap-3">
                                  <div className="relative">
                                    <div className="absolute inset-0 bg-emerald-500/8 rounded-xl blur-md" />
                                    <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 flex items-center justify-center border border-emerald-200/40">
                                      <ArrowDownCircle size={16} className="text-emerald-600" />
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-[13px] font-semibold text-foreground">A Receber</p>
                                    <p className="text-[9px] text-muted-foreground/40 font-medium">Receitas pendentes</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-4 px-5 text-right">
                                <span className="font-display text-[14px] tabular-nums text-foreground/60">{fmt(stats.receitaEmAberto)}</span>
                              </td>
                              <td className="py-4 px-5 text-right">
                                <span className="inline-flex items-center gap-1 font-display text-[14px] tabular-nums text-emerald-600 font-medium">
                                  {stats.receitaVencida > 0 && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                                  {fmt(stats.receitaVencida)}
                                </span>
                              </td>
                              <td className="py-4 px-5 text-right">
                                <span className="font-display text-[14px] tabular-nums text-foreground font-bold">{fmt(stats.receitaTotal)}</span>
                              </td>
                            </tr>
                            <tr className="group hover:bg-red-50/30 transition-colors duration-300">
                              <td className="py-4 px-5">
                                <div className="flex items-center gap-3">
                                  <div className="relative">
                                    <div className="absolute inset-0 bg-red-500/8 rounded-xl blur-md" />
                                    <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-red-50 to-red-100/50 flex items-center justify-center border border-red-200/40">
                                      <ArrowUpCircle size={16} className="text-red-400" />
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-[13px] font-semibold text-foreground">A Pagar</p>
                                    <p className="text-[9px] text-muted-foreground/40 font-medium">Despesas pendentes</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-4 px-5 text-right">
                                <span className="font-display text-[14px] tabular-nums text-foreground/60">{fmt(stats.despesaEmAberto)}</span>
                              </td>
                              <td className="py-4 px-5 text-right">
                                <span className="inline-flex items-center gap-1 font-display text-[14px] tabular-nums text-red-400 font-medium">
                                  {stats.despesaVencida > 0 && <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />}
                                  {fmt(stats.despesaVencida)}
                                </span>
                              </td>
                              <td className="py-4 px-5 text-right">
                                <span className="font-display text-[14px] tabular-nums text-foreground font-bold">{fmt(stats.despesaTotal)}</span>
                              </td>
                            </tr>
                            <tr className="bg-gradient-to-r from-gold/[0.03] to-transparent">
                              <td className="py-4 px-5 pl-14">
                                <p className="text-[13px] font-bold text-foreground">Total</p>
                              </td>
                              <td className="py-4 px-5 text-right">
                                <span className="font-display text-[14px] tabular-nums text-foreground font-bold">{fmt(stats.receitaEmAberto + stats.despesaEmAberto)}</span>
                              </td>
                              <td className="py-4 px-5 text-right">
                                <span className="font-display text-[14px] tabular-nums text-foreground font-bold">{fmt(stats.receitaVencida + stats.despesaVencida)}</span>
                              </td>
                              <td className="py-4 px-5 text-right">
                                <div className="inline-flex items-center gap-2 bg-gradient-to-r from-gold/10 to-gold/5 px-3.5 py-1 rounded-xl border border-gold/15">
                                  <span className="font-display text-[15px] tabular-nums text-gold font-black">{fmt(stats.receitaTotal + stats.despesaTotal)}</span>
                                </div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Saldo das contas */}
                <div className="lg:col-span-1">
                  <div className="relative overflow-hidden rounded-[28px] border border-border/15 bg-white/80 backdrop-blur-xl shadow-[0_8px_40px_-12px_rgba(0,0,0,0.06)] h-full flex flex-col">
                    <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br from-gold/[0.03] to-transparent rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-gold/40 to-transparent" />

                    <div className="relative px-7 pt-7 pb-5 flex-1 flex flex-col">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="absolute inset-0 bg-gold/15 rounded-2xl blur-xl" />
                            <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-br from-gold via-gold/90 to-gold/70 flex items-center justify-center shadow-lg shadow-gold/15">
                              <Wallet size={16} className="text-white" />
                            </div>
                          </div>
                          <div>
                            <h3 className="text-[15px] font-bold text-foreground tracking-tight">Saldo das contas</h3>
                            <p className="text-[10px] text-muted-foreground/40 mt-0.5 font-medium">{format(new Date(), 'dd/MM/yyyy')}</p>
                          </div>
                        </div>
                        <button onClick={() => setShowValues(!showValues)} className="w-8 h-8 rounded-xl bg-secondary/30 flex items-center justify-center border border-border/10 hover:bg-gold/5 hover:border-gold/15 transition-all duration-200">
                          {showValues ? <Eye size={14} className="text-muted-foreground/40" /> : <EyeOff size={14} className="text-muted-foreground/40" />}
                        </button>
                      </div>

                      {/* Accounts */}
                      <div className="flex-1 overflow-y-auto -mx-1 px-1">
                        <div className="space-y-1.5">
                          {bankAccounts.length === 0 ? (
                            <div className="text-center py-12">
                              <div className="relative inline-block mb-3">
                                <div className="absolute inset-0 bg-gold/8 rounded-2xl blur-lg" />
                                <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-secondary/40 to-secondary/20 flex items-center justify-center border border-border/10">
                                  <Landmark size={20} className="text-muted-foreground/20" />
                                </div>
                              </div>
                              <p className="text-[12px] text-muted-foreground/35 font-medium">Nenhuma conta</p>
                            </div>
                          ) : (
                            bankAccounts.map((acc: any) => {
                              const balance = getBalance(acc.id);
                              const isNegative = balance < -0.01;
                              return (
                                <div key={acc.id} className="group/item relative p-3.5 rounded-xl hover:bg-secondary/20 border border-transparent hover:border-border/10 transition-all duration-300 cursor-pointer">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <div className={cn("w-2 h-2 rounded-full", isNegative ? "bg-red-400" : "bg-emerald-500")} />
                                        <p className="text-[12px] font-semibold text-foreground truncate group-hover/item:text-gold transition-colors">{acc.bank_name || 'Sem banco'}</p>
                                      </div>
                                      <div className="ml-4 mt-1">
                                        {(acc.agency || acc.account_number) && (
                                          <p className="text-[9px] text-muted-foreground/35 tabular-nums font-medium">
                                            {acc.agency && `Ag. ${acc.agency}`}
                                            {acc.agency && acc.account_number && <span className="mx-1 text-border/30">·</span>}
                                            {acc.account_number && `Cc ${acc.account_number}${acc.account_digit || ''}`}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <span className={cn(
                                      "text-[13px] font-display font-bold tabular-nums whitespace-nowrap",
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
                        <div className="mt-4 pt-4 border-t border-border/10 relative">
                          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/25 to-transparent" />
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-gold" />
                              <p className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/40">Saldo Total</p>
                            </div>
                            <div className="bg-gradient-to-r from-gold/10 to-gold/5 px-3.5 py-1.5 rounded-xl border border-gold/15">
                              <p className="text-[15px] font-display font-black tabular-nums text-gold">
                                {showValues ? fmt(stats.saldoHoje) : '···'}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Quick Links */}
                      <div className="mt-5 space-y-1.5">
                        <div className="h-px bg-gradient-to-r from-transparent via-border/15 to-transparent" />
                        <a href="/conciliacao" className="flex items-center justify-between p-3 rounded-xl hover:bg-secondary/20 border border-transparent hover:border-border/10 transition-all duration-300 group/link">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-gold/8 to-gold/4 flex items-center justify-center border border-gold/8">
                              <ExternalLink size={12} className="text-gold/50" />
                            </div>
                            <span className="text-[11px] text-muted-foreground/50 font-medium group-hover/link:text-gold transition-colors">Conciliação bancária</span>
                          </div>
                          <ArrowRight size={13} className="text-muted-foreground/15 group-hover/link:text-gold/50 group-hover/link:translate-x-0.5 transition-all" />
                        </a>
                        <button type="button" onClick={() => setTransferOpen(true)} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-secondary/20 border border-transparent hover:border-border/10 transition-all duration-300 group/link cursor-pointer">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-gold/8 to-gold/4 flex items-center justify-center border border-gold/8">
                              <ArrowRightLeft size={12} className="text-gold/50" />
                            </div>
                            <span className="text-[11px] text-muted-foreground/50 font-medium group-hover/link:text-gold transition-colors">Transferência entre contas</span>
                          </div>
                          <ArrowRight size={13} className="text-muted-foreground/15 group-hover/link:text-gold/50 group-hover/link:translate-x-0.5 transition-all" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Charts */}
              <div className="space-y-6">
                {/* Receber x Pagar */}
                {chartData.length > 0 && (
                  <div className="relative overflow-hidden rounded-[28px] border border-border/15 bg-white/80 backdrop-blur-xl shadow-[0_8px_40px_-12px_rgba(0,0,0,0.06)]">
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
                    <div className="px-8 pt-7 pb-6">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="absolute inset-0 bg-gold/10 rounded-xl blur-lg" />
                            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-gold/15 to-gold/5 flex items-center justify-center border border-gold/15">
                              <Receipt size={15} className="text-gold" />
                            </div>
                          </div>
                          <div>
                            <h3 className="text-[15px] font-bold text-foreground tracking-tight">Receber x Pagar</h3>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 mt-0.5">Fluxo diário no período</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">
                          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-gold" /> A receber</div>
                          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-rose-400" /> A pagar</div>
                        </div>
                      </div>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} margin={{ top: 15, right: 10, left: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#aaa' }} tickLine={false} axisLine={{ stroke: '#eee' }} />
                            <YAxis tick={{ fontSize: 10, fill: '#aaa' }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                            <Tooltip
                              contentStyle={{ borderRadius: 12, border: '1px solid #eee', boxShadow: '0 8px 30px rgba(0,0,0,0.06)', fontSize: 12 }}
                              formatter={(value: number, name: string) => [fmt(value), name === 'receber' ? 'A receber' : 'A pagar']}
                              labelFormatter={(label, payload) => payload?.[0]?.payload?.fullDate || label}
                            />
                            <Bar dataKey="receber" fill="#C5A059" radius={[4, 4, 0, 0]} maxBarSize={36} />
                            <Bar dataKey="pagar" fill="#FB7185" radius={[4, 4, 0, 0]} maxBarSize={36} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}

                {/* Receitas x Despesas */}
                {monthlyChartData.length > 0 && (
                  <div className="relative overflow-hidden rounded-[28px] border border-border/15 bg-white/80 backdrop-blur-xl shadow-[0_8px_40px_-12px_rgba(0,0,0,0.06)]">
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#3B82F6]/30 to-transparent" />
                    <div className="px-8 pt-7 pb-6">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="absolute inset-0 bg-[#3B82F6]/10 rounded-xl blur-lg" />
                            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-[#3B82F6]/15 to-[#3B82F6]/5 flex items-center justify-center border border-[#3B82F6]/15">
                              <TrendingUp size={15} className="text-[#3B82F6]" />
                            </div>
                          </div>
                          <div>
                            <h3 className="text-[15px] font-bold text-foreground tracking-tight">Receitas x Despesas</h3>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 mt-0.5">Totais mensais no período</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">
                          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]" /> Receita</div>
                          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" /> Despesa</div>
                        </div>
                      </div>
                      <div className="h-[340px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={monthlyChartData} margin={{ top: 30, right: 10, left: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#666', fontWeight: 600 }} tickLine={false} axisLine={{ stroke: '#eee' }} />
                            <YAxis tick={{ fontSize: 10, fill: '#aaa' }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                            <Tooltip
                              contentStyle={{ borderRadius: 12, border: '1px solid #eee', boxShadow: '0 8px 30px rgba(0,0,0,0.06)', fontSize: 12, padding: '12px 16px' }}
                              formatter={(value: number, name: string) => [fmt(value), name === 'receita' ? 'Receita' : 'Despesa']}
                              labelFormatter={(label, payload) => payload?.[0]?.payload?.fullMonth || label}
                            />
                            <Bar dataKey="receita" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={50}>
                              <LabelList dataKey="receita" position="top" formatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : fmt(v)} style={{ fontSize: 9, fill: '#3B82F6', fontWeight: 700, rotate: -35, textAnchor: 'end' }} />
                            </Bar>
                            <Bar dataKey="despesa" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={50}>
                              <LabelList dataKey="despesa" position="top" formatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : fmt(v)} style={{ fontSize: 9, fill: '#EF4444', fontWeight: 700, rotate: -35, textAnchor: 'end' }} />
                            </Bar>
                            <Legend wrapperStyle={{ paddingTop: 16 }} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}

                {/* Fluxo de Caixa */}
                {cashFlowChartData.length > 0 && (() => {
                  return (
                    <div className="relative overflow-hidden rounded-[28px] border border-border/15 bg-white/80 backdrop-blur-xl shadow-[0_8px_40px_-12px_rgba(0,0,0,0.06)]">
                      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#3B82F6]/30 to-transparent" />
                      <div className="px-8 pt-7 pb-6">
                        <div className="flex items-center justify-between mb-6">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <div className="absolute inset-0 bg-[#3B82F6]/10 rounded-xl blur-lg" />
                              <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-[#3B82F6]/15 to-[#3B82F6]/5 flex items-center justify-center border border-[#3B82F6]/15">
                                <TrendingUp size={15} className="text-[#3B82F6]" />
                              </div>
                            </div>
                            <div>
                              <h3 className="text-[15px] font-bold text-foreground tracking-tight">Fluxo de caixa</h3>
                              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 mt-0.5">Saldo projetado por dia no período</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">
                            <div className="flex items-center gap-1.5"><div className="w-6 h-[2px] bg-[#3B82F6] rounded" /> Saldo real</div>
                            <div className="flex items-center gap-1.5"><div className="w-6 h-0 rounded" style={{ borderTop: '2px dashed #3B82F6' }} /> Projetado</div>
                          </div>
                        </div>
                        <div className="h-[340px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={cashFlowChartData} margin={{ top: 20, right: 20, left: 20, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
                              <XAxis
                                dataKey="date"
                                tick={({ x, y, payload }) => {
                                  const item = cashFlowChartData.find(d => d.date === payload.value);
                                  const isToday = item?.isToday;
                                  return (
                                    <text x={x} y={y + 12} textAnchor="middle" style={{ fontSize: 10, fill: isToday ? '#C5A059' : '#aaa', fontWeight: isToday ? 900 : 400, fontStyle: isToday ? 'italic' : 'normal' }}>
                                      {isToday ? 'Hoje' : payload.value}
                                    </text>
                                  );
                                }}
                                tickLine={false}
                                axisLine={{ stroke: '#eee' }}
                                angle={-35}
                                textAnchor="end"
                                height={50}
                              />
                              <YAxis tick={{ fontSize: 10, fill: '#aaa' }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                              <Tooltip
                                contentStyle={{ borderRadius: 12, border: '1px solid #eee', boxShadow: '0 8px 30px rgba(0,0,0,0.06)', fontSize: 12, padding: '12px 16px' }}
                                formatter={(value: number) => [fmt(value), 'Saldo']}
                                labelFormatter={(label, payload) => payload?.[0]?.payload?.fullDate || label}
                              />
                              <Line
                                type="monotone"
                                dataKey="saldo"
                                stroke="#3B82F6"
                                strokeWidth={2.5}
                                dot={{ r: 4, fill: '#3B82F6', stroke: '#fff', strokeWidth: 2 }}
                                activeDot={{ r: 6, fill: '#3B82F6', stroke: '#fff', strokeWidth: 2 }}
                              />
                              <Line
                                type="monotone"
                                dataKey={(d: any) => d.isPast ? null : d.saldo}
                                stroke="#3B82F6"
                                strokeWidth={2.5}
                                strokeDasharray="6 4"
                                dot={false}
                                activeDot={false}
                                legendType="none"
                              />
                              <ReferenceLine
                                x={cashFlowChartData.find(d => d.isToday)?.date}
                                stroke="#C5A059"
                                strokeWidth={1.5}
                                strokeDasharray="4 3"
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="calendario" className="mt-8">
          <CalendarTab selectedCompany={selectedCompany} />
        </TabsContent>

      </div>

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
      <DialogContent className="max-w-lg rounded-[28px] p-0 overflow-hidden max-h-[90vh] flex flex-col border-border/15 shadow-2xl">
        <div className="bg-gradient-to-r from-gold via-gold/90 to-gold/80 p-6 text-white shrink-0 relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
          <div className="relative">
            <DialogTitle className="text-xl font-display text-white tracking-tight">
              Transferência entre contas
            </DialogTitle>
            <p className="text-white/60 text-[9px] font-black uppercase tracking-[0.25em] mt-1.5">Movimentação interna de fundos</p>
          </div>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto min-h-0 flex-1">
          <div className="space-y-2">
            <Label className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/50">Conta origem</Label>
            <Select value={fromId} onValueChange={(v) => { setFromId(v); if (v === toId) setToId(''); }}>
              <SelectTrigger className="h-12 rounded-xl border-border/20"><SelectValue placeholder="Selecionar conta origem" /></SelectTrigger>
              <SelectContent>{accounts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.bank_name} - {a.account_number}{a.account_digit ? `-${a.account_digit}` : ''}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-center">
            <button type="button" onClick={handleSwap} className="w-8 h-8 rounded-full border border-border/20 flex items-center justify-center hover:bg-gold/10 hover:border-gold/25 transition-all">
              <ArrowRightLeft size={14} className="text-gold rotate-90" />
            </button>
          </div>

          <div className="space-y-2">
            <Label className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/50">Conta destino</Label>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger className="h-12 rounded-xl border-border/20"><SelectValue placeholder="Selecionar conta destino" /></SelectTrigger>
              <SelectContent>{filteredTo.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.bank_name} - {a.account_number}{a.account_digit ? `-${a.account_digit}` : ''}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/50">Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 rounded-xl border-border/20" />
            </div>
            <div className="space-y-2">
              <Label className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/50">Valor</Label>
              <Input value={amount} onChange={(e) => setAmount(maskCurrencyInput(e.target.value))} className="h-12 rounded-xl border-border/20 font-bold" placeholder="0,00" />
            </div>
          </div>

          {fromId && (
            <div className="border border-border/15 rounded-xl overflow-hidden">
              <div className="grid grid-cols-2 text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 border-b border-border/10">
                <div className="py-2 px-4">Conta</div>
                <div className="py-2 px-4 text-right">Saldo resultante</div>
              </div>
              <div className="grid grid-cols-2 items-center border-b border-border/10 bg-red-50/20">
                <div className="py-3 px-4 flex items-center gap-2">
                  <ArrowUpRight size={13} className="text-red-500" />
                  <span className="font-semibold text-[13px]">{fromAccount?.bank_name} {fromAccount?.account_number}</span>
                </div>
                <div className="py-3 px-4 text-right font-black text-[13px] text-red-500 tabular-nums">{fmtLocal(fromResult)}</div>
              </div>
              {toId && (
                <div className="grid grid-cols-2 items-center bg-emerald-50/20">
                  <div className="py-3 px-4 flex items-center gap-2">
                    <ArrowDownLeft size={13} className="text-emerald-500" />
                    <span className="font-semibold text-[13px]">{toAccount?.bank_name} {toAccount?.account_number}</span>
                  </div>
                  <div className="py-3 px-4 text-right font-black text-[13px] text-emerald-600 tabular-nums">{fmtLocal(toResult)}</div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/50">Comentário</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[60px] rounded-xl border-border/20" placeholder="Comentário sobre esta transferência" />
            <p className="text-[9px] text-muted-foreground/50 italic">* Comentários são visíveis apenas no extrato consolidado</p>
          </div>
        </div>
        <div className="p-5 pt-0 flex justify-end gap-3 shrink-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl uppercase text-[9px] font-black tracking-[0.15em]">Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending || !fromId || !toId || !Number.isFinite(parsedAmount) || parsedAmount <= 0} className="bg-gradient-to-r from-gold to-gold/80 text-white font-bold h-11 px-8 rounded-xl uppercase text-[9px] tracking-[0.15em] shadow-lg shadow-gold/20 hover:shadow-xl hover:shadow-gold/30 transition-all duration-300">
            {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRightLeft size={14} className="mr-2" />}
            Transferir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default FinancialDashboard;
