import { supabase } from '@/integrations/supabase/client';

export type InventoryType = 'food' | 'furniture';

export type InventoryStatus =
  | 'available'
  | 'low_stock'
  | 'expired'
  | 'out_of_stock'
  | 'reserved'
  | 'maintenance'
  | 'damaged';

export type ReservationStatus = 'draft' | 'reserved' | 'confirmed' | 'returned' | 'partially_returned' | 'canceled';

export const FOOD_CATEGORIES = [
  'meat',
  'seafood',
  'pasta',
  'dessert',
  'beverage',
  'garnish',
  'snack',
  'condiment',
  'disposable',
  'other',
];

export const FURNITURE_CATEGORIES = [
  'table',
  'chair',
  'sofa',
  'lounge',
  'buffet_table',
  'decorative_object',
  'vase',
  'panel',
  'structure',
  'lighting',
  'linen',
  'rug',
  'tray',
  'support_item',
  'other',
];

export const UNITS = ['kg', 'g', 'liter', 'ml', 'unit', 'box', 'package'];

export const RESERVATION_STATUSES: ReservationStatus[] = ['draft', 'reserved', 'confirmed', 'returned', 'partially_returned', 'canceled'];

export const MOVEMENT_TYPES = [
  'initial_registration',
  'manual_adjustment',
  'event_reservation',
  'event_cancellation',
  'item_return',
  'loss_damage',
  'maintenance',
  'purchase_entry',
];

export interface InventoryPhoto {
  id: string;
  inventory_item_id: string;
  photo_url: string;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  type: InventoryType;
  category: string;
  description: string | null;
  unit: string | null;
  total_quantity: number;
  available_quantity: number;
  reserved_quantity: number;
  damaged_quantity: number;
  maintenance_quantity: number;
  minimum_stock: number;
  supplier: string | null;
  purchase_date: string | null;
  expiration_date: string | null;
  cost_per_unit: number | null;
  replacement_value: number | null;
  color: string | null;
  material: string | null;
  dimensions: string | null;
  storage_location: string | null;
  sku: string | null;
  notes: string | null;
  status: InventoryStatus;
  created_at: string;
  updated_at: string;
  inventory_item_photos?: InventoryPhoto[];
}

export interface EventInventoryReservation {
  id: string;
  event_id: string | null;
  client_id: string | null;
  reservation_status: ReservationStatus;
  created_at: string;
  updated_at: string;
  events?: {
    id: string;
    title: string;
    event_type: string | null;
    event_date: string | null;
    location: string | null;
    notes: string | null;
    clients?: {
      id: string;
      first_name: string;
      last_name: string;
      phone: string | null;
      email: string | null;
    } | null;
  } | null;
  event_inventory_items?: EventInventoryItem[];
}

export interface EventInventoryItem {
  id: string;
  reservation_id: string;
  inventory_item_id: string;
  quantity: number;
  unit: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  inventory_items?: InventoryItem | null;
}

export interface StockMovement {
  id: string;
  inventory_item_id: string | null;
  event_id: string | null;
  client_id: string | null;
  user_id: string | null;
  movement_type: string;
  previous_quantity: number | null;
  new_quantity: number | null;
  quantity_changed: number | null;
  notes: string | null;
  created_at: string;
  inventory_items?: { name: string; type: InventoryType; category: string } | null;
  clients?: { first_name: string; last_name: string } | null;
  events?: { title: string } | null;
  profiles?: { full_name: string } | null;
}

const sb = supabase as any;

export const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    available: 'Disponível',
    low_stock: 'Estoque Baixo',
    expired: 'Vencido',
    out_of_stock: 'Sem Estoque',
    reserved: 'Reservado',
    maintenance: 'Manutenção',
    damaged: 'Danificado',
    draft: 'Rascunho',
    confirmed: 'Confirmado',
    returned: 'Devolvido',
    partially_returned: 'Devolução Parcial',
    canceled: 'Cancelado',
    initial_registration: 'Cadastro Inicial',
    manual_adjustment: 'Ajuste Manual',
    event_reservation: 'Reserva para Evento',
    event_cancellation: 'Cancelamento de Evento',
    item_return: 'Retorno de Item',
    loss_damage: 'Perda / Dano',
    purchase_entry: 'Entrada de Compra',
  };
  return map[status] || status;
};

