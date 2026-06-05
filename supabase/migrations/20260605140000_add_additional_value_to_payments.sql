-- Adiciona colunas de valor adicional e descrição do adicional na tabela de pagamentos
-- O adicional representa um valor extra que o cliente pode incluir após o contrato
-- Não altera o valor das parcelas, apenas reflete no valor final do contrato

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS additional_value numeric DEFAULT 0;

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS additional_description text DEFAULT '';
