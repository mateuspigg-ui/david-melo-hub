import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Upload, ImageIcon, Pencil, Trash2, LayoutGrid, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { FURNITURE_CATEGORIES, categoryLabel, fetchInventoryItems, statusLabel, upsertInventoryItem, deleteInventoryItem, uploadInventoryPhotos, type InventoryItem } from '@/lib/inventory';
import { formatCurrencyInput, maskCurrencyInput, parseCurrencyInput } from '@/lib/currencyInput';

const emptyForm = {
  name: '',
  category: 'other',
  description: '',
  total_quantity: 0,
  minimum_stock: 0,
  damaged_quantity: 0,
  maintenance_quantity: 0,
  color: '',
  material: '',
  dimensions: '',
  storage_location: '',
  replacement_value: '',
  sku: '',
  notes: '',
};

const tokenPart = (value: string, fallback: string) => {
  const normalized = (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
  return (normalized.slice(0, 3) || fallback).padEnd(3, 'X');
};

const buildAutoSku = (existingSkus: string[], category: string, name: string, color?: string) => {
  const categoryCode = tokenPart(category, 'CAT');
  const nameCode = tokenPart(name, 'PEC');
  const colorCode = tokenPart(color || 'STD', 'STD');
  const prefix = `MB-${categoryCode}-${nameCode}-${colorCode}`;
  const regex = new RegExp(`^${prefix}-(\\d{3})$`);
  const next = existingSkus.reduce((max, sku) => {
    const match = sku.match(regex);
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0) + 1;

  return `${prefix}-${String(next).padStart(3, '0')}`;
};

const MobiliarioDecoracaoPage = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'table' | 'gallery'>('gallery');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [autoSku, setAutoSku] = useState(true);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['inventory_furniture_items'],
    queryFn: () => fetchInventoryItems('furniture'),
  });

  const filteredItems = useMemo(() => {
    const text = search.toLowerCase();
    return items.filter((item) => {
      const matchText =
        item.name.toLowerCase().includes(text) ||
        (item.sku || '').toLowerCase().includes(text) ||
        (item.material || '').toLowerCase().includes(text);
      const matchCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;
      return matchText && matchCategory && matchStatus;
    });
  }, [items, search, categoryFilter, statusFilter]);

  const existingSkus = useMemo(() => {
    return items.filter((item) => item.id !== editing?.id).map((item) => item.sku || '').filter(Boolean);
  }, [items, editing]);

  useEffect(() => {
    if (!open || editing || !autoSku) return;
    const generated = buildAutoSku(existingSkus, form.category, form.name, form.color);
    if (generated !== form.sku) {
      setForm((prev: any) => ({ ...prev, sku: generated }));
    }
  }, [autoSku, editing, existingSkus, form.category, form.color, form.name, form.sku, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        id: editing?.id,
        name: form.name,
        type: 'furniture' as const,
        category: form.category,
        description: form.description || null,
        unit: 'unit',
        total_quantity: Number(form.total_quantity || 0),
        minimum_stock: Number(form.minimum_stock || 0),
        damaged_quantity: Number(form.damaged_quantity || 0),
        maintenance_quantity: Number(form.maintenance_quantity || 0),
        color: form.color || null,
        material: form.material || null,
        dimensions: form.dimensions || null,
        storage_location: form.storage_location || null,
        replacement_value: form.replacement_value ? parseCurrencyInput(form.replacement_value) : null,
        sku: form.sku || null,
        notes: form.notes || null,
      };

      const item = await upsertInventoryItem(payload);
      if (photoFiles.length > 0) {
        await uploadInventoryPhotos(item.id, photoFiles);
      }
      return item;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory_furniture_items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory_items_dashboard'] });
      toast({ title: editing ? 'Item atualizado com sucesso' : 'Item criado com sucesso' });
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
      setPhotoFiles([]);
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao salvar item', description: error?.message || 'Tente novamente', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteInventoryItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory_furniture_items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory_items_dashboard'] });
      toast({ title: 'Item removido do estoque' });
    },
  });

  const openForm = (item?: InventoryItem) => {
    if (item) {
      setEditing(item);
      setAutoSku(false);
      setForm({
        name: item.name,
        category: item.category,
        description: item.description || '',
        total_quantity: item.total_quantity,
        minimum_stock: item.minimum_stock,
        damaged_quantity: item.damaged_quantity,
        maintenance_quantity: item.maintenance_quantity,
        color: item.color || '',
        material: item.material || '',
        dimensions: item.dimensions || '',
        storage_location: item.storage_location || '',
        replacement_value: item.replacement_value != null ? formatCurrencyInput(item.replacement_value) : '',
        sku: item.sku || '',
        notes: item.notes || '',
      });
    } else {
      setEditing(null);
      setAutoSku(true);
      setForm(emptyForm);
    }
    setPhotoFiles([]);
    setOpen(true);
  };

  return (
    <div className="space-y-10 animate-fade-in max-w-[1700px] mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 px-2">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 bg-gold rounded-full" />
            <h1 className="text-4xl md:text-5xl font-display text-foreground tracking-tighter uppercase leading-none">Mobiliário e Decoração</h1>
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.35em] text-gold/80 pl-4">Acervo visual e controle físico</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white border border-border/50">
            <Button variant="ghost" size="sm" className={viewMode === 'gallery' ? 'bg-gold/10 text-gold' : ''} onClick={() => setViewMode('gallery')}><LayoutGrid size={15} className="mr-2" />Galeria</Button>
            <Button variant="ghost" size="sm" className={viewMode === 'table' ? 'bg-gold/10 text-gold' : ''} onClick={() => setViewMode('table')}><Table2 size={15} className="mr-2" />Tabela</Button>
          </div>
          <Button onClick={() => openForm()} className="h-12 rounded-2xl bg-gradient-gold text-white font-bold uppercase text-[11px] tracking-[0.14em]"><Plus size={16} className="mr-2" />Novo item</Button>
        </div>
      </div>

      <div className="px-2">
        <div className="bg-white rounded-[28px] border border-border/30 p-5 premium-shadow grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative md:col-span-2"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input className="pl-10 h-11 rounded-xl" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, SKU, material..." /></div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas categorias</SelectItem>{FURNITURE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{categoryLabel(c)}</SelectItem>)}</SelectContent></Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos status</SelectItem><SelectItem value="available">Disponível</SelectItem><SelectItem value="reserved">Reservado</SelectItem><SelectItem value="maintenance">Manutenção</SelectItem><SelectItem value="damaged">Danificado</SelectItem><SelectItem value="out_of_stock">Sem estoque</SelectItem></SelectContent></Select>
        </div>
      </div>

      {viewMode === 'gallery' ? (
        <div className="px-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {!isLoading && filteredItems.map((item) => (
            <div key={item.id} className="bg-white border border-border/30 rounded-[26px] premium-shadow overflow-hidden group">
              <div className="aspect-[4/3] bg-secondary/20 relative">
                {item.inventory_item_photos?.[0]?.photo_url ? (
                  <img src={item.inventory_item_photos[0].photo_url} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ImageIcon size={28} /></div>
                )}
                <span className="absolute top-3 left-3 px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-white/90 text-gold">{statusLabel(item.status)}</span>
              </div>
              <div className="p-4 space-y-2">
                <p className="font-semibold leading-tight">{item.name}</p>
                <p className="text-xs text-muted-foreground">{categoryLabel(item.category)}</p>
                <div className="text-xs font-bold text-foreground/70">Disponível: {Number(item.available_quantity)}</div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button size="icon" variant="ghost" onClick={() => openForm(item)}><Pencil size={15} /></Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(item.id)}><Trash2 size={15} className="text-rose-600" /></Button>
                </div>
              </div>
            </div>
          ))}
          {!isLoading && filteredItems.length === 0 && <div className="col-span-full p-12 border border-dashed rounded-2xl text-center text-muted-foreground">Nenhum item encontrado.</div>}
        </div>
      ) : (
        <div className="px-2">
          <div className="bg-white rounded-[30px] border border-border/30 premium-shadow overflow-auto">
            <table className="w-full min-w-[1200px]">
              <thead className="bg-secondary/40 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80"><tr><th className="text-left p-4">Item</th><th className="text-left p-4">Categoria</th><th className="text-left p-4">Total</th><th className="text-left p-4">Disponível</th><th className="text-left p-4">Reservado</th><th className="text-left p-4">Danificado</th><th className="text-left p-4">Manutenção</th><th className="text-left p-4">Status</th><th className="text-right p-4">Ações</th></tr></thead>
              <tbody>
                {!isLoading && filteredItems.map((item) => (
                  <tr key={item.id} className="border-t border-border/30 text-sm">
                    <td className="p-4"><p className="font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">SKU: {item.sku || '-'}</p></td>
                    <td className="p-4">{categoryLabel(item.category)}</td>
                    <td className="p-4">{Number(item.total_quantity)}</td>
                    <td className="p-4 font-semibold">{Number(item.available_quantity)}</td>
                    <td className="p-4">{Number(item.reserved_quantity)}</td>
                    <td className="p-4">{Number(item.damaged_quantity)}</td>
                    <td className="p-4">{Number(item.maintenance_quantity)}</td>
                    <td className="p-4"><span className="inline-flex px-2 py-1 rounded-full text-[10px] bg-gold/10 text-gold font-bold uppercase tracking-wider">{statusLabel(item.status)}</span></td>
                    <td className="p-4 text-right"><Button size="icon" variant="ghost" onClick={() => openForm(item)}><Pencil size={15} /></Button><Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(item.id)}><Trash2 size={15} className="text-rose-600" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl h-[90vh] rounded-[28px] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/20 bg-white">
            <DialogTitle className="font-display text-2xl">{editing ? 'Editar item de mobiliário' : 'Novo item de mobiliário'}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-2"><Label>Nome do item</Label><Input value={form.name} onChange={(e) => setForm((p: any) => ({ ...p, name: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Categoria</Label><Select value={form.category} onValueChange={(v) => setForm((p: any) => ({ ...p, category: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{FURNITURE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{categoryLabel(c)}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2">
                <Label>SKU interno</Label>
                <div className="flex gap-2">
                  <Input
                    value={form.sku}
                    onChange={(e) => {
                      setAutoSku(false);
                      setForm((p: any) => ({ ...p, sku: e.target.value }));
                    }}
                    placeholder="Gerado automaticamente"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const generated = buildAutoSku(existingSkus, form.category, form.name, form.color);
                      setAutoSku(true);
                      setForm((p: any) => ({ ...p, sku: generated }));
                    }}
                    className="whitespace-nowrap"
                  >
                    Gerar SKU
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Padrão: <b>MB-CAT-NOM-COR-001</b> (automático).</p>
              </div>
              <div className="space-y-2"><Label>Quantidade total</Label><Input type="number" value={form.total_quantity} onChange={(e) => setForm((p: any) => ({ ...p, total_quantity: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Estoque mínimo</Label><Input type="number" value={form.minimum_stock} onChange={(e) => setForm((p: any) => ({ ...p, minimum_stock: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Quantidade danificada</Label><Input type="number" value={form.damaged_quantity} onChange={(e) => setForm((p: any) => ({ ...p, damaged_quantity: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Quantidade em manutenção</Label><Input type="number" value={form.maintenance_quantity} onChange={(e) => setForm((p: any) => ({ ...p, maintenance_quantity: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Cor</Label><Input value={form.color} onChange={(e) => setForm((p: any) => ({ ...p, color: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Material</Label><Input value={form.material} onChange={(e) => setForm((p: any) => ({ ...p, material: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Dimensões</Label><Input value={form.dimensions} onChange={(e) => setForm((p: any) => ({ ...p, dimensions: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Valor de reposição</Label><Input type="text" inputMode="numeric" placeholder="0,00" value={form.replacement_value} onChange={(e) => setForm((p: any) => ({ ...p, replacement_value: maskCurrencyInput(e.target.value) }))} /></div>
              <div className="md:col-span-2 space-y-2"><Label>Local de armazenamento</Label><Input value={form.storage_location} onChange={(e) => setForm((p: any) => ({ ...p, storage_location: e.target.value }))} /></div>
              <div className="md:col-span-2 space-y-2"><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => setForm((p: any) => ({ ...p, description: e.target.value }))} /></div>
              <div className="md:col-span-2 space-y-2"><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => setForm((p: any) => ({ ...p, notes: e.target.value }))} /></div>

              <div className="md:col-span-2 rounded-xl border border-gold/20 bg-gold/[0.04] p-4 space-y-3">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-gold">Upload de fotos do mobiliário</p>
                <p className="text-xs text-muted-foreground">Selecione as imagens neste bloco. As fotos serão enviadas ao clicar em <b>Salvar item</b>.</p>
                <label className="h-12 border border-dashed border-gold/40 rounded-xl flex items-center justify-center gap-2 text-sm text-gold cursor-pointer bg-white">
                  <Upload size={16} /> Selecionar imagens
                  <input type="file" className="hidden" multiple accept="image/*" onChange={(e) => setPhotoFiles(Array.from(e.target.files || []))} />
                </label>
                {photoFiles.length > 0 ? (
                  <div className="text-xs text-foreground/75 space-y-1">
                    <p className="font-semibold">{photoFiles.length} arquivo(s) selecionado(s):</p>
                    {photoFiles.slice(0, 4).map((file) => (
                      <p key={file.name} className="truncate">- {file.name}</p>
                    ))}
                    {photoFiles.length > 4 && <p className="text-muted-foreground">...e mais {photoFiles.length - 4} arquivo(s)</p>}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Nenhuma imagem selecionada ainda.</p>
                )}
              </div>
            </div>
          </div>
          <div className="border-t border-border/20 bg-white px-6 py-4 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending}>{saveMutation.isPending ? 'Salvando...' : 'Salvar item'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MobiliarioDecoracaoPage;
