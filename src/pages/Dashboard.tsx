import { DollarSign, TrendingUp, Clock, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { format, startOfYear, startOfMonth, endOfMonth } from 'date-fns';
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
  
  // 1. Fetch KPI Totals
  const { data: kpis, isLoading: isLoadingKPIs } = useQuery({
    queryKey: ['dashboard_kpis'],
    queryFn: async () => {
      // Annual Revenue
      const { data: yearEvents } = await supabase
        .from('events')
        .select('budget_value')
        .gte('event_date', format(startOfYear(new Date()), 'yyyy-MM-dd'));
      
      const annualTotal = yearEvents?.reduce((acc, curr) => acc + Number(curr.budget_value || 0), 0) || 0;

      // Monthly Revenue
      const { data: monthEvents } = await supabase
        .from('events')
        .select('budget_value')
        .gte('event_date', format(currentMonthStart, 'yyyy-MM-dd'))
        .lte('event_date', format(endOfMonth(new Date()), 'yyyy-MM-dd'));
      
      const monthlyTotal = monthEvents?.reduce((acc, curr) => acc + Number(curr.budget_value || 0), 0) || 0;

      // Accounts Receivable (Pending installments)
      const { data: pendingInstallments } = await supabase
        .from('payment_installments')
        .select('amount')
        .eq('status', 'pending');
      
      const receivableTotal = pendingInstallments?.reduce((acc, curr) => acc + Number(curr.amount || 0), 0) || 0;

      return {
        annual: annualTotal,
        monthly: monthlyTotal,
        receivable: receivableTotal
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

      // In the real system, we'd fetch transactions or grouping from SQL
      // For now, let's aggregate from 'events' for revenue and 'accounts_payable' for expenses as a proxy
      const { data: events } = await supabase.from('events').select('budget_value, event_date');
      const { data: expenses } = await supabase.from('accounts_payable').select('amount, due_date');

      events?.forEach(e => {
        const eventDate = e.event_date ? new Date(e.event_date) : null;
        if (!eventDate || Number.isNaN(eventDate.getTime())) return;
        const monthIdx = eventDate.getMonth();
        if (monthIdx < 0 || monthIdx > 11) return;
        data[monthIdx].receitas += Number(e.budget_value || 0);
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
  const receivableCoverage = monthlyValue > 0 ? (receivableValue / monthlyValue) * 100 : 0;

  const recentQuarterData = (monthlyMetrics || []).slice(-4);
  const maskMonetary = (value: string) => (isAdmin ? value : 'R$ ••••••••');

  const kpiCards = [
    {
      label: 'Faturamento Anual',
      value: formatCurrency(annualValue),
      subValue: `${formatCurrency(avgRevenue)} media mensal`,
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
      label: 'A Receber no Mes',
      value: formatCurrency(receivableValue),
      subValue: `${pipelineTotal} oportunidades ativas`,
      icon: Clock,
      sensitive: true,
      cardClass: 'from-emerald-50 to-teal-50 border-emerald-200/50',
      iconClass: 'bg-emerald-100 text-emerald-700',
    },
  ];

  return (
    <div className="space-y-10 animate-fade-in max-w-[1600px] mx-auto p-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 border-b border-border/10 pb-8">
        <div>
          <h1 className="text-4xl font-display text-foreground tracking-tighter uppercase">Painel Executivo</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold mt-2">David Melo Produções & Eventos • Hub de Gestão</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">Última Atualização</p>
          <p className="text-xs font-bold text-foreground mt-1.5">{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          const restricted = kpi.sensitive && !isAdmin;
          const displayValue = restricted ? maskMonetary(kpi.value) : kpi.value;
          return (
            <div key={kpi.label} className={cn('premium-shadow rounded-2xl p-8 border bg-gradient-to-br hover:shadow-2xl transition-all duration-300 group relative overflow-hidden', kpi.cardClass)}>
              <div className="absolute top-0 right-0 w-36 h-36 bg-white/50 rounded-full -mr-20 -mt-20 group-hover:scale-110 transition-transform" />
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <p className="text-[10px] text-foreground/70 uppercase font-black tracking-[0.25em]">{kpi.label}</p>
                  <p className={cn('text-4xl font-display text-foreground mt-3 tracking-tighter transition-all', restricted && 'select-none')}>{displayValue}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/70 mt-2">{kpi.subValue}</p>
                  {restricted && <p className="text-[10px] font-black uppercase tracking-widest text-foreground/80 mt-2">Visao restrita para ADM</p>}
                </div>
                <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-sm', kpi.iconClass)}>
                  <Icon size={28} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Essential Indicators */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-display text-foreground uppercase tracking-tight">Indicadores Essenciais da Operação</h3>
          <span className="text-[10px] font-black uppercase tracking-widest text-gold">Eventos • CRM • Financeiro</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-border/40 bg-white p-5 premium-shadow">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Eventos no Ano</p>
            <p className="text-3xl font-display text-foreground mt-2">{totalEvents}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Volume total de projetos atendidos</p>
          </div>

          <div className="rounded-2xl border border-border/40 bg-white p-5 premium-shadow">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ticket Médio por Evento</p>
            <p className="text-3xl font-display text-foreground mt-2 select-none">{maskMonetary(formatCurrency(avgTicket))}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Receita média por contrato fechado</p>
          </div>

          <div className="rounded-2xl border border-border/40 bg-white p-5 premium-shadow">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Conversão Comercial</p>
            <p className="text-3xl font-display text-foreground mt-2">{conversionRate.toFixed(1)}%</p>
            <p className="text-[11px] text-muted-foreground mt-1">{pipelineWon} fechados de {pipelineTotal} oportunidades</p>
          </div>

          <div className="rounded-2xl border border-border/40 bg-white p-5 premium-shadow">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Margem Operacional Anual</p>
            <p className={cn('text-3xl font-display mt-2', annualMargin >= 20 ? 'text-emerald-700' : annualMargin > 0 ? 'text-amber-700' : 'text-rose-700')}>
              {annualMargin.toFixed(1)}%
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">Qualidade financeira da operação</p>
          </div>

          <div className="rounded-2xl border border-border/40 bg-white p-5 premium-shadow">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Lucro Operacional Anual</p>
            <p className="text-3xl font-display text-foreground mt-2 select-none">{maskMonetary(formatCurrency(annualProfit))}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Receitas menos despesas consolidadas</p>
          </div>

          <div className="rounded-2xl border border-border/40 bg-white p-5 premium-shadow">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Backlog em Negociação</p>
            <p className="text-3xl font-display text-foreground mt-2">{pipelineNegotiation}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{receivableCoverage.toFixed(1)}% do mês em contas a receber</p>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white premium-shadow rounded-2xl p-10 border border-border/40 transition-all hover:shadow-2xl">
          <div className="flex items-center justify-between mb-10">
            <h3 className="text-xl font-display text-foreground tracking-tight uppercase">Performance Trimestral</h3>
            <div className="px-3 py-1 rounded-full bg-gold/10 text-gold text-[10px] uppercase font-black tracking-widest">Receitas</div>
          </div>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={recentQuarterData} barGap={10}>
                <defs>
                  <linearGradient id="quarterRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C5A059" stopOpacity={1} />
                    <stop offset="100%" stopColor="#8E6C2E" stopOpacity={0.9} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="month" stroke="#666" fontSize={11} axisLine={false} tickLine={false} tick={{ dy: 10 }} />
                <YAxis stroke="#666" fontSize={11} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${Math.round(v / 1000)}k`} />
                <Tooltip 
                  cursor={{ fill: 'rgba(197, 160, 89, 0.08)' }}
                  formatter={(value: number) => [formatCurrency(value), 'Receita']}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #f0f0f0', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.12)', padding: '12px' }}
                />
                <Bar dataKey="receitas" fill="url(#quarterRevenue)" radius={[10, 10, 0, 0]} barSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 p-4 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-700">Melhor lucro mensal</span>
            <span className="font-display text-xl text-amber-900">{formatCurrency(bestProfit)}</span>
          </div>
        </div>

        <div className="bg-white premium-shadow rounded-2xl p-10 border border-border/40 transition-all hover:shadow-2xl">
          <div className="mb-6 text-center lg:text-left">
            <h3 className="text-xl font-display text-foreground tracking-tight uppercase">Eficiência do Pipeline</h3>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1 opacity-60">Matriz de Conversão CRM</p>
          </div>
          <div className="h-[220px] flex items-center justify-center relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  data={pipelineData} 
                  cx="50%" 
                  cy="50%" 
                  innerRadius={65} 
                  outerRadius={90} 
                  dataKey="value" 
                  paddingAngle={8}
                  stroke="none"
                >
                  {pipelineData?.map((entry, idx) => (
                    <Cell key={idx} fill={PIPELINE_COLORS[entry.name] || GOLD_COLORS[idx % GOLD_COLORS.length]} />
                  ))}
                </Pie>
                 <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #f0f0f0', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }} />
               </PieChart>
             </ResponsiveContainer>
             <div className="absolute flex flex-col items-center justify-center pointer-events-none">
               <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Ativos</span>
               <span className="text-2xl font-display text-foreground">{pipelineTotal}</span>
             </div>
           </div>
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Conversão de fechados</span>
            <span className="font-display text-lg text-emerald-800">{conversionRate.toFixed(1)}%</span>
          </div>
          {/* Pipeline Table */}
          <div className="mt-6 border-t border-border/20 pt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <th className="text-left pb-2">Estágio</th>
                  <th className="text-right pb-2">Qtd</th>
                  <th className="text-right pb-2">%</th>
                </tr>
              </thead>
              <tbody>
                {pipelineData?.map((entry) => {
                  const total = pipelineData.reduce((a, b) => a + b.value, 0) || 1;
                  const pct = ((entry.value / total) * 100).toFixed(1);
                  const color = PIPELINE_COLORS[entry.name] || '#C5A059';
                  return (
                    <tr key={entry.name} className="border-t border-border/10">
                      <td className="py-2 flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="font-bold text-foreground text-xs">{entry.name}</span>
                      </td>
                      <td className="text-right font-display text-foreground py-2">{entry.value}</td>
                      <td className="text-right text-muted-foreground font-bold py-2">{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Monthly Cashflow Chart */}
      <div className="bg-white premium-shadow rounded-2xl p-10 border border-border/40 transition-all hover:shadow-2xl">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h3 className="text-xl font-display text-foreground tracking-tight uppercase">Fluxo de Caixa Mensal</h3>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1 opacity-60">Análise de Receitas vs Despesas Operacionais</p>
          </div>
          <div className="flex gap-6 items-center">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-gold" /><span className="text-[9px] font-black uppercase text-muted-foreground">Receitas</span></div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-rose-300" /><span className="text-[9px] font-black uppercase text-muted-foreground">Despesas</span></div>
          </div>
        </div>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthlyMetrics}>
              <defs>
                <linearGradient id="revenueArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#C5A059" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#C5A059" stopOpacity={0.04} />
                </linearGradient>
                <linearGradient id="expenseArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FB7185" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#FB7185" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
              <XAxis dataKey="month" stroke="#666" fontSize={11} tickLine={false} axisLine={false} tick={{ dy: 15 }} />
              <YAxis stroke="#666" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${Math.round(v / 1000)}k`} />
              <Tooltip 
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{ backgroundColor: '#fff', border: 'none', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', padding: '16px' }}
              />
              <Area type="monotone" dataKey="receitas" stroke="#C5A059" strokeWidth={3} fill="url(#revenueArea)" name="Receitas" />
              <Area type="monotone" dataKey="despesas" stroke="#FB7185" strokeWidth={3} fill="url(#expenseArea)" name="Despesas" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* DRE Table */}
      <div className="bg-card premium-shadow rounded-2xl p-8 border border-border/40 overflow-hidden">
        <h3 className="text-lg font-display text-foreground mb-6">DRE Informativo - Resultados de Gestão</h3>
        <div className="overflow-x-auto -mx-8 px-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-secondary/20">
                {['Mês', 'Eventos', 'Receita Bruta', 'Despesas', 'Lucro Operacional', 'Margem', 'Status'].map(h => (
                  <th key={h} className="text-left py-4 px-4 text-muted-foreground font-black text-[9px] uppercase tracking-[0.2em]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {monthlyMetrics?.map((m) => {
                const lucro = m.receitas - m.despesas;
                const margem = m.receitas > 0 ? (lucro / m.receitas) * 100 : 0;
                return (
                  <tr key={m.month} className="hover:bg-secondary/20 transition-colors even:bg-secondary/[0.08]">
                    <td className="py-4 px-4 text-foreground font-black uppercase text-[10px] tracking-widest">{m.month}</td>
                    <td className="py-4 px-4 text-foreground font-bold">{m.eventos}</td>
                    <td className="py-4 px-4 text-emerald-600 font-bold">{formatCurrency(m.receitas)}</td>
                    <td className="py-4 px-4 text-rose-600 font-bold">{formatCurrency(m.despesas)}</td>
                    <td className={`py-4 px-4 font-bold ${lucro >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatCurrency(lucro)}</td>
                    <td className="py-4 px-4 font-medium">
                      <span className={cn(
                        "px-2 py-1 rounded text-[10px] font-black",
                        margem > 30 ? "bg-emerald-100 text-emerald-800" : margem > 0 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"
                      )}>
                        {margem.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-1.5 font-black text-[9px] uppercase tracking-wider text-muted-foreground opacity-60">
                         <div className={`w-1.5 h-1.5 rounded-full ${m.receitas > 0 ? 'bg-gold' : 'bg-slate-300'}`} /> {m.receitas > 0 ? 'Auditado' : 'Sem Dados'}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
