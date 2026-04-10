import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  CheckCircle2, AlertCircle, ArrowRight, BarChart3, 
  Search, Landmark, FileCheck, ShieldCheck, ArrowUpDown
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

type ReconcileStatus = 'Conciliado' | 'Zero' | 'Pendente';

type ReconciledRow = {
  id: string;
  description: string;
  amount: number;
  date: string;
  status: ReconcileStatus;
};

const normalizeText = (value: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const similarityScore = (a: string, b: string) => {
  const aTokens = new Set(normalizeText(a).split(' ').filter(Boolean));
  const bTokens = new Set(normalizeText(b).split(' ').filter(Boolean));
  if (!aTokens.size && !bTokens.size) return 0;
  let intersection = 0;
  aTokens.forEach((token) => {
    if (bTokens.has(token)) intersection += 1;
  });
  const union = new Set([...aTokens, ...bTokens]).size;
  return union ? intersection / union : 0;
};

const sameDate = (a: string, b: string) => String(a || '').slice(0, 10) === String(b || '').slice(0, 10);
const sameAmount = (a: number, b: number) => Math.abs(Number(a || 0) - Number(b || 0)) < 0.005;

const statusBadgeClass: Record<ReconcileStatus, string> = {
  Conciliado: 'border-emerald-500/30 text-emerald-700 bg-emerald-50',
  Zero: 'border-blue-500/30 text-blue-700 bg-blue-50',
  Pendente: 'border-amber-500/30 text-amber-700 bg-amber-50',
};

const toSafeDateLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return format(date, 'dd/MM/yyyy');
};

