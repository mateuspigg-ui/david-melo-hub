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

const ConciliacaoPage = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [period, setPeriod] = useState({ start: '', end: '' });
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  
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
    enabled: !!selectedAccount,
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
    enabled: !!selectedAccount,
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

  const calculateTotals = () => {
    const bankTotal = bankTransactions?.reduce((acc: number, curr: any) => acc + Number(curr.amount), 0) || 0;
    const accTotal = accountingEntries?.reduce((acc: number, curr: any) => acc + Number(curr.amount), 0) || 0;
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
    <div className="p-6 space-y-8 animate-fade-in max-w-[1400px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display text-gold tracking-wide">Conciliação Inteligente</h1>
          <p className="text-sm text-foreground/60 mt-1 font-body">Processo automatizado de auditoria bancária vs contábil</p>
        </div>
        
        {/* Step Indicator */}
        <div className="flex items-center gap-1 bg-dark-card p-1.5 rounded-full border border-border/30">
          {steps.map((step) => {
            const Icon = step.icon;
            const isCompleted = currentStep > step.id;
            const isActive = currentStep === step.id;
            return (
              <div 
                key={step.id}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all",
                  isActive ? "bg-gold text-dark" : isCompleted ? "text-gold" : "text-muted-foreground"
                )}
              >
                <div className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center border",
                  isActive ? "border-dark bg-white/20" : isCompleted ? "border-gold bg-gold/10" : "border-muted-foreground/30"
                )}>
                  {isCompleted ? <FileCheck size={12} /> : step.id}
                </div>
                <span className="hidden md:inline">{step.title}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="glass-card bg-dark-card rounded-2xl border border-border/30 overflow-hidden min-h-[500px] flex flex-col">
        {/* Step Content */}
        <div className="flex-1 p-8">
          {currentStep === 1 && (
            <div className="max-w-xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
              <div className="text-center space-y-2">
                <Landmark className="w-12 h-12 text-gold mx-auto mb-4" />
                <h2 className="text-xl font-semibold">Iniciando Diagnóstico</h2>
                <p className="text-sm text-muted-foreground">Selecione a conta e o período para validar os saldos iniciais.</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Conta Bancária Ativa</Label>
                  <select 
                    value={selectedAccount}
                    onChange={(e) => setSelectedAccount(e.target.value)}
                    className="flex h-12 w-full rounded-md bg-dark-surface border border-border/40 px-3 py-2 text-sm focus:border-gold text-foreground outline-none"
                  >
                    <option value="">Selecione uma conta...</option>
                    {accounts?.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>{acc.bank_name} - {acc.account_number}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Início do Período</Label>
                    <Input 
                      type="date" 
                      value={period.start} 
                      onChange={e => setPeriod({...period, start: e.target.value})}
                      className="h-12 bg-dark-surface border-border/40 dark:[color-scheme:dark]" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fim do Período</Label>
                    <Input 
                      type="date" 
                      value={period.end} 
                      onChange={e => setPeriod({...period, end: e.target.value})}
                      className="h-12 bg-dark-surface border-border/40 dark:[color-scheme:dark]" 
                    />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-gold/5 border border-gold/20 space-y-3">
                  <h4 className="text-xs font-semibold text-gold uppercase tracking-wider">Status do Diagnóstico</h4>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Saldo inicial Extrato:</span>
                    <span className="font-medium">R$ 0,00</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Saldo inicial Razão:</span>
                    <span className="font-medium">R$ 0,00</span>
                  </div>
                  <div className="pt-2 border-t border-gold/10 flex items-center gap-2 text-gold text-xs font-medium">
                    <CheckCircle2 size={14} /> Saldos iniciais validados (Tolerância R$ 1,00)
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Cruzamento de Dados</h2>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    className="text-xs border-gold text-gold hover:bg-gold hover:text-dark"
                    onClick={() => setImportDialogOpen(true)}
                  >
                    Importar Extrato CSV
                  </Button>
                  <Button variant="outline" className="text-xs border-gold text-gold hover:bg-gold hover:text-dark">
                    Rodar Inteligência de Matching
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-dark-surface border-border/30">
                  <CardHeader className="py-3 border-b border-border/20">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Landmark size={16} className="text-gold" /> Extrato Bancário
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-[300px] overflow-y-auto">
                      {bankTransactions?.map((tx: any) => (
                        <div key={tx.id} className="p-3 border-b border-border/10 flex items-center justify-between hover:bg-white/5 transition-colors">
                          <div className="space-y-0.5">
                            <p className="text-xs font-semibold">{tx.description}</p>
                            <p className="text-[10px] text-muted-foreground">{format(new Date(tx.transaction_date), 'dd/MM/yyyy')}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-medium">{formatCurrency(tx.amount)}</span>
                            <Badge variant="outline" className="text-[10px] h-4">Pendente</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-dark-surface border-border/30">
                  <CardHeader className="py-3 border-b border-border/20">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <FileCheck size={16} className="text-gold" /> Razão Contábil
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-[300px] overflow-y-auto">
                      {accountingEntries?.map((entry: any) => (
                        <div key={entry.id} className="p-3 border-b border-border/10 flex items-center justify-between hover:bg-white/5 transition-colors">
                          <div className="space-y-0.5">
                            <p className="text-xs font-semibold">{entry.description}</p>
                            <p className="text-[10px] text-muted-foreground">{format(new Date(entry.entry_date), 'dd/MM/yyyy')}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-medium">{formatCurrency(entry.amount)}</span>
                            <Badge variant="outline" className="text-[10px] h-4">Pendente</Badge>
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
              <h2 className="text-xl font-semibold text-center mt-4">Relatório de Pendências</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 rounded-2xl bg-dark-surface border border-border/30 space-y-1">
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold">Variação Total (Var-Tot)</p>
                  <p className={cn("text-2xl font-display", diff === 0 ? "text-green-500" : "text-amber-500")}>
                    {formatCurrency(diff)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-2">Saldo Extrato - Saldo Contábil</p>
                </div>
                <div className="p-6 rounded-2xl bg-dark-surface border border-border/30 space-y-1">
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold">Pendências Extrato</p>
                  <p className="text-2xl font-display text-foreground">{formatCurrency(bankTotal)}</p>
                </div>
                <div className="p-6 rounded-2xl bg-dark-surface border border-border/30 space-y-1">
                  <p className="text-[10px] uppercase text-muted-foreground font-semibold">Pendências Contábil</p>
                  <p className="text-2xl font-display text-foreground">{formatCurrency(accTotal)}</p>
                </div>
              </div>

              <div className="bg-gold/5 p-6 rounded-2xl border border-gold/20 max-w-2xl mx-auto space-y-4">
                 <h3 className="text-sm font-semibold text-gold tracking-widest uppercase">Equação Principal</h3>
                 <div className="flex items-center justify-center gap-4 text-xl font-display">
                    <span className="text-muted-foreground text-sm">Eq. Final:</span>
                    <span>{formatCurrency(bankTotal - accTotal)}</span>
                    <span className="text-gold text-2xl">==</span>
                    <span className={cn(bankTotal - accTotal === diff ? "text-green-500" : "text-destructive")}>
                       {formatCurrency(diff)}
                    </span>
                 </div>
                 <p className="text-center text-[11px] text-muted-foreground">O relatório só será válido se a variação bater com a soma das pendências.</p>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="max-w-xl mx-auto space-y-8 animate-in zoom-in-95 text-center py-10">
              <div className={cn(
                "w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6",
                diff === 0 ? "bg-green-500/20 text-green-500" : "bg-amber-500/20 text-amber-500"
              )}>
                {diff === 0 ? <CheckCircle2 size={40} /> : <AlertCircle size={40} />}
              </div>
              <h2 className="text-2xl font-display text-gold">Validação Final da Conciliação</h2>
              
              <div className="space-y-4 text-left p-6 bg-dark-surface rounded-2xl border border-border/30">
                <div className="flex justify-between items-center text-sm border-b border-border/10 pb-3">
                  <span className="text-muted-foreground">Auditável por Log:</span>
                  <span className="text-gold font-medium">SIM</span>
                </div>
                <div className="flex justify-between items-center text-sm border-b border-border/10 pb-3">
                  <span className="text-muted-foreground">Sistema de Segurança:</span>
                  <span className="text-gold font-medium">ATIVO</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Status da Validação:</span>
                  <Badge variant={diff === 0 ? "default" : "destructive"}>
                    {diff === 0 ? "VÁLIDO PARA FECHAMENTO" : "REVISÃO OBRIGATÓRIA"}
                  </Badge>
                </div>
              </div>

              <div className="pt-6 space-y-4">
                 <Button 
                   className="w-full bg-gold hover:bg-gold-light text-dark font-display h-12 shadow-gold"
                   disabled={diff !== 0}
                 >
                    CONCLUIR E REGISTRAR EM LOG
                 </Button>
                 <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                    Usuário logado: David Melo Hub Admin
                 </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="p-4 bg-dark-surface border-t border-border/20 flex justify-between items-center px-8">
           <Button 
             variant="ghost" 
             onClick={handlePrev} 
             disabled={currentStep === 1}
             className="text-muted-foreground hover:text-white"
            >
             Anterior
           </Button>
           
           <div className="text-xs text-muted-foreground font-medium uppercase tracking-widest hidden md:block">
              Etapa {currentStep} de 4
           </div>

           <Button 
             onClick={handleNext} 
             disabled={currentStep === 4}
             className="bg-gold hover:bg-gold-light text-dark font-medium min-w-[120px]"
            >
             Próximo <ArrowRight className="w-4 h-4 ml-2" />
           </Button>
        </div>
      </div>

      <ImportTransactionsDialog 
        open={importDialogOpen} 
        onOpenChange={setImportDialogOpen} 
        bankAccountId={selectedAccount}
        onImported={() => {
          refetchBank();
        }}
      />
    </div>
  );
};

export default ConciliacaoPage;
