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
  'congelados',
  'frutos_do_mar',
  'condimentos',
  'graos_cereais',
  'bebidas',
];

export const FURNITURE_CATEGORIES = ['mobiliario', 'cozinha', 'tecidos', 'espelhos', 'pecas_mesa_frios_cozinha'];

export const UNITS = ['kg', 'g', 'litro', 'ml', 'unidade', 'caixa', 'pacote', 'garrafa', 'lata', 'bandeja', 'fardo'];

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
  inventory_item_id: string | null;
  quantity: number;
  unit: string | null;
  notes: string | null;
  is_rental?: boolean;
  rental_supplier?: string | null;
  rental_item_name?: string | null;
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

const CATEGORY_LABELS: Record<string, string> = {
  congelados: 'congelados',
  frutos_do_mar: 'frutos do mar',
  condimentos: 'condimentos',
  graos_cereais: 'grãos e cereais',
  bebidas: 'bebidas',
  pecas_mesa_frios_cozinha: 'peças para mesa de frios e cozinha',
  cozinha: 'cozinha',
  tecidos: 'tecidos',
  espelhos: 'espelhos',
  mobiliario: 'mobiliário',
};

export const categoryLabel = (category: string) => CATEGORY_LABELS[category] || category.replaceAll('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase());

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
  inventory_item_id?: string | null;
  quantity: number;
  unit?: string | null;
  notes?: string | null;
  is_rental?: boolean;
  rental_supplier?: string | null;
  rental_item_name?: string | null;
}) => {
  const { data, error } = await sb
    .from('event_inventory_items')
    .insert({
      reservation_id: payload.reservation_id,
      inventory_item_id: payload.inventory_item_id || null,
      quantity: payload.quantity,
      unit: payload.unit || null,
      notes: payload.notes || null,
      is_rental: payload.is_rental || false,
      rental_supplier: payload.rental_supplier || null,
      rental_item_name: payload.rental_item_name || null,
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

export const seedInventoryDemoData = async () => {
  const demoClientEmail = 'demo.almoxarifado@davidmelo.local';
  const demoEventTitle = 'DEMO | Casamento Isabella & Rafael';
  const demoContractTitle = 'CONTRATO DEMO | CAS-2026-001';

  const { data: existingClient } = await sb.from('clients').select('id').eq('email', demoClientEmail).maybeSingle();

  let clientId = existingClient?.id as string | undefined;
  if (!clientId) {
    const { data: createdClient, error: clientError } = await sb
      .from('clients')
      .insert({
        first_name: 'Isabella',
        last_name: 'Almeida',
        email: demoClientEmail,
        phone: '(11) 98888-1122',
        instagram: '@isabella.almeida.demo',
      })
      .select('id')
      .single();
    if (clientError) throw clientError;
    clientId = createdClient.id;
  }

  const { data: existingEvent } = await sb.from('events').select('id').eq('title', demoEventTitle).maybeSingle();
  let eventId = existingEvent?.id as string | undefined;
  if (!eventId) {
    const { data: createdEvent, error: eventError } = await sb
      .from('events')
      .insert({
        title: demoEventTitle,
        client_id: clientId,
        event_type: 'wedding',
        event_date: '2026-11-21',
        event_time: '19:30:00',
        location: 'Palácio Dourado - São Paulo/SP',
        notes: 'Evento fictício para demonstração do módulo de almoxarifado.',
        budget_value: 185000,
        payment_status: 'pendente',
      })
      .select('id')
      .single();
    if (eventError) throw eventError;
    eventId = createdEvent.id;
  }

  const { data: existingContract } = await sb.from('contracts').select('id').eq('event_id', eventId).eq('title', demoContractTitle).maybeSingle();
  if (!existingContract?.id) {
    const { error: contractError } = await sb.from('contracts').insert({
      title: demoContractTitle,
      event_id: eventId,
      client_id: clientId,
      signed_status: 'pendente',
    });
    if (contractError) throw contractError;
  }

  const demoItems = [
    {
      name: 'Filé Mignon Premium',
      type: 'food',
      category: 'meat',
      unit: 'kg',
      total_quantity: 120,
      minimum_stock: 25,
      supplier: 'Boutique Carnes Nobres',
      purchase_date: '2026-11-12',
      expiration_date: '2026-11-26',
      cost_per_unit: 89.9,
      storage_location: 'Câmara fria A1',
      notes: 'Lote selecionado para eventos premium.',
    },
    {
      name: 'Camarão VG Limpo',
      type: 'food',
      category: 'seafood',
      unit: 'kg',
      total_quantity: 75,
      minimum_stock: 20,
      supplier: 'Costa Azul Frutos do Mar',
      purchase_date: '2026-11-10',
      expiration_date: '2026-11-24',
      cost_per_unit: 112.5,
      storage_location: 'Câmara fria A2',
      notes: 'Controle rígido de validade.',
    },
    {
      name: 'Espumante Brut Reserva',
      type: 'food',
      category: 'beverage',
      unit: 'unit',
      total_quantity: 220,
      minimum_stock: 50,
      supplier: 'Adega Monte Bello',
      purchase_date: '2026-10-01',
      expiration_date: '2027-10-01',
      cost_per_unit: 56,
      storage_location: 'Adega climatizada B1',
      notes: 'Caixas lacradas para eventos sociais.',
    },
    {
      name: 'Mesa Provençal Off-white',
      type: 'furniture',
      category: 'table',
      unit: 'unit',
      total_quantity: 24,
      minimum_stock: 6,
      replacement_value: 1650,
      color: 'Off-white',
      material: 'Madeira laqueada',
      dimensions: '220x90x78 cm',
      storage_location: 'Galpão C - Corredor 2',
      sku: 'TB-PRO-220',
      notes: 'Uso principal em ilhas gastronômicas.',
      description: 'Mesa de apoio premium para buffet.',
    },
    {
      name: 'Cadeira Tiffany Dourada',
      type: 'furniture',
      category: 'chair',
      unit: 'unit',
      total_quantity: 320,
      minimum_stock: 80,
      replacement_value: 390,
      color: 'Dourado champagne',
      material: 'Policarbonato reforçado',
      dimensions: '40x45x92 cm',
      storage_location: 'Galpão A - Prateleira 4',
      sku: 'CH-TIF-GOLD',
      notes: 'Modelo padrão para eventos de luxo.',
      description: 'Cadeira clássica para área social.',
    },
    {
      name: 'Lustre Pendente Cristal Siena',
      type: 'furniture',
      category: 'lighting',
      unit: 'unit',
      total_quantity: 18,
      minimum_stock: 4,
      replacement_value: 4800,
      color: 'Cristal transparente',
      material: 'Cristal e metal',
      dimensions: '65x65x90 cm',
      storage_location: 'Sala técnica iluminação',
      sku: 'LG-CRS-65',
      notes: 'Necessita montagem técnica.',
      description: 'Lustre cênico para pista e salão principal.',
    },
  ] as Array<Record<string, any>>;

  const photoMap: Record<string, string[]> = {
    'Mesa Provençal Off-white': [
      'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=900&q=80',
    ],
    'Cadeira Tiffany Dourada': [
      'https://images.unsplash.com/photo-1464146072230-91cabc968266?auto=format&fit=crop&w=900&q=80',
    ],
    'Lustre Pendente Cristal Siena': [
      'https://images.unsplash.com/photo-1533090481720-856c6e3c1fdc?auto=format&fit=crop&w=900&q=80',
    ],
  };

  const createdItemIdsByName = new Map<string, string>();

  for (const item of demoItems) {
    const { data: existingItem } = await sb
      .from('inventory_items')
      .select('id, name')
      .eq('name', item.name)
      .eq('type', item.type)
      .maybeSingle();

    let itemId = existingItem?.id as string | undefined;
    if (!itemId) {
      const { data: createdItem, error: itemError } = await sb.from('inventory_items').insert(item).select('id, name').single();
      if (itemError) throw itemError;
      itemId = createdItem.id;
    }

    createdItemIdsByName.set(item.name, itemId);

    if (item.type === 'furniture' && photoMap[item.name]?.length) {
      const { data: existingPhotos } = await sb
        .from('inventory_item_photos')
        .select('id')
        .eq('inventory_item_id', itemId)
        .limit(1);

      if (!existingPhotos?.length) {
        const rows = photoMap[item.name].map((url) => ({ inventory_item_id: itemId, photo_url: url }));
        const { error: photoError } = await sb.from('inventory_item_photos').insert(rows);
        if (photoError) throw photoError;
      }
    }
  }

  const { data: existingReservation } = await sb.from('event_inventory_reservations').select('id').eq('event_id', eventId).maybeSingle();
  let reservationId = existingReservation?.id as string | undefined;
  if (!reservationId) {
    const { data: createdReservation, error: reservationError } = await sb
      .from('event_inventory_reservations')
      .insert({
        event_id: eventId,
        client_id: clientId,
        reservation_status: 'reserved',
      })
      .select('id')
      .single();
    if (reservationError) throw reservationError;
    reservationId = createdReservation.id;
  }

  const reservationTemplate = [
    { name: 'Filé Mignon Premium', quantity: 32, unit: 'kg', notes: 'Estação principal do jantar.' },
    { name: 'Camarão VG Limpo', quantity: 18, unit: 'kg', notes: 'Coquetel volante e ilhas quentes.' },
    { name: 'Espumante Brut Reserva', quantity: 96, unit: 'unit', notes: 'Brinde oficial e welcome drinks.' },
    { name: 'Mesa Provençal Off-white', quantity: 8, unit: 'unit', notes: 'Ilhas de buffet e doces finos.' },
    { name: 'Cadeira Tiffany Dourada', quantity: 180, unit: 'unit', notes: 'Salão principal e varanda.' },
    { name: 'Lustre Pendente Cristal Siena', quantity: 4, unit: 'unit', notes: 'Montagem na pista central.' },
  ];

  for (const row of reservationTemplate) {
    const itemId = createdItemIdsByName.get(row.name);
    if (!itemId) continue;

    const { data: existingReservationItem } = await sb
      .from('event_inventory_items')
      .select('id')
      .eq('reservation_id', reservationId)
      .eq('inventory_item_id', itemId)
      .maybeSingle();

    if (!existingReservationItem?.id) {
      const { error: reservationItemError } = await sb.from('event_inventory_items').insert({
        reservation_id: reservationId,
        inventory_item_id: itemId,
        quantity: row.quantity,
        unit: row.unit,
        notes: row.notes,
      });
      if (reservationItemError) throw reservationItemError;
    }
  }

  return {
    client_id: clientId,
    event_id: eventId,
    reservation_id: reservationId,
    items_seeded: demoItems.length,
    reservation_items_seeded: reservationTemplate.length,
  };
};

export const clearInventoryDemoData = async () => {
  const demoClientEmail = 'demo.almoxarifado@davidmelo.local';
  const demoEventTitle = 'DEMO | Casamento Isabella & Rafael';
  const demoContractTitle = 'CONTRATO DEMO | CAS-2026-001';
  const demoItemNames = [
    'Filé Mignon Premium',
    'Camarão VG Limpo',
    'Espumante Brut Reserva',
    'Mesa Provençal Off-white',
    'Cadeira Tiffany Dourada',
    'Lustre Pendente Cristal Siena',
  ];

  const { data: demoItems } = await sb
    .from('inventory_items')
    .select('id, name')
    .in('name', demoItemNames);

  const demoItemIds = (demoItems || []).map((item: any) => item.id);

  const { data: demoEvent } = await sb.from('events').select('id').eq('title', demoEventTitle).maybeSingle();
  const demoEventId = demoEvent?.id as string | undefined;

  const { data: demoReservations } = demoEventId
    ? await sb.from('event_inventory_reservations').select('id').eq('event_id', demoEventId)
    : { data: [] as Array<{ id: string }> };

  const reservationIds = (demoReservations || []).map((reservation: any) => reservation.id);

  if (reservationIds.length > 0) {
    await sb.from('event_inventory_items').delete().in('reservation_id', reservationIds);
    await sb.from('event_inventory_reservations').delete().in('id', reservationIds);
  }

  if (demoEventId) {
    await sb.from('contracts').delete().eq('event_id', demoEventId).eq('title', demoContractTitle);
    await sb.from('stock_movements').delete().eq('event_id', demoEventId);
    await sb.from('events').delete().eq('id', demoEventId);
  }

  if (demoItemIds.length > 0) {
    await sb.from('stock_movements').delete().in('inventory_item_id', demoItemIds);
    await sb.from('inventory_items').delete().in('id', demoItemIds);
  }

  const { data: demoClient } = await sb.from('clients').select('id').eq('email', demoClientEmail).maybeSingle();
  if (demoClient?.id) {
    await sb.from('stock_movements').delete().eq('client_id', demoClient.id);
    await sb.from('clients').delete().eq('id', demoClient.id);
  }

  return {
    removed_items: demoItemIds.length,
    removed_reservations: reservationIds.length,
    removed_event: Boolean(demoEventId),
    removed_client: Boolean(demoClient?.id),
  };
};

export const seedPartyTestCatalog = async () => {
  const foodBlueprint: Array<{ category: string; items: Array<{ name: string; unit: string; quantity: number; min: number; cost: number }>; photo: string }> = [
    {
      category: 'congelados',
      photo: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80',
      items: [
        { name: 'TESTE | filé de frango congelado', unit: 'kg', quantity: 120, min: 20, cost: 22 },
        { name: 'TESTE | medalhão suíno congelado', unit: 'kg', quantity: 85, min: 15, cost: 31 },
        { name: 'TESTE | batata pré-frita congelada', unit: 'fardo', quantity: 40, min: 10, cost: 78 },
        { name: 'TESTE | polpa de fruta congelada', unit: 'caixa', quantity: 28, min: 6, cost: 64 },
        { name: 'TESTE | salgado coquetel congelado', unit: 'caixa', quantity: 35, min: 8, cost: 96 },
      ],
    },
    {
      category: 'frutos_do_mar',
      photo: 'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?auto=format&fit=crop&w=1200&q=80',
      items: [
        { name: 'TESTE | camarão limpo médio', unit: 'kg', quantity: 65, min: 12, cost: 98 },
        { name: 'TESTE | lula em anéis', unit: 'kg', quantity: 42, min: 8, cost: 74 },
        { name: 'TESTE | polvo pré-cozido', unit: 'kg', quantity: 24, min: 5, cost: 112 },
        { name: 'TESTE | mexilhão sem casca', unit: 'kg', quantity: 30, min: 6, cost: 69 },
        { name: 'TESTE | peixe branco em postas', unit: 'kg', quantity: 58, min: 10, cost: 52 },
      ],
    },
    {
      category: 'condimentos',
      photo: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=1200&q=80',
      items: [
        { name: 'TESTE | sal refinado premium', unit: 'fardo', quantity: 22, min: 4, cost: 38 },
        { name: 'TESTE | azeite extra virgem', unit: 'caixa', quantity: 18, min: 4, cost: 168 },
        { name: 'TESTE | pimenta-do-reino moída', unit: 'caixa', quantity: 16, min: 3, cost: 92 },
        { name: 'TESTE | orégano seco', unit: 'caixa', quantity: 12, min: 2, cost: 54 },
        { name: 'TESTE | alho desidratado', unit: 'caixa', quantity: 14, min: 3, cost: 61 },
      ],
    },
    {
      category: 'graos_cereais',
      photo: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=1200&q=80',
      items: [
        { name: 'TESTE | arroz branco tipo 1', unit: 'fardo', quantity: 26, min: 5, cost: 148 },
        { name: 'TESTE | feijão carioca selecionado', unit: 'fardo', quantity: 20, min: 4, cost: 132 },
        { name: 'TESTE | lentilha premium', unit: 'caixa', quantity: 15, min: 3, cost: 89 },
        { name: 'TESTE | grão-de-bico', unit: 'caixa', quantity: 13, min: 3, cost: 84 },
        { name: 'TESTE | quinoa em grãos', unit: 'caixa', quantity: 10, min: 2, cost: 119 },
      ],
    },
    {
      category: 'bebidas',
      photo: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=1200&q=80',
      items: [
        { name: 'TESTE | água sem gás 500ml', unit: 'fardo', quantity: 55, min: 12, cost: 32 },
        { name: 'TESTE | refrigerante cola 2l', unit: 'fardo', quantity: 30, min: 8, cost: 74 },
        { name: 'TESTE | suco integral uva 1l', unit: 'caixa', quantity: 24, min: 6, cost: 88 },
        { name: 'TESTE | energético lata 269ml', unit: 'caixa', quantity: 18, min: 4, cost: 146 },
        { name: 'TESTE | água tônica lata', unit: 'caixa', quantity: 20, min: 5, cost: 102 },
      ],
    },
  ];

  const categoryBlueprint: Array<{ category: string; bases: string[]; photos: string[] }> = [
    {
      category: 'mobiliario',
      bases: ['mesa para bolo', 'aparador decorativo', 'mesa de convidados', 'cadeira cerimônia', 'stand by'],
      photos: [
        'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1493666438817-866a91353ca9?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1517705008128-361805f42e86?auto=format&fit=crop&w=1200&q=80',
      ],
    },
    {
      category: 'cozinha',
      bases: ['fogão industrial', 'frigideira chef', 'caixa térmica', 'tacho e escumadeira', 'bandeja para salgado'],
      photos: [
        'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1556912167-f556f1f39fdf?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1200&q=80',
      ],
    },
    {
      category: 'tecidos',
      bases: ['toalha mesa convidados', 'sobrepor mesa convidados', 'guardanapos', 'pano bandeja garçom', 'fundo de mesa'],
      photos: [
        'https://images.unsplash.com/photo-1512100356356-de1b84283e18?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1594968591532-8f31d779d6bc?auto=format&fit=crop&w=1200&q=80',
      ],
    },
    {
      category: 'espelhos',
      bases: ['espelho moldura dourada', 'espelho moldura prata', 'tampo espelho mesa convidado', 'tampo espelho mesa buffet', 'espelho decorativo'],
      photos: [
        'https://images.unsplash.com/photo-1616486029423-aaa4789e8c9a?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1617104680985-b0f8ef9b47b4?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1615874959474-d609969a20ed?auto=format&fit=crop&w=1200&q=80',
      ],
    },
    {
      category: 'pecas_mesa_frios_cozinha',
      bases: ['travessa frios', 'petisqueira premium', 'suporte gastronômico', 'bandeja inox serviço', 'conjunto mesa frios'],
      photos: [
        'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=1200&q=80',
      ],
    },
  ];

  const models = ['redonda de madeira', 'retangular provençal', 'espelhada premium'];

  let created = 0;
  let updated = 0;

  for (const foodCategory of foodBlueprint) {
    for (const foodItem of foodCategory.items) {
      const { data: existingFood, error: findFoodError } = await sb
        .from('inventory_items')
        .select('id')
        .eq('name', foodItem.name)
        .eq('type', 'food')
        .maybeSingle();
      if (findFoodError) throw findFoodError;

      let foodId = existingFood?.id as string | undefined;
      if (!foodId) {
        const { data: insertedFood, error: insertFoodError } = await sb
          .from('inventory_items')
          .insert({
            name: foodItem.name,
            type: 'food',
            category: foodCategory.category,
            unit: foodItem.unit,
            total_quantity: foodItem.quantity,
            minimum_stock: foodItem.min,
            cost_per_unit: foodItem.cost,
            storage_location: `câmara teste ${foodCategory.category}`,
            notes: `catálogo de teste • alimentação • categoria: ${foodCategory.category}`,
          } as any)
          .select('id')
          .single();
        if (insertFoodError) throw insertFoodError;
        foodId = insertedFood.id;
        created += 1;
      } else {
        const { error: updateFoodError } = await sb
          .from('inventory_items')
          .update({
            category: foodCategory.category,
            unit: foodItem.unit,
            total_quantity: foodItem.quantity,
            minimum_stock: foodItem.min,
            cost_per_unit: foodItem.cost,
            storage_location: `câmara teste ${foodCategory.category}`,
            notes: `catálogo de teste • alimentação • categoria: ${foodCategory.category}`,
          } as any)
          .eq('id', foodId);
        if (updateFoodError) throw updateFoodError;
        updated += 1;
      }

      const { data: existingFoodPhotos, error: findFoodPhotoError } = await sb
        .from('inventory_item_photos')
        .select('id, photo_url')
        .eq('inventory_item_id', foodId)
        .order('created_at', { ascending: true });
      if (findFoodPhotoError) throw findFoodPhotoError;

      if (!existingFoodPhotos?.length) {
        const { error: photoFoodError } = await sb
          .from('inventory_item_photos')
          .insert({ inventory_item_id: foodId, photo_url: foodCategory.photo } as any);
        if (photoFoodError) throw photoFoodError;
      } else {
        const firstPhoto = existingFoodPhotos[0];
        if (firstPhoto.photo_url !== foodCategory.photo) {
          const { error: updateFoodPhotoError } = await sb
            .from('inventory_item_photos')
            .update({ photo_url: foodCategory.photo } as any)
            .eq('id', firstPhoto.id);
          if (updateFoodPhotoError) throw updateFoodPhotoError;
        }
      }
    }
  }

  for (const blueprint of categoryBlueprint) {
    for (const base of blueprint.bases) {
      for (let i = 0; i < models.length; i++) {
        const model = models[i];
        const itemName = `TESTE | ${base} - ${model}`;
        const total = 8 + i * 4;
        const { data: existingItem, error: findError } = await sb
          .from('inventory_items')
          .select('id')
          .eq('name', itemName)
          .eq('type', 'furniture')
          .maybeSingle();
        if (findError) throw findError;

        let itemId = existingItem?.id as string | undefined;

        if (!itemId) {
          const { data: inserted, error: insertError } = await sb
            .from('inventory_items')
            .insert({
              name: itemName,
              type: 'furniture',
              category: blueprint.category,
              unit: 'unidade',
              total_quantity: total,
              minimum_stock: 2,
              replacement_value: 350 + i * 120,
              storage_location: `galpão ${blueprint.category}`,
              notes: `catálogo de teste • categoria: ${blueprint.category}`,
            } as any)
            .select('id')
            .single();
          if (insertError) throw insertError;
          itemId = inserted.id;
          created += 1;
        } else {
          const { error: updateError } = await sb
            .from('inventory_items')
            .update({
              category: blueprint.category,
              total_quantity: total,
              minimum_stock: 2,
              replacement_value: 350 + i * 120,
              storage_location: `galpão ${blueprint.category}`,
              notes: `catálogo de teste • categoria: ${blueprint.category}`,
            } as any)
            .eq('id', itemId);
          if (updateError) throw updateError;
          updated += 1;
        }

        const photoUrl = blueprint.photos[i % blueprint.photos.length];

        const { data: existingPhotos, error: photoFindError } = await sb
          .from('inventory_item_photos')
          .select('id, photo_url')
          .eq('inventory_item_id', itemId)
          .order('created_at', { ascending: true });
        if (photoFindError) throw photoFindError;

        if (!existingPhotos?.length) {
          const { error: photoError } = await sb.from('inventory_item_photos').insert({ inventory_item_id: itemId, photo_url: photoUrl } as any);
          if (photoError) throw photoError;
        } else {
          const firstPhoto = existingPhotos[0];
          if (firstPhoto.photo_url !== photoUrl) {
            const { error: updatePhotoError } = await sb.from('inventory_item_photos').update({ photo_url: photoUrl } as any).eq('id', firstPhoto.id);
            if (updatePhotoError) throw updatePhotoError;
          }
          const extraIds = existingPhotos.slice(1).map((photo: any) => photo.id);
          if (extraIds.length > 0) {
            await sb.from('inventory_item_photos').delete().in('id', extraIds);
          }
        }
      }
    }
  }

  return { items_created: created, items_updated: updated, categories: categoryBlueprint.length };
};
