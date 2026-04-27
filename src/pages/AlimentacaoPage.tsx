import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, AlertTriangle, CalendarClock, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { FOOD_CATEGORIES, UNITS, calculateExpirationAlert, categoryLabel, fetchInventoryItems, statusLabel, upsertInventoryItem, deleteInventoryItem, type InventoryItem } from '@/lib/inventory';
import { supabase } from '@/integrations/supabase/client';

const emptyForm = {
  name: '',
  category: 'other',
  unit: 'kg',
  total_quantity: 0,
  minimum_stock: 0,
  supplier: '',
  purchase_date: '',
  expiration_date: '',
  cost_per_unit: 0,
  storage_location: '',
  notes: '',
};

const QUANTITY_OPTIONS = ['0.5', '1', '2', '5', '10', '20', '30', '50', '75', '100', '150', '200', '300', '500'];

const AlimentacaoPage = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<any>(emptyForm);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['inventory_food_items'],
    queryFn: () => fetchInventoryItems('food'),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers_for_inventory_food'],
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('company_name').order('company_name');
      if (error) throw error;
      return (data || []).map((row) => row.company_name).filter(Boolean);
    },
  });

  const filteredItems = useMemo(() => {
    const text = search.toLowerCase();
    return items.filter((item) => {
      const matchText =
        item.name.toLowerCase().includes(text) ||
        (item.supplier || '').toLowerCase().includes(text) ||
        (item.storage_location || '').toLowerCase().includes(text);
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchCategory = categoryFilter === 'all' || item.category === categoryFilter;
      return matchText && matchStatus && matchCategory;
    });
  }, [items, search, statusFilter, categoryFilter]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        id: editing?.id,
        name: form.name,
        type: 'food' as const,
        category: form.category,
        unit: form.unit,
        total_quantity: Number(form.total_quantity || 0),
        minimum_stock: Number(form.minimum_stock || 0),
        supplier: form.supplier || null,
        purchase_date: form.purchase_date || null,
        expiration_date: form.expiration_date || null,
        cost_per_unit: form.cost_per_unit ? Number(form.cost_per_unit) : null,
        storage_location: form.storage_location || null,
        notes: form.notes || null,
      };
      return upsertInventoryItem(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory_food_items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory_items_dashboard'] });
      toast({ title: editing ? 'Item atualizado com sucesso' : 'Item criado com sucesso' });
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao salvar item', description: error?.message || 'Tente novamente', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteInventoryItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory_food_items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory_items_dashboard'] });
      toast({ title: 'Item removido do estoque' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao excluir', description: error?.message || 'Tente novamente', variant: 'destructive' });
    },
  });

  const openForm = (item?: InventoryItem) => {
    if (item) {
      setEditing(item);
      setForm({
        name: item.name,
        category: item.category,
        unit: item.unit || 'kg',
        total_quantity: item.total_quantity,
        minimum_stock: item.minimum_stock,
        supplier: item.supplier || '',
        purchase_date: item.purchase_date || '',
        expiration_date: item.expiration_date || '',
        cost_per_unit: item.cost_per_unit || 0,
        storage_location: item.storage_location || '',
        notes: item.notes || '',
      });
    } else {
      setEditing(null);
      setForm(emptyForm);
    }
    setOpen(true);
  };

  return (
    <div className="space-y-10 animate-fade-in max-w-[1700px] mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 px-2">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 bg-gold rounded-full" />
            <h1 className="text-4xl md:text-5xl font-display text-foreground tracking-tighter uppercase leading-none">Alimentação</h1>
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.35em] text-gold/80 pl-4">Controle de insumos e perecíveis</p>
        </div>
        <Button onClick={() => openForm()} className="h-12 rounded-2xl bg-gradient-gold text-white font-bold uppercase text-[11px] tracking-[0.14em]">
          <Plus size={16} className="mr-2" /> Novo item
        </Button>
      </div>

      <div className="px-2">
        <div className="bg-white rounded-[28px] border border-border/30 p-5 premium-shadow">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative md:col-span-2">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por item, fornecedor, local..." className="pl-10 h-11 rounded-xl" />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {FOOD_CATEGORIES.map((category) => <SelectItem key={category} value={category}>{categoryLabel(category)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="available">Disponível</SelectItem>
                <SelectItem value="low_stock">Estoque baixo</SelectItem>
                <SelectItem value="expired">Vencido</SelectItem>
                <SelectItem value="out_of_stock">Sem estoque</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="px-2">
        <div className="bg-white rounded-[32px] border border-border/30 premium-shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px]">
              <thead className="bg-secondary/40">
                <tr className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80">
                  <th className="text-left p-4">Item</th>
                  <th className="text-left p-4">Categoria</th>
                  <th className="text-left p-4">Estoque</th>
                  <th className="text-left p-4">Disponível</th>
                  <th className="text-left p-4">Reservado</th>
                  <th className="text-left p-4">Fornecedor</th>
                  <th className="text-left p-4">Validade</th>
                  <th className="text-left p-4">Status</th>
                  <th className="text-right p-4">Ações</th>
                </tr>
              </thead>
              <tbody>
                {!isLoading && filteredItems.map((item) => {
                  const expirationAlert = calculateExpirationAlert(item.expiration_date);
                  return (
                    <tr key={item.id} className="border-t border-border/30 text-sm">
                      <td className="p-4">
                        <p className="font-semibold">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.storage_location || 'Sem local'}</p>
                      </td>
                      <td className="p-4">{categoryLabel(item.category)}</td>
                      <td className="p-4">{Number(item.total_quantity)} {item.unit}</td>
                      <td className="p-4 font-semibold">{Number(item.available_quantity)}</td>
                      <td className="p-4">{Number(item.reserved_quantity)}</td>
                      <td className="p-4">{item.supplier || '-'}</td>
                      <td className="p-4">
                        {item.expiration_date ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${item.expiration_date}T00:00:00`)) : '-'}
                        {expirationAlert && (
                          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-700">
                            <CalendarClock size={12} />
                            {expirationAlert.type === 'expired' ? 'Vencido' : `${expirationAlert.days} dias`}
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className="inline-flex px-2 py-1 rounded-full text-[10px] bg-gold/10 text-gold font-bold uppercase tracking-wider">
                          {statusLabel(item.status)}
                        </span>
                      </td>
                      <td className="p-4 text-right space-x-2">
                        <Button size="icon" variant="ghost" onClick={() => openForm(item)}><Pencil size={15} /></Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(item.id)}><Trash2 size={15} className="text-rose-600" /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!isLoading && filteredItems.length === 0 && (
              <div className="p-10 text-center text-sm text-muted-foreground">Nenhum item encontrado para os filtros selecionados.</div>
            )}
            {isLoading && <div className="p-10 text-center text-sm text-muted-foreground">Carregando estoque...</div>}
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl h-[88vh] rounded-[28px] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/20 bg-white">
            <DialogTitle className="font-display text-2xl">{editing ? 'Editar item de alimentação' : 'Novo item de alimentação'}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-2">
                <Label>Nome do item</Label>
                <Input value={form.name} onChange={(e) => setForm((p: any) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={(v) => setForm((p: any) => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FOOD_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{categoryLabel(c)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Unidade</Label>
                <Select value={form.unit} onValueChange={(v) => setForm((p: any) => ({ ...p, unit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{UNITS.map((unit) => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantidade total</Label>
                <div className="grid grid-cols-[1fr,140px] gap-2">
                  <Input type="number" step="0.001" value={form.total_quantity} onChange={(e) => setForm((p: any) => ({ ...p, total_quantity: e.target.value }))} />
                  <Select onValueChange={(v) => setForm((p: any) => ({ ...p, total_quantity: v }))}>
                    <SelectTrigger><SelectValue placeholder="Opções" /></SelectTrigger>
                    <SelectContent>{QUANTITY_OPTIONS.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Estoque mínimo</Label>
                <div className="grid grid-cols-[1fr,140px] gap-2">
                  <Input type="number" step="0.001" value={form.minimum_stock} onChange={(e) => setForm((p: any) => ({ ...p, minimum_stock: e.target.value }))} />
                  <Select onValueChange={(v) => setForm((p: any) => ({ ...p, minimum_stock: v }))}>
                    <SelectTrigger><SelectValue placeholder="Opções" /></SelectTrigger>
                    <SelectContent>{QUANTITY_OPTIONS.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Fornecedor (buscar cadastrados)</Label>
                <Input
                  list="food-suppliers-list"
                  value={form.supplier}
                  onChange={(e) => setForm((p: any) => ({ ...p, supplier: e.target.value }))}
                  placeholder="Digite para buscar fornecedor cadastrado"
                />
                <datalist id="food-suppliers-list">
                  {suppliers.map((supplier) => (
                    <option key={supplier} value={supplier} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2"><Label>Custo por unidade</Label><Input type="number" value={form.cost_per_unit} onChange={(e) => setForm((p: any) => ({ ...p, cost_per_unit: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Data de compra</Label><Input type="date" value={form.purchase_date} onChange={(e) => setForm((p: any) => ({ ...p, purchase_date: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Validade</Label><Input type="date" value={form.expiration_date} onChange={(e) => setForm((p: any) => ({ ...p, expiration_date: e.target.value }))} /></div>
              <div className="md:col-span-2 space-y-2"><Label>Local de armazenamento</Label><Input value={form.storage_location} onChange={(e) => setForm((p: any) => ({ ...p, storage_location: e.target.value }))} /></div>
              <div className="md:col-span-2 space-y-2"><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => setForm((p: any) => ({ ...p, notes: e.target.value }))} /></div>
            </div>
          </div>
          <div className="border-t border-border/20 bg-white px-6 py-4 space-y-3">
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5" />
              O sistema recalcula automaticamente quantidade disponível com base em reservados, avariados e manutenção.
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending}>
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AlimentacaoPage;
