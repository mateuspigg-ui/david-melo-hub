import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { categoryLabel, fetchStockMovements, MOVEMENT_TYPES, statusLabel } from '@/lib/inventory';

const MovimentacoesEstoquePage = () => {
  const [search, setSearch] = useState('');
  const [movementType, setMovementType] = useState('all');
  const [category, setCategory] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['stock_movements'],
    queryFn: fetchStockMovements,
  });

  const filtered = useMemo(() => {
    const text = search.toLowerCase();
    const now = new Date();

    return movements.filter((movement) => {
      const matchText =
        (movement.inventory_items?.name || '').toLowerCase().includes(text) ||
        (movement.events?.title || '').toLowerCase().includes(text) ||
        (movement.clients ? `${movement.clients.first_name} ${movement.clients.last_name}` : '').toLowerCase().includes(text) ||
        (movement.profiles?.full_name || '').toLowerCase().includes(text);

      const matchType = movementType === 'all' || movement.movement_type === movementType;
      const matchCategory = category === 'all' || movement.inventory_items?.category === category;

      const movementDate = new Date(movement.created_at);
      const dayDiff = Math.floor((now.getTime() - movementDate.getTime()) / (1000 * 60 * 60 * 24));
      const matchDate =
        dateFilter === 'all' ||
        (dateFilter === 'today' && dayDiff === 0) ||
        (dateFilter === '7d' && dayDiff <= 7) ||
        (dateFilter === '30d' && dayDiff <= 30);

      return matchText && matchType && matchCategory && matchDate;
    });
  }, [movements, search, movementType, category, dateFilter]);

  const uniqueCategories = useMemo(() => [...new Set(movements.map((movement) => movement.inventory_items?.category).filter(Boolean))], [movements]);

  return (
    <div className="space-y-10 animate-fade-in max-w-[1700px] mx-auto pb-12">
      <div className="px-2 space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 bg-gold rounded-full" />
          <h1 className="text-4xl md:text-5xl font-display text-foreground tracking-tighter uppercase leading-none">Movimentações</h1>
        </div>
        <p className="text-[11px] font-black uppercase tracking-[0.35em] text-gold/80 pl-4">Histórico completo de entradas e saídas</p>
      </div>

      <div className="px-2">
        <div className="bg-white rounded-[28px] border border-border/30 p-5 premium-shadow grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="relative md:col-span-2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-10 h-11 rounded-xl" placeholder="Buscar por item, cliente, evento, usuário..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={movementType} onValueChange={setMovementType}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os tipos</SelectItem>{MOVEMENT_TYPES.map((type) => <SelectItem key={type} value={type}>{statusLabel(type)}</SelectItem>)}</SelectContent></Select>
          <Select value={category} onValueChange={setCategory}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas categorias</SelectItem>{uniqueCategories.map((c) => <SelectItem key={String(c)} value={String(c)}>{categoryLabel(String(c))}</SelectItem>)}</SelectContent></Select>
          <Select value={dateFilter} onValueChange={setDateFilter}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todo período</SelectItem><SelectItem value="today">Hoje</SelectItem><SelectItem value="7d">Últimos 7 dias</SelectItem><SelectItem value="30d">Últimos 30 dias</SelectItem></SelectContent></Select>
        </div>
      </div>

      <div className="px-2">
        <div className="bg-white rounded-[30px] border border-border/30 premium-shadow overflow-auto">
          <table className="w-full min-w-[1300px]">
            <thead className="bg-secondary/30 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80">
              <tr>
                <th className="text-left p-4">Data / Hora</th>
                <th className="text-left p-4">Tipo</th>
                <th className="text-left p-4">Item</th>
                <th className="text-left p-4">Categoria</th>
                <th className="text-left p-4">Qtd. anterior</th>
                <th className="text-left p-4">Qtd. nova</th>
                <th className="text-left p-4">Variação</th>
                <th className="text-left p-4">Cliente / Evento</th>
                <th className="text-left p-4">Usuário</th>
                <th className="text-left p-4">Observações</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && filtered.map((movement) => (
                <tr key={movement.id} className="border-t border-border/30 text-sm">
                  <td className="p-4">{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(movement.created_at))}</td>
                  <td className="p-4"><span className="inline-flex px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gold/10 text-gold">{statusLabel(movement.movement_type)}</span></td>
                  <td className="p-4">{movement.inventory_items?.name || '-'}</td>
                  <td className="p-4">{movement.inventory_items?.category ? categoryLabel(movement.inventory_items.category) : '-'}</td>
                  <td className="p-4">{movement.previous_quantity ?? '-'}</td>
                  <td className="p-4">{movement.new_quantity ?? '-'}</td>
                  <td className="p-4 font-semibold">{movement.quantity_changed ?? '-'}</td>
                  <td className="p-4 text-xs">
                    <div>{movement.clients ? `${movement.clients.first_name} ${movement.clients.last_name}` : '-'}</div>
                    <div className="text-muted-foreground">{movement.events?.title || '-'}</div>
                  </td>
                  <td className="p-4">{movement.profiles?.full_name || '-'}</td>
                  <td className="p-4 text-xs text-muted-foreground">{movement.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isLoading && filtered.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma movimentação encontrada.</div>}
          {isLoading && <div className="p-10 text-center text-sm text-muted-foreground">Carregando movimentações...</div>}
        </div>
      </div>
    </div>
  );
};

export default MovimentacoesEstoquePage;
