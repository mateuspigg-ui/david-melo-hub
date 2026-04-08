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
  onImported: () => void;
}

export const ImportTransactionsDialog = ({ open, onOpenChange, bankAccountId, onImported }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [columns, setColumns] = useState<{ date: string; amount: string; description: string }>({
    date: '',
    amount: '',
    description: ''
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);

      Papa.parse(selectedFile, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const data = results.data as any[];
          if (data.length > 0) {
            autoDetectColumns(data);
            setPreview(data.slice(0, 5));
          }
        }
      });
    }
  };

  const autoDetectColumns = (data: any[]) => {
    const firstRow = data[0];
    const headerKeys = Object.keys(firstRow);
    
    let detectedDate = '';
    let detectedAmount = '';
    let detectedDesc = '';

    // RegExp patterns
    const datePattern = /(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4})/;
    const amountPattern = /(-?\d+[,.]\d+)|(-?\d+)/;

    headerKeys.forEach(key => {
      const val = String(firstRow[key]);
      
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
        headerKeys.forEach(key => {
            if (key !== detectedDate && amountPattern.test(String(firstRow[key]))) detectedAmount = key;
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
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rawData = results.data as any[];
          const transactions = rawData.map(row => ({
            bank_account_id: bankAccountId,
            transaction_date: parseDate(row[columns.date]),
            amount: parseAmount(row[columns.amount]),
            description: row[columns.description] || 'S/D',
            status: 'pendente'
          })).filter(tx => tx.transaction_date && !isNaN(tx.amount));

          const { error } = await (supabase as any).from('bank_transactions').insert(transactions);
          
          if (error) throw error;

          toast({ title: 'Sucesso', description: `${transactions.length} transações importadas!` });
          onImported();
          onOpenChange(false);
          setFile(null);
          setPreview([]);
        } catch (error: any) {
          toast({ title: 'Erro na importação', description: error.message, variant: 'destructive' });
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const parseDate = (dateStr: string) => {
    if (!dateStr) return null;
    // Tenta converter DD/MM/AAAA para AAAA-MM-DD
    const parts = dateStr.split(/[-/.]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) return `${parts[0]}-${parts[1]}-${parts[2]}`; // ISO
      return `${parts[2]}-${parts[1]}-${parts[0]}`; // Brasileiro
    }
    return dateStr;
  };

  const parseAmount = (amountStr: string) => {
    if (!amountStr) return 0;
    const clean = amountStr.replace(/[^\d.,-]/g, '').replace(',', '.');
    return parseFloat(clean);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-dark border-border/30 max-w-2xl text-foreground font-body">
        <DialogHeader>
          <DialogTitle className="text-xl font-display text-gold flex items-center gap-2">
            <Upload className="w-5 h-5" /> Importar Extrato CSV
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {!file ? (
            <div className="border-2 border-dashed border-border/30 rounded-2xl p-12 text-center hover:border-gold/50 transition-all cursor-pointer relative">
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleFileChange} 
                className="absolute inset-0 opacity-0 cursor-pointer" 
              />
              <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-sm text-foreground/80 font-medium">Clique ou arraste o arquivo CSV aqui</p>
              <p className="text-xs text-muted-foreground mt-1">O sistema detectará as colunas automaticamente</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-dark-surface rounded-xl border border-border/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gold/10 rounded-full flex items-center justify-center text-gold">
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setFile(null); setPreview([]); }} className="text-xs text-destructive hover:text-white">Remover</Button>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase text-gold/60 font-semibold tracking-wider">Mapeamento Detectado</Label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-2 bg-white/5 rounded-lg border border-border/10">
                    <p className="text-[10px] text-muted-foreground uppercase">Coluna Data</p>
                    <p className="text-xs font-medium truncate">{columns.date}</p>
                  </div>
                  <div className="p-2 bg-white/5 rounded-lg border border-border/10">
                    <p className="text-[10px] text-muted-foreground uppercase">Coluna Valor</p>
                    <p className="text-xs font-medium truncate">{columns.amount}</p>
                  </div>
                  <div className="p-2 bg-white/5 rounded-lg border border-border/10">
                    <p className="text-[10px] text-muted-foreground uppercase">Coluna Descrição</p>
                    <p className="text-xs font-medium truncate">{columns.description}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase text-gold/60 font-semibold tracking-wider">Prévia dos Dados</Label>
                <div className="rounded-xl border border-border/20 overflow-hidden bg-dark-surface">
                  <table className="w-full text-[11px] text-left">
                    <thead className="bg-white/5 font-semibold text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Data</th>
                        <th className="px-3 py-2">Descrição</th>
                        <th className="px-3 py-2 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, idx) => (
                        <tr key={idx} className="border-t border-border/10">
                          <td className="px-3 py-2">{row[columns.date]}</td>
                          <td className="px-3 py-2 truncate max-w-[150px]">{row[columns.description]}</td>
                          <td className="px-3 py-2 text-right font-medium">{row[columns.amount]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border/40 bg-dark-surface hover:bg-dark-surface/80">Cancelar</Button>
          <Button 
            onClick={handleImport} 
            disabled={loading || !file} 
            className="bg-gold hover:bg-gold-light text-dark font-medium min-w-[120px]"
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Importar {preview.length > 0 ? 'tudo' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
