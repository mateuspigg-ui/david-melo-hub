CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('food', 'furniture')),
  category TEXT NOT NULL,
  description TEXT,
  unit TEXT,
  total_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (total_quantity >= 0),
  available_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
  reserved_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  damaged_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
  maintenance_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (maintenance_quantity >= 0),
  minimum_stock NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
  supplier TEXT,
  purchase_date DATE,
  expiration_date DATE,
  cost_per_unit NUMERIC(12, 2),
  replacement_value NUMERIC(12, 2),
  color TEXT,
  material TEXT,
  dimensions TEXT,
  storage_location TEXT,
  sku TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_item_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.event_inventory_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  reservation_status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.event_inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.event_inventory_reservations(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
  unit TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(reservation_id, inventory_item_id)
);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL,
  previous_quantity NUMERIC(12, 3),
  new_quantity NUMERIC(12, 3),
  quantity_changed NUMERIC(12, 3),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_type ON public.inventory_items(type);
CREATE INDEX IF NOT EXISTS idx_inventory_items_status ON public.inventory_items(status);
CREATE INDEX IF NOT EXISTS idx_inventory_items_expiration_date ON public.inventory_items(expiration_date);
CREATE INDEX IF NOT EXISTS idx_event_inventory_items_reservation ON public.event_inventory_items(reservation_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON public.stock_movements(created_at DESC);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_item_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'inventory_items' AND policyname = 'Authenticated can manage inventory items'
  ) THEN
    CREATE POLICY "Authenticated can manage inventory items"
      ON public.inventory_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'inventory_item_photos' AND policyname = 'Authenticated can manage inventory photos'
  ) THEN
    CREATE POLICY "Authenticated can manage inventory photos"
      ON public.inventory_item_photos FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'event_inventory_reservations' AND policyname = 'Authenticated can manage event reservations'
  ) THEN
    CREATE POLICY "Authenticated can manage event reservations"
      ON public.event_inventory_reservations FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'event_inventory_items' AND policyname = 'Authenticated can manage event reservation items'
  ) THEN
    CREATE POLICY "Authenticated can manage event reservation items"
      ON public.event_inventory_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stock_movements' AND policyname = 'Authenticated can view stock movements'
  ) THEN
    CREATE POLICY "Authenticated can view stock movements"
      ON public.stock_movements FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stock_movements' AND policyname = 'Admins can manage stock movements'
  ) THEN
    CREATE POLICY "Admins can manage stock movements"
      ON public.stock_movements FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END
$$;

