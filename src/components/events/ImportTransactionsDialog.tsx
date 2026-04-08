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
      <DialogContent className="bg-background border-border/40 max-w-2xl text-foreground font-body rounded-2xl p-0 overflow-hidden shadow-2xl">
        <div className="bg-gradient-gold p-6 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display text-white flex items-center gap-2">
              <Upload className="w-6 h-6" /> Importar Extrato CSV
            </DialogTitle>
            <p className="text-white/80 text-sm mt-1">Carregue seu extrato bancário para realizar o matching inteligente.</p>
          </DialogHeader>
        </div>

        <div className="p-8 space-y-6">
          {!file ? (
            <div className="border-3 border-dashed border-border/60 rounded-2xl p-16 text-center hover:border-gold/50 transition-all cursor-pointer relative bg-secondary/10 group">
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleFileChange} 
                className="absolute inset-0 opacity-0 cursor-pointer z-10" 
              />
              <div className="relative z-0 group-hover:scale-105 transition-transform duration-300">
                <FileText className="w-16 h-16 text-gold/30 mx-auto mb-4 group-hover:text-gold/50" />
                <p className="text-base text-foreground font-bold uppercase tracking-wide">Clique ou arraste o arquivo CSV</p>
                <p className="text-xs text-muted-foreground mt-2 font-medium">O David Melo Hub detectará as colunas automaticamente</p>
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

              <div className="space-y-3">
                <Label className="text-[10px] uppercase text-gold/80 font-bold tracking-[0.2em]">Inteligência de Mapeamento</Label>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 bg-secondary/20 rounded-xl border border-border/20">
                    <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Data</p>
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
            Processar Importação
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
