-- Atualiza o CHECK constraint para permitir 'floral' como tipo
ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inventory_items_type_check;
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_type_check CHECK (type IN ('food', 'furniture', 'floral'));

-- Move todos os itens com category 'floral' para type 'floral'
UPDATE public.inventory_items
SET type = 'floral', category = 'floral'
WHERE category = 'floral';

-- Atualiza a função de status para incluir o tipo 'floral'
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

  IF p_type IN ('furniture', 'floral') AND v_maintenance > 0 THEN
    RETURN 'maintenance';
  END IF;

  IF p_type IN ('furniture', 'floral') AND v_damaged > 0 THEN
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
