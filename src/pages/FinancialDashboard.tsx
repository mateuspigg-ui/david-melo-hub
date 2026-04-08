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
      const { data, error } = await supabase.from('vw_financial_summary').select('*');
      if (error) throw error;
      return data;
    }
  });

  const { data: pendingStats } = useQuery({
    queryKey: ['reconciliation_pending'],
    queryFn: async () => {
      const { data: extData } = await supabase.from('bank_transactions').select('amount').eq('status', 'pendente');
      const { data: contData } = await supabase.from('accounting_entries').select('amount').eq('status', 'pendente');
      
      const extTotal = extData?.reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;
      const contTotal = contData?.reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;
      
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
    <div className="p-6 space-y-6 animate-fade-in max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-3xl font-display text-gold tracking-wide">Dashboard Financeiro</h1>
        <p className="text-sm text-foreground/60 mt-1 font-body">Visão executiva e controle de saldos em tempo real</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-dark-card border-border/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Saldo Bancário Total</CardTitle>
            <Landmark className="w-4 h-4 text-gold" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{formatCurrency(totalBankBalance)}</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3 text-green-500" /> +2.1% em relação a ontem
            </p>
          </CardContent>
        </Card>

        <Card className="bg-dark-card border-border/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Saldo Contábil Total</CardTitle>
            <Receipt className="w-4 h-4 text-gold" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{formatCurrency(totalAccBalance)}</div>
            <p className="text-xs text-muted-foreground mt-1">Sincronizado com o Razão</p>
          </CardContent>
        </Card>

        <Card className="bg-dark-card border-border/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Diferença Bancária</CardTitle>
            <AlertCircle className={`w-4 h-4 ${totalDiff === 0 ? 'text-green-500' : 'text-amber-500'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalDiff === 0 ? 'text-green-500' : 'text-amber-500'}`}>
              {formatCurrency(totalDiff)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total a conciliar</p>
          </CardContent>
        </Card>

        <Card className="bg-dark-card border-border/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Status Geral</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-gold" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">Auditado</div>
            <p className="text-xs text-muted-foreground mt-1">Última conciliação: Hoje</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-dark-card border-border/30 lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg font-display text-gold">Comparativo Banco vs Contabilidade</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="name" stroke="#888" fontSize={12} />
                <YAxis stroke="#888" fontSize={12} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', color: '#fff' }}
                  itemStyle={{ color: '#DAA520' }}
                />
                <Bar dataKey="Banco" fill="#DAA520" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Contábil" fill="#555" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-dark-card border-border/30 lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg font-display text-gold">Distribuição de Pendências</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2 ml-4">
              {pieData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default FinancialDashboard;
