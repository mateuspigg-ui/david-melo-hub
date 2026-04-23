-- 1. Criar o Bucket de Storage para anexos do Chat
INSERT INTO storage.buckets (id, name, public) 
VALUES ('lead-attachments', 'lead-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Políticas de Segurança (RLS) para o Bucket
-- Permitir que qualquer um (incluindo clientes anônimos) envie arquivos para este bucket
CREATE POLICY "Qualquer um pode enviar anexos" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'lead-attachments');

-- Permitir que qualquer um veja os anexos (sendo público)
CREATE POLICY "Qualquer um pode ver anexos" ON storage.objects
    FOR SELECT USING (bucket_id = 'lead-attachments');

-- Permitir que a equipe delete ou atualize
CREATE POLICY "Equipe pode gerenciar anexos" ON storage.objects
    FOR ALL USING (bucket_id = 'lead-attachments' AND auth.role() = 'authenticated');
