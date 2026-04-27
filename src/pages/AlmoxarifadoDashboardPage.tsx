import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Boxes, AlertTriangle, PackageCheck, PackageOpen, Ban, ClipboardList } from 'lucide-react';
import { fetchInventoryItems, fetchReservations, categoryLabel } from '@/lib/inventory';

const COLORS = ['#C5A059', '#111827', '#C7CDD7', '#E2A53B', '#7C8AA6'];

const AlmoxarifadoDashboardPage = () => {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['inventory_items_dashboard'],
    queryFn: () => fetchInventoryItems(),
  });

  const { data: reservations = [] } = useQuery({
    queryKey: ['inventory_reservations_dashboard'],
    queryFn: fetchReservations,
  });

  const stats = useMemo(() => {
    const totalItems = items.length;
    const foodItems = items.filter((item) => item.type === 'food').length;
    const furnitureItems = items.filter((item) => item.type === 'furniture').length;
    const lowStock = items.filter((item) => item.status === 'low_stock').length;
    const reserved = items.filter((item) => item.reserved_quantity > 0).length;
    const available = items.filter((item) => item.available_quantity > 0).length;
    const outOfStock = items.filter((item) => item.status === 'out_of_stock').length;

    return { totalItems, foodItems, furnitureItems, lowStock, reserved, available, outOfStock };
  }, [items]);

  const byCategory = useMemo(() => {
    const categoryMap = new Map<string, number>();
    items.forEach((item) => {
      categoryMap.set(item.category, (categoryMap.get(item.category) || 0) + 1);
    });

    return [...categoryMap.entries()]
      .map(([name, value]) => ({ name: categoryLabel(name), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [items]);

  const mostUsed = useMemo(() => {
    const usageMap = new Map<string, { name: string; total: number }>();
    reservations.forEach((reservation) => {
      (reservation.event_inventory_items || []).forEach((entry) => {
        const name = entry.inventory_items?.name || 'Item';
        const current = usageMap.get(entry.inventory_item_id) || { name, total: 0 };
        usageMap.set(entry.inventory_item_id, { name, total: current.total + Number(entry.quantity || 0) });
      });
    });
    return [...usageMap.values()].sort((a, b) => b.total - a.total).slice(0, 8);
  }, [reservations]);

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return reservations
      .filter((reservation) => reservation.events?.event_date)
      .filter((reservation) => new Date(`${reservation.events!.event_date}T00:00:00`) >= now)
      .sort((a, b) => new Date(`${a.events?.event_date}T00:00:00`).getTime() - new Date(`${b.events?.event_date}T00:00:00`).getTime())
      .slice(0, 6);
  }, [reservations]);

  const cards = [
    { label: 'Total Cadastrado', value: stats.totalItems, icon: Boxes },
    { label: 'Itens de Alimentação', value: stats.foodItems, icon: PackageCheck },
    { label: 'Mobiliário e Decoração', value: stats.furnitureItems, icon: PackageOpen },
    { label: 'Estoque Baixo', value: stats.lowStock, icon: AlertTriangle },
    { label: 'Reservados para Eventos', value: stats.reserved, icon: ClipboardList },
    { label: 'Disponíveis', value: stats.available, icon: PackageCheck },
    { label: 'Sem Estoque', value: stats.outOfStock, icon: Ban },
  ];

  return (
    <div className="space-y-12 animate-fade-in max-w-[1700px] mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 px-2">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 bg-gold rounded-full" />
            <h1 className="text-4xl md:text-5xl font-display text-foreground tracking-tighter uppercase leading-none">Almoxarifado / Controle de Estoque</h1>
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.35em] text-gold/80 pl-4">Dashboard do Estoque • Visão Integrada</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 px-2">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-[30px] border border-border/30 p-6 premium-shadow">
            <div className="flex items-center justify-between mb-6">
              <div className="text-[10px] font-black tracking-[0.16em] uppercase text-muted-foreground/60">{card.label}</div>
              <div className="w-10 h-10 rounded-xl bg-gold/10 text-gold flex items-center justify-center">
                <card.icon size={18} />
              </div>
            </div>
            <div className="text-3xl font-display tracking-tight">{isLoading ? '-' : card.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 px-2">
        <div className="bg-white rounded-[32px] border border-border/30 p-8 premium-shadow">
          <h3 className="text-xl font-display mb-6">Estoque por categoria</h3>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={58} outerRadius={104} paddingAngle={2}>
                  {byCategory.map((entry, idx) => (
                    <Cell key={`${entry.name}-${idx}`} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [`${v} itens`, 'Quantidade']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-[32px] border border-border/30 p-8 premium-shadow">
          <h3 className="text-xl font-display mb-6">Itens mais usados em eventos</h3>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mostUsed}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-12} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v}`, 'Qtd. usada']} />
                <Bar dataKey="total" fill="#C5A059" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 px-2">
        <div className="bg-white rounded-[32px] border border-border/30 p-8 premium-shadow">
          <h3 className="text-xl font-display mb-6">Alertas de estoque baixo</h3>
          <div className="space-y-3">
            {items.filter((item) => item.status === 'low_stock').slice(0, 7).map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                <div>
                  <p className="font-semibold text-sm">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{categoryLabel(item.category)}</p>
                </div>
                <div className="text-xs font-bold text-amber-700">
                  {Number(item.available_quantity)} / mínimo {Number(item.minimum_stock)}
                </div>
              </div>
            ))}
            {items.filter((item) => item.status === 'low_stock').length === 0 && (
              <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">Nenhum alerta de estoque baixo no momento.</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-[32px] border border-border/30 p-8 premium-shadow">
          <h3 className="text-xl font-display mb-6">Próximos eventos com reserva</h3>
          <div className="space-y-3">
            {upcomingEvents.map((reservation) => (
              <div key={reservation.id} className="rounded-xl border border-border/50 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-sm">{reservation.events?.title || 'Evento sem título'}</p>
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold">{reservation.reservation_status}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {reservation.events?.event_date ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${reservation.events.event_date}T00:00:00`)) : 'Sem data'} • {reservation.events?.location || 'Local pendente'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Itens reservados: {reservation.event_inventory_items?.length || 0}</p>
              </div>
            ))}
            {upcomingEvents.length === 0 && (
              <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">Nenhum evento futuro com itens reservados.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AlmoxarifadoDashboardPage;
