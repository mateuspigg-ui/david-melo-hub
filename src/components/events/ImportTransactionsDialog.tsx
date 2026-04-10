import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Upload, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import Papa from 'papaparse';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bankAccountId: string;
  mode?: 'bank' | 'accounting';
  onImported: (info: { mode: 'bank' | 'accounting'; fileName: string; kind: 'pdf' | 'csv'; count: number }) => void;
}

export const ImportTransactionsDialog = ({ open, onOpenChange, bankAccountId, mode = 'bank', onImported }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [preview, setPreview] = useState<any[]>([]);
  const [columns, setColumns] = useState<{ date: string; amount: string; description: string }>({
    date: '',
    amount: '',
    description: ''
  });

  const getFileExtension = (filename: string) => filename.split('.').pop()?.toLowerCase() || '';
  const isAccountingMode = mode === 'accounting';
  const allowsPdf = !isAccountingMode;
  const acceptedTypesText = allowsPdf ? 'PDF ou CSV' : 'CSV';
  const dialogTitle = isAccountingMode ? 'Importar Razão Contábil' : 'Importar Extrato Bancário';
  const mappedDateLabel = isAccountingMode ? 'Lançamento' : 'Data';
  const isMissingCompanyDocumentsTableError = (error: any) => {
    const message = String(error?.message || '');
    return /could not find the table ['"]public\.company_documents['"]/i.test(message);
  };

  const parseCsvFile = (selectedFile: File) =>
    new Promise<any[]>((resolve, reject) => {
      Papa.parse(selectedFile, {
        header: true,
        skipEmptyLines: 'greedy',
        complete: (results) => resolve(results.data as any[]),
        error: (error) => reject(error),
      });
    });

  const parseFileRows = async (selectedFile: File) => parseCsvFile(selectedFile);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;

    const selectedFile = e.target.files[0];
    const ext = getFileExtension(selectedFile.name);

    if (allowsPdf ? !['pdf', 'csv'].includes(ext) : ext !== 'csv') {
      toast({ title: 'Formato inválido', description: `Selecione um arquivo ${acceptedTypesText}.`, variant: 'destructive' });
      return;
    }

    setFile(selectedFile);
    setColumns({ date: '', amount: '', description: '' });

    if (ext === 'pdf' && allowsPdf) {
      setParsedRows([]);
      setPreview([]);
      return;
    }

    try {
      const data = await parseFileRows(selectedFile);
      setParsedRows(data);

      if (data.length > 0) {
        autoDetectColumns(data);
        setPreview(data.slice(0, 5));
      } else {
        setPreview([]);
      }
    } catch (error: any) {
      setFile(null);
      setParsedRows([]);
      setPreview([]);
      toast({ title: 'Erro ao ler arquivo', description: error.message || 'Não foi possível processar o arquivo.', variant: 'destructive' });
    }
  };

  const autoDetectColumns = (data: any[]) => {
    const firstRow = data[0] || {};
    const headerKeys = Object.keys(firstRow);
    const sampleRows = data.slice(0, 5);

    const normalizeKey = (value: string) =>
      value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_]/g, '');

    const hasHeaderHint = (key: string, hints: string[]) => {
      const normalized = normalizeKey(key);
      return hints.some((hint) => normalized.includes(hint));
    };
    
    let detectedDate = '';
    let detectedAmount = '';
    let detectedDesc = '';

    // RegExp patterns
    const datePattern = /(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4})/;
    const amountPattern = /(-?\d+[,.]\d+)|(-?\d+)/;

    detectedDate = headerKeys.find((key) => hasHeaderHint(key, ['data', 'date', 'dt', 'lancamento', 'transactiondate', 'entrydate'])) || '';
    detectedAmount = headerKeys.find((key) => hasHeaderHint(key, ['valor', 'amount', 'debito', 'credito', 'saldo'])) || '';
    detectedDesc = headerKeys.find((key) => hasHeaderHint(key, ['descricao', 'historico', 'memo', 'detalhe', 'description'])) || '';

    headerKeys.forEach(key => {
      const val = String(firstRow[key] ?? '');
      
      if (!detectedDate && datePattern.test(val)) {
        detectedDate = key;
      } else if (!detectedAmount && amountPattern.test(val) && (key.toLowerCase().includes('valor') || key.toLowerCase().includes('amount') || key.toLowerCase().includes('monto'))) {
        detectedAmount = key;
      } else if (!detectedDesc && val.length > 5) {
        detectedDesc = key;
      }
    });

    // Fallbacks if not detected by keywords
    if (!detectedAmount) {
      headerKeys.forEach((key) => {
        if (detectedAmount) return;
        const hasAmountLike = sampleRows.some((row) => amountPattern.test(String(row[key] ?? '')));
        if (key !== detectedDate && hasAmountLike) detectedAmount = key;
      });
    }

    setColumns({
      date: detectedDate || headerKeys[0],
      amount: detectedAmount || headerKeys[1],
      description: detectedDesc || headerKeys[2]
    });
  };

  const handleImport = async () => {
    if (!file || !bankAccountId) return;

    setLoading(true);
    try {
      if (getFileExtension(file.name) === 'pdf' && allowsPdf) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const fileExt = getFileExtension(file.name);
        const fileBaseName = file.name.replace(/\.[^/.]+$/, '').replace(/\s+/g, '-').toLowerCase();
        const filePath = `reconciliacao/${bankAccountId}/${Date.now()}-${fileBaseName}.${fileExt}`;

        const bucketCandidates = ['documents', 'documentos'];
        let uploadedBucket = '';
        let uploadError: any = null;

        for (const bucket of bucketCandidates) {
          const { error } = await supabase.storage
            .from(bucket)
            .upload(filePath, file, { upsert: true, contentType: file.type || 'application/pdf' });
          if (!error) {
            uploadedBucket = bucket;
            break;
          }
          uploadError = error;
        }

        if (!uploadedBucket) {
          throw new Error(uploadError?.message || 'Nao foi possivel enviar o PDF para o storage.');
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from(uploadedBucket).getPublicUrl(filePath);

        const { error: docError } = await supabase.from('company_documents').insert([
          {
            title: `Extrato bancario - ${file.name.replace(/\.[^/.]+$/, '')}`,
            category: 'financeiro',
            description: `Extrato PDF enviado na conciliacao bancaria (conta: ${bankAccountId}).`,
            file_url: publicUrl || `${uploadedBucket}/${filePath}`,
            created_by: user?.id || null,
          },
        ]);

        if (docError && !isMissingCompanyDocumentsTableError(docError)) throw docError;

        if (docError && isMissingCompanyDocumentsTableError(docError)) {
          toast({
            title: 'PDF enviado com sucesso',
            description: 'Arquivo salvo no storage. A tabela company_documents ainda nao existe para registrar o link.',
          });
        } else {
          toast({
            title: 'PDF enviado com sucesso',
            description: 'Arquivo registrado para conferência manual. Para importação automática, use CSV.',
          });
        }
        onImported({ mode, fileName: file.name, kind: 'pdf', count: 0 });
        onOpenChange(false);
        setFile(null);
        setParsedRows([]);
        setPreview([]);
        return;
      }

      const rawData = parsedRows.length > 0 ? parsedRows : await parseFileRows(file);
      const records = rawData.map((row) => {
        const base = {
          bank_account_id: bankAccountId,
          amount: parseAmount(row[columns.amount]),
          description: row[columns.description] || 'S/D',
          status: 'pendente',
        } as any;

        if (isAccountingMode) {
          base.entry_date = parseDate(row[columns.date]);
        } else {
          base.transaction_date = parseDate(row[columns.date]);
        }

        return base;
      }).filter((record: any) => {
        const dateField = isAccountingMode ? record.entry_date : record.transaction_date;
        return dateField && !isNaN(record.amount);
      });

      if (records.length === 0) {
        throw new Error('Nenhum registro válido foi encontrado no arquivo.');
      }

      const tableName = isAccountingMode ? 'accounting_entries' : 'bank_transactions';
      const { error } = await (supabase as any).from(tableName).insert(records);
      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: isAccountingMode
          ? `${records.length} lançamentos contábeis importados!`
          : `${records.length} transações bancárias importadas!`,
      });
      onImported({ mode, fileName: file.name, kind: 'csv', count: records.length });
      onOpenChange(false);
      setFile(null);
      setParsedRows([]);
      setPreview([]);
    } catch (error: any) {
      toast({ title: 'Erro na importação', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const parseDate = (dateVal: any) => {
    const dateStr = String(dateVal || '').trim();
    if (!dateStr) return null;
    // Tenta converter DD/MM/AAAA para AAAA-MM-DD
    const parts = dateStr.split(/[-/.]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) return `${parts[0]}-${parts[1]}-${parts[2]}`; // ISO
      return `${parts[2]}-${parts[1]}-${parts[0]}`; // Brasileiro
    }
    return dateStr;
  };

  const parseAmount = (amountVal: any) => {
    const amountStr = String(amountVal || '').trim();
    if (!amountStr) return 0;

    const clean = amountStr.replace(/[^\d.,-]/g, '');
    if (!clean) return 0;

    const hasComma = clean.includes(',');
    const hasDot = clean.includes('.');

    let normalized = clean;
    if (hasComma && hasDot) {
      normalized = clean.lastIndexOf(',') > clean.lastIndexOf('.')
        ? clean.replace(/\./g, '').replace(',', '.')
        : clean.replace(/,/g, '');
    } else if (hasComma) {
      normalized = clean.replace(/\./g, '').replace(',', '.');
    }

    return parseFloat(normalized);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border-border/40 max-w-2xl text-foreground font-body rounded-2xl p-0 overflow-hidden shadow-2xl">
        <div className="bg-gradient-gold p-6 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display text-white flex items-center gap-2">
              <Upload className="w-6 h-6" /> {dialogTitle}
            </DialogTitle>
            <p className="text-white/80 text-sm mt-1">Carregue um arquivo {acceptedTypesText} para importação dos dados da conciliação.</p>
          </DialogHeader>
        </div>

        <div className="p-8 space-y-6">
          {!file ? (
            <div className="border-3 border-dashed border-border/60 rounded-2xl p-16 text-center hover:border-gold/50 transition-all cursor-pointer relative bg-secondary/10 group">
              <input 
                type="file" 
                accept={allowsPdf ? '.pdf,.csv,application/pdf,text/csv' : '.csv,text/csv'}
                onChange={handleFileChange} 
                className="absolute inset-0 opacity-0 cursor-pointer z-10" 
              />
              <div className="relative z-0 group-hover:scale-105 transition-transform duration-300">
                <FileText className="w-16 h-16 text-gold/30 mx-auto mb-4 group-hover:text-gold/50" />
                <p className="text-base text-foreground font-bold uppercase tracking-wide">Clique ou arraste arquivo {acceptedTypesText}</p>
                <p className="text-xs text-muted-foreground mt-2 font-medium">
                  {isAccountingMode ? 'Importação automática da razão contábil via CSV.' : 'Para importação automática de lançamentos, prefira CSV.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl border border-border/40">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gold/10 rounded-xl flex items-center justify-center text-gold">
                    <CheckCircle2 size={24} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{file.name}</p>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{(file.size / 1024).toFixed(1)} KB • Pronto para importar</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setFile(null); setPreview([]); }} className="text-xs font-bold text-destructive hover:bg-destructive/10">Trocar Arquivo</Button>
              </div>

              {preview.length > 0 ? (
                <>
                  <div className="space-y-3">
                    <Label className="text-[10px] uppercase text-gold/80 font-bold tracking-[0.2em]">Inteligência de Mapeamento</Label>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="p-3 bg-secondary/20 rounded-xl border border-border/20">
                        <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider mb-1">{mappedDateLabel}</p>
                        <p className="text-xs font-bold text-foreground truncate">{columns.date}</p>
                      </div>
                      <div className="p-3 bg-secondary/20 rounded-xl border border-border/20">
                        <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Valor</p>
                        <p className="text-xs font-bold text-foreground truncate">{columns.amount}</p>
                      </div>
                      <div className="p-3 bg-secondary/20 rounded-xl border border-border/20">
                        <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Descrição</p>
                        <p className="text-xs font-bold text-foreground truncate">{columns.description}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-[10px] uppercase text-gold/80 font-bold tracking-[0.2em]">Prévia dos Registros</Label>
                    <div className="rounded-xl border border-border/40 overflow-hidden bg-white shadow-sm">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-secondary/50 font-bold text-muted-foreground border-b border-border/40">
                          <tr>
                            <th className="px-4 py-3 uppercase tracking-wider">Data</th>
                            <th className="px-4 py-3 uppercase tracking-wider">Descrição</th>
                            <th className="px-4 py-3 text-right uppercase tracking-wider">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                          {preview.map((row, idx) => (
                            <tr key={idx} className="hover:bg-secondary/10 transition-colors">
                              <td className="px-4 py-3 text-foreground font-medium">{row[columns.date]}</td>
                              <td className="px-4 py-3 text-foreground truncate max-w-[200px]">{row[columns.description]}</td>
                              <td className="px-4 py-3 text-right font-bold text-foreground">{row[columns.amount]}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : getFileExtension(file.name) === 'pdf' ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-bold">Arquivo PDF selecionado</p>
                    <p className="mt-1">O processamento automático de lançamentos está disponível para CSV.</p>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-bold">Nenhum registro legível encontrado</p>
                    <p className="mt-1">Verifique o cabeçalho e o delimitador do CSV para seguir com a importação.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 bg-secondary/10 border-t border-border/20 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground font-bold uppercase text-[11px] tracking-widest">Cancelar</Button>
          <Button 
            onClick={handleImport} 
            disabled={loading || !file} 
            className="bg-gold hover:bg-gold-light text-white font-bold min-w-[160px] h-11 rounded-lg shadow-sm uppercase text-[11px] tracking-widest"
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Confirmar Importação
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
