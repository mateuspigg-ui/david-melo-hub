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
  fetchEventsForInventory,
  fetchInventoryItems,
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

const SelecaoFestaPage = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedReservationId, setSelectedReservationId] = useState<string>('');
  const [searchItems, setSearchItems] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'food' | 'furniture'>('all');
  const [reservationTypeFilter, setReservationTypeFilter] = useState<'all' | 'food' | 'furniture'>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [itemSource, setItemSource] = useState<'inventory' | 'rental'>('inventory');
  const [editOpen, setEditOpen] = useState(false);
  const [newReservationOpen, setNewReservationOpen] = useState(false);
  const [itemForm, setItemForm] = useState({ itemId: '', quantity: 1, notes: '' });
  const [rentalForm, setRentalForm] = useState({ pieceName: '', supplier: '', quantity: 1, unit: 'unidade', notes: '' });
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

  const availableItems = useMemo(() => {
    const text = searchItems.toLowerCase();
    return items
      .filter((item) => item.available_quantity > 0)
      .filter((item) => (selectedType === 'all' ? true : item.type === selectedType))
      .filter((item) => (item.status === 'maintenance' || item.status === 'damaged' || item.status === 'expired' ? false : true))
      .filter((item) => item.name.toLowerCase().includes(text) || item.category.toLowerCase().includes(text));
  }, [items, selectedType, searchItems]);

  const filteredReservationItems = useMemo(() => {
    const reservationItems = selectedReservation?.event_inventory_items || [];
    if (reservationTypeFilter === 'all') return reservationItems;
    return reservationItems.filter((item) => {
      if (item.is_rental) return reservationTypeFilter === 'furniture';
      return item.inventory_items?.type === reservationTypeFilter;
    });
  }, [selectedReservation, reservationTypeFilter]);

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

  const addItemMutation = useMutation({
    mutationFn: async () => {
      if (!selectedReservation) throw new Error('Selecione uma reserva');
      if (itemSource === 'rental') {
        if (!rentalForm.pieceName.trim()) throw new Error('Informe o nome da peça alugada');
        if (!rentalForm.supplier.trim()) throw new Error('Selecione ou informe o fornecedor do aluguel');
        if (Number(rentalForm.quantity) <= 0) throw new Error('Quantidade inválida para aluguel');
        return addReservationItem({
          reservation_id: selectedReservation.id,
          quantity: Number(rentalForm.quantity),
          unit: rentalForm.unit || 'unidade',
          notes: rentalForm.notes || null,
          is_rental: true,
          rental_supplier: rentalForm.supplier,
          rental_item_name: rentalForm.pieceName,
        });
      }

      const inventoryItem = items.find((item) => item.id === itemForm.itemId);
      if (!inventoryItem) throw new Error('Item não encontrado');
      if (itemForm.quantity > inventoryItem.available_quantity) {
        throw new Error(`Quantidade acima do disponível (${inventoryItem.available_quantity})`);
      }
      return addReservationItem({
        reservation_id: selectedReservation.id,
        inventory_item_id: inventoryItem.id,
        quantity: Number(itemForm.quantity),
        unit: inventoryItem.unit,
        notes: itemForm.notes || null,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['event_inventory_reservations'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory_items_for_reservation'] }),
      ]);
      setItemForm({ itemId: '', quantity: 1, notes: '' });
      setRentalForm({ pieceName: '', supplier: '', quantity: 1, unit: 'unidade', notes: '' });
      setAddOpen(false);
      toast({ title: 'Item reservado com sucesso' });
    },
    onError: (error: any) => {
      toast({ title: 'Falha ao reservar item', description: error?.message || 'Tente novamente', variant: 'destructive' });
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
    setItemForm({ itemId: '', quantity: 1, notes: '' });
    setRentalForm({ pieceName: '', supplier: '', quantity: 1, unit: 'unidade', notes: '' });
    setAddOpen(true);
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
              <p className="font-semibold text-sm">{reservation.events?.title || 'Evento sem título'}</p>
              <p className="text-xs text-muted-foreground">{reservation.events?.event_date ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${reservation.events.event_date}T00:00:00`)) : 'Sem data'} • {reservation.events?.location || 'Sem local'}</p>
              <p className="text-[10px] text-gold font-bold uppercase tracking-wider mt-1">{statusLabel(reservation.reservation_status)}</p>
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
              <Select value={selectedType} onValueChange={(v: any) => setSelectedType(v)}>
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
            <div className="md:col-span-2 relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={searchItems} onChange={(e) => setSearchItems(e.target.value)} className="pl-9" placeholder="Buscar item" /></div>
            <div className="md:col-span-2" />
            <Select value={itemForm.itemId} onValueChange={(v) => setItemForm((p) => ({ ...p, itemId: v }))}><SelectTrigger><SelectValue placeholder="Item" /></SelectTrigger><SelectContent>{availableItems.slice(0, 150).map((item) => <SelectItem key={item.id} value={item.id}>{item.name} • disp. {Number(item.available_quantity)}</SelectItem>)}</SelectContent></Select>
            <div className="space-y-2"><Label>Quantidade</Label><Input type="number" min={1} value={itemForm.quantity} onChange={(e) => setItemForm((p) => ({ ...p, quantity: Number(e.target.value || 1) }))} /></div>
            <div className="md:col-span-3 space-y-2"><Label>Observações</Label><Textarea value={itemForm.notes} onChange={(e) => setItemForm((p) => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          )}
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button><Button onClick={() => addItemMutation.mutate()} disabled={(itemSource === 'inventory' && !itemForm.itemId) || (itemSource === 'rental' && !rentalForm.pieceName.trim()) || !selectedReservation}>Reservar item</Button></div>
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
