import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell 
} from 'recharts';
import { 
  DollarSign, TrendingUp, AlertCircle, CheckCircle2, 
  ArrowUpRight, ArrowDownRight, Landmark, Receipt
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const FinancialDashboard = () => {
  // Fetch summary from the view created in SQL
  const { data: summary, isLoading } = useQuery({
    queryKey: ['financial_summary'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('vw_financial_summary').select('*');
      if (error) throw error;
      return data;
    }
  });

  const { data: pendingStats } = useQuery({
    queryKey: ['reconciliation_pending'],
    queryFn: async () => {
      const { data: extData } = await (supabase as any).from('bank_transactions').select('amount').eq('status', 'pendente');
      const { data: contData } = await (supabase as any).from('accounting_entries').select('amount').eq('status', 'pendente');
      
      const extTotal = extData?.reduce((acc: number, curr: any) => acc + Number(curr.amount), 0) || 0;
      const contTotal = contData?.reduce((acc: number, curr: any) => acc + Number(curr.amount), 0) || 0;
      
      return { extTotal, contTotal };
    }
  });

  const totalBankBalance = summary?.reduce((acc: number, curr: any) => acc + Number(curr.bank_balance), 0) || 0;
  const totalAccBalance = summary?.reduce((acc: number, curr: any) => acc + Number(curr.accounting_balance), 0) || 0;
  const totalDiff = totalBankBalance - totalAccBalance;

  const chartData = summary?.map((s: any) => ({
    name: s.bank_name,
    Banco: Number(s.bank_balance),
    Contábil: Number(s.accounting_balance)
  })) || [];

  const pieData = [
    { name: 'Pendente Extrato', value: pendingStats?.extTotal || 0, color: '#C5A059' },
    { name: 'Pendente Contábil', value: pendingStats?.contTotal || 0, color: '#1A1A1A' },
    { name: 'Diferença Total', value: Math.abs(totalDiff), color: '#94A3B8' }
  ];

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const formatCurrencyNoCents = (value: number) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value || 0);

  const kpis = [
    {
      label: 'Saldo Bancário Total',
      value: totalBankBalance,
      icon: Landmark,
      trend: '+2.4%',
      trendUp: true,
      subtext: 'Consolidado em conta',
      color: 'gold'
    },
    {
      label: 'Saldo Contábil Total',
      value: totalAccBalance,
      icon: Receipt,
      trend: 'Sincronizado',
      trendUp: true,
      subtext: 'Base David Melo CRM',
      color: 'dark'
    },
    {
      label: 'Pendências Financeiras',
      value: Math.abs(totalDiff),
      icon: AlertCircle,
      trend: totalDiff === 0 ? 'Zerado' : 'Auditando',
      trendUp: totalDiff === 0,
      subtext: 'Diferença a conciliar',
      color: totalDiff === 0 ? 'emerald' : 'amber'
    },
    {
      label: 'Fluxo de Caixa',
      value: totalBankBalance - (pendingStats?.extTotal || 0),
      icon: TrendingUp,
      trend: 'Estável',
      trendUp: true,
      subtext: 'Líquido projetado',
      color: 'emerald'
    }
  ];

  return (
    <div className="space-y-12 animate-fade-in max-w-[1700px] mx-auto pb-12">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 px-2">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 bg-gold rounded-full" />
            <h1 className="text-4xl md:text-5xl font-display text-foreground tracking-tighter uppercase leading-none">Console Financeiro</h1>
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.4em] text-gold/80 pl-4">David Melo Produções • Auditoria e Controle de Fluxo</p>
        </div>
        <div className="flex items-center gap-3 px-6 py-3 bg-white/50 backdrop-blur-md rounded-2xl border border-gold/20 shadow-sm transition-all hover:shadow-md">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-widest text-foreground/70">Sistemas Sincronizados</span>
        </div>
      </div>

      {/* KPI Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 px-2">
        {kpis.map((kpi, i) => (
          <div 
            key={i} 
            className="group relative bg-white rounded-[32px] p-8 border border-border/30 premium-shadow transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-gold/10 to-transparent rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-700" />
            <div className="relative z-10 space-y-6">
              <div className="flex items-center justify-between">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm transition-transform duration-500 group-hover:rotate-6",
                  kpi.color === 'gold' ? 'bg-gold text-white shadow-gold-sm' : 'bg-secondary text-foreground/40'
                )}>
                  <kpi.icon size={20} />
                </div>
                <div className={cn(
                  "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                  kpi.trendUp ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
                )}>
                  {kpi.trend}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">{kpi.label}</p>
                <h3 className="text-3xl font-display text-foreground tracking-tighter">{typeof kpi.value === 'number' ? formatCurrency(kpi.value) : kpi.value}</h3>
              </div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 border-t border-border/10 pt-4">{kpi.subtext}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 px-2">
        {/* Main Bar Chart */}
        <div className="lg:col-span-2 bg-white rounded-[40px] border border-border/30 p-10 premium-shadow relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-gold opacity-50" />
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
            <div>
              <h3 className="text-2xl font-display text-foreground uppercase tracking-tight">Comparativo de Saldos</h3>
              <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.3em] mt-2">Visão por instituição financeira</p>
            </div>
            <div className="flex items-center gap-6 bg-secondary/30 px-6 py-3 rounded-2xl border border-border/10">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gold shadow-gold-sm" />
                <span className="text-[10px] font-black uppercase text-foreground/60 tracking-widest">Banco</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-slate-200" />
                <span className="text-[10px] font-black uppercase text-foreground/60 tracking-widest">Contábil</span>
              </div>
            </div>
          </div>
          
          <div className="h-[450px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={12}>
                <defs>
                  <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C5A059" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#C5A059" stopOpacity={0.8}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="#94A3B8" 
                  fontSize={10} 
                  fontFamily="Outfit" 
                  fontWeight="bold"
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ dy: 15 }}
                />
                <YAxis 
                  stroke="#94A3B8" 
                  fontSize={10} 
                  fontFamily="Outfit"
                  fontWeight="bold"
                  axisLine={false} 
                  tickLine={false} 
                  tickFormatter={(v) => formatCurrencyNoCents(Number(v))} 
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(197, 160, 89, 0.03)' }}
                  contentStyle={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(197, 160, 89, 0.2)', 
                    borderRadius: '24px', 
                    boxShadow: '0 20px 40px -10px rgba(0,0,0,0.1)',
                    padding: '20px'
                  }}
                  itemStyle={{ fontSize: '11px', color: '#C5A059', fontWeight: 'bold', textTransform: 'uppercase', fontFamily: 'Outfit' }}
                  labelStyle={{ fontWeight: '900', color: '#1A1A1A', marginBottom: '10px', fontSize: '13px', letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: 'Outfit' }}
                />
                <Bar dataKey="Banco" fill="url(#goldGradient)" radius={[10, 10, 0, 0]} barSize={40} />
                <Bar dataKey="Contábil" fill="#F1F5F9" radius={[10, 10, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pendency Pie Chart */}
        <div className="bg-white rounded-[40px] border border-border/30 p-10 premium-shadow flex flex-col group">
          <div className="mb-12">
            <h3 className="text-2xl font-display text-foreground uppercase tracking-tight">Status de Conciliação</h3>
            <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.3em] mt-2">Distribuição de fluxos abertos</p>
          </div>
          
          <div className="flex-1 flex flex-col items-center justify-center relative">
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={85}
                    outerRadius={120}
                    paddingAngle={8}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none pt-8">
              <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.3em]">Total Auditado</p>
              <p className="text-2xl font-display text-foreground tracking-tighter mt-1">
                {formatCurrency(pieData.reduce((a, b) => a + b.value, 0))}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 mt-8">
            {pieData.map((item, i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-secondary/20 border border-border/10 transition-all hover:bg-secondary/40">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: item.color }} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-foreground/70">{item.name}</span>
                </div>
                <span className="text-xs font-bold font-display text-foreground tabular-nums">{formatCurrency(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinancialDashboard;