export const categoryLabel = (category: string) => category.replaceAll('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase());

export const calculateExpirationAlert = (expirationDate: string | null) => {
  if (!expirationDate) return null;
  const now = new Date();
  const exp = new Date(`${expirationDate}T00:00:00`);
  const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { type: 'expired', days: diffDays };
  if (diffDays <= 7) return { type: 'critical', days: diffDays };
  if (diffDays <= 30) return { type: 'warning', days: diffDays };
  return null;
};

export const fetchInventoryItems = async (type?: InventoryType) => {
  let query = sb
    .from('inventory_items')
    .select('*, inventory_item_photos(*)')
    .order('updated_at', { ascending: false });

  if (type) query = query.eq('type', type);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as InventoryItem[];
};

export const upsertInventoryItem = async (item: Partial<InventoryItem> & { name: string; type: InventoryType; category: string }) => {
  if (item.id) {
    const { data, error } = await sb
      .from('inventory_items')
      .update({ ...item })
      .eq('id', item.id)
      .select('*')
      .single();
    if (error) throw error;
    return data as InventoryItem;
  }

  const { data, error } = await sb.from('inventory_items').insert(item).select('*').single();
  if (error) throw error;
  return data as InventoryItem;
};

export const deleteInventoryItem = async (id: string) => {
  const { error } = await sb.from('inventory_items').delete().eq('id', id);
  if (error) throw error;
};

export const uploadInventoryPhotos = async (inventoryItemId: string, files: File[]) => {
  const uploadedUrls: string[] = [];

  for (const file of files) {
    const extension = file.name.split('.').pop() || 'jpg';
    const fileName = `${inventoryItemId}/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;
    const { error: uploadError } = await sb.storage.from('inventory-photos').upload(fileName, file, {
      upsert: false,
      contentType: file.type || 'image/jpeg',
    });

    if (uploadError) throw uploadError;

    const { data: publicData } = sb.storage.from('inventory-photos').getPublicUrl(fileName);
    const photoUrl = publicData?.publicUrl;
    if (!photoUrl) continue;

    uploadedUrls.push(photoUrl);

    const { error: photoError } = await sb.from('inventory_item_photos').insert({
      inventory_item_id: inventoryItemId,
      photo_url: photoUrl,
    });

    if (photoError) throw photoError;
  }

  return uploadedUrls;
};

export const fetchReservations = async () => {
  const { data, error } = await sb
    .from('event_inventory_reservations')
    .select('*, events(id, title, event_type, event_date, location, notes, clients(id, first_name, last_name, phone, email)), event_inventory_items(*, inventory_items(*, inventory_item_photos(*)))')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as EventInventoryReservation[];
};

export const createReservation = async (payload: { event_id: string; client_id: string | null; reservation_status?: ReservationStatus }) => {
  const { data, error } = await sb
    .from('event_inventory_reservations')
    .insert({
      event_id: payload.event_id,
      client_id: payload.client_id,
      reservation_status: payload.reservation_status || 'draft',
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as EventInventoryReservation;
};

export const updateReservationStatus = async (reservationId: string, reservationStatus: ReservationStatus) => {
  const { data, error } = await sb
    .from('event_inventory_reservations')
    .update({ reservation_status: reservationStatus })
    .eq('id', reservationId)
    .select('*')
    .single();

  if (error) throw error;
  return data as EventInventoryReservation;
};

export const addReservationItem = async (payload: {
  reservation_id: string;
  inventory_item_id: string;
  quantity: number;
  unit?: string | null;
  notes?: string | null;
}) => {
  const { data, error } = await sb
    .from('event_inventory_items')
    .insert({
      reservation_id: payload.reservation_id,
      inventory_item_id: payload.inventory_item_id,
      quantity: payload.quantity,
      unit: payload.unit || null,
      notes: payload.notes || null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as EventInventoryItem;
};

export const updateReservationItem = async (id: string, quantity: number, notes?: string) => {
  const { data, error } = await sb
    .from('event_inventory_items')
    .update({ quantity, notes: notes || null })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data as EventInventoryItem;
};

export const removeReservationItem = async (id: string) => {
  const { error } = await sb.from('event_inventory_items').delete().eq('id', id);
  if (error) throw error;
};

export const fetchEventsForInventory = async () => {
  const { data, error } = await sb
    .from('events')
    .select('id, title, event_type, event_date, event_time, location, notes, client_id, clients(id, first_name, last_name, phone, email)')
    .order('event_date', { ascending: true });
  if (error) throw error;

  const { data: contracts } = await sb.from('contracts').select('id, event_id, title').order('created_at', { ascending: false });
  const contractMap = new Map<string, { id: string; title: string }>();

  (contracts || []).forEach((contract: any) => {
    if (!contractMap.has(contract.event_id)) {
      contractMap.set(contract.event_id, { id: contract.id, title: contract.title || contract.id });
    }
  });

  return (data || []).map((event: any) => ({
    ...event,
    contract: contractMap.get(event.id) || null,
  }));
};

export const fetchStockMovements = async () => {
  const { data, error } = await sb
    .from('stock_movements')
    .select('*, inventory_items(name, type, category), clients(first_name, last_name), events(title), profiles!stock_movements_user_id_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data || []) as StockMovement[];
};

export const buildCsv = (headers: string[], rows: Array<Array<string | number | null | undefined>>) => {
  const safe = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return '';
    const text = String(value).replaceAll('"', '""');
    return `"${text}"`;
  };

  return [headers.map(safe).join(','), ...rows.map((row) => row.map(safe).join(','))].join('\n');
};

export const downloadCsv = (fileName: string, content: string) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
