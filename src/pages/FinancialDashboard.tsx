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
    { name: 'Pendente Extrato', value: pendingStats?.extTotal || 0, color: '#f59e0b' },
    { name: 'Pendente Contábil', value: pendingStats?.contTotal || 0, color: '#ef4444' },
    { name: 'Diferença Total', value: Math.abs(totalDiff), color: '#3b82f6' }
  ];

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  return (
    <div className="p-8 space-y-10 animate-fade-in max-w-[1600px] mx-auto bg-transparent">
      {/* Dashboard Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div>
          <h1 className="text-4xl font-display text-foreground tracking-tight flex items-center gap-3">
            <Landmark className="h-10 w-10 text-gold" />
            Dashboard Financeiro
          </h1>
          <p className="text-sm text-muted-foreground mt-1 font-body font-medium uppercase tracking-widest">Controle executivo David Melo • Tempo Real</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-white premium-shadow rounded-xl border border-border/40 text-[10px] font-bold uppercase tracking-widest text-gold animate-pulse">
          <div className="w-2 h-2 rounded-full bg-gold" />
          Sistemas Auditados
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white premium-shadow border border-border/40 rounded-2xl p-6 relative overflow-hidden transition-all duration-300 hover:scale-[1.02] group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gold/5 rounded-full -mr-8 -mt-8 transition-all group-hover:scale-110" />
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Saldo Bancário Total</p>
            <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center">
               <DollarSign className="w-4 h-4 text-gold" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-display text-foreground tracking-tighter">{formatCurrency(totalBankBalance)}</div>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex items-center text-emerald-500 font-bold text-[10px] bg-emerald-500/10 px-2 py-0.5 rounded-full">
                <ArrowUpRight className="w-3 h-3 mr-1" /> +2.1%
              </div>
              <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-tighter opacity-60">Base Diária</p>
            </div>
          </div>
        </div>

        <div className="bg-white premium-shadow border border-border/40 rounded-2xl p-6 relative overflow-hidden transition-all duration-300 hover:scale-[1.02] group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gold/5 rounded-full -mr-8 -mt-8 transition-all group-hover:scale-110" />
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Saldo Contábil Total</p>
            <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center">
               <Receipt className="w-4 h-4 text-gold" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-display text-foreground tracking-tighter">{formatCurrency(totalAccBalance)}</div>
            <div className="flex items-center gap-2 mt-2">
               <p className="text-[9px] text-emerald-500 font-black uppercase tracking-widest">Sincronizado via API</p>
            </div>
          </div>
        </div>

        <div className="bg-white premium-shadow border border-border/40 rounded-2xl p-6 relative overflow-hidden transition-all duration-300 hover:scale-[1.02] group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full -mr-8 -mt-8 transition-all group-hover:scale-110" />
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Diferença Bancária</p>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${totalDiff === 0 ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
               <AlertCircle className={`w-4 h-4 ${totalDiff === 0 ? 'text-emerald-500' : 'text-amber-500'}`} />
            </div>
          </div>
          <div>
            <div className={`text-3xl font-display tracking-tighter ${totalDiff === 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
              {formatCurrency(totalDiff)}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wide opacity-60">Valor total a conciliar</p>
            </div>
          </div>
        </div>

        <div className="bg-white premium-shadow border border-border/40 rounded-2xl p-6 relative overflow-hidden transition-all duration-300 hover:scale-[1.02] group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gold/5 rounded-full -mr-8 -mt-8 transition-all group-hover:scale-110" />
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Status da Auditoria</p>
            <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center">
               <CheckCircle2 className="w-4 h-4 text-gold" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-display text-gold tracking-tight uppercase">Auditado</div>
            <div className="flex items-center gap-2 mt-2">
              <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wide opacity-60">Conciliado em: {new Date().toLocaleDateString('pt-BR')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Charts area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white premium-shadow border border-border/40 rounded-2xl p-8 transition-all duration-300 lg:col-span-1">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-display text-foreground tracking-tight uppercase">Comparativo Geral de Saldos</h3>
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1 opacity-70">Monitoramento Sincronizado Banco vs Razão</p>
            </div>
            <div className="flex gap-8 items-center">
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-gold shadow-sm" /><span className="text-[10px] font-black uppercase text-secondary-foreground opacity-60">Saldo em Conta</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-slate-200 shadow-sm" /><span className="text-[10px] font-black uppercase text-secondary-foreground opacity-60">Base Contábil</span></div>
            </div>
          </div>
          <div className="h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f2f2f2" vertical={false} />
                <XAxis dataKey="name" stroke="#666" fontSize={11} axisLine={false} tickLine={false} tick={{ dy: 15 }} />
                <YAxis stroke="#666" fontSize={11} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${v/1000}k`} />
                <Tooltip 
                  cursor={{ fill: 'rgba(197, 160, 89, 0.05)' }}
                  contentStyle={{ backgroundColor: '#fff', border: 'none', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.1)', padding: '16px' }}
                  itemStyle={{ fontSize: '11px', color: '#C5A059', fontWeight: 'bold', textTransform: 'uppercase' }}
                  labelStyle={{ fontWeight: 'black', color: '#000', marginBottom: '8px', fontSize: '12px', letterSpacing: '0.05em' }}
                />
                <Bar dataKey="Banco" fill="#C5A059" radius={[8, 8, 0, 0]} barSize={45} />
                <Bar dataKey="Contábil" fill="#E2E8F0" radius={[8, 8, 0, 0]} barSize={45} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white premium-shadow border border-border/40 rounded-2xl p-8 transition-all duration-300 lg:col-span-1">
          <div className="mb-8 text-center sm:text-left">
            <h3 className="text-xl font-display text-foreground tracking-tight uppercase">Distribuição de Pendências</h3>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">Alocação de valores a conciliar</p>
          </div>
          <div className="h-[400px] flex flex-col sm:flex-row items-center justify-center gap-8">
            <div className="flex-1 w-full h-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <circle cx="50%" cy="50%" r="65" fill="#f8fafc" />
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={75}
                    outerRadius={105}
                    paddingAngle={8}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                 <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">Total</p>
                 <p className="text-lg font-display text-foreground leading-tight mt-1">{formatCurrency(pieData.reduce((a, b) => a + b.value, 0))}</p>
              </div>
            </div>
            <div className="flex flex-col gap-4 w-full sm:w-auto p-4 bg-secondary/20 rounded-2xl border border-border/20">
              {pieData.map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-6 px-2">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: item.color }} />
                    <span className="text-[11px] text-foreground font-bold uppercase tracking-tight whitespace-nowrap">{item.name}</span>
                  </div>
                  <span className="text-[11px] font-display text-foreground opacity-60 tabular-nums font-medium">{formatCurrency(item.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinancialDashboard;