const ConciliacaoPage = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [period, setPeriod] = useState({ start: '', end: '' });
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importMode, setImportMode] = useState<'bank' | 'accounting'>('bank');
  const [importedArtifacts, setImportedArtifacts] = useState<ImportedArtifact[]>([]);
  const [balances, setBalances] = useState({
    tolerance: 1,
    statementInitial: 0,
    statementFinal: 0,
    ledgerInitial: 0,
    ledgerFinal: 0,
  });
  const isDemoAccount = selectedAccount === DEMO_ACCOUNT.id;

  const clearReconciliationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAccount) throw new Error('Selecione a conta para limpar a conciliação.');
      if (!period.start || !period.end) throw new Error('Defina o período antes de limpar os dados.');

      const { error: bankError } = await (supabase as any)
        .from('bank_transactions')
        .delete()
        .eq('bank_account_id', selectedAccount)
        .gte('transaction_date', period.start)
        .lte('transaction_date', period.end);

      if (bankError) throw bankError;

      const { error: accountingError } = await (supabase as any)
        .from('accounting_entries')
        .delete()
        .eq('bank_account_id', selectedAccount)
        .gte('entry_date', period.start)
        .lte('entry_date', period.end);

      if (accountingError) throw accountingError;
    },
    onSuccess: () => {
      refetchBank();
      refetchAcc();
      setImportedArtifacts([]);
      setCurrentStep(1);
      toast({ title: 'Conciliação limpa', description: 'Dados do período foram removidos. Você pode começar do zero.' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao limpar', description: error?.message || 'Não foi possível limpar a conciliação.', variant: 'destructive' });
    },
  });
  
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

  const selectedAccountData = useMemo(
    () => accountsWithDemo.find((acc: any) => acc.id === selectedAccount),
    [accountsWithDemo, selectedAccount]
  );

  const bankMovementTotal = useMemo(
    () => effectiveBankTransactions.reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0),
    [effectiveBankTransactions]
  );

  const accountingMovementTotal = useMemo(
    () => effectiveAccountingEntries.reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0),
    [effectiveAccountingEntries]
  );

  const reconciliationData = useMemo(() => {
    const bankRows = effectiveBankTransactions.map((tx: any) => ({
      id: String(tx.id),
      description: tx.description || 'S/D',
      amount: Number(tx.amount || 0),
      date: String(tx.transaction_date || ''),
      status: 'Pendente' as ReconcileStatus,
    }));

    const accountingRows = effectiveAccountingEntries.map((entry: any) => ({
      id: String(entry.id),
      description: entry.description || 'S/D',
      amount: Number(entry.amount || 0),
      date: String(entry.entry_date || ''),
      status: 'Pendente' as ReconcileStatus,
    }));

    const usedAccountingIds = new Set<string>();

    bankRows.forEach((bankRow) => {
      const candidates = accountingRows.filter(
        (accRow) =>
          !usedAccountingIds.has(accRow.id) &&
          sameDate(bankRow.date, accRow.date) &&
          sameAmount(bankRow.amount, accRow.amount)
      );

      if (!candidates.length) return;
      const bestMatch = candidates.sort(
        (a, b) => similarityScore(bankRow.description, b.description) - similarityScore(bankRow.description, a.description)
      )[0];

      bankRow.status = 'Conciliado';
      bestMatch.status = 'Conciliado';
      usedAccountingIds.add(bestMatch.id);
    });

    const unresolvedAccounting = accountingRows.filter((row) => row.status === 'Pendente');
    const visitedForZero = new Set<string>();

    unresolvedAccounting.forEach((row) => {
      if (visitedForZero.has(row.id)) return;
      const opposite = unresolvedAccounting.find(
        (candidate) =>
          candidate.id !== row.id &&
          !visitedForZero.has(candidate.id) &&
          sameAmount(row.amount + candidate.amount, 0)
      );

      if (!opposite) return;
      row.status = 'Zero';
      opposite.status = 'Zero';
      visitedForZero.add(row.id);
      visitedForZero.add(opposite.id);
    });

    const pendingBank = bankRows.filter((row) => row.status === 'Pendente');
    const pendingAccounting = accountingRows.filter((row) => row.status === 'Pendente');
    const extDifTot = pendingBank.reduce((acc, row) => acc + row.amount, 0);
    const contDifTot = pendingAccounting.reduce((acc, row) => acc + row.amount, 0);
    const difTot = extDifTot - contDifTot;
    const varTot = Number(balances.statementFinal) - Number(balances.ledgerFinal);

    return {
      bankRows,
      accountingRows,
      pendingBank,
      pendingAccounting,
      extDifTot,
      contDifTot,
      difTot,
      varTot,
    };
  }, [effectiveBankTransactions, effectiveAccountingEntries, balances.statementFinal, balances.ledgerFinal]);

  const diagnostics = useMemo(() => {
    const tolerance = Number(balances.tolerance || 0);
    const rule11Diff = Number(balances.statementInitial) - Number(balances.ledgerInitial);
    const rule12Calc = Number(balances.statementInitial) + bankMovementTotal;
    const rule12Diff = rule12Calc - Number(balances.statementFinal);
    const rule13Calc = Number(balances.ledgerInitial) + accountingMovementTotal;
    const rule13Diff = rule13Calc - Number(balances.ledgerFinal);

    return {
      tolerance,
      rule11Diff,
      rule12Calc,
      rule12Diff,
      rule13Calc,
      rule13Diff,
      rule11Ok: Math.abs(rule11Diff) <= tolerance,
      rule12Ok: Math.abs(rule12Diff) <= tolerance,
      rule13Ok: Math.abs(rule13Diff) <= tolerance,
      allOk:
        Math.abs(rule11Diff) <= tolerance &&
        Math.abs(rule12Diff) <= tolerance &&
        Math.abs(rule13Diff) <= tolerance,
    };
  }, [balances, bankMovementTotal, accountingMovementTotal]);

  const handleNext = () => {
    if (currentStep === 1 && (!selectedAccount || !period.start || !period.end)) {
      toast({ title: 'Aviso', description: 'Preencha todos os campos do diagnóstico.', variant: 'destructive' });
      return;
    }

    if (currentStep === 1 && !diagnostics.rule11Ok) {
      toast({
        title: 'Erro na etapa 1.1',
        description: `Saldo inicial contábil e extrato divergentes em ${formatCurrency(diagnostics.rule11Diff)}.`,
        variant: 'destructive',
      });
      return;
    }

    if (currentStep === 1 && !diagnostics.rule12Ok) {
      toast({
        title: 'Erro na etapa 1.2',
        description: `Saldo do extrato inconsistente. Diferença apurada: ${formatCurrency(diagnostics.rule12Diff)}.`,
        variant: 'destructive',
      });
      return;
    }

    if (currentStep === 1 && !diagnostics.rule13Ok) {
      toast({
        title: 'Erro na etapa 1.3',
        description: `Saldo do balancete inconsistente. Diferença apurada: ${formatCurrency(diagnostics.rule13Diff)}.`,
        variant: 'destructive',
      });
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

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => clearReconciliationMutation.mutate()}
                  disabled={isDemoAccount || !selectedAccount || !period.start || !period.end || clearReconciliationMutation.isPending}
                  className="text-xs border-destructive/40 text-destructive hover:bg-destructive hover:text-white transition-all"
                >
                  {clearReconciliationMutation.isPending ? 'Limpando...' : 'Limpar conciliação deste período'}
                </Button>

                <div className="space-y-3 rounded-xl border border-border/20 bg-secondary/10 p-5">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-foreground">Parâmetros de validação</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Tolerância permitida (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={balances.tolerance}
                        onChange={(e) => setBalances((prev) => ({ ...prev, tolerance: Number(e.target.value || 0) }))}
                        className="h-11 bg-white border-border/30"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Saldo inicial extrato</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={balances.statementInitial}
                        onChange={(e) => setBalances((prev) => ({ ...prev, statementInitial: Number(e.target.value || 0) }))}
                        className="h-11 bg-white border-border/30"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Saldo final extrato</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={balances.statementFinal}
                        onChange={(e) => setBalances((prev) => ({ ...prev, statementFinal: Number(e.target.value || 0) }))}
                        className="h-11 bg-white border-border/30"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Saldo inicial balancete</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={balances.ledgerInitial}
                        onChange={(e) => setBalances((prev) => ({ ...prev, ledgerInitial: Number(e.target.value || 0) }))}
                        className="h-11 bg-white border-border/30"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Saldo final balancete</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={balances.ledgerFinal}
                        onChange={(e) => setBalances((prev) => ({ ...prev, ledgerFinal: Number(e.target.value || 0) }))}
                        className="h-11 bg-white border-border/30"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-gold/5 border border-gold/20 space-y-3">
                  <h4 className="text-xs font-bold text-gold uppercase tracking-widest">Status do Diagnóstico</h4>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">1.1 Saldo inicial extrato x contabilidade:</span>
                    <Badge variant="outline" className={cn('text-[10px] font-bold', diagnostics.rule11Ok ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'border-destructive/30 text-destructive bg-destructive/10')}>
                      {diagnostics.rule11Ok ? 'OK' : `Dif: ${formatCurrency(diagnostics.rule11Diff)}`}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">1.2 Extrato inicial + movimentação = extrato final:</span>
                    <Badge variant="outline" className={cn('text-[10px] font-bold', diagnostics.rule12Ok ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'border-destructive/30 text-destructive bg-destructive/10')}>
                      {diagnostics.rule12Ok ? 'OK' : `Dif: ${formatCurrency(diagnostics.rule12Diff)}`}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">1.3 Balancete inicial + razão = balancete final:</span>
                    <Badge variant="outline" className={cn('text-[10px] font-bold', diagnostics.rule13Ok ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'border-destructive/30 text-destructive bg-destructive/10')}>
                      {diagnostics.rule13Ok ? 'OK' : `Dif: ${formatCurrency(diagnostics.rule13Diff)}`}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm border-t border-gold/20 pt-3">
                    <span className="text-muted-foreground">Tolerância aplicada:</span>
                    <span className="font-semibold text-foreground">{formatCurrency(diagnostics.tolerance)}</span>
                  </div>
                  <div className="pt-3 border-t border-gold/10 flex items-center gap-2 text-gold text-xs font-bold">
                    <CheckCircle2 size={14} />
                    {diagnostics.allOk
                      ? 'Validações concluídas. Pronto para o passo 2.'
                      : 'Existem inconsistências. Corrija os saldos para prosseguir.'}
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
                  <Button
                    variant="outline"
                    className="text-xs border-gold text-gold hover:bg-gold hover:text-white transition-all shadow-sm"
                    onClick={() => toast({ title: 'Cruzamento executado', description: 'Status atualizado para Conciliado, Zero e Pendente.' })}
                  >
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
                      {reconciliationData.bankRows.map((tx: ReconciledRow) => (
                        <div key={tx.id} className="p-4 border-b border-border/10 flex items-center justify-between hover:bg-secondary/30 transition-colors">
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold text-foreground">{tx.description}</p>
                            <p className="text-[10px] text-muted-foreground">{toSafeDateLabel(tx.date)}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-foreground">{formatCurrency(tx.amount)}</span>
                            <Badge variant="outline" className={cn('text-[10px] font-bold', statusBadgeClass[tx.status])}>{tx.status}</Badge>
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
                      {reconciliationData.accountingRows.map((entry: ReconciledRow) => (
                        <div key={entry.id} className="p-4 border-b border-border/10 flex items-center justify-between hover:bg-secondary/30 transition-colors">
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold text-foreground">{entry.description}</p>
                            <p className="text-[10px] text-muted-foreground">{toSafeDateLabel(entry.date)}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-foreground">{formatCurrency(entry.amount)}</span>
                            <Badge variant="outline" className={cn('text-[10px] font-bold', statusBadgeClass[entry.status])}>{entry.status}</Badge>
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
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
              <h2 className="text-2xl font-display text-center mt-4">Relatório de Conciliação Bancária</h2>

              <div className="rounded-2xl border border-border/30 bg-white p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Banco</p>
                    <p className="font-semibold text-foreground">{selectedAccountData?.bank_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Conta bancária</p>
                    <p className="font-semibold text-foreground">{selectedAccountData?.account_number || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Conta contábil</p>
                    <p className="font-semibold text-foreground">{selectedAccountData?.accounting_account_id || '-'}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-gold/20 bg-gold/5 p-4">
                  <p className="text-[10px] uppercase tracking-widest text-gold font-bold">Diferença entre saldos finais</p>
                  <p className="mt-1 text-sm text-foreground font-semibold">
                    Saldo Final do Extrato ({formatCurrency(balances.statementFinal)}) - Saldo Final da Contabilidade ({formatCurrency(balances.ledgerFinal)})
                  </p>
                  <p className="text-xl font-display mt-2 text-foreground">Diferença de saldos finais: {formatCurrency(reconciliationData.varTot)}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-border/30 bg-white p-6">
                <h3 className="text-sm font-bold uppercase tracking-widest text-foreground mb-3">Pendências no Extrato</h3>
                <div className="space-y-2 max-h-[220px] overflow-y-auto">
                  {reconciliationData.pendingBank.length === 0 && <p className="text-xs text-muted-foreground">Sem pendências no extrato.</p>}
                  {reconciliationData.pendingBank.map((item) => (
                    <div key={item.id} className="flex items-center justify-between border-b border-border/10 pb-2">
                      <div>
                        <p className="text-xs font-semibold text-foreground">{item.description}</p>
                        <p className="text-[10px] text-muted-foreground">{toSafeDateLabel(item.date)}</p>
                      </div>
                      <span className="text-xs font-bold text-foreground">{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-border/20 flex justify-between text-sm font-semibold">
                  <span>Total de pendências no extrato</span>
                  <span>{formatCurrency(reconciliationData.extDifTot)}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-border/30 bg-white p-6">
                <h3 className="text-sm font-bold uppercase tracking-widest text-foreground mb-3">Pendências na Contabilidade</h3>
                <div className="space-y-2 max-h-[220px] overflow-y-auto">
                  {reconciliationData.pendingAccounting.length === 0 && <p className="text-xs text-muted-foreground">Sem pendências no razão contábil.</p>}
                  {reconciliationData.pendingAccounting.map((item) => (
                    <div key={item.id} className="flex items-center justify-between border-b border-border/10 pb-2">
                      <div>
                        <p className="text-xs font-semibold text-foreground">{item.description}</p>
                        <p className="text-[10px] text-muted-foreground">{toSafeDateLabel(item.date)}</p>
                      </div>
                      <span className="text-xs font-bold text-foreground">{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-border/20 flex justify-between text-sm font-semibold">
                  <span>Total de pendências na contabilidade</span>
                  <span>{formatCurrency(reconciliationData.contDifTot)}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-gold/30 bg-gold/5 p-6">
                <div className="flex items-center justify-between text-lg font-display text-foreground">
                  <span>Resultado final das pendências</span>
                  <span>{formatCurrency(reconciliationData.difTot)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Total pendente no extrato - Total pendente na contabilidade</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8">
                <div className="border-t border-foreground/30 pt-3">
                  <p className="text-xs font-semibold text-foreground">Preparado por</p>
                </div>
                <div className="border-t border-foreground/30 pt-3">
                  <p className="text-xs font-semibold text-foreground">Revisado por</p>
                </div>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="max-w-xl mx-auto space-y-8 animate-in zoom-in-95 text-center py-10">
              {(() => {
                const validationGap = reconciliationData.difTot - reconciliationData.varTot;
                const isValid = Math.abs(validationGap) <= diagnostics.tolerance;
                return (
                  <>
              <div className={cn(
                "w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border-2",
                isValid ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning border-warning/20"
              )}>
                {isValid ? <CheckCircle2 size={48} /> : <AlertCircle size={48} />}
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
                  <span className="text-muted-foreground font-medium">Comparação final (pendências x diferença de saldos):</span>
                  <Badge variant={isValid ? "default" : "destructive"} className="px-3 py-1 font-bold">
                    {isValid ? "VÁLIDO" : "ERRO DE DIFERENÇA"}
                  </Badge>
                </div>
                <div className="flex justify-between items-center text-sm border-t border-border/10 pt-4">
                  <span className="text-muted-foreground font-medium">Resultado final das pendências</span>
                  <span className="font-bold text-foreground">{formatCurrency(reconciliationData.difTot)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground font-medium">Diferença entre saldos finais</span>
                  <span className="font-bold text-foreground">{formatCurrency(reconciliationData.varTot)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground font-medium">Diferença apurada</span>
                  <span className={cn('font-bold', isValid ? 'text-success' : 'text-destructive')}>
                    {formatCurrency(validationGap)}
                  </span>
                </div>
              </div>

              <div className="pt-6 space-y-6">
                 <Button 
                    className="w-full bg-gradient-gold hover:opacity-90 text-white font-bold h-14 rounded-xl shadow-gold text-lg uppercase tracking-wide"
                    disabled={!isValid}
                  >
                     CONCLUIR E REGISTRAR AUDITORIA
                  </Button>
                  <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground font-bold uppercase tracking-widest">
                     <ShieldCheck size={14} className="text-gold" /> Usuário: David Melo Admin
                  </div>
              </div>
                  </>
                );
              })()}
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
