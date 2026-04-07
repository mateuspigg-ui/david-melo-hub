import { DollarSign, TrendingUp, Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';

const kpiCards = [
  { label: 'Faturamento Anual', value: 'R$ 0,00', icon: DollarSign, color: 'text-success' },
  { label: 'Vendas do Mês', value: 'R$ 0,00', icon: TrendingUp, color: 'text-primary' },
  { label: 'A Receber no Mês', value: 'R$ 0,00', icon: Clock, color: 'text-warning' },
];

const pipelineData = [
  { name: 'Novo Contato', value: 0 },
  { name: 'Orçamento Enviado', value: 0 },
  { name: 'Em Negociação', value: 0 },
  { name: 'Fechados', value: 0 },
  { name: 'Perdidos', value: 0 },
];

const GOLD_COLORS = ['#b89451', '#a6855a', '#d4b87a', '#8a6d3b', '#c9a96e'];

const monthlyData = Array.from({ length: 12 }, (_, i) => ({
  month: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][i],
  receitas: 0,
  despesas: 0,
}));

const Dashboard = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Visão geral do seu negócio</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="bg-card rounded-xl p-6 border border-border/50 shadow-sm hover:shadow-gold transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
                  <p className="text-2xl font-semibold text-foreground mt-1">{kpi.value}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon size={20} className={kpi.color} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl p-6 border border-border/50">
          <h3 className="text-sm font-semibold text-foreground mb-4">Vendas Semanais</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={monthlyData.slice(0, 4)}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
              <XAxis dataKey="month" stroke="hsl(40 10% 60%)" fontSize={12} />
              <YAxis stroke="hsl(40 10% 60%)" fontSize={12} />
              <Tooltip contentStyle={{ background: 'hsl(0 0% 13%)', border: '1px solid hsl(0 0% 20%)', borderRadius: '8px', color: '#e5e2d9' }} />
              <Bar dataKey="receitas" fill="#b89451" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-xl p-6 border border-border/50">
          <h3 className="text-sm font-semibold text-foreground mb-4">Pipeline CRM</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={pipelineData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name }) => name}>
                {pipelineData.map((_, idx) => (
                  <Cell key={idx} fill={GOLD_COLORS[idx % GOLD_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: 'hsl(0 0% 13%)', border: '1px solid hsl(0 0% 20%)', borderRadius: '8px', color: '#e5e2d9' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Sales */}
      <div className="bg-card rounded-xl p-6 border border-border/50">
        <h3 className="text-sm font-semibold text-foreground mb-4">Vendas Mensais</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
            <XAxis dataKey="month" stroke="hsl(40 10% 60%)" fontSize={12} />
            <YAxis stroke="hsl(40 10% 60%)" fontSize={12} />
            <Tooltip contentStyle={{ background: 'hsl(0 0% 13%)', border: '1px solid hsl(0 0% 20%)', borderRadius: '8px', color: '#e5e2d9' }} />
            <Legend />
            <Line type="monotone" dataKey="receitas" stroke="#b89451" strokeWidth={2} dot={false} name="Receitas" />
            <Line type="monotone" dataKey="despesas" stroke="#a6855a" strokeWidth={2} dot={false} name="Despesas" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* DRE Table */}
      <div className="bg-card rounded-xl p-6 border border-border/50">
        <h3 className="text-sm font-semibold text-foreground mb-4">DRE - Resultado Mensal</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50">
                {['Mês', 'Eventos', 'Receita', 'Despesas', 'Lucro', 'Margem %', 'A Receber'].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-muted-foreground font-medium text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthlyData.map((m) => (
                <tr key={m.month} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4 text-foreground">{m.month}</td>
                  <td className="py-3 px-4 text-foreground">0</td>
                  <td className="py-3 px-4 text-success">R$ 0</td>
                  <td className="py-3 px-4 text-destructive">R$ 0</td>
                  <td className="py-3 px-4 text-foreground">R$ 0</td>
                  <td className="py-3 px-4 text-foreground">0%</td>
                  <td className="py-3 px-4 text-warning">R$ 0</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
