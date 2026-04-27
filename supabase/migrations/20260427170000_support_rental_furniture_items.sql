ALTER TABLE public.event_inventory_items
  ALTER COLUMN inventory_item_id DROP NOT NULL;

ALTER TABLE public.event_inventory_items
  ADD COLUMN IF NOT EXISTS is_rental BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rental_supplier TEXT,
  ADD COLUMN IF NOT EXISTS rental_item_name TEXT;

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
    IF NEW.inventory_item_id IS NULL THEN
      RETURN NEW;
    END IF;

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
    IF NEW.inventory_item_id IS NULL OR OLD.inventory_item_id IS NULL THEN
      RETURN NEW;
    END IF;

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
    IF OLD.inventory_item_id IS NULL THEN
      RETURN OLD;
    END IF;

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
