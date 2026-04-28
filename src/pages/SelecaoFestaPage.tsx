import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, FileDown, Printer, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  addReservationItem,
  categoryLabel,
  createReservation,
  FOOD_CATEGORIES,
  fetchEventsForInventory,
  fetchInventoryItems,
  FURNITURE_CATEGORIES,
  fetchReservations,
  removeReservationItem,
  RESERVATION_STATUSES,
  statusLabel,
  updateReservationItem,
  updateReservationStatus,
  type EventInventoryReservation,
} from '@/lib/inventory';
import { openReservationPdfPrint } from '@/lib/inventoryPdf';
import logo from '@/assets/logo.png';

type PendingReservationItem = {
  localId: string;
  source: 'inventory' | 'rental';
  inventory_item_id?: string;
  itemName: string;
  supplier?: string;
  quantity: number;
  unit: string;
  model?: string;
  notes?: string;
};

const MODEL_OPTIONS_BY_ITEM: Record<string, string[]> = {
};

const normalizeModelKey = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const CATEGORY_BY_ITEM_NAME: Record<string, string> = {
  // cozinha
  fogao: 'cozinha',
  frigideira: 'cozinha',
  gas: 'cozinha',
  gordura: 'cozinha',
  'balde de gurdura vazio': 'cozinha',
  'caixa termica pequena': 'cozinha',
  'caixa termica grande': 'cozinha',
  palete: 'cozinha',
  'tacho e escumadeira': 'cozinha',
  'bandeja para salgado': 'cozinha',

  // mobiliario
  'mesa de bolo': 'mobiliario',
  brinde: 'mobiliario',
  'frios 1': 'mobiliario',
  'mesas de apoio aos frios': 'mobiliario',
  doce: 'mobiliario',
  jantar: 'mobiliario',
  'apoio ao jantar': 'mobiliario',
  aparadores: 'mobiliario',
  'bem casados': 'mobiliario',
  sandalia: 'mobiliario',
  lembranca: 'mobiliario',
  'mesa de convidados': 'mobiliario',
  'mesa da familia': 'mobiliario',
  'mesa de convi. pranchao redondo': 'mobiliario',
  'cadeiras de convidados': 'mobiliario',
  'cadeiras da familia': 'mobiliario',
  'cadeiras cerimonia': 'mobiliario',
  digestiva: 'mobiliario',
  sushi: 'mobiliario',
  padre: 'mobiliario',
  'stand by retangular': 'mobiliario',
  'stand by redonda': 'mobiliario',
  'stand by redonda nova': 'mobiliario',
  'banquetas medalhao': 'mobiliario',
  'banquetas capri': 'mobiliario',
  banquetas: 'mobiliario',
  familia: 'mobiliario',
  presente: 'mobiliario',
  'pranchao retangular': 'mobiliario',
  receptivo: 'mobiliario',

  // tapetes
  'perca 5 x 3': 'tapetes',
  'perca 4 x 3': 'tapetes',
  felpudo: 'tapetes',
  'listra laranja 5 x 3': 'tapetes',
  'sisal cru': 'tapetes',
  cupim: 'tapetes',
  'tapete igreja': 'tapetes',
  'tapete listra 3x2': 'tapetes',
  'passarela vermelho': 'tapetes',
  'passarela bege': 'tapetes',
  'passarela perca': 'tapetes',
  carpetes: 'tapetes',

  // tecidos
  'toalha mesa de convidados': 'tecidos',
  'sobrepor mesa de convidados': 'tecidos',
  guardanapos: 'tecidos',
  'sacolao garçons': 'tecidos',
  'pano para bandeja garçom': 'tecidos',
  'fundo de mesa': 'tecidos',

  // velas / casticais / lustres
  'vela copo de wisky redondo': 'velas_carticais_lustres',
  'vela copo de wisky quadrado': 'velas_carticais_lustres',
  'lustre cristal pp p m g gg': 'velas_carticais_lustres',
  'lustre cristal m (novo) g(novo)': 'velas_carticais_lustres',
  'lustre cristal': 'velas_carticais_lustres',
  'cupula de lustre': 'velas_carticais_lustres',
  'cupula de cartiçal': 'velas_carticais_lustres',
  lampada: 'velas_carticais_lustres',
  abajour: 'velas_carticais_lustres',
  adereços: 'velas_carticais_lustres',

  // espelhos
  'espelho md moldura dourada': 'espelhos',
  'espelho md moldura prata': 'espelhos',
  'tampo de espelho m. convidado': 'espelhos',
  'tampo de espelho m. buffet': 'espelhos',
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  cozinha: ['fogao', 'frigideira', 'gas', 'gordura', 'caixa termica', 'tacho', 'escumadeira', 'bandeja para salgado', 'palete'],
  mobiliario: ['mesa', 'cadeira', 'aparador', 'stand by', 'banqueta', 'pranchao', 'receptivo', 'digestiva', 'sushi', 'padre', 'brinde', 'lembranca', 'presente', 'frios', 'doce', 'jantar'],
  tapetes: ['tapete', 'passarela', 'carpete', 'felpudo', 'sisal', 'listra', 'cupim', 'perca'],
  tecidos: ['toalha', 'sobrepor', 'guardanapo', 'sacolao', 'pano', 'fundo de mesa'],
  velas_carticais_lustres: ['vela', 'lustre', 'cupula', 'lampada', 'abajour', 'adereco', 'cartical', 'castical'],
  espelhos: ['espelho', 'tampo de espelho'],
};

