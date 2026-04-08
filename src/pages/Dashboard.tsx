import { DollarSign, TrendingUp, Clock, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { format, startOfYear, startOfMonth, endOfMonth } from 'date-fns';
import { cn } from '@/lib/utils';

const GOLD_COLORS = ['#C5A059', '#B89451', '#D4AF37', '#997F3D', '#E5C185'];

const Dashboard = () => {
  const currentYear = new Date().getFullYear();
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
        const monthIdx = new Date(e.event_date).getMonth();
        data[monthIdx].receitas += Number(e.budget_value || 0);
        data[monthIdx].eventos++;
      });

      expenses?.forEach(ex => {
        const monthIdx = new Date(ex.due_date).getMonth();
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

  const kpiCards = [
    { label: 'Faturamento Anual', value: formatCurrency(kpis?.annual || 0), icon: DollarSign },
    { label: 'Vendas do Mês', value: formatCurrency(kpis?.monthly || 0), icon: TrendingUp },
    { label: 'A Receber no Mês', value: formatCurrency(kpis?.receivable || 0), icon: Clock },
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
          return (
            <div key={kpi.label} className="bg-white premium-shadow rounded-2xl p-8 border border-border/40 hover:border-gold/30 transition-all duration-300 group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gold/[0.03] rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform" />
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-black tracking-[0.25em]">{kpi.label}</p>
                  <p className="text-4xl font-display text-foreground mt-3 tracking-tighter">{kpi.value}</p>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-secondary/30 flex items-center justify-center text-gold group-hover:bg-gold group-hover:text-white transition-all duration-500 shadow-sm">
                  <Icon size={28} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white premium-shadow rounded-2xl p-10 border border-border/40 transition-all hover:shadow-2xl">
          <div className="flex items-center justify-between mb-10">
            <h3 className="text-xl font-display text-foreground tracking-tight uppercase">Performance Trimestral</h3>
            <div className="w-2 h-2 rounded-full bg-gold animate-pulse" />
          </div>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyMetrics?.slice(0, 4)} barGap={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="month" stroke="#666" fontSize={11} axisLine={false} tickLine={false} tick={{ dy: 10 }} />
                <YAxis stroke="#666" fontSize={11} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${v/1000}k`} />
                <Tooltip 
                  cursor={{ fill: 'rgba(197, 160, 89, 0.05)' }}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #f0f0f0', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', padding: '12px' }}
                  itemStyle={{ fontSize: '11px', color: '#C5A059', fontWeight: 'bold', textTransform: 'uppercase' }}
                  labelStyle={{ fontWeight: 'bold', color: '#000', marginBottom: '4px' }}
                />
                <Bar dataKey="receitas" fill="#C5A059" radius={[6, 6, 0, 0]} barSize={45} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white premium-shadow rounded-2xl p-10 border border-border/40 transition-all hover:shadow-2xl">
          <div className="mb-10 text-center lg:text-left">
            <h3 className="text-xl font-display text-foreground tracking-tight uppercase">Eficiência do Pipeline</h3>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1 opacity-60">Matriz de Conversão CRM</p>
          </div>
          <div className="h-[350px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  data={pipelineData} 
                  cx="50%" 
                  cy="50%" 
                  innerRadius={85} 
                  outerRadius={115} 
                  dataKey="value" 
                  paddingAngle={10}
                  stroke="none"
                >
                  {pipelineData?.map((_, idx) => (
                    <Cell key={idx} fill={GOLD_COLORS[idx % GOLD_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #f0f0f0', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Ativos</span>
              <span className="text-2xl font-display text-foreground">{pipelineData?.reduce((a, b) => a + b.value, 0) || 0}</span>
            </div>
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
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-border" /><span className="text-[9px] font-black uppercase text-muted-foreground">Despesas</span></div>
          </div>
        </div>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyMetrics}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
              <XAxis dataKey="month" stroke="#666" fontSize={11} tickLine={false} axisLine={false} tick={{ dy: 15 }} />
              <YAxis stroke="#666" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#fff', border: 'none', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', padding: '16px' }}
              />
              <Line type="stepAfter" dataKey="receitas" stroke="#C5A059" strokeWidth={4} dot={{ r: 0 }} activeDot={{ r: 6, fill: '#C5A059', stroke: '#fff' }} name="Receitas" />
              <Line type="stepAfter" dataKey="despesas" stroke="#E2E8F0" strokeWidth={4} dot={{ r: 0 }} activeDot={{ r: 6, fill: '#CBD5E1', stroke: '#fff' }} name="Despesas" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* DRE Table */}
      <div className="bg-card premium-shadow rounded-2xl p-8 border border-border/40 overflow-hidden">
        <h3 className="text-lg font-display text-foreground mb-6 underline decoration-gold/30">DRE Informativo - Resultados de Gestão</h3>
        <div className="overflow-x-auto -mx-8 px-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40">
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
                  <tr key={m.month} className="hover:bg-secondary/20 transition-colors">
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
