import { DollarSign, TrendingUp, Clock, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const GOLD_COLORS = ['#C5A059', '#B89451', '#D4AF37', '#997F3D', '#E5C185'];

const PIPELINE_COLORS: Record<string, string> = {
  'Novo Contato': 'hsl(45, 70%, 50%)',       // gold (same as kanban)
  'Orçamento Enviado': 'hsl(210, 60%, 50%)', // blue
  'Em Negociação': 'hsl(35, 80%, 55%)',      // orange
  'Fechados': 'hsl(142, 60%, 45%)',          // green
  'Perdidos': 'hsl(0, 60%, 50%)',            // red
};

const Dashboard = () => {
  const { isAdmin } = useAuth();
  const currentMonthStart = startOfMonth(new Date());
  const yearStart = format(startOfYear(new Date()), 'yyyy-MM-dd');
  const yearEnd = format(endOfYear(new Date()), 'yyyy-MM-dd');
  const monthStart = format(currentMonthStart, 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');
  
  // 1. Fetch KPI Totals
  const { data: kpis, isLoading: isLoadingKPIs } = useQuery({
    queryKey: ['dashboard_kpis'],
    queryFn: async () => {
      // Faturamento baseado nos contratos de Pagamentos
      const { data: yearPayments } = await supabase
        .from('payments')
        .select('total_event_value, created_at')
        .gte('created_at', `${yearStart}T00:00:00`)
        .lte('created_at', `${yearEnd}T23:59:59`);

      const annualTotal = (yearPayments || []).reduce(
        (acc: number, curr: any) => acc + Number(curr.total_event_value || 0),
        0
      );

      const { data: monthPayments } = await supabase
        .from('payments')
        .select('total_event_value, created_at')
        .gte('created_at', `${monthStart}T00:00:00`)
        .lte('created_at', `${monthEnd}T23:59:59`);

      const monthlyTotal = (monthPayments || []).reduce(
        (acc: number, curr: any) => acc + Number(curr.total_event_value || 0),
        0
      );

      // Contas a receber projetadas (mesma base da tela de Recebimentos)
      const { data: pendingInstallments } = await supabase
        .from('payment_installments')
        .select('amount, status')
        .in('status', ['pending', 'pendente']);

      const { data: pendingMonthInstallments } = await supabase
        .from('payment_installments')
        .select('amount, due_date, status')
        .gte('due_date', monthStart)
        .lte('due_date', monthEnd)
        .in('status', ['pending', 'pendente']);

      const receivableTotal = pendingInstallments?.reduce((acc, curr) => acc + Number(curr.amount || 0), 0) || 0;
      const receivableMonthTotal = pendingMonthInstallments?.reduce((acc, curr) => acc + Number(curr.amount || 0), 0) || 0;

      return {
        annual: annualTotal,
        monthly: monthlyTotal,
        receivable: receivableTotal,
        receivableMonth: receivableMonthTotal,
      };
    }
  });

  // 2. Fetch CRM Pipeline
  const { data: pipelineData, isLoading: isLoadingCRM } = useQuery({
    queryKey: ['dashboard_pipeline'],
    queryFn: async () => {
      const { data: leads } = await supabase.from('leads').select('stage');
      const counts: Record<string, number> = {
        'novo_contato': 0,
        'orcamento_enviado': 0,
        'em_negociacao': 0,
        'fechados': 0,
        'perdidos': 0
      };
      
      leads?.forEach(l => {
        if (counts[l.stage] !== undefined) counts[l.stage]++;
      });

      return [
        { name: 'Novo Contato', value: counts.novo_contato },
        { name: 'Orçamento Enviado', value: counts.orcamento_enviado },
        { name: 'Em Negociação', value: counts.em_negociacao },
        { name: 'Fechados', value: counts.fechados },
        { name: 'Perdidos', value: counts.perdidos },
      ];
    }
  });

  // 3. Monthly Metrics for Charts & DRE
  const { data: monthlyMetrics, isLoading: isLoadingMetrics } = useQuery({
    queryKey: ['dashboard_metrics'],
    queryFn: async () => {
      const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const data = months.map(m => ({
        month: m,
        receitas: 0,
        despesas: 0,
        eventos: 0
      }));

      const { data: installments } = await supabase
        .from('payment_installments')
        .select('amount, due_date, paid_at, status')
        .gte('due_date', yearStart)
        .lte('due_date', yearEnd);

      const { data: entryPayments } = await supabase
        .from('payments')
        .select('entry_amount, entry_date, has_entry_payment')
        .eq('has_entry_payment', true)
        .gte('entry_date', yearStart)
        .lte('entry_date', yearEnd);

      const { data: events } = await supabase
        .from('events')
        .select('event_date')
        .gte('event_date', yearStart)
        .lte('event_date', yearEnd);

      let expenses: { amount: number; due_date: string }[] | null = null;
      try {
        const res = await supabase
          .from('accounts_payable')
          .select('amount, due_date')
          .gte('due_date', yearStart)
          .lte('due_date', yearEnd);
        if (!res.error) expenses = res.data;
      } catch {
        // table may not exist in schema cache
      }

      installments?.forEach((inst) => {
        const refDate = inst.status === 'paid' && inst.paid_at ? new Date(inst.paid_at) : new Date(inst.due_date);
        if (Number.isNaN(refDate.getTime())) return;
        const monthIdx = refDate.getMonth();
        if (monthIdx < 0 || monthIdx > 11) return;
        data[monthIdx].receitas += Number(inst.amount || 0);
      });

      entryPayments?.forEach((pay) => {
        const entryDate = pay.entry_date ? new Date(pay.entry_date) : null;
        if (!entryDate || Number.isNaN(entryDate.getTime())) return;
        const monthIdx = entryDate.getMonth();
        if (monthIdx < 0 || monthIdx > 11) return;
        data[monthIdx].receitas += Number(pay.entry_amount || 0);
      });

      events?.forEach(e => {
        const eventDate = e.event_date ? new Date(e.event_date) : null;
        if (!eventDate || Number.isNaN(eventDate.getTime())) return;
        const monthIdx = eventDate.getMonth();
        if (monthIdx < 0 || monthIdx > 11) return;
        data[monthIdx].eventos++;
      });

      expenses?.forEach(ex => {
        const dueDate = ex.due_date ? new Date(ex.due_date) : null;
        if (!dueDate || Number.isNaN(dueDate.getTime())) return;
        const monthIdx = dueDate.getMonth();
        if (monthIdx < 0 || monthIdx > 11) return;
        data[monthIdx].despesas += Number(ex.amount || 0);
      });

      return data;
    }
  });

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const formatCurrencyNoCents = (val: number) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val || 0);

  if (isLoadingKPIs || isLoadingCRM || isLoadingMetrics) {
    return (
      <div className="h-[80vh] flex flex-col items-center justify-center gap-6">
        <Loader2 className="w-12 h-12 text-gold animate-spin" />
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-gold animate-pulse">Sincronizando Ecossistema David Melo...</p>
      </div>
    );
  }

  const annualValue = kpis?.annual || 0;
  const monthlyValue = kpis?.monthly || 0;
  const receivableValue = kpis?.receivable || 0;
  const receivableMonthValue = kpis?.receivableMonth || 0;

  const pipelineTotal = pipelineData?.reduce((acc, item) => acc + item.value, 0) || 0;
  const pipelineWon = pipelineData?.find((item) => item.name === 'Fechados')?.value || 0;
  const pipelineNegotiation = pipelineData?.find((item) => item.name === 'Em Negociação')?.value || 0;
  const conversionRate = pipelineTotal > 0 ? (pipelineWon / pipelineTotal) * 100 : 0;

  const monthlyProfit = (monthlyMetrics || []).map((m) => m.receitas - m.despesas);
  const bestProfit = monthlyProfit.length > 0 ? Math.max(...monthlyProfit) : 0;
  const avgRevenue = (monthlyMetrics || []).reduce((acc, m) => acc + m.receitas, 0) / 12;
  const totalEvents = (monthlyMetrics || []).reduce((acc, m) => acc + m.eventos, 0);
  const totalRevenue = (monthlyMetrics || []).reduce((acc, m) => acc + m.receitas, 0);
  const totalExpenses = (monthlyMetrics || []).reduce((acc, m) => acc + m.despesas, 0);
  const annualProfit = totalRevenue - totalExpenses;
  const avgTicket = totalEvents > 0 ? totalRevenue / totalEvents : 0;
  const annualMargin = totalRevenue > 0 ? (annualProfit / totalRevenue) * 100 : 0;
  const receivableCoverage = monthlyValue > 0 ? (receivableMonthValue / monthlyValue) * 100 : 0;

  const currentMonthIndex = new Date().getMonth();
  const quarterStartIndex = Math.max(0, currentMonthIndex - 3);
  const recentQuarterData = (monthlyMetrics || []).slice(quarterStartIndex, currentMonthIndex + 1);
  const maskMonetary = (value: string) => (isAdmin ? value : 'R$ ••••••••');
  const maskCurrency = (value: number) => (isAdmin ? formatCurrency(value) : 'R$ ••••••••');
  const financialChartData = isAdmin
    ? (monthlyMetrics || [])
    : (monthlyMetrics || []).map((m) => ({ ...m, receitas: 0, despesas: 0 }));
  const financialQuarterData = isAdmin
    ? recentQuarterData
    : recentQuarterData.map((m) => ({ ...m, receitas: 0, despesas: 0 }));

  const dreRows = (monthlyMetrics || []).map((m) => {
    const lucro = m.receitas - m.despesas;
    const margem = m.receitas > 0 ? (lucro / m.receitas) * 100 : 0;
    return { ...m, lucro, margem };
  });
  const profitableMonths = dreRows.filter((row) => row.lucro > 0).length;
  const bestDreMonth = dreRows.reduce(
    (best, row) => (row.lucro > best.lucro ? row : best),
    dreRows[0] || { month: '-', lucro: 0 }
  );
  const worstDreMonth = dreRows.reduce(
    (worst, row) => (row.lucro < worst.lucro ? row : worst),
    dreRows[0] || { month: '-', lucro: 0 }
  );

  const kpiCards = [
    {
      label: 'Faturamento Anual',
      value: formatCurrency(annualValue),
      subValue: `${maskCurrency(avgRevenue)} media mensal`,
      icon: DollarSign,
      sensitive: true,
      cardClass: 'from-amber-50 to-yellow-50 border-amber-200/50',
      iconClass: 'bg-amber-100 text-amber-700',
    },
    {
      label: 'Vendas do Mes',
      value: formatCurrency(monthlyValue),
      subValue: `${conversionRate.toFixed(1)}% taxa de conversao`,
      icon: TrendingUp,
      sensitive: true,
      cardClass: 'from-blue-50 to-cyan-50 border-blue-200/50',
      iconClass: 'bg-blue-100 text-blue-700',
    },
    {
      label: 'A Receber Projetado',
      value: formatCurrency(receivableValue),
      subValue: `${pipelineTotal} oportunidades ativas`,
      icon: Clock,
      sensitive: true,
      cardClass: 'from-emerald-50 to-teal-50 border-emerald-200/50',
      iconClass: 'bg-emerald-100 text-emerald-700',
    },
  ];

  const essentialIndicators = [
    {
      title: 'Eventos no Ano',
      value: String(totalEvents),
      subtitle: 'Volume total de projetos atendidos',
      badge: 'Operacao',
      tone: 'border-l-amber-500 bg-amber-50/70',
    },
    {
      title: 'Ticket Medio por Evento',
      value: maskMonetary(formatCurrency(avgTicket)),
      subtitle: 'Receita media por contrato fechado',
      badge: 'Comercial',
      tone: 'border-l-sky-500 bg-sky-50/70',
    },
    {
      title: 'Conversao Comercial',
      value: `${conversionRate.toFixed(1)}%`,
      subtitle: `${pipelineWon} fechados de ${pipelineTotal} oportunidades`,
      badge: 'CRM',
      tone: 'border-l-emerald-500 bg-emerald-50/70',
    },
    {
      title: 'Margem Operacional Anual',
      value: `${annualMargin.toFixed(1)}%`,
      subtitle: 'Qualidade financeira da operacao',
      badge: 'Financeiro',
      tone: 'border-l-rose-500 bg-rose-50/70',
      valueClass: annualMargin >= 20 ? 'text-emerald-700' : annualMargin > 0 ? 'text-amber-700' : 'text-rose-700',
    },
    {
      title: 'Lucro Operacional Anual',
      value: maskMonetary(formatCurrency(annualProfit)),
      subtitle: 'Receitas menos despesas consolidadas',
      badge: 'Resultado',
      tone: 'border-l-indigo-500 bg-indigo-50/70',
    },
    {
      title: 'Backlog em Negociação',
      value: String(pipelineNegotiation),
      subtitle: `${receivableCoverage.toFixed(1)}% do mês em contas a receber`,
      badge: 'Pipeline',
      tone: 'border-l-teal-500 bg-teal-50/70',
    },
  ];

  return (
    <div className="space-y-10 animate-fade-in max-w-[1700px] mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 px-2">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 bg-gold rounded-full" />
            <h1 className="text-4xl md:text-5xl font-display text-foreground tracking-tighter uppercase leading-none">Painel Executivo</h1>
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.4em] text-gold/80 pl-4">David Melo Produções & Eventos • Hub de Inteligência</p>
        </div>
        <div className="bg-white/50 backdrop-blur-sm border border-border/50 rounded-2xl px-6 py-3 premium-shadow flex items-center gap-6">
          <div className="text-right">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">Status do Sistema</p>
            <div className="flex items-center justify-end gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-bold text-emerald-700 uppercase">Sincronizado</span>
            </div>
          </div>
          <div className="h-8 w-px bg-border/40" />
          <div className="text-right">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">Última Atualização</p>
            <p className="text-xs font-black text-foreground">{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-2">
        {kpiCards.map((kpi, idx) => {
          const Icon = kpi.icon;
          const restricted = kpi.sensitive && !isAdmin;
          const displayValue = restricted ? maskMonetary(kpi.value) : kpi.value;
          return (
            <div key={kpi.label} className={cn(
              'group relative overflow-hidden rounded-[32px] border p-8 transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl bg-white bg-gradient-to-br',
              kpi.cardClass
            )}>
              <div className="absolute -right-4 -top-4 h-32 w-32 rounded-full bg-white/40 blur-2xl group-hover:bg-white/60 transition-all duration-700" />
              
              <div className="relative z-10 flex flex-col h-full justify-between gap-8">
                <div className="flex items-start justify-between">
                  <div className={cn('p-3 rounded-2xl transition-all duration-500 group-hover:scale-110 shadow-sm', kpi.iconClass)}>
                    <Icon size={24} />
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground/40">{kpi.label}</p>
                    {restricted && <span className="text-[8px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Restrito</span>}
                  </div>
                </div>

                <div>
                  <p className={cn('text-4xl lg:text-5xl font-display text-foreground tracking-tighter transition-all', restricted && 'blur-sm select-none')}>
                    {displayValue}
                  </p>
                  <div className="mt-4 flex items-center gap-2">
                    <div className="h-px flex-1 bg-foreground/10" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/50 whitespace-nowrap">{kpi.subValue}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 px-2">
        {/* Indicators Bento */}
        <div className="xl:col-span-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {essentialIndicators.map((indicator, idx) => (
            <div key={indicator.title} className={cn(
              'rounded-[24px] border p-6 transition-all duration-300 hover:shadow-lg bg-white relative overflow-hidden group border-l-4',
              indicator.tone
            )}>
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-secondary/50 text-foreground/60 border border-border/20">
                    {indicator.badge}
                  </span>
                </div>
                <p className={cn('text-2xl font-display text-foreground mb-1 select-none', indicator.valueClass)}>{indicator.value}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 leading-tight">{indicator.title}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Pipeline Chart Bento */}
        <div className="xl:col-span-2 bg-white rounded-[32px] border p-8 premium-shadow relative overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-display text-foreground uppercase tracking-tight">Fluxo de Conversão CRM</h3>
              <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-1 opacity-60">Status atual das oportunidades</p>
            </div>
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 px-4 py-2 rounded-2xl">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-black text-emerald-800 uppercase tracking-widest">{conversionRate.toFixed(1)}% Taxa de Sucesso</span>
            </div>
          </div>
          
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div className="h-[280px] flex items-center justify-center relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={pipelineData} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={80} 
                    outerRadius={110} 
                    dataKey="value" 
                    paddingAngle={6}
                    stroke="none"
                  >
                    {pipelineData?.map((entry, idx) => (
                      <Cell 
                        key={idx} 
                        fill={PIPELINE_COLORS[entry.name] || GOLD_COLORS[idx % GOLD_COLORS.length]} 
                        className="hover:opacity-80 transition-opacity cursor-pointer outline-none"
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: 'none', borderRadius: '20px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)', padding: '16px' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-1">Pipeline Total</span>
                <span className="text-5xl font-display text-foreground leading-none">{pipelineTotal}</span>
                <span className="text-[9px] font-bold text-gold uppercase tracking-widest mt-2">Ativos</span>
              </div>
            </div>

            <div className="space-y-3">
              {pipelineData?.map((entry) => {
                const total = pipelineData.reduce((a, b) => a + b.value, 0) || 1;
                const pct = ((entry.value / total) * 100).toFixed(1);
                const color = PIPELINE_COLORS[entry.name] || '#C5A059';
                return (
                  <div key={entry.name} className="flex items-center justify-between p-3 rounded-2xl bg-secondary/30 hover:bg-secondary/50 transition-colors border border-transparent hover:border-border/50">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: color }} />
                      <span className="text-[11px] font-black text-foreground uppercase tracking-wider">{entry.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-display text-foreground mr-3">{entry.value}</span>
                      <span className="text-[10px] font-bold text-muted-foreground/60">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Big Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-2">
        {/* Cashflow Chart */}
        <div className="bg-white rounded-[32px] border p-8 md:p-10 premium-shadow relative overflow-hidden group">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-10 gap-4">
            <div>
              <h3 className="text-2xl font-display text-foreground uppercase tracking-tight">Fluxo de Caixa Mensal</h3>
              <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-1 opacity-60">Visão consolidada do ano vigente</p>
            </div>
            <div className="flex gap-4 p-2 bg-secondary/30 rounded-2xl">
              <div className="flex items-center gap-2 px-3 py-1 bg-white rounded-xl shadow-sm">
                <div className="w-2.5 h-2.5 rounded-full bg-gold" />
                <span className="text-[10px] font-black uppercase text-foreground">Receitas</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                <span className="text-[10px] font-black uppercase text-muted-foreground">Despesas</span>
              </div>
            </div>
          </div>
          
          <div className="h-[380px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={financialChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--gold))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--gold))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expenseArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FB7185" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#FB7185" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tick={{ dy: 15 }} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => (isAdmin ? formatCurrencyNoCents(Number(v)) : 'R$ •••')} />
                <Tooltip 
                  cursor={{ stroke: 'hsl(var(--gold))', strokeWidth: 1, strokeDasharray: '4 4' }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-white/95 backdrop-blur-md border border-border/50 p-4 rounded-2xl shadow-2xl space-y-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
                          <div className="space-y-1">
                            <p className="text-sm font-display text-emerald-600 flex justify-between gap-4">
                              <span>Receita:</span>
                              <span>{maskCurrency(payload[0].value as number)}</span>
                            </p>
                            <p className="text-sm font-display text-rose-600 flex justify-between gap-4">
                              <span>Despesa:</span>
                              <span>{maskCurrency(payload[1].value as number)}</span>
                            </p>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area type="monotone" dataKey="receitas" stroke="hsl(var(--gold))" strokeWidth={4} fill="url(#revenueArea)" animationDuration={2000} />
                <Area type="monotone" dataKey="despesas" stroke="#FB7185" strokeWidth={3} fill="url(#expenseArea)" strokeDasharray="5 5" animationDuration={2000} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quarterly Performance Chart */}
        <div className="bg-white rounded-[32px] border p-8 md:p-10 premium-shadow relative overflow-hidden group">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h3 className="text-2xl font-display text-foreground uppercase tracking-tight">Performance Trimestral</h3>
              <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-1 opacity-60">Volume de receitas por período</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 p-4 rounded-[24px]">
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-700 mb-1">Recorde Mensal</p>
              <p className="text-xl font-display text-amber-900 select-none leading-none">{maskCurrency(bestProfit)}</p>
            </div>
          </div>

          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financialQuarterData} barGap={12}>
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--gold))" />
                    <stop offset="100%" stopColor="hsl(var(--gold-dark))" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} axisLine={false} tickLine={false} tick={{ dy: 10 }} />
                <YAxis stroke="#94a3b8" fontSize={11} axisLine={false} tickLine={false} tickFormatter={(v) => (isAdmin ? formatCurrencyNoCents(Number(v)) : 'R$ •••')} />
                <Tooltip 
                  cursor={{ fill: 'rgba(197, 160, 89, 0.05)', radius: 12 }}
                  contentStyle={{ backgroundColor: '#fff', border: 'none', borderRadius: '20px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)', padding: '16px' }}
                  formatter={(value: number) => [maskCurrency(value), 'Faturamento']}
                />
                <Bar 
                  dataKey="receitas" 
                  fill="url(#barGradient)" 
                  radius={[12, 12, 4, 4]} 
                  barSize={50}
                  animationDuration={1500}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* DRE Table Bento */}
      <div className="px-2">
        <div className="bg-white rounded-[32px] border border-border/60 overflow-hidden premium-shadow">
          <div className="p-8 md:p-10 border-b border-border/40 bg-gradient-to-r from-white via-white to-secondary/20">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
              <div className="space-y-2">
                <h3 className="text-3xl font-display text-foreground uppercase tracking-tighter">Demonstrativo de Resultado (DRE)</h3>
                <p className="text-[11px] text-muted-foreground font-black uppercase tracking-[0.3em] opacity-60">Análise granular de performance financeira mensal</p>
              </div>
              <div className="flex flex-wrap gap-4">
                <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-[24px] min-w-[140px]">
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700 mb-2">Saúde da Operação</p>
                  <p className="text-2xl font-display text-emerald-900">{profitableMonths}<span className="text-sm opacity-40 ml-1">/12 meses</span></p>
                </div>
                <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-[24px] min-w-[140px]">
                  <p className="text-[9px] font-black uppercase tracking-widest text-indigo-700 mb-2">Margem Média</p>
                  <p className="text-2xl font-display text-indigo-900">{annualMargin.toFixed(1)}%</p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 md:p-10 overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 border-b border-border/40">
                  <th className="text-left pb-6 px-4">Período</th>
                  <th className="text-left pb-6 px-4">Eventos</th>
                  <th className="text-left pb-6 px-4">Receita Bruta</th>
                  <th className="text-left pb-6 px-4">Custo Operacional</th>
                  <th className="text-left pb-6 px-4">Resultado Líquido</th>
                  <th className="text-left pb-6 px-4">Eficiência</th>
                  <th className="text-right pb-6 px-4">Certificação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {dreRows.map((row) => (
                  <tr key={row.month} className="group hover:bg-secondary/40 transition-all duration-300">
                    <td className="py-6 px-4">
                      <span className="text-[11px] font-black uppercase tracking-[0.15em] text-foreground group-hover:text-gold transition-colors">{row.month}</span>
                    </td>
                    <td className="py-6 px-4">
                      <div className="flex items-center gap-2">
                        <span className="h-6 w-6 rounded-lg bg-secondary/50 flex items-center justify-center text-[10px] font-black">{row.eventos}</span>
                        <span className="text-xs font-bold text-muted-foreground">Projetos</span>
                      </div>
                    </td>
                    <td className="py-6 px-4">
                      <span className="text-sm font-display text-emerald-700">{maskMonetary(formatCurrency(row.receitas))}</span>
                    </td>
                    <td className="py-6 px-4">
                      <span className="text-sm font-display text-rose-600/80">{maskMonetary(formatCurrency(row.despesas))}</span>
                    </td>
                    <td className="py-6 px-4">
                      <div className={cn(
                        'inline-flex items-center px-4 py-1.5 rounded-2xl text-sm font-display shadow-sm',
                        row.lucro >= 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
                      )}>
                        {maskMonetary(formatCurrency(row.lucro))}
                      </div>
                    </td>
                    <td className="py-6 px-4 min-w-[180px]">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 rounded-full bg-secondary/80 overflow-hidden p-0.5">
                          <div
                            className={cn('h-full rounded-full transition-all duration-1000', row.margem >= 30 ? 'bg-emerald-500' : row.margem > 0 ? 'bg-amber-500' : 'bg-rose-500')}
                            style={{ width: `${Math.min(Math.max(row.margem, 0), 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-black text-foreground/60 w-10">{row.margem.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="py-6 px-4 text-right">
                      <div className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest',
                        row.receitas > 0 ? 'bg-gold/10 text-gold' : 'bg-slate-100 text-slate-400'
                      )}>
                        <div className={cn('w-1.5 h-1.5 rounded-full', row.receitas > 0 ? 'bg-gold animate-pulse' : 'bg-slate-300')} />
                        {row.receitas > 0 ? 'Consolidado' : 'Aguardando'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
