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
    <div className="space-y-8 animate-fade-in max-w-[1600px] mx-auto p-2">
      <div>
        <h1 className="text-3xl font-display text-foreground tracking-tight">Dashboard Executivo</h1>
        <p className="text-sm text-muted-foreground mt-1 font-body">Visão geral consolidada do seu negócio em tempo real</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="bg-card premium-shadow rounded-2xl p-6 border border-border/40 hover:border-gold/30 transition-all group">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-[0.2em]">{kpi.label}</p>
                  <p className="text-3xl font-bold text-foreground mt-2 tracking-tight">{kpi.value}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center group-hover:bg-gold group-hover:text-white transition-all duration-300">
                  <Icon size={24} className={kpi.color} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card premium-shadow rounded-2xl p-8 border border-border/40">
          <h3 className="text-lg font-display text-foreground mb-6">Volume de Vendas Semanais</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData.slice(0, 4)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="month" stroke="#a0a0a0" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#a0a0a0" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #f0f0f0', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                itemStyle={{ fontSize: '12px', color: '#DAA520', fontWeight: 'bold' }}
              />
              <Bar dataKey="receitas" fill="#DAA520" radius={[6, 6, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card premium-shadow rounded-2xl p-8 border border-border/40">
          <h3 className="text-lg font-display text-foreground mb-6">Eficiência do Pipeline CRM</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie 
                data={pipelineData} 
                cx="50%" 
                cy="50%" 
                innerRadius={70} 
                outerRadius={100} 
                dataKey="value" 
                paddingAngle={5}
                label={({ name }) => name}
              >
                {pipelineData.map((_, idx) => (
                  <Cell key={idx} fill={GOLD_COLORS[idx % GOLD_COLORS.length]} stroke="rgba(255,255,255,0.5)" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #f0f0f0', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Sales */}
      <div className="bg-card premium-shadow rounded-2xl p-8 border border-border/40">
        <h3 className="text-lg font-display text-foreground mb-6">Fluxo de Caixa Mensal</h3>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="month" stroke="#a0a0a0" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#a0a0a0" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #f0f0f0', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
            />
            <Legend verticalAlign="top" height={36} iconType="circle" />
            <Line type="monotone" dataKey="receitas" stroke="#DAA520" strokeWidth={3} dot={{ r: 4, fill: '#DAA520', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} name="Receitas" />
            <Line type="monotone" dataKey="despesas" stroke="#cbd5e1" strokeWidth={3} dot={{ r: 4, fill: '#cbd5e1', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} name="Despesas" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* DRE Table */}
      <div className="bg-card premium-shadow rounded-2xl p-8 border border-border/40 overflow-hidden">
        <h3 className="text-lg font-display text-foreground mb-6">DRE Informativo - Resultados Consolidados</h3>
        <div className="overflow-x-auto -mx-8 px-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40">
                {['Mês', 'Eventos', 'Receita', 'Despesas', 'Lucro Real', 'Margem', 'Status'].map(h => (
                  <th key={h} className="text-left py-4 px-4 text-muted-foreground font-bold text-[10px] uppercase tracking-[0.2em]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {monthlyData.map((m) => (
                <tr key={m.month} className="hover:bg-secondary/20 transition-colors">
                  <td className="py-4 px-4 text-foreground font-bold">{m.month}</td>
                  <td className="py-4 px-4 text-foreground font-medium">0</td>
                  <td className="py-4 px-4 text-success font-bold">R$ 0,00</td>
                  <td className="py-4 px-4 text-destructive font-bold">R$ 0,00</td>
                  <td className="py-4 px-4 text-foreground font-bold">R$ 0,00</td>
                  <td className="py-4 px-4 font-medium">
                    <span className="bg-secondary/50 px-2 py-1 rounded text-[10px] font-bold">0%</span>
                  </td>
                  <td className="py-4 px-4 text-warning">
                    <div className="flex items-center gap-1.5 font-bold text-[10px] uppercase tracking-wider">
                       <Clock size={12} /> Auditando
                    </div>
                  </td>
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
