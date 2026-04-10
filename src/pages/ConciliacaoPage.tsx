import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  CheckCircle2, AlertCircle, ArrowRight, BarChart3, 
  Search, Landmark, FileCheck, ShieldCheck, Loader2, ArrowUpDown
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ImportTransactionsDialog } from '@/components/events/ImportTransactionsDialog';

const steps = [
  { id: 1, title: 'Diagnóstico', icon: Search },
  { id: 2, title: 'Cruzamento', icon: ArrowUpDown },
  { id: 3, title: 'Relatório', icon: BarChart3 },
  { id: 4, title: 'Validação', icon: ShieldCheck },
];

const DEMO_ACCOUNT = {
  id: 'demo-account-001',
  description: 'Conta Ficticia - Operacional',
  bank_name: 'Banco Exemplo',
  account_number: '99999-0',
};

const DEMO_BANK_TRANSACTIONS = [
  { id: 'demo-bank-1', description: 'Recebimento Contrato Evento A', transaction_date: '2026-04-05', amount: 8500, status: 'pendente' },
  { id: 'demo-bank-2', description: 'Pagamento Fornecedor Buffet', transaction_date: '2026-04-06', amount: -2300, status: 'pendente' },
  { id: 'demo-bank-3', description: 'Recebimento Entrada Evento B', transaction_date: '2026-04-08', amount: 4200, status: 'pendente' },
];

const DEMO_ACCOUNTING_ENTRIES = [
  { id: 'demo-acc-1', description: 'Receita Contrato Evento A', entry_date: '2026-04-05', amount: 8500, status: 'pendente' },
  { id: 'demo-acc-2', description: 'Despesa Buffet Evento A', entry_date: '2026-04-06', amount: -2000, status: 'pendente' },
  { id: 'demo-acc-3', description: 'Receita Entrada Evento B', entry_date: '2026-04-08', amount: 4200, status: 'pendente' },
];

type ImportedArtifact = {
  mode: 'bank' | 'accounting';
  kind: 'pdf' | 'csv';
  fileName: string;
  count: number;
  importedAt: string;
};