const resolveCategory = (item: { name: string; category: string; type?: string }) => {
  const normalizedName = normalizeModelKey(item.name);
  const mapped = CATEGORY_BY_ITEM_NAME[normalizedName];
  if (mapped) return mapped;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => normalizedName.includes(keyword))) {
      return category;
    }
  }

  if (item.type === 'furniture') return 'mobiliario';
  return item.category;
};

const SelecaoFestaPage = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedReservationId, setSelectedReservationId] = useState<string>('');
  const [searchItems, setSearchItems] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'food' | 'furniture'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [reservationTypeFilter, setReservationTypeFilter] = useState<'all' | 'food' | 'furniture'>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [itemSource, setItemSource] = useState<'inventory' | 'rental'>('inventory');
  const [editOpen, setEditOpen] = useState(false);
  const [newReservationOpen, setNewReservationOpen] = useState(false);
  const [itemForm, setItemForm] = useState({ itemId: '', model: '', quantity: 1, notes: '' });
  const [rentalForm, setRentalForm] = useState({ pieceName: '', supplier: '', quantity: 1, unit: 'unidade', notes: '' });
  const [pendingItems, setPendingItems] = useState<PendingReservationItem[]>([]);
  const [editItemForm, setEditItemForm] = useState({ id: '', quantity: 1, notes: '' });
  const [newReservationEventId, setNewReservationEventId] = useState('');
  const [responsibleName, setResponsibleName] = useState('');
  const [guestCount, setGuestCount] = useState<number | null>(null);

  const { data: reservations = [] } = useQuery({ queryKey: ['event_inventory_reservations'], queryFn: fetchReservations });
  const { data: items = [] } = useQuery({ queryKey: ['inventory_items_for_reservation'], queryFn: () => fetchInventoryItems() });
  const { data: events = [] } = useQuery({ queryKey: ['events_for_inventory'], queryFn: fetchEventsForInventory });
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers_for_rental_selection'],
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('company_name').order('company_name');
      if (error) throw error;
      return (data || []).map((row) => row.company_name).filter(Boolean);
    },
  });

  const selectedReservation = useMemo(() => reservations.find((r) => r.id === selectedReservationId) || null, [reservations, selectedReservationId]);
  const selectedInventoryItem = useMemo(() => items.find((item) => item.id === itemForm.itemId) || null, [items, itemForm.itemId]);
  const modelOptions = useMemo(() => {
    if (!selectedInventoryItem) return [] as string[];
    return MODEL_OPTIONS_BY_ITEM[normalizeModelKey(selectedInventoryItem.name)] || [];
  }, [selectedInventoryItem]);

  const availableCategories = useMemo(() => {
    if (selectedType === 'food') return FOOD_CATEGORIES;
    if (selectedType === 'furniture') return FURNITURE_CATEGORIES;
    return [...FOOD_CATEGORIES, ...FURNITURE_CATEGORIES];
  }, [selectedType]);

  const availableItems = useMemo(() => {
    const text = searchItems.toLowerCase();
    return items
      .filter((item) => item.available_quantity > 0)
      .filter((item) => (selectedType === 'all' ? true : item.type === selectedType))
      .filter((item) => (selectedCategory === 'all' ? true : resolveCategory(item) === selectedCategory))
      .filter((item) => (item.status === 'maintenance' || item.status === 'damaged' || item.status === 'expired' ? false : true))
      .filter((item) => item.name.toLowerCase().includes(text) || categoryLabel(resolveCategory(item)).toLowerCase().includes(text));
  }, [items, selectedType, selectedCategory, searchItems]);

  const filteredReservationItems = useMemo(() => {
    const reservationItems = selectedReservation?.event_inventory_items || [];
    if (reservationTypeFilter === 'all') return reservationItems;
    return reservationItems.filter((item) => {
      if (item.is_rental) return reservationTypeFilter === 'furniture';
      return item.inventory_items?.type === reservationTypeFilter;
    });
  }, [selectedReservation, reservationTypeFilter]);

  const queuedByInventoryId = useMemo(() => {
    const map = new Map<string, number>();
    pendingItems
      .filter((item) => item.source === 'inventory' && item.inventory_item_id)
      .forEach((item) => {
        const id = item.inventory_item_id as string;
        map.set(id, (map.get(id) || 0) + Number(item.quantity || 0));
      });
    return map;
  }, [pendingItems]);

  const createReservationMutation = useMutation({
    mutationFn: async () => {
      const event = events.find((entry: any) => entry.id === newReservationEventId);
      if (!event) throw new Error('Selecione um evento válido');
      return createReservation({ event_id: event.id, client_id: event.client_id || null, reservation_status: 'draft' });
    },
    onSuccess: async (reservation) => {
      await queryClient.invalidateQueries({ queryKey: ['event_inventory_reservations'] });
      setSelectedReservationId(reservation.id);
      setNewReservationOpen(false);
      setNewReservationEventId('');
      toast({ title: 'Reserva criada com sucesso' });
    },
    onError: (error: any) => {
      toast({ title: 'Não foi possível criar a reserva', description: error?.message || 'Tente novamente', variant: 'destructive' });
    },
  });

  const finalizeReservationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedReservation) throw new Error('Selecione uma reserva');
      if (pendingItems.length === 0) throw new Error('Adicione itens à lista antes de finalizar');

      for (const row of pendingItems) {
        if (row.source === 'rental') {
          await addReservationItem({
            reservation_id: selectedReservation.id,
            quantity: Number(row.quantity),
            unit: row.unit || 'unidade',
            notes: row.notes || null,
            is_rental: true,
            rental_supplier: row.supplier || null,
            rental_item_name: row.itemName,
          });
          continue;
        }

        await addReservationItem({
          reservation_id: selectedReservation.id,
          inventory_item_id: row.inventory_item_id,
          quantity: Number(row.quantity),
          unit: row.unit || null,
          notes: row.notes || null,
        });
      }

      await updateReservationStatus(selectedReservation.id, 'confirmed');
      return true;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['event_inventory_reservations'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory_items_for_reservation'] }),
      ]);
      setItemForm({ itemId: '', quantity: 1, notes: '' });
      setRentalForm({ pieceName: '', supplier: '', quantity: 1, unit: 'unidade', notes: '' });
      setPendingItems([]);
      setAddOpen(false);
      toast({ title: 'Pedido finalizado com sucesso', description: 'Todos os itens foram reservados e o pedido foi confirmado.' });
    },
    onError: (error: any) => {
      toast({ title: 'Falha ao finalizar pedido', description: error?.message || 'Tente novamente', variant: 'destructive' });
    },
  });

  const editItemMutation = useMutation({
    mutationFn: async () => updateReservationItem(editItemForm.id, Number(editItemForm.quantity), editItemForm.notes),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['event_inventory_reservations'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory_items_for_reservation'] }),
      ]);
      setEditOpen(false);
      toast({ title: 'Reserva atualizada com sucesso' });
    },
    onError: (error: any) => {
      toast({ title: 'Não foi possível editar o item', description: error?.message || 'Tente novamente', variant: 'destructive' });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: removeReservationItem,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['event_inventory_reservations'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory_items_for_reservation'] }),
      ]);
      toast({ title: 'Item removido da reserva' });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: any }) => updateReservationStatus(id, status),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['event_inventory_reservations'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory_items_for_reservation'] }),
      ]);
      toast({ title: 'Status da reserva atualizado' });
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async ({ reservationId, eventId }: { reservationId: string; eventId: string }) => {
      const { data: reservationRows } = await supabase.from('event_inventory_reservations').select('id').eq('event_id', eventId);
      const reservationIds = (reservationRows || []).map((row: any) => row.id);
      if (reservationIds.length > 0) {
        await supabase.from('event_inventory_items').delete().in('reservation_id', reservationIds);
      }

      const { error: reservationsError } = await supabase.from('event_inventory_reservations').delete().eq('event_id', eventId);
      if (reservationsError) throw reservationsError;

      await supabase.from('contracts').delete().eq('event_id', eventId);

      const { error: eventError } = await supabase.from('events').delete().eq('id', eventId);
      if (eventError) throw eventError;

      return { reservationId, eventId };
    },
    onSuccess: async ({ reservationId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['event_inventory_reservations'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory_items_for_reservation'] }),
        queryClient.invalidateQueries({ queryKey: ['events_for_inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory_items_dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory_reservations_dashboard'] }),
      ]);
      if (selectedReservationId === reservationId) {
        setSelectedReservationId('');
      }
      toast({ title: 'Evento excluído com sucesso' });
    },
    onError: (error: any) => {
      toast({ title: 'Não foi possível excluir o evento', description: error?.message || 'Verifique vínculos e tente novamente.', variant: 'destructive' });
    },
  });

  const openPrint = (reservation: EventInventoryReservation) => {
    openReservationPdfPrint({
      reservation,
      companyName: 'David Melo Produções',
      logoUrl: logo,
      responsibleName,
      guestCount,
    });
  };

  const openAddDialog = () => {
    setItemSource('inventory');
    setItemForm({ itemId: '', model: '', quantity: 1, notes: '' });
    setRentalForm({ pieceName: '', supplier: '', quantity: 1, unit: 'unidade', notes: '' });
    setPendingItems([]);
    setAddOpen(true);
  };

  const addDraftItem = () => {
    if (itemSource === 'rental') {
      if (!rentalForm.pieceName.trim()) {
        toast({ title: 'Informe o nome da peça alugada', variant: 'destructive' });
        return;
      }
      if (!rentalForm.supplier.trim()) {
        toast({ title: 'Selecione/informe o fornecedor do aluguel', variant: 'destructive' });
        return;
      }
      if (Number(rentalForm.quantity) <= 0) {
        toast({ title: 'Quantidade inválida', variant: 'destructive' });
        return;
      }

      setPendingItems((prev) => [
        ...prev,
        {
          localId: `${Date.now()}-${Math.random()}`,
          source: 'rental',
          itemName: rentalForm.pieceName,
          supplier: rentalForm.supplier,
          quantity: Number(rentalForm.quantity),
          unit: rentalForm.unit || 'unidade',
          notes: rentalForm.notes || '',
        },
      ]);
      setRentalForm({ pieceName: '', supplier: '', quantity: 1, unit: 'unidade', notes: '' });
      return;
    }

    const inventoryItem = items.find((item) => item.id === itemForm.itemId);
    if (!inventoryItem) {
      toast({ title: 'Selecione um item do estoque', variant: 'destructive' });
      return;
    }

    const requested = Number(itemForm.quantity || 0);
    if (requested <= 0) {
      toast({ title: 'Quantidade inválida', variant: 'destructive' });
      return;
    }

    const alreadyQueued = queuedByInventoryId.get(inventoryItem.id) || 0;
    const remaining = Number(inventoryItem.available_quantity) - alreadyQueued;
    if (requested > remaining) {
      toast({ title: 'Quantidade acima do disponível', description: `Disponível para adicionar agora: ${remaining}`, variant: 'destructive' });
      return;
    }

    const normalizedModel = itemForm.model.trim();

    setPendingItems((prev) => [
      ...prev,
      {
        localId: `${Date.now()}-${Math.random()}`,
        source: 'inventory',
        inventory_item_id: inventoryItem.id,
        itemName: inventoryItem.name,
        model: normalizedModel || undefined,
        quantity: requested,
        unit: inventoryItem.unit || 'unidade',
        notes: normalizedModel ? `${itemForm.notes ? `${itemForm.notes} • ` : ''}Modelo: ${normalizedModel}` : (itemForm.notes || ''),
      },
    ]);

    setItemForm({ itemId: '', model: '', quantity: 1, notes: '' });
  };

  const removeDraftItem = (localId: string) => {
    setPendingItems((prev) => prev.filter((row) => row.localId !== localId));
  };

  return (
    <div className="space-y-10 animate-fade-in max-w-[1700px] mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 px-2">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 bg-gold rounded-full" />
            <h1 className="text-4xl md:text-5xl font-display text-foreground tracking-tighter uppercase leading-none">Seleção por Festa</h1>
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.35em] text-gold/80 pl-4">Reserva de estoque por evento</p>
        </div>
        <Button onClick={() => setNewReservationOpen(true)} className="h-12 rounded-2xl bg-gradient-gold text-white font-bold uppercase text-[11px] tracking-[0.14em]"><Plus size={16} className="mr-2" />Nova reserva</Button>
      </div>

      <div className="px-2 grid grid-cols-1 lg:grid-cols-[360px,1fr] gap-6">
        <div className="bg-white rounded-[30px] border border-border/30 premium-shadow p-4 space-y-3">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Reservas de eventos</div>
          {reservations.map((reservation) => (
            <button key={reservation.id} onClick={() => setSelectedReservationId(reservation.id)} className={`w-full text-left rounded-2xl border p-3 transition ${selectedReservationId === reservation.id ? 'border-gold bg-gold/5' : 'border-border/40 hover:border-gold/30'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm">{reservation.events?.title || 'Evento sem título'}</p>
                  <p className="text-xs text-muted-foreground">{reservation.events?.event_date ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${reservation.events.event_date}T00:00:00`)) : 'Sem data'} • {reservation.events?.location || 'Sem local'}</p>
                  <p className="text-[10px] text-gold font-bold uppercase tracking-wider mt-1">{statusLabel(reservation.reservation_status)}</p>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                  disabled={!reservation.event_id || deleteEventMutation.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!reservation.event_id) return;
                    const confirmed = window.confirm('Deseja realmente excluir este evento e todas as reservas vinculadas? Esta ação não pode ser desfeita.');
                    if (!confirmed) return;
                    deleteEventMutation.mutate({ reservationId: reservation.id, eventId: reservation.event_id });
                  }}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            </button>
          ))}
          {reservations.length === 0 && <div className="text-sm text-muted-foreground border border-dashed rounded-xl p-6 text-center">Nenhuma reserva criada.</div>}
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-[30px] border border-border/30 premium-shadow p-5">
            {selectedReservation ? (
              <>
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
                  <div>
                    <h3 className="text-2xl font-display">{selectedReservation.events?.title || 'Reserva de estoque'}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Cliente: {`${selectedReservation.events?.clients?.first_name || ''} ${selectedReservation.events?.clients?.last_name || ''}`.trim() || 'Não informado'}
                    </p>
                    <p className="text-sm text-muted-foreground">Data: {selectedReservation.events?.event_date ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${selectedReservation.events.event_date}T00:00:00`)) : 'Não definida'} • Local: {selectedReservation.events?.location || 'Não definido'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Select value={selectedReservation.reservation_status} onValueChange={(v) => statusMutation.mutate({ id: selectedReservation.id, status: v })}>
                      <SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RESERVATION_STATUSES.map((status) => <SelectItem key={status} value={status}>{statusLabel(status)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={openAddDialog}><Plus size={15} className="mr-2" />Adicionar item</Button>
                    <Button variant="outline" onClick={() => openPrint(selectedReservation)}><Printer size={15} className="mr-2" />Gerar PDF da Seleção</Button>
                    <Button variant="outline" onClick={() => openPrint(selectedReservation)}><FileDown size={15} className="mr-2" />Imprimir / Download</Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
                  <div className="space-y-2"><Label>Responsável do evento</Label><Input value={responsibleName} onChange={(e) => setResponsibleName(e.target.value)} placeholder="Ex.: Juliana Costa" /></div>
                  <div className="space-y-2"><Label>Número de convidados</Label><Input type="number" value={guestCount ?? ''} onChange={(e) => setGuestCount(e.target.value ? Number(e.target.value) : null)} placeholder="Ex.: 180" /></div>
                </div>

                <div className="mt-4 max-w-[260px]">
                  <Label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Filtrar itens reservados</Label>
                  <Select value={reservationTypeFilter} onValueChange={(v: any) => setReservationTypeFilter(v)}>
                    <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="food">Alimentação</SelectItem>
                      <SelectItem value="furniture">Mobiliário</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Selecione uma reserva de evento para iniciar.</div>
            )}
          </div>

          <div className="bg-white rounded-[30px] border border-border/30 premium-shadow overflow-auto">
            <table className="w-full min-w-[1000px]">
              <thead className="bg-secondary/30 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80">
                <tr>
                  <th className="text-left p-4">Item</th>
                  <th className="text-left p-4">Categoria</th>
                  <th className="text-left p-4">Qtd. solicitada</th>
                  <th className="text-left p-4">Qtd. disponível</th>
                  <th className="text-left p-4">Unidade</th>
                  <th className="text-left p-4">Observações</th>
                  <th className="text-right p-4">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredReservationItems.map((item) => (
                  <tr key={item.id} className="border-t border-border/30 text-sm">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        {item.inventory_items?.inventory_item_photos?.[0]?.photo_url ? <img src={item.inventory_items.inventory_item_photos[0].photo_url} className="w-10 h-10 rounded-lg object-cover" /> : <div className="w-10 h-10 rounded-lg bg-secondary/50" />}
                        <div>
                          <p className="font-semibold">{item.is_rental ? item.rental_item_name : item.inventory_items?.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.is_rental
                              ? `Mobiliário (Aluguel) • ${item.rental_supplier || 'Fornecedor não informado'}`
                              : item.inventory_items?.type === 'food'
                              ? 'Alimentação'
                              : 'Mobiliário'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">{item.is_rental ? 'Aluguel externo' : categoryLabel(item.inventory_items?.category || '')}</td>
                    <td className="p-4 font-semibold">{Number(item.quantity)}</td>
                    <td className="p-4">{item.is_rental ? '-' : Number(item.inventory_items?.available_quantity || 0)}</td>
                    <td className="p-4">{item.unit || item.inventory_items?.unit || '-'}</td>
                    <td className="p-4">{item.notes || '-'}</td>
                    <td className="p-4 text-right">
                      <Button size="icon" variant="ghost" onClick={() => { setEditItemForm({ id: item.id, quantity: Number(item.quantity), notes: item.notes || '' }); setEditOpen(true); }}><Pencil size={15} /></Button>
                      <Button size="icon" variant="ghost" onClick={() => removeItemMutation.mutate(item.id)}><Trash2 size={15} className="text-rose-600" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {selectedReservation && filteredReservationItems.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">Nenhum item reservado para este filtro.</div>}
          </div>
        </div>
      </div>

      <Dialog open={newReservationOpen} onOpenChange={setNewReservationOpen}>
        <DialogContent className="max-w-xl rounded-[28px]">
          <DialogHeader><DialogTitle className="font-display text-2xl">Nova reserva por festa</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Evento</Label>
            <Select value={newReservationEventId} onValueChange={setNewReservationEventId}>
              <SelectTrigger><SelectValue placeholder="Selecione o evento" /></SelectTrigger>
              <SelectContent>
                {events.map((event: any) => (
                  <SelectItem key={event.id} value={event.id}>{event.title} • {event.event_date ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${event.event_date}T00:00:00`)) : 'Sem data'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setNewReservationOpen(false)}>Cancelar</Button><Button onClick={() => createReservationMutation.mutate()} disabled={!newReservationEventId}>{createReservationMutation.isPending ? 'Criando...' : 'Criar reserva'}</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl rounded-[28px]">
          <DialogHeader><DialogTitle className="font-display text-2xl">Adicionar item à reserva</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-1">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={selectedType} onValueChange={(v: any) => {
                setSelectedType(v);
                setSelectedCategory('all');
                if (v !== 'furniture') {
                  setItemSource('inventory');
                }
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Todas categorias</SelectItem><SelectItem value="food">Alimentação</SelectItem><SelectItem value="furniture">Mobiliário</SelectItem></SelectContent>
              </Select>
            </div>
            {selectedType === 'furniture' && (
              <div className="space-y-2">
                <Label>Origem da peça</Label>
                <Select value={itemSource} onValueChange={(v: any) => setItemSource(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inventory">Estoque interno</SelectItem>
                    <SelectItem value="rental">Aluguel externo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {selectedType === 'furniture' && itemSource === 'rental' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2 space-y-2">
                <Label>Nome da peça alugada</Label>
                <Input value={rentalForm.pieceName} onChange={(e) => setRentalForm((p) => ({ ...p, pieceName: e.target.value }))} placeholder="Ex.: Poltrona Louis XV Dourada" />
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label>Fornecedor do aluguel</Label>
                <Input
                  list="rental-suppliers-list"
                  value={rentalForm.supplier}
                  onChange={(e) => setRentalForm((p) => ({ ...p, supplier: e.target.value }))}
                  placeholder="Buscar fornecedor cadastrado"
                />
                <datalist id="rental-suppliers-list">
                  {suppliers.map((supplier) => <option key={supplier} value={supplier} />)}
                </datalist>
              </div>
              <div className="space-y-2"><Label>Quantidade</Label><Input type="number" min={1} value={rentalForm.quantity} onChange={(e) => setRentalForm((p) => ({ ...p, quantity: Number(e.target.value || 1) }))} /></div>
              <div className="space-y-2"><Label>Unidade</Label><Input value={rentalForm.unit} onChange={(e) => setRentalForm((p) => ({ ...p, unit: e.target.value }))} placeholder="unidade" /></div>
              <div className="md:col-span-2 space-y-2"><Label>Observações</Label><Textarea value={rentalForm.notes} onChange={(e) => setRentalForm((p) => ({ ...p, notes: e.target.value }))} /></div>
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2 space-y-2">
              <Label>Categoria</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger><SelectValue placeholder="Filtrar por categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas categorias</SelectItem>
                  {availableCategories.map((category) => (
                    <SelectItem key={category} value={category}>{categoryLabel(category)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-4 space-y-2">
              <Label>Buscar item</Label>
              <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={searchItems} onChange={(e) => setSearchItems(e.target.value)} className="pl-9" placeholder="Digite para ver opções de item" /></div>
              {searchItems.trim().length > 0 && (
                <div className="max-h-44 overflow-y-auto rounded-xl border border-border/50 bg-white p-1">
                  {availableItems.slice(0, 12).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setItemForm((p) => ({ ...p, itemId: item.id, model: '' }));
                        setSearchItems(item.name);
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-gold/5 transition text-sm"
                    >
                      <span className="font-semibold">{item.name}</span>
                      <span className="text-xs text-muted-foreground"> • {categoryLabel(resolveCategory(item))} • disp. {Number(item.available_quantity)} {item.unit || ''}</span>
                    </button>
                  ))}
                  {availableItems.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Nenhum item encontrado.</p>}
                </div>
              )}
              <Select value={itemForm.itemId} onValueChange={(v) => setItemForm((p) => ({ ...p, itemId: v, model: '' }))}>
                <SelectTrigger><SelectValue placeholder="Ou selecione na lista completa" /></SelectTrigger>
                <SelectContent>{availableItems.slice(0, 150).map((item) => <SelectItem key={item.id} value={item.id}>{item.name} • {categoryLabel(resolveCategory(item))} • disp. {Number(item.available_quantity)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Modelo</Label>
              <Select value={itemForm.model || '__none__'} onValueChange={(v) => setItemForm((p) => ({ ...p, model: v === '__none__' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder={selectedInventoryItem ? 'Selecione o modelo' : 'Selecione um item primeiro'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem modelo</SelectItem>
                  {modelOptions.map((model) => <SelectItem key={model} value={model}>{model}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Quantidade</Label><Input type="number" min={1} value={itemForm.quantity} onChange={(e) => setItemForm((p) => ({ ...p, quantity: Number(e.target.value || 1) }))} /></div>
            <div className="md:col-span-3 space-y-2"><Label>Observações</Label><Textarea value={itemForm.notes} onChange={(e) => setItemForm((p) => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          )}
          <div className="rounded-xl border border-border/40 p-3 mt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] uppercase tracking-[0.14em] font-bold text-muted-foreground">Itens adicionados ao pedido</p>
              <span className="text-xs font-semibold text-foreground/70">{pendingItems.length} item(ns)</span>
            </div>
            <div className="max-h-44 overflow-y-auto space-y-2">
              {pendingItems.map((row) => (
                <div key={row.localId} className="flex items-start justify-between gap-3 rounded-lg border border-border/40 px-3 py-2 text-sm">
                  <div>
                    <p className="font-semibold">{row.itemName}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.source === 'rental' ? `Aluguel • ${row.supplier}` : 'Estoque interno'}{row.model ? ` • modelo: ${row.model}` : ''} • {row.quantity} {row.unit}
                    </p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => removeDraftItem(row.localId)}><Trash2 size={14} className="text-rose-600" /></Button>
                </div>
              ))}
              {pendingItems.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Nenhum item adicionado ainda.</p>}
            </div>
          </div>

          <div className="flex justify-between gap-2">
            <Button type="button" variant="outline" onClick={addDraftItem} disabled={!selectedReservation}>Adicionar à lista</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
              <Button onClick={() => finalizeReservationMutation.mutate()} disabled={!selectedReservation || pendingItems.length === 0 || finalizeReservationMutation.isPending}>
                {finalizeReservationMutation.isPending ? 'Finalizando...' : 'Fechar pedido e reservar tudo'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg rounded-[28px]">
          <DialogHeader><DialogTitle className="font-display text-2xl">Editar item reservado</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label>Quantidade</Label><Input type="number" min={1} value={editItemForm.quantity} onChange={(e) => setEditItemForm((p) => ({ ...p, quantity: Number(e.target.value || 1) }))} /></div>
            <div className="space-y-2"><Label>Observações</Label><Textarea value={editItemForm.notes} onChange={(e) => setEditItemForm((p) => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button><Button onClick={() => editItemMutation.mutate()}>Salvar alterações</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SelecaoFestaPage;
