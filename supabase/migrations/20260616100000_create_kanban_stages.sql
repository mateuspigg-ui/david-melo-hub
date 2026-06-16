-- Create kanban_stages table for custom CRM columns
CREATE TABLE IF NOT EXISTS kanban_stages (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'hsl(var(--gold))',
  position INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE kanban_stages ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated users can read/write
CREATE POLICY "Authenticated users can read kanban_stages"
  ON kanban_stages FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert kanban_stages"
  ON kanban_stages FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update kanban_stages"
  ON kanban_stages FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete kanban_stages"
  ON kanban_stages FOR DELETE
  USING (auth.role() = 'authenticated');

-- Seed default stages
INSERT INTO kanban_stages (id, label, color, position, is_default) VALUES
  ('novo_contato', 'Novo Contato', 'hsl(var(--gold))', 0, true),
  ('orcamento_enviado', 'Orçamento Enviado', 'hsl(210 60% 50%)', 1, true),
  ('cliente_em_contato', 'Cliente em Contato', 'hsl(48 95% 52%)', 2, true),
  ('em_negociacao', 'Em Negociação', 'hsl(35 80% 55%)', 3, true),
  ('fechados', 'Fechados', 'hsl(142 60% 45%)', 4, true),
  ('perdidos', 'Perdidos', 'hsl(0 60% 50%)', 5, true)
ON CONFLICT (id) DO NOTHING;

-- Index for ordering
CREATE INDEX IF NOT EXISTS idx_kanban_stages_position ON kanban_stages (position);