INSERT INTO storage.buckets (id, name, public)
SELECT 'inventory-photos', 'inventory-photos', true
WHERE NOT EXISTS (
  SELECT 1 FROM storage.buckets WHERE id = 'inventory-photos'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated can upload inventory photos'
  ) THEN
    CREATE POLICY "Authenticated can upload inventory photos"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'inventory-photos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated can update inventory photos'
  ) THEN
    CREATE POLICY "Authenticated can update inventory photos"
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'inventory-photos')
      WITH CHECK (bucket_id = 'inventory-photos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated can view inventory photos'
  ) THEN
    CREATE POLICY "Authenticated can view inventory photos"
      ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'inventory-photos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated can delete inventory photos'
  ) THEN
    CREATE POLICY "Authenticated can delete inventory photos"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'inventory-photos');
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.calculate_inventory_available(
  p_total NUMERIC,
  p_reserved NUMERIC,
  p_damaged NUMERIC,
  p_maintenance NUMERIC
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(COALESCE(p_total, 0) - COALESCE(p_reserved, 0) - COALESCE(p_damaged, 0) - COALESCE(p_maintenance, 0), 0)
$$;

CREATE OR REPLACE FUNCTION public.compute_inventory_status(
  p_type TEXT,
  p_available NUMERIC,
  p_minimum NUMERIC,
  p_expiration_date DATE,
  p_damaged NUMERIC,
  p_maintenance NUMERIC
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_available NUMERIC := COALESCE(p_available, 0);
  v_minimum NUMERIC := COALESCE(p_minimum, 0);
  v_damaged NUMERIC := COALESCE(p_damaged, 0);
  v_maintenance NUMERIC := COALESCE(p_maintenance, 0);
BEGIN
  IF v_available <= 0 THEN
    RETURN 'out_of_stock';
  END IF;

  IF p_type = 'food' AND p_expiration_date IS NOT NULL AND p_expiration_date < CURRENT_DATE THEN
    RETURN 'expired';
  END IF;

  IF p_type = 'furniture' AND v_maintenance > 0 THEN
    RETURN 'maintenance';
  END IF;

  IF p_type = 'furniture' AND v_damaged > 0 THEN
    RETURN 'damaged';
  END IF;

  IF v_available <= v_minimum THEN
    RETURN 'low_stock';
  END IF;

  IF COALESCE(v_available, 0) < COALESCE(v_available, 0) + COALESCE(v_damaged, 0) + COALESCE(v_maintenance, 0) THEN
    RETURN 'reserved';
  END IF;

  RETURN 'available';
END
$$;

CREATE OR REPLACE FUNCTION public.sync_inventory_item_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.available_quantity := public.calculate_inventory_available(
    NEW.total_quantity,
    NEW.reserved_quantity,
    NEW.damaged_quantity,
    NEW.maintenance_quantity
  );

  NEW.status := public.compute_inventory_status(
    NEW.type,
    NEW.available_quantity,
    NEW.minimum_stock,
    NEW.expiration_date,
    NEW.damaged_quantity,
    NEW.maintenance_quantity
  );

  NEW.updated_at := now();

  IF NEW.reserved_quantity > NEW.total_quantity THEN
    RAISE EXCEPTION 'Estoque reservado não pode ser maior que o total';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_sync_inventory_item_fields ON public.inventory_items;
CREATE TRIGGER trg_sync_inventory_item_fields
BEFORE INSERT OR UPDATE ON public.inventory_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_inventory_item_fields();

CREATE OR REPLACE FUNCTION public.log_inventory_initial_registration()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.stock_movements (
    inventory_item_id,
    user_id,
    movement_type,
    previous_quantity,
    new_quantity,
    quantity_changed,
    notes
  ) VALUES (
    NEW.id,
    auth.uid(),
    'initial_registration',
    0,
    NEW.total_quantity,
    NEW.total_quantity,
    'Cadastro inicial do item no estoque'
  );

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_inventory_initial_registration ON public.inventory_items;
CREATE TRIGGER trg_inventory_initial_registration
AFTER INSERT ON public.inventory_items
FOR EACH ROW
EXECUTE FUNCTION public.log_inventory_initial_registration();

CREATE OR REPLACE FUNCTION public.log_inventory_manual_adjustment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_changed BOOLEAN;
BEGIN
  v_changed :=
    COALESCE(OLD.total_quantity, 0) <> COALESCE(NEW.total_quantity, 0)
    OR COALESCE(OLD.damaged_quantity, 0) <> COALESCE(NEW.damaged_quantity, 0)
    OR COALESCE(OLD.maintenance_quantity, 0) <> COALESCE(NEW.maintenance_quantity, 0)
    OR COALESCE(OLD.minimum_stock, 0) <> COALESCE(NEW.minimum_stock, 0);

  IF v_changed THEN
    INSERT INTO public.stock_movements (
      inventory_item_id,
      user_id,
      movement_type,
      previous_quantity,
      new_quantity,
      quantity_changed,
      notes
    ) VALUES (
      NEW.id,
      auth.uid(),
      'manual_adjustment',
      OLD.total_quantity,
      NEW.total_quantity,
      NEW.total_quantity - OLD.total_quantity,
      'Ajuste manual de estoque'
    );
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_inventory_manual_adjustment ON public.inventory_items;
CREATE TRIGGER trg_inventory_manual_adjustment
AFTER UPDATE ON public.inventory_items
FOR EACH ROW
EXECUTE FUNCTION public.log_inventory_manual_adjustment();

CREATE OR REPLACE FUNCTION public.adjust_inventory_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_item public.inventory_items%ROWTYPE;
  v_delta NUMERIC;
  v_event_id UUID;
  v_client_id UUID;
  v_previous_reserved NUMERIC;
  v_new_reserved NUMERIC;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO v_item FROM public.inventory_items WHERE id = NEW.inventory_item_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item de estoque não encontrado';
    END IF;

    IF v_item.status IN ('maintenance', 'damaged', 'expired') THEN
      RAISE EXCEPTION 'Item indisponível para reserva devido ao status atual';
    END IF;

    IF NEW.quantity > v_item.available_quantity THEN
      RAISE EXCEPTION 'Quantidade solicitada maior do que estoque disponível';
    END IF;

    UPDATE public.inventory_items
    SET reserved_quantity = reserved_quantity + NEW.quantity
    WHERE id = NEW.inventory_item_id;

    SELECT event_id, client_id INTO v_event_id, v_client_id
    FROM public.event_inventory_reservations
    WHERE id = NEW.reservation_id;

    INSERT INTO public.stock_movements (
      inventory_item_id,
      event_id,
      client_id,
      user_id,
      movement_type,
      previous_quantity,
      new_quantity,
      quantity_changed,
      notes
    ) VALUES (
      NEW.inventory_item_id,
      v_event_id,
      v_client_id,
      auth.uid(),
      'event_reservation',
      v_item.available_quantity,
      v_item.available_quantity - NEW.quantity,
      -NEW.quantity,
      COALESCE(NEW.notes, 'Reserva para evento')
    );

    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_delta := NEW.quantity - OLD.quantity;

    SELECT * INTO v_item FROM public.inventory_items WHERE id = NEW.inventory_item_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item de estoque não encontrado';
    END IF;

    IF v_item.status IN ('maintenance', 'damaged', 'expired') THEN
      RAISE EXCEPTION 'Item indisponível para reserva devido ao status atual';
    END IF;

    IF v_delta > 0 AND v_delta > v_item.available_quantity THEN
      RAISE EXCEPTION 'Quantidade adicional maior que estoque disponível';
    END IF;

    v_previous_reserved := v_item.reserved_quantity;
    v_new_reserved := v_previous_reserved + v_delta;

    UPDATE public.inventory_items
    SET reserved_quantity = v_new_reserved
    WHERE id = NEW.inventory_item_id;

    SELECT event_id, client_id INTO v_event_id, v_client_id
    FROM public.event_inventory_reservations
    WHERE id = NEW.reservation_id;

    INSERT INTO public.stock_movements (
      inventory_item_id,
      event_id,
      client_id,
      user_id,
      movement_type,
      previous_quantity,
      new_quantity,
      quantity_changed,
      notes
    ) VALUES (
      NEW.inventory_item_id,
      v_event_id,
      v_client_id,
      auth.uid(),
      'manual_adjustment',
      v_item.available_quantity,
      v_item.available_quantity - v_delta,
      -v_delta,
      'Ajuste da quantidade reservada do evento'
    );

    RETURN NEW;
  ELSE
    SELECT * INTO v_item FROM public.inventory_items WHERE id = OLD.inventory_item_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN OLD;
    END IF;

    UPDATE public.inventory_items
    SET reserved_quantity = GREATEST(reserved_quantity - OLD.quantity, 0)
    WHERE id = OLD.inventory_item_id;

    SELECT event_id, client_id INTO v_event_id, v_client_id
    FROM public.event_inventory_reservations
    WHERE id = OLD.reservation_id;

    INSERT INTO public.stock_movements (
      inventory_item_id,
      event_id,
      client_id,
      user_id,
      movement_type,
      previous_quantity,
      new_quantity,
      quantity_changed,
      notes
    ) VALUES (
      OLD.inventory_item_id,
      v_event_id,
      v_client_id,
      auth.uid(),
      'item_return',
      v_item.available_quantity,
      v_item.available_quantity + OLD.quantity,
      OLD.quantity,
      'Item removido da reserva do evento'
    );

    RETURN OLD;
  END IF;
END
$$;

DROP TRIGGER IF EXISTS trg_adjust_inventory_reservation_insert ON public.event_inventory_items;
CREATE TRIGGER trg_adjust_inventory_reservation_insert
AFTER INSERT ON public.event_inventory_items
FOR EACH ROW
EXECUTE FUNCTION public.adjust_inventory_reservation();

DROP TRIGGER IF EXISTS trg_adjust_inventory_reservation_update ON public.event_inventory_items;
CREATE TRIGGER trg_adjust_inventory_reservation_update
AFTER UPDATE ON public.event_inventory_items
FOR EACH ROW
EXECUTE FUNCTION public.adjust_inventory_reservation();

DROP TRIGGER IF EXISTS trg_adjust_inventory_reservation_delete ON public.event_inventory_items;
CREATE TRIGGER trg_adjust_inventory_reservation_delete
AFTER DELETE ON public.event_inventory_items
FOR EACH ROW
EXECUTE FUNCTION public.adjust_inventory_reservation();

CREATE OR REPLACE FUNCTION public.handle_reservation_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_row RECORD;
BEGIN
  IF NEW.reservation_status IN ('canceled', 'returned') AND OLD.reservation_status <> NEW.reservation_status THEN
    FOR v_row IN
      SELECT * FROM public.event_inventory_items WHERE reservation_id = NEW.id
    LOOP
      DELETE FROM public.event_inventory_items WHERE id = v_row.id;
    END LOOP;

    INSERT INTO public.stock_movements (
      event_id,
      client_id,
      user_id,
      movement_type,
      notes
    ) VALUES (
      NEW.event_id,
      NEW.client_id,
      auth.uid(),
      'event_cancellation',
      'Reserva cancelada/encerrada e itens devolvidos ao estoque'
    );
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_handle_reservation_cancellation ON public.event_inventory_reservations;
CREATE TRIGGER trg_handle_reservation_cancellation
BEFORE UPDATE ON public.event_inventory_reservations
FOR EACH ROW
EXECUTE FUNCTION public.handle_reservation_cancellation();

DROP TRIGGER IF EXISTS trg_inventory_reservations_updated_at ON public.event_inventory_reservations;
CREATE TRIGGER trg_inventory_reservations_updated_at
BEFORE UPDATE ON public.event_inventory_reservations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_event_inventory_items_updated_at ON public.event_inventory_items;
CREATE TRIGGER trg_event_inventory_items_updated_at
BEFORE UPDATE ON public.event_inventory_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.module_permissions (user_id, module)
SELECT p.id, 'almoxarifado'
FROM public.profiles p
WHERE EXISTS (
  SELECT 1
  FROM public.user_roles ur
  WHERE ur.user_id = p.id AND ur.role = 'admin'
)
ON CONFLICT (user_id, module) DO NOTHING;
