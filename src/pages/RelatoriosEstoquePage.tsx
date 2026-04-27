import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildCsv, categoryLabel, downloadCsv, fetchInventoryItems, fetchReservations, fetchStockMovements } from '@/lib/inventory';

const currency = (value?: number | null) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const RelatoriosEstoquePage = () => {
  const [reportType, setReportType] = useState('current_stock');
  const { data: items = [] } = useQuery({ queryKey: ['report_inventory_items'], queryFn: () => fetchInventoryItems() });
  const { data: reservations = [] } = useQuery({ queryKey: ['report_reservations'], queryFn: fetchReservations });
  const { data: movements = [] } = useQuery({ queryKey: ['report_movements'], queryFn: fetchStockMovements });

  const reportRows = useMemo(() => {
    switch (reportType) {
      case 'low_stock':
        return items.filter((item) => item.status === 'low_stock').map((item) => ({
          nome: item.name,
          tipo: item.type,
          categoria: categoryLabel(item.category),
          disponivel: item.available_quantity,
          minimo: item.minimum_stock,
          status: item.status,
        }));
      case 'food_expiring':
        return items
          .filter((item) => item.type === 'food' && item.expiration_date)
          .sort((a, b) => new Date(`${a.expiration_date}T00:00:00`).getTime() - new Date(`${b.expiration_date}T00:00:00`).getTime())
          .map((item) => ({
            nome: item.name,
            categoria: categoryLabel(item.category),
            validade: item.expiration_date,
            disponivel: item.available_quantity,
            local: item.storage_location || '-',
          }));
      case 'most_used': {
        const usage = new Map<string, { nome: string; total: number }>();
        reservations.forEach((reservation) => {
          (reservation.event_inventory_items || []).forEach((entry) => {
            const key = entry.inventory_item_id;
            const current = usage.get(key) || { nome: entry.inventory_items?.name || 'Item', total: 0 };
            usage.set(key, { ...current, total: current.total + Number(entry.quantity || 0) });
          });
        });
        return [...usage.values()].sort((a, b) => b.total - a.total);
      }
      case 'reserved_by_event':
        return reservations.flatMap((reservation) =>
          (reservation.event_inventory_items || []).map((entry) => ({
            evento: reservation.events?.title || '-',
            cliente: `${reservation.events?.clients?.first_name || ''} ${reservation.events?.clients?.last_name || ''}`.trim() || '-',
            item: entry.inventory_items?.name || '-',
            categoria: categoryLabel(entry.inventory_items?.category || ''),
            quantidade: entry.quantity,
            status: reservation.reservation_status,
          })),
        );
      case 'maintenance_items':
        return items.filter((item) => item.status === 'maintenance').map((item) => ({ nome: item.name, categoria: categoryLabel(item.category), quantidade: item.maintenance_quantity }));
      case 'damaged_items':
        return items.filter((item) => item.status === 'damaged').map((item) => ({ nome: item.name, categoria: categoryLabel(item.category), quantidade: item.damaged_quantity }));
      case 'monthly_movement': {
        const byMonth = new Map<string, number>();
        movements.forEach((movement) => {
          const key = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' }).format(new Date(movement.created_at));
          byMonth.set(key, (byMonth.get(key) || 0) + Number(movement.quantity_changed || 0));
        });
        return [...byMonth.entries()].map(([mes, saldo]) => ({ mes, saldo }));
      }
      case 'stock_valuation':
        return items.map((item) => ({
          nome: item.name,
          tipo: item.type,
          quantidade: item.total_quantity,
          custo_unitario: Number(item.cost_per_unit || item.replacement_value || 0),
          valor_total: Number(item.total_quantity) * Number(item.cost_per_unit || item.replacement_value || 0),
        }));
      case 'current_stock':
      default:
        return items.map((item) => ({
          nome: item.name,
          tipo: item.type,
          categoria: categoryLabel(item.category),
          total: item.total_quantity,
          disponivel: item.available_quantity,
          reservado: item.reserved_quantity,
          status: item.status,
        }));
    }
  }, [reportType, items, reservations, movements]);

  const handleExportCsv = () => {
    if (reportRows.length === 0) return;
    const headers = Object.keys(reportRows[0]);
    const csv = buildCsv(headers, reportRows.map((row) => headers.map((header) => (row as any)[header])));
    downloadCsv(`relatorio-${reportType}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const handlePrint = () => {
    window.print();
  };

  const totalValuation = useMemo(() => {
    return items.reduce((acc, item) => acc + Number(item.total_quantity) * Number(item.cost_per_unit || item.replacement_value || 0), 0);
  }, [items]);

  return (
    <div className="space-y-10 animate-fade-in max-w-[1700px] mx-auto pb-12">
      <div className="px-2 space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 bg-gold rounded-full" />
          <h1 className="text-4xl md:text-5xl font-display text-foreground tracking-tighter uppercase leading-none">Relatórios</h1>
        </div>
        <p className="text-[11px] font-black uppercase tracking-[0.35em] text-gold/80 pl-4">Indicadores e exportações do estoque</p>
      </div>

      <div className="px-2">
        <div className="bg-white rounded-[30px] border border-border/30 premium-shadow p-5 flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
          <div className="flex-1 max-w-xl">
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="current_stock">Estoque atual</SelectItem>
                <SelectItem value="low_stock">Estoque baixo</SelectItem>
                <SelectItem value="food_expiring">Alimentos próximos da validade</SelectItem>
                <SelectItem value="most_used">Itens mais usados</SelectItem>
                <SelectItem value="reserved_by_event">Itens reservados por evento</SelectItem>
                <SelectItem value="maintenance_items">Mobiliário em manutenção</SelectItem>
                <SelectItem value="damaged_items">Itens danificados</SelectItem>
                <SelectItem value="monthly_movement">Movimentação mensal</SelectItem>
                <SelectItem value="stock_valuation">Valoração de estoque</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handlePrint}><Printer size={15} className="mr-2" />Exportar PDF</Button>
            <Button variant="outline" onClick={handleExportCsv}><FileSpreadsheet size={15} className="mr-2" />Exportar CSV</Button>
            <Button onClick={handleExportCsv} className="bg-gradient-gold text-white"><Download size={15} className="mr-2" />Baixar relatório</Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-2">
        <div className="bg-white rounded-[26px] border border-border/30 p-5 premium-shadow"><p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Itens no estoque</p><p className="text-3xl font-display mt-2">{items.length}</p></div>
        <div className="bg-white rounded-[26px] border border-border/30 p-5 premium-shadow"><p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Reservas ativas</p><p className="text-3xl font-display mt-2">{reservations.filter((reservation) => reservation.reservation_status !== 'canceled').length}</p></div>
        <div className="bg-white rounded-[26px] border border-border/30 p-5 premium-shadow"><p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Valoração estimada</p><p className="text-3xl font-display mt-2">{currency(totalValuation)}</p></div>
      </div>

      <div className="px-2">
        <div className="bg-white rounded-[30px] border border-border/30 premium-shadow overflow-auto">
          {reportRows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Nenhum dado disponível para este relatório.</div>
          ) : (
            <table className="w-full min-w-[900px]">
              <thead className="bg-secondary/30 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80">
                <tr>
                  {Object.keys(reportRows[0]).map((key) => <th key={key} className="text-left p-4">{key.replaceAll('_', ' ')}</th>)}
                </tr>
              </thead>
              <tbody>
                {reportRows.map((row, idx) => (
                  <tr key={idx} className="border-t border-border/30 text-sm">
                    {Object.keys(reportRows[0]).map((key) => <td key={key} className="p-4">{(row as any)[key]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default RelatoriosEstoquePage;