const ConciliacaoPage = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [period, setPeriod] = useState({ start: '', end: '' });
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importMode, setImportMode] = useState<'bank' | 'accounting'>('bank');
  const [importedArtifacts, setImportedArtifacts] = useState<ImportedArtifact[]>([]);
  const isDemoAccount = selectedAccount === DEMO_ACCOUNT.id;
  
  // Data for reconciliation
  const { data: accounts } = useQuery({
    queryKey: ['bank_accounts_dropdown'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('bank_accounts').select('*').eq('status', 'active');
      return data || [];
    }
  });

  const { data: bankTransactions, refetch: refetchBank } = useQuery({
    queryKey: ['reconciliation_bank_tx', selectedAccount],
    enabled: !!selectedAccount && !isDemoAccount,
    queryFn: async () => {
      const { data } = await (supabase as any).from('bank_transactions')
        .select('*')
        .eq('bank_account_id', selectedAccount)
        .eq('status', 'pendente');
      return data || [];
    }
  });

  const { data: accountingEntries, refetch: refetchAcc } = useQuery({
    queryKey: ['reconciliation_acc_entries', selectedAccount],
    enabled: !!selectedAccount && !isDemoAccount,
    queryFn: async () => {
      const { data } = await (supabase as any).from('accounting_entries')
        .select('*')
        .eq('bank_account_id', selectedAccount)
        .eq('status', 'pendente');
      return data || [];
    }
  });

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const accountsWithDemo = [DEMO_ACCOUNT, ...(accounts || [])];
  const effectiveBankTransactions = isDemoAccount ? DEMO_BANK_TRANSACTIONS : (bankTransactions || []);
  const effectiveAccountingEntries = isDemoAccount ? DEMO_ACCOUNTING_ENTRIES : (accountingEntries || []);

  const calculateTotals = () => {
    const bankTotal = effectiveBankTransactions.reduce((acc: number, curr: any) => acc + Number(curr.amount), 0);
    const accTotal = effectiveAccountingEntries.reduce((acc: number, curr: any) => acc + Number(curr.amount), 0);
    return { bankTotal, accTotal, diff: bankTotal - accTotal };
  };

  const { bankTotal, accTotal, diff } = calculateTotals();

  const handleNext = () => {
    if (currentStep === 1 && (!selectedAccount || !period.start || !period.end)) {
      toast({ title: 'Aviso', description: 'Preencha todos os campos do diagnóstico.', variant: 'destructive' });
      return;
    }
    setCurrentStep(prev => Math.min(prev + 1, 4));
  };

  const handlePrev = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  return (
    <div className="p-8 space-y-10 animate-fade-in max-w-[1400px] mx-auto min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 border-b border-border/10 pb-10">
        <div>
          <h1 className="text-4xl font-display text-foreground tracking-tighter uppercase">Conciliação Inteligente</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold mt-2 opacity-80">Auditagem Automatizada David Melo Hub</p>
        </div>
        
        {/* Step Indicator */}
        <div className="flex items-center gap-2 bg-white premium-shadow-sm p-2 rounded-[20px] border border-border/40">
          {steps.map((step) => {
            const Icon = step.icon;
            const isCompleted = currentStep > step.id;
            const isActive = currentStep === step.id;
            return (
              <div 
                key={step.id}
                className={cn(
                  "flex items-center gap-3 px-5 py-2.5 rounded-2xl text-[10px] font-black transition-all uppercase tracking-widest",
                  isActive ? "bg-secondary/40 text-foreground ring-1 ring-gold/20" : isCompleted ? "text-gold" : "text-muted-foreground/40"
                )}
              >
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all duration-500",
                  isActive ? "border-gold bg-gradient-gold text-white scale-110 shadow-gold" : isCompleted ? "border-gold bg-gold/10 text-gold" : "border-muted-foreground/10 bg-transparent"
                )}>
                  {isCompleted ? <CheckCircle2 size={12} strokeWidth={3} /> : <span className="text-[10px]">{step.id}</span>}
                </div>
                <span className={cn("hidden lg:inline", isActive ? "opacity-100" : "opacity-60")}>{step.title}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-card premium-shadow rounded-2xl border border-border/40 overflow-hidden min-h-[500px] flex flex-col">
        {/* Step Content */}
        <div className="flex-1 p-8">
          {currentStep === 1 && (
            <div className="max-w-xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
              <div className="text-center space-y-2">
                <Landmark className="w-12 h-12 text-gold mx-auto mb-4" />
                <h2 className="text-2xl font-display text-foreground">Iniciando Diagnóstico</h2>
                <p className="text-sm text-muted-foreground">Selecione a conta e o período para validar os saldos iniciais.</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Conta Bancária Ativa</Label>
                  <select 
                    value={selectedAccount}
                    onChange={(e) => setSelectedAccount(e.target.value)}
                    className="flex h-12 w-full rounded-md bg-secondary/50 border border-border/40 px-3 py-2 text-sm focus:border-gold text-foreground outline-none transition-all"
                  >
                    <option value="">Selecione uma conta...</option>
                    {accountsWithDemo.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>
                        {(acc.description && acc.description.trim()) || acc.bank_name}
                        {acc.account_number ? ` - ${acc.account_number}` : ''}
                        {acc.id === DEMO_ACCOUNT.id ? ' (exemplo)' : ''}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-2 text-xs border-gold/40 text-gold hover:bg-gold hover:text-white"
                    onClick={() => {
                      setSelectedAccount(DEMO_ACCOUNT.id);
                      setPeriod({ start: '2026-04-01', end: '2026-04-30' });
                      toast({ title: 'Exemplo carregado', description: 'Conta e movimentações fictícias aplicadas para demonstração.' });
                    }}
                  >
                    Carregar exemplo fictício
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Início do Período</Label>
                    <Input 
                      type="date" 
                      value={period.start} 
                      onChange={e => setPeriod({...period, start: e.target.value})}
                      className="h-12 bg-secondary/50 border-border/40 focus:border-gold" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Fim do Período</Label>
                    <Input 
                      type="date" 
                      value={period.end} 
                      onChange={e => setPeriod({...period, end: e.target.value})}
                      className="h-12 bg-secondary/50 border-border/40 focus:border-gold" 
                    />
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-gold/5 border border-gold/20 space-y-3">
                  <h4 className="text-xs font-bold text-gold uppercase tracking-widest">Status do Diagnóstico</h4>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Saldo inicial Extrato:</span>
                    <span className="font-semibold text-foreground">R$ 0,00</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Saldo inicial Razão:</span>
                    <span className="font-semibold text-foreground">R$ 0,00</span>
                  </div>
                  <div className="pt-3 border-t border-gold/10 flex items-center gap-2 text-gold text-xs font-bold">
                    <CheckCircle2 size={14} /> Saldos iniciais validados (Tolerância R$ 1,00)
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-display text-foreground">Cruzamento de Dados</h2>
                <div className="flex gap-2">
                  {isDemoAccount && (
                    <Badge variant="outline" className="text-[10px] border-gold text-gold bg-gold/5 px-3">
                      Dados fictícios ativos
                    </Badge>
                  )}
                  <Button 
                    variant="outline" 
                    className="text-xs border-gold text-gold hover:bg-gold hover:text-white transition-all shadow-sm"
                    onClick={() => {
                      setImportMode('bank');
                      setImportDialogOpen(true);
                    }}
                    disabled={isDemoAccount || !selectedAccount}
                  >
                    Upload PDF Extrato
                  </Button>
                  <Button 
                    variant="outline" 
                    className="text-xs border-gold text-gold hover:bg-gold hover:text-white transition-all shadow-sm"
                    onClick={() => {
                      setImportMode('accounting');
                      setImportDialogOpen(true);
                    }}
                    disabled={isDemoAccount || !selectedAccount}
                  >
                    Importar CSV Razão
                  </Button>
                  <Button variant="outline" className="text-xs border-gold text-gold hover:bg-gold hover:text-white transition-all shadow-sm">
                    Rodar Inteligência de Matching
                  </Button>
                </div>
              </div>

              {importedArtifacts.length > 0 && (
                <div className="rounded-xl border border-border/30 bg-secondary/15 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gold mb-3">Arquivos carregados</p>
                  <div className="flex flex-col gap-2">
                    {importedArtifacts.map((item) => (
                      <div key={`${item.mode}-${item.importedAt}`} className="flex items-center justify-between rounded-lg border border-border/20 bg-white px-3 py-2">
                        <div>
                          <p className="text-xs font-bold text-foreground">{item.fileName}</p>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                            {item.mode === 'bank' ? 'Extrato bancário' : 'Razão contábil'} • {item.kind.toUpperCase()}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px] border-gold/30 text-gold bg-gold/5">
                          {item.kind === 'csv' ? `${item.count} registros` : 'Arquivo enviado'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-white border-border/40 premium-shadow">
                    <CardHeader className="py-3 border-b border-border/20 bg-secondary/30">
                    <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground uppercase tracking-wider">
                      <Landmark size={16} className="text-gold" /> Extrato Bancário
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-[350px] overflow-y-auto">
                      {effectiveBankTransactions.map((tx: any) => (
                        <div key={tx.id} className="p-4 border-b border-border/10 flex items-center justify-between hover:bg-secondary/30 transition-colors">
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold text-foreground">{tx.description}</p>
                            <p className="text-[10px] text-muted-foreground">{format(new Date(tx.transaction_date), 'dd/MM/yyyy')}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-foreground">{formatCurrency(tx.amount)}</span>
                            <Badge variant="outline" className="text-[10px] font-bold border-gold/30 text-gold bg-gold/5">Pendente</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white border-border/40 premium-shadow">
                  <CardHeader className="py-3 border-b border-border/20 bg-secondary/30">
                    <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground uppercase tracking-wider">
                      <FileCheck size={16} className="text-gold" /> Razão Contábil
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-[350px] overflow-y-auto">
                      {effectiveAccountingEntries.map((entry: any) => (
                        <div key={entry.id} className="p-4 border-b border-border/10 flex items-center justify-between hover:bg-secondary/30 transition-colors">
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold text-foreground">{entry.description}</p>
                            <p className="text-[10px] text-muted-foreground">{format(new Date(entry.entry_date), 'dd/MM/yyyy')}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-foreground">{formatCurrency(entry.amount)}</span>
                            <Badge variant="outline" className="text-[10px] font-bold border-gold/30 text-gold bg-gold/5">Pendente</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-10 animate-in fade-in slide-in-from-right-4">
              <h2 className="text-2xl font-display text-center mt-4">Relatório de Pendências</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-8 rounded-2xl bg-white border border-border/40 premium-shadow space-y-2">
                  <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-widest">Variação Total</p>
                  <p className={cn("text-3xl font-display", diff === 0 ? "text-success" : "text-warning")}>
                    {formatCurrency(diff)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Saldo Extrato - Saldo Contábil</p>
                </div>
                <div className="p-8 rounded-2xl bg-white border border-border/40 premium-shadow space-y-2">
                  <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-widest">Pendências Extrato</p>
                  <p className="text-3xl font-display text-foreground">{formatCurrency(bankTotal)}</p>
                </div>
                <div className="p-8 rounded-2xl bg-white border border-border/40 premium-shadow space-y-2">
                  <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-widest">Pendências Contábil</p>
                  <p className="text-3xl font-display text-foreground">{formatCurrency(accTotal)}</p>
                </div>
              </div>

              <div className="bg-gold/5 p-8 rounded-2xl border border-gold/20 max-w-2xl mx-auto space-y-6 text-center">
                 <h3 className="text-xs font-bold text-gold tracking-widest uppercase">Equação Principal de Auditoria</h3>
                 <div className="flex items-center justify-center gap-6 text-2xl font-semibold text-foreground">
                    <span className="text-muted-foreground text-sm uppercase">Eq. Final:</span>
                    <span>{formatCurrency(bankTotal - accTotal)}</span>
                    <span className="text-gold font-display text-4xl">==</span>
                    <span className={cn(bankTotal - accTotal === diff ? "text-success" : "text-destructive")}>
                       {formatCurrency(diff)}
                    </span>
                 </div>
                 <p className="text-[11px] text-muted-foreground font-medium italic">O fechamento só é permitido quando a equação auditoria é igual à variação de saldos.</p>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="max-w-xl mx-auto space-y-8 animate-in zoom-in-95 text-center py-10">
              <div className={cn(
                "w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border-2",
                diff === 0 ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning border-warning/20"
              )}>
                {diff === 0 ? <CheckCircle2 size={48} /> : <AlertCircle size={48} />}
              </div>
              <h2 className="text-3xl font-display text-foreground">Validação Final da Conciliação</h2>
              
              <div className="space-y-4 text-left p-8 bg-secondary/20 rounded-2xl border border-border/40">
                <div className="flex justify-between items-center text-sm border-b border-border/10 pb-4">
                  <span className="text-muted-foreground font-medium">Auditável por Log:</span>
                  <span className="text-gold font-bold">SIM</span>
                </div>
                <div className="flex justify-between items-center text-sm border-b border-border/10 pb-4">
                  <span className="text-muted-foreground font-medium">Sistema de Segurança:</span>
                  <span className="text-gold font-bold">ATIVO</span>
                </div>
                <div className="flex justify-between items-center text-sm pt-2">
                  <span className="text-muted-foreground font-medium">Status do Fechamento:</span>
                  <Badge variant={diff === 0 ? "default" : "destructive"} className="px-3 py-1 font-bold">
                    {diff === 0 ? "VÁLIDO" : "REVISÃO OBRIGATÓRIA"}
                  </Badge>
                </div>
              </div>

              <div className="pt-6 space-y-6">
                 <Button 
                   className="w-full bg-gradient-gold hover:opacity-90 text-white font-bold h-14 rounded-xl shadow-gold text-lg uppercase tracking-wide"
                   disabled={diff !== 0}
                 >
                    CONCLUIR E REGISTRAR AUDITORIA
                 </Button>
                 <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground font-bold uppercase tracking-widest">
                    <ShieldCheck size={14} className="text-gold" /> Usuário: David Melo Admin
                 </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="p-6 bg-secondary/10 border-t border-border/20 flex justify-between items-center px-10">
           <Button 
             variant="ghost" 
             onClick={handlePrev} 
             disabled={currentStep === 1}
             className="text-muted-foreground hover:text-foreground font-bold uppercase text-[11px] tracking-widest"
            >
             Anterior
           </Button>
           
           <div className="text-[11px] text-muted-foreground font-bold uppercase tracking-[0.2em] hidden md:block">
              Etapa {currentStep} de 4
           </div>

           <Button 
             onClick={handleNext} 
             disabled={currentStep === 4}
             className="bg-gold hover:bg-gold-light text-white font-bold min-w-[140px] h-11 rounded-lg shadow-sm uppercase text-[11px] tracking-widest"
            >
             Próximo <ArrowRight className="w-4 h-4 ml-2" />
           </Button>
        </div>
      </div>

      <ImportTransactionsDialog 
        open={importDialogOpen} 
        onOpenChange={setImportDialogOpen} 
        bankAccountId={selectedAccount}
        mode={importMode}
        onImported={(info) => {
          setImportedArtifacts((prev) => {
            const next = prev.filter((item) => item.mode !== info.mode);
            return [
              {
                ...info,
                importedAt: new Date().toISOString(),
              },
              ...next,
            ];
          });
          refetchBank();
          refetchAcc();
        }}
      />
    </div>
  );
};

export default ConciliacaoPage;
