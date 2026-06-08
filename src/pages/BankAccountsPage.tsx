import { useMemo, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Building2, Landmark, Search, Trash2, Loader2, LayoutGrid, List, ArrowRightLeft, FileText, DollarSign, ArrowUpRight, ArrowDownLeft, Calendar, Printer, CreditCard, Banknote, Link } from 'lucide-react';
import { LinkInstallmentsDialog } from '@/components/LinkInstallmentsDialog';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatCurrencyInput, maskCurrencyInput, parseCurrencyInput } from '@/lib/currencyInput';
import { format } from 'date-fns';

const currencyFmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  corrente: 'Corrente Executiva',
  fiscal: 'Conta Fiscal',
  poupanca: 'Poupanca / Reserva',
  investimento: 'Investimento Privado',
  investimentos: 'Investimento Privado',
};

const BankAccountsPage = () => {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState<any>(null);
  const [extractOpen, setExtractOpen] = useState(false);
  const [extractAccount, setExtractAccount] = useState<any>(null);
  const [linkInstallmentsOpen, setLinkInstallmentsOpen] = useState(false);
  const [form, setForm] = useState({
    bank_name: '', bank_code: '', agency: '', account_number: '',
    account_digit: '', description: '', account_type: 'corrente',
    default_initial_balance: '', accounting_account_id: ''
  });

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['bank_accounts'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('bank_accounts').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['bank_transactions_balance'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('bank_transactions').select('bank_account_id, amount, transaction_date');
      if (error) return [];
      return data || [];
    },
  });

  const { data: payables = [] } = useQuery({
    queryKey: ['bank_accounts_payables'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('accounts_payable')
        .select('bank_account_id, paid_amount, amount, payment_status, paid_at')
        .not('bank_account_id', 'is', null);
      if (error) return [];
      return data || [];
    },
  });

  const { data: entryPayments = [] } = useQuery({
    queryKey: ['bank_accounts_entry_payments'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('payments')
        .select('entry_bank_account_id, entry_paid_amount, entry_amount, entry_paid_at')
        .not('entry_bank_account_id', 'is', null)
        .not('entry_paid_at', 'is', null);
      if (error) return [];
      return data || [];
    },
  });

  const { data: installmentPayments = [] } = useQuery({
    queryKey: ['bank_accounts_installment_payments'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('payment_installments')
        .select('bank_account_id, paid_amount, amount, paid_at')
        .not('bank_account_id', 'is', null)
        .not('paid_at', 'is', null);
      if (error) return [];
      return data || [];
    },
  });

  const balanceMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of transactions) {
      const id = t.bank_account_id;
      map[id] = (map[id] || 0) + Number(t.amount || 0);
    }
    for (const p of payables) {
      if (p.payment_status === 'pago' || p.paid_at) {
        const id = p.bank_account_id;
        const paidVal = Number(p.paid_amount || p.amount || 0);
        map[id] = (map[id] || 0) - paidVal;
      }
    }
    for (const ep of entryPayments) {
      const id = ep.entry_bank_account_id;
      const val = Number(ep.entry_paid_amount || ep.entry_amount || 0);
      map[id] = (map[id] || 0) + val;
    }
    for (const ip of installmentPayments) {
      const id = ip.bank_account_id;
      const val = Number(ip.paid_amount || ip.amount || 0);
      map[id] = (map[id] || 0) + val;
    }
    return map;
  }, [transactions, payables, entryPayments, installmentPayments]);

  const getBalance = (accountId: string) => {
    const initial = accounts?.find((a: any) => a.id === accountId)?.default_initial_balance || 0;
    return (balanceMap[accountId] || 0) + Number(initial);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const parsedBalance = parseCurrencyInput(form.default_initial_balance);
      const payload = {
        ...form,
        default_initial_balance: form.default_initial_balance.trim() === '' || Number.isNaN(parsedBalance) ? 0 : parsedBalance,
      };
      if (editingAccount) {
        const { error } = await (supabase as any).from('bank_accounts').update(payload).eq('id', editingAccount.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('bank_accounts').insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank_accounts'] });
      setDialogOpen(false);
      setEditingAccount(null);
      resetForm();
      toast({ title: 'Sucesso', description: 'Dados bancarios atualizados!', style: { backgroundColor: '#C5A059', color: '#fff' } });
    },
    onError: (error: any) => toast({ title: 'Erro', description: error.message, variant: 'destructive' })
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('bank_accounts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank_accounts'] });
      setDeleteTarget(null);
      toast({ title: 'Removido', description: 'Conta excluida com sucesso.', variant: 'destructive' });
    },
    onError: (e: any) => toast({ title: 'Erro ao excluir', description: e.message, variant: 'destructive' })
  });

  const transferMutation = useMutation({
    mutationFn: async ({ fromId, toId, amount, description, date }: { fromId: string; toId: string; amount: number; description: string; date: string }) => {
      const { error: err1 } = await (supabase as any).from('bank_transactions').insert({
        bank_account_id: fromId, amount: -Math.abs(amount), transaction_date: date,
        description: `Transferencia saida: ${description}`, transaction_type: 'debito', status: 'conciliado',
      });
      if (err1) throw err1;
      const { error: err2 } = await (supabase as any).from('bank_transactions').insert({
        bank_account_id: toId, amount: Math.abs(amount), transaction_date: date,
        description: `Transferencia entrada: ${description}`, transaction_type: 'credito', status: 'conciliado',
      });
      if (err2) throw err2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank_transactions_balance'] });
      qc.invalidateQueries({ queryKey: ['bank_accounts_payables'] });
      qc.invalidateQueries({ queryKey: ['bank_accounts_entry_payments'] });
      qc.invalidateQueries({ queryKey: ['bank_accounts_installment_payments'] });
      setTransferOpen(false);
      setTransferFrom(null);
      toast({ title: 'Transferencia registrada', description: 'Movimentacao entre contas realizada.', style: { backgroundColor: '#C5A059', color: '#fff' } });
    },
    onError: (e: any) => toast({ title: 'Erro na transferencia', description: e.message, variant: 'destructive' })
  });

  const resetForm = () => {
    setForm({ bank_name: '', bank_code: '', agency: '', account_number: '', account_digit: '', description: '', account_type: 'corrente', default_initial_balance: '', accounting_account_id: '' });
  };

  const sortedAccounts = useMemo(() => {
    return (accounts || []).slice().sort((a: any, b: any) => String(a.bank_name || '').localeCompare(String(b.bank_name || ''), 'pt-BR', { sensitivity: 'base' }));
  }, [accounts]);

  const getAccountTypeLabel = (value?: string | null) => {
    const key = String(value || '').trim().toLowerCase();
    return ACCOUNT_TYPE_LABELS[key] || (value ? String(value) : '---');
  };

  const formatBalance = (balance: number) => {
    const formatted = currencyFmt(Math.abs(balance));
    return balance >= 0 ? `+ ${formatted}` : `- ${formatted}`;
  };

  return (
    <>
    <div className="p-8 space-y-10 animate-fade-in max-w-[1500px] mx-auto min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 border-b border-border/10 pb-10">
        <div>
          <h1 className="text-4xl font-display text-foreground tracking-tighter uppercase">Contas Bancarias</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold mt-2 opacity-80">Gestao e Custodia de Ativos David Melo</p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => setLinkInstallmentsOpen(true)}
            variant="outline"
            className="border-gold/40 text-gold hover:bg-gold hover:text-white font-black h-12 px-6 rounded-xl uppercase text-[11px] tracking-[0.25em] transition-all duration-300"
          >
            <Link size={16} className="mr-2" /> Vincular Parcelas
          </Button>
          <Button
            onClick={() => { setEditingAccount(null); resetForm(); setDialogOpen(true); }}
            className="bg-gradient-gold hover:opacity-95 text-white font-black h-12 px-10 rounded-xl shadow-gold uppercase text-[11px] tracking-[0.25em] transition-all duration-300"
          >
            <Plus size={20} className="mr-3" /> Registrar Conta
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant={viewMode === 'cards' ? 'default' : 'outline'} onClick={() => setViewMode('cards')} className={`h-10 px-4 rounded-xl font-bold uppercase text-[10px] tracking-widest ${viewMode === 'cards' ? 'bg-gradient-gold text-white' : 'border-border/30'}`}>
          <LayoutGrid size={14} className="mr-2" /> Cards
        </Button>
        <Button type="button" variant={viewMode === 'list' ? 'default' : 'outline'} onClick={() => setViewMode('list')} className={`h-10 px-4 rounded-xl font-bold uppercase text-[10px] tracking-widest ${viewMode === 'list' ? 'bg-gradient-gold text-white' : 'border-border/30'}`}>
          <List size={14} className="mr-2" /> Lista
        </Button>
      </div>

      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {isLoading ? (
            <div className="col-span-full h-64 flex flex-col items-center justify-center text-muted-foreground gap-4 bg-white/50 rounded-[32px] border border-dashed border-border/40">
              <Landmark className="w-12 h-12 animate-pulse opacity-20" />
              <span className="text-[10px] font-black uppercase tracking-widest">Sincronizando...</span>
            </div>
          ) : sortedAccounts.length === 0 ? (
            <div className="col-span-full p-24 text-center bg-white rounded-[32px] border border-dashed border-border/40 premium-shadow relative overflow-hidden">
              <Landmark className="mx-auto h-20 w-20 text-gold/10 mb-6" />
              <h3 className="text-xl font-display text-foreground uppercase tracking-tight">Nenhuma conta cadastrada</h3>
              <Button onClick={() => setDialogOpen(true)} className="mt-10 bg-secondary/50 hover:bg-gold hover:text-white text-gold font-black px-10 h-12 rounded-xl border border-gold/20 transition-all uppercase text-[11px] tracking-widest">Iniciar Cadastro</Button>
            </div>
          ) : sortedAccounts.map((account: any) => {
            const balance = getBalance(account.id);
            return (
              <div key={account.id} className="bg-white premium-shadow rounded-[28px] p-8 border border-border/40 hover:border-gold/30 transition-all duration-500 group relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gold/[0.03] rounded-full -mr-16 -mt-16 group-hover:scale-125 transition-transform duration-700" />

                <div className="flex justify-between items-start mb-4 relative z-10">
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-secondary/30 flex items-center justify-center text-gold group-hover:bg-gold group-hover:text-white transition-all duration-500 shadow-sm">
                      <Building2 size={28} />
                    </div>
                    <div>
                      <h3 className="font-display text-xl text-foreground tracking-tight uppercase leading-none">{account.bank_name}</h3>
                      <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-2 opacity-60">{account.description || `ID: ${account.bank_code || '---'}`}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={cn("px-3 py-1 text-[9px] font-black uppercase tracking-[0.15em] rounded-full", account.status === 'active' ? 'border-emerald-500/20 text-emerald-500 bg-emerald-500/5' : 'border-destructive/20 text-destructive bg-destructive/5')}>
                    {account.status === 'active' ? 'Ativo' : 'Offline'}
                  </Badge>
                </div>

                <div className={cn(
                  "relative z-10 p-5 rounded-2xl border mb-4",
                  balance >= 0 ? "bg-gradient-to-br from-emerald-50 to-emerald-50/50 border-emerald-200/60" : "bg-gradient-to-br from-red-50 to-red-50/50 border-red-200/60",
                )}>
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 mb-1">Saldo Disponivel</p>
                  <p className={cn("text-2xl font-display tracking-tight font-black", balance >= 0 ? "text-emerald-700" : "text-red-600")}>
                    {formatBalance(balance)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-6 p-6 bg-secondary/[0.15] rounded-2xl border border-border/5 relative z-10">
                  <div className="space-y-1">
                    <p className="text-[9px] uppercase text-muted-foreground font-black tracking-widest opacity-60">Agencia</p>
                    <p className="text-sm font-black text-foreground">{account.agency}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] uppercase text-muted-foreground font-black tracking-widest opacity-60">Conta & Digito</p>
                    <p className="text-sm font-black text-foreground">{account.account_number}{account.account_digit ? `-${account.account_digit}` : ''}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-6 pt-5 border-t border-border/10 relative z-10">
                  <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest opacity-40">{getAccountTypeLabel(account.account_type)}</p>
                  <div className="flex gap-2">
                    <button onClick={() => { setExtractAccount(account); setExtractOpen(true); }} className="w-10 h-10 rounded-xl bg-secondary/40 flex items-center justify-center text-muted-foreground hover:text-blue-500 hover:bg-blue-50 transition-all shadow-sm" title="Extrato">
                      <FileText size={18} />
                    </button>
                    <button onClick={() => { setTransferFrom(account); setTransferOpen(true); }} className="w-10 h-10 rounded-xl bg-secondary/40 flex items-center justify-center text-muted-foreground hover:text-gold hover:bg-gold/10 transition-all shadow-sm" title="Transferencia">
                      <ArrowRightLeft size={18} />
                    </button>
                    <button onClick={() => {
                      setEditingAccount(account);
                      setForm({ bank_name: account.bank_name, bank_code: account.bank_code || '', agency: account.agency, account_number: account.account_number, account_digit: account.account_digit || '', description: account.description || '', account_type: account.account_type || 'corrente', default_initial_balance: account.default_initial_balance != null ? formatCurrencyInput(account.default_initial_balance) : '', accounting_account_id: account.accounting_account_id || '' });
                      setDialogOpen(true);
                    }} className="w-10 h-10 rounded-xl bg-secondary/40 flex items-center justify-center text-muted-foreground hover:text-gold hover:bg-gold/10 transition-all shadow-sm" title="Editar">
                      <Search size={18} />
                    </button>
                    <button onClick={() => setDeleteTarget(account)} className="w-10 h-10 rounded-xl bg-secondary/40 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all shadow-sm" title="Excluir">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white premium-shadow rounded-2xl border border-border/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/10 border-b border-border/20">
                  <th className="text-left py-4 px-6 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Banco</th>
                  <th className="text-left py-4 px-6 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Agencia / Conta</th>
                  <th className="text-left py-4 px-6 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Tipo</th>
                  <th className="text-right py-4 px-6 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Saldo</th>
                  <th className="text-left py-4 px-6 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Status</th>
                  <th className="text-right py-4 px-6 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/10">
                {sortedAccounts.map((account: any) => {
                  const balance = getBalance(account.id);
                  return (
                    <tr key={account.id} className="hover:bg-secondary/5 transition-colors">
                      <td className="py-4 px-6"><p className="font-bold">{account.bank_name}</p><p className="text-xs text-muted-foreground">{account.description || `ID: ${account.bank_code || '---'}`}</p></td>
                      <td className="py-4 px-6 text-sm">{account.agency} / {account.account_number}{account.account_digit ? `-${account.account_digit}` : ''}</td>
                      <td className="py-4 px-6 text-xs uppercase text-muted-foreground">{getAccountTypeLabel(account.account_type)}</td>
                      <td className={cn("py-4 px-6 text-sm font-black text-right tabular-nums", balance >= 0 ? "text-emerald-600" : "text-red-500")}>{formatBalance(balance)}</td>
                      <td className={`py-4 px-6 text-xs uppercase font-bold ${account.status === 'active' ? 'text-emerald-600' : 'text-destructive'}`}>{account.status === 'active' ? 'Ativo' : 'Offline'}</td>
                      <td className="py-4 px-6">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => { setExtractAccount(account); setExtractOpen(true); }} className="h-8 w-8 text-muted-foreground hover:text-blue-500 hover:bg-blue-50"><FileText size={16} /></Button>
                          <Button variant="ghost" size="icon" onClick={() => { setTransferFrom(account); setTransferOpen(true); }} className="h-8 w-8 text-muted-foreground hover:text-gold hover:bg-gold/10"><ArrowRightLeft size={16} /></Button>
                          <Button variant="ghost" size="icon" onClick={() => { setEditingAccount(account); setForm({ bank_name: account.bank_name, bank_code: account.bank_code || '', agency: account.agency, account_number: account.account_number, account_digit: account.account_digit || '', description: account.description || '', account_type: account.account_type || 'corrente', default_initial_balance: account.default_initial_balance != null ? formatCurrencyInput(account.default_initial_balance) : '', accounting_account_id: account.accounting_account_id || '' }); setDialogOpen(true); }} className="h-8 w-8 text-muted-foreground hover:text-gold hover:bg-gold/10"><Search size={16} /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(account)} className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 size={16} /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== CREATE/EDIT DIALOG ===== */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open && !saveMutation.isPending) setDialogOpen(false); }}>
        <DialogContent className="bg-white border-border/40 text-foreground max-w-2xl max-h-[90vh] rounded-[32px] p-0 overflow-hidden shadow-[0_25px_50px_-12px_rgba(218,165,32,0.15)] flex flex-col">
          <div className="bg-gradient-gold p-10 text-white relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl opacity-50" />
            <DialogHeader>
              <DialogTitle className="text-3xl font-display text-white tracking-tight">{editingAccount ? 'Editar Conta' : 'Nova Conta Bancaria'}</DialogTitle>
              <p className="text-white/80 text-[10px] font-black uppercase tracking-[0.2em] mt-2">David Melo Hub</p>
            </DialogHeader>
          </div>
          <div className="p-6 md:p-10 space-y-8 bg-white/50 backdrop-blur-sm overflow-y-auto min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Instituicao Bancaria</Label>
                <Input value={form.bank_name} onChange={e => setForm({...form, bank_name: e.target.value})} className="bg-secondary/20 h-12 border-border/10 focus:border-gold rounded-xl font-bold px-4" placeholder="Ex: Itau, BTG" />
              </div>
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Codigo do Banco</Label>
                <Input value={form.bank_code} onChange={e => setForm({...form, bank_code: e.target.value})} className="bg-secondary/20 h-12 border-border/10 focus:border-gold rounded-xl font-bold px-4" placeholder="Ex: 341" />
              </div>
              <div className="grid grid-cols-3 gap-4 md:col-span-2">
                <div className="space-y-3"><Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Agencia</Label><Input value={form.agency} onChange={e => setForm({...form, agency: e.target.value})} className="bg-secondary/20 h-12 border-border/10 focus:border-gold rounded-xl font-bold text-center" placeholder="0001" /></div>
                <div className="space-y-3"><Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Conta</Label><Input value={form.account_number} onChange={e => setForm({...form, account_number: e.target.value})} className="bg-secondary/20 h-12 border-border/10 focus:border-gold rounded-xl font-bold text-center" placeholder="12345" /></div>
                <div className="space-y-3"><Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Digito</Label><Input value={form.account_digit} onChange={e => setForm({...form, account_digit: e.target.value})} className="bg-secondary/20 h-12 border-border/10 focus:border-gold rounded-xl font-bold text-center" placeholder="0" /></div>
              </div>
              <div className="space-y-3 md:col-span-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Descricao / Apelido</Label>
                <Input value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="bg-secondary/20 h-12 border-border/10 focus:border-gold rounded-xl font-bold px-4" placeholder="Ex: Conta Operacional Principal" />
              </div>
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Tipo de Conta</Label>
                <select value={form.account_type} onChange={e => setForm({...form, account_type: e.target.value})} className="flex h-12 w-full rounded-xl bg-secondary/20 border border-border/10 px-4 py-2 text-xs font-black uppercase tracking-widest focus:border-gold text-foreground outline-none shadow-sm">
                  <option value="corrente">Corrente Executiva</option>
                  <option value="fiscal">Conta Fiscal</option>
                  <option value="poupanca">Poupanca / Reserva</option>
                  <option value="investimento">Investimento Privado</option>
                </select>
              </div>
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Saldo Inicial (R$)</Label>
                <Input type="text" inputMode="decimal" value={form.default_initial_balance} onChange={e => setForm({...form, default_initial_balance: maskCurrencyInput(e.target.value)})} className="bg-gold/5 h-12 border-gold/20 focus:border-gold rounded-xl font-display text-xl text-gold text-center" placeholder="0,00" />
              </div>
            </div>
            <div className="flex justify-between items-center gap-6 pt-10 border-t border-border/10">
              <Button variant="ghost" onClick={() => setDialogOpen(false)} className="h-12 px-8 text-muted-foreground font-black uppercase text-[10px] tracking-[0.2em] rounded-xl hover:bg-secondary/40">Cancelar</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="bg-gradient-gold hover:opacity-95 text-white font-black h-12 px-12 rounded-xl shadow-gold uppercase text-[11px] tracking-[0.25em] transition-all duration-300">
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-3 animate-spin" /> : null}
                {editingAccount ? 'Salvar Alteracoes' : 'Registrar Conta'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== DELETE CONFIRMATION ===== */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="rounded-[24px] border-border/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl">Excluir Conta Bancaria</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Tem certeza que deseja excluir a conta <strong>{deleteTarget?.bank_name}</strong> ({deleteTarget?.account_number})? Esta acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} className="bg-destructive text-white rounded-xl hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== TRANSFER DIALOG ===== */}
      <TransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        accounts={sortedAccounts}
        preselectedFrom={transferFrom}
        onSubmit={transferMutation.mutate}
        isPending={transferMutation.isPending}
        getBalance={getBalance}
      />

      {/* ===== EXTRACT DIALOG ===== */}
      <ExtractDialog open={extractOpen} onOpenChange={setExtractOpen} account={extractAccount} />

      <LinkInstallmentsDialog open={linkInstallmentsOpen} onOpenChange={setLinkInstallmentsOpen} />
    </div>
    </>
  );
};

/* ===== TRANSFER DIALOG ===== */
function TransferDialog({ open, onOpenChange, accounts, preselectedFrom, onSubmit, isPending, getBalance }: {
  open: boolean; onOpenChange: (v: boolean) => void; accounts: any[]; preselectedFrom: any;
  onSubmit: (data: { fromId: string; toId: string; amount: number; description: string; date: string }) => void; isPending: boolean;
  getBalance: (id: string) => number;
}) {
  const [fromId, setFromId] = useState(preselectedFrom?.id || '');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const fromAccount = accounts.find((a: any) => a.id === fromId);
  const toAccount = accounts.find((a: any) => a.id === toId);
  const parsedAmount = parseCurrencyInput(amount);

  const filteredTo = accounts.filter((a: any) => a.id !== fromId);

  const fromBalance = fromId ? getBalance(fromId) : 0;
  const toBalance = toId ? getBalance(toId) : 0;
  const fromResult = fromBalance - (Number.isFinite(parsedAmount) ? parsedAmount : 0);
  const toResult = toBalance + (Number.isFinite(parsedAmount) ? parsedAmount : 0);

  const handleSubmit = () => {
    if (!fromId || !toId || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast({ title: 'Preencha todos os campos', variant: 'destructive' });
      return;
    }
    onSubmit({ fromId, toId, amount: parsedAmount, description: description || 'Transferencia entre contas', date });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-[28px] p-0 overflow-hidden">
        <div className="bg-gradient-to-r from-gold via-gold-light to-gold p-8 text-white">
          <DialogTitle className="text-2xl font-display text-white tracking-tight">
            Transferencia de {fromAccount?.bank_name || '...'}
          </DialogTitle>
          <p className="text-white/70 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Movimentacao interna de fundos</p>
        </div>
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Conta destino</Label>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Selecionar conta destino" /></SelectTrigger>
              <SelectContent>{filteredTo.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.bank_name} - {a.account_number}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Valor</Label>
              <Input value={amount} onChange={(e) => setAmount(maskCurrencyInput(e.target.value))} className="h-12 rounded-xl font-bold" placeholder="0,00" />
            </div>
          </div>

          {/* Balance preview */}
          {fromId && (
            <div className="border border-border/20 rounded-xl overflow-hidden">
              <div className="grid grid-cols-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 border-b border-border/10">
                <div className="py-2 px-4">Conta</div>
                <div className="py-2 px-4 text-right">Saldo resultante</div>
              </div>
              <div className="grid grid-cols-2 items-center border-b border-border/10 bg-red-50/30">
                <div className="py-3 px-4 flex items-center gap-2">
                  <ArrowUpRight size={14} className="text-red-500" />
                  <span className="font-bold text-sm">{fromAccount?.bank_name}</span>
                </div>
                <div className="py-3 px-4 text-right font-black text-sm text-red-500 tabular-nums">
                  {currencyFmt(fromResult)}
                </div>
              </div>
              {toId && (
                <div className="grid grid-cols-2 items-center bg-emerald-50/30">
                  <div className="py-3 px-4 flex items-center gap-2">
                    <ArrowDownLeft size={14} className="text-emerald-500" />
                    <span className="font-bold text-sm">{toAccount?.bank_name}</span>
                  </div>
                  <div className="py-3 px-4 text-right font-black text-sm text-emerald-600 tabular-nums">
                    {currencyFmt(toResult)}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Comentario</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[60px] rounded-xl" placeholder="Comentario sobre esta transferencia" />
            <p className="text-[9px] text-muted-foreground/60 italic">* Comentarios sao visiveis apenas no extrato consolidado</p>
          </div>
        </div>
        <div className="p-6 pt-0 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl uppercase text-[10px] font-bold tracking-widest">Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending} className="bg-gradient-to-r from-gold to-gold-light text-white font-bold h-11 px-8 rounded-xl uppercase text-[10px] tracking-widest">
            {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRightLeft size={14} className="mr-2" />}
            Gravar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ===== EXTRACT DIALOG ===== */
function ExtractDialog({ open, onOpenChange, account }: { open: boolean; onOpenChange: (v: boolean) => void; account: any }) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  const { data: transactions = [], isLoading: isLoadingTx } = useQuery({
    queryKey: ['extract_transactions', account?.id, dateFrom, dateTo],
    queryFn: async () => {
      if (!account?.id) return [];
      let q = (supabase as any).from('bank_transactions').select('*').eq('bank_account_id', account.id).order('transaction_date', { ascending: false });
      if (dateFrom) q = q.gte('transaction_date', dateFrom);
      if (dateTo) q = q.lte('transaction_date', dateTo);
      const { data, error } = await q;
      if (error) return [];
      return data || [];
    },
    enabled: open && !!account?.id,
  });

  const { data: payables = [], isLoading: isLoadingPay } = useQuery({
    queryKey: ['extract_payables', account?.id, dateFrom, dateTo],
    queryFn: async () => {
      if (!account?.id) return [];
      let q = (supabase as any).from('accounts_payable').select('*, suppliers(company_name)').eq('bank_account_id', account.id).not('paid_at', 'is', null).order('paid_at', { ascending: false });
      if (dateFrom) q = q.gte('paid_at', dateFrom);
      if (dateTo) q = q.lte('paid_at', dateTo);
      const { data, error } = await q;
      if (error) return [];
      return data || [];
    },
    enabled: open && !!account?.id,
  });

  const { data: entryPayments = [], isLoading: isLoadingEntry } = useQuery({
    queryKey: ['extract_entry_payments', account?.id, dateFrom, dateTo],
    queryFn: async () => {
      if (!account?.id) return [];
      let q = (supabase as any).from('payments').select('*, clients(name), events(name)').eq('entry_bank_account_id', account.id).not('entry_paid_at', 'is', null).order('entry_paid_at', { ascending: false });
      if (dateFrom) q = q.gte('entry_paid_at', dateFrom);
      if (dateTo) q = q.lte('entry_paid_at', dateTo);
      const { data, error } = await q;
      if (error) return [];
      return data || [];
    },
    enabled: open && !!account?.id,
  });

  const { data: installmentPayments = [], isLoading: isLoadingInst } = useQuery({
    queryKey: ['extract_installment_payments', account?.id, dateFrom, dateTo],
    queryFn: async () => {
      if (!account?.id) return [];
      let q = (supabase as any).from('payment_installments').select('*, payments(client_id, event_id, clients(name), events(name))').eq('bank_account_id', account.id).not('paid_at', 'is', null).order('paid_at', { ascending: false });
      if (dateFrom) q = q.gte('paid_at', dateFrom);
      if (dateTo) q = q.lte('paid_at', dateTo);
      const { data, error } = await q;
      if (error) return [];
      return data || [];
    },
    enabled: open && !!account?.id,
  });

  const extractRows = useMemo(() => {
    const txRows = transactions.map((t: any) => ({
      id: t.id,
      date: t.transaction_date,
      description: t.description || '---',
      amount: Number(t.amount || 0),
      source: 'transfer' as const,
      transaction_type: t.transaction_type || (Number(t.amount) >= 0 ? 'credito' : 'debito'),
    }));
    const payRows = payables.map((p: any) => ({
      id: `pay-${p.id}`,
      date: p.paid_at || p.due_date,
      description: p.suppliers?.company_name || p.description || 'Pagamento',
      amount: -(Number(p.paid_amount || p.amount || 0)),
      source: 'conta_pagar' as const,
      payment_method: p.payment_method,
      document_number: p.document_number,
      paid_amount: p.paid_amount,
      original_amount: p.amount,
    }));
    const entryRows = entryPayments.map((ep: any) => ({
      id: `entry-${ep.id}`,
      date: ep.entry_paid_at || ep.entry_due_date,
      description: ep.clients?.name || ep.events?.name || 'Recebimento (sinal)',
      amount: Number(ep.entry_paid_amount || ep.entry_amount || 0),
      source: 'recebimento' as const,
      payment_method: ep.entry_payment_method,
    }));
    const instRows = installmentPayments.map((ip: any) => ({
      id: `inst-${ip.id}`,
      date: ip.paid_at || ip.due_date,
      description: ip.payments?.clients?.name || ip.payments?.events?.name || 'Recebimento (parcela)',
      amount: Number(ip.paid_amount || ip.amount || 0),
      source: 'recebimento' as const,
      payment_method: ip.payment_method,
    }));
    const all = [...txRows, ...payRows, ...entryRows, ...instRows];
    all.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return all;
  }, [transactions, payables, entryPayments, installmentPayments]);

  const runningBalance = useMemo(() => {
    const sorted = [...extractRows].sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));
    let running = Number(account?.default_initial_balance || 0);
    const withBalance = sorted.map((t: any) => {
      running += Number(t.amount || 0);
      return { ...t, running_balance: running };
    });
    withBalance.reverse();
    return withBalance;
  }, [extractRows, account]);

  const isLoading = isLoadingTx || isLoadingPay || isLoadingEntry || isLoadingInst;
  const totalCredits = extractRows.filter((t: any) => Number(t.amount) > 0).reduce((sum: number, t: any) => sum + Number(t.amount), 0);
  const totalDebits = extractRows.filter((t: any) => Number(t.amount) < 0).reduce((sum: number, t: any) => sum + Number(t.amount), 0);

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Extrato - ${account?.bank_name}</title>
          <style>
            @page { size: A4; margin: 0; }
            body { font-family: Arial, sans-serif; padding: 30px; color: #333; }
            @media print { body { margin: 12mm; padding: 0; } }
            h1 { font-size: 18px; margin-bottom: 4px; }
            h2 { font-size: 12px; color: #888; margin-top: 0; font-weight: normal; }
            .summary { display: flex; gap: 20px; margin: 20px 0; }
            .summary div { padding: 10px 16px; border: 1px solid #ddd; border-radius: 8px; flex: 1; }
            .summary .label { font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 1px; }
            .summary .value { font-size: 16px; font-weight: bold; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
            th { text-align: left; padding: 8px 10px; border-bottom: 2px solid #333; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #666; }
            td { padding: 8px 10px; border-bottom: 1px solid #eee; }
            .text-right { text-align: right; }
            .positive { color: #16a34a; }
            .negative { color: #dc2626; }
            .badge { display: inline-block; padding: 2px 6px; border-radius: 10px; font-size: 9px; font-weight: bold; text-transform: uppercase; }
            .badge-despesa { background: #fee2e2; color: #dc2626; }
            .badge-recebimento { background: #dbeafe; color: #2563eb; }
            .badge-pix { background: #d1fae5; color: #059669; }
            .badge-cartao { background: #dbeafe; color: #2563eb; }
            .badge-dinheiro { background: #fef3c7; color: #d97706; }
            .badge-doc { background: #fef3c7; color: #d97706; }
            .footer { margin-top: 20px; font-size: 10px; color: #999; text-align: center; }
          </style>
        </head>
        <body>
          <h1>Extrato - ${account?.bank_name}</h1>
          <h2>${account?.account_number}${account?.account_digit ? '-' + account.account_digit : ''} | Saldo inicial: ${currencyFmt(Number(account?.default_initial_balance || 0))}</h2>
          <div class="summary">
            <div><div class="label">Creditos</div><div class="value positive">+ ${currencyFmt(totalCredits)}</div></div>
            <div><div class="label">Debitos</div><div class="value negative">- ${currencyFmt(Math.abs(totalDebits))}</div></div>
            <div><div class="label">Saldo</div><div class="value ${(totalCredits + totalDebits) >= 0 ? 'positive' : 'negative'}">${currencyFmt(totalCredits + totalDebits)}</div></div>
          </div>
          <table>
            <thead>
              <tr><th>Data</th><th>Descricao</th><th>Info</th><th class="text-right">Valor</th><th class="text-right">Saldo</th></tr>
            </thead>
            <tbody>
              ${runningBalance.map((t: any) => `
                <tr>
                  <td>${format(new Date(t.date + 'T12:00:00'), 'dd/MM/yyyy')}</td>
                  <td>${t.description || '---'}</td>
                  <td>
                    ${t.source === 'conta_pagar' ? `
                      <span class="badge badge-despesa">Despesa</span>
                      ${t.payment_method ? `<span class="badge badge-${t.payment_method === 'pix' ? 'pix' : t.payment_method === 'cartao' ? 'cartao' : 'dinheiro'}">${t.payment_method === 'pix' ? 'PIX' : t.payment_method === 'cartao' ? 'Cartao' : 'Dinheiro'}</span>` : ''}
                      ${t.document_number ? `<span class="badge badge-doc">Doc: ${t.document_number}</span>` : ''}
                    ` : t.source === 'recebimento' ? `
                      <span class="badge badge-recebimento">Recebimento</span>
                      ${t.payment_method ? `<span class="badge badge-${t.payment_method === 'pix' ? 'pix' : t.payment_method === 'cartao' ? 'cartao' : 'dinheiro'}">${t.payment_method === 'pix' ? 'PIX' : t.payment_method === 'cartao' ? 'Cartao' : 'Dinheiro'}</span>` : ''}
                    ` : `
                      <span class="badge ${Number(t.amount) >= 0 ? 'badge-pix' : 'badge-despesa'}">${t.transaction_type || (Number(t.amount) >= 0 ? 'credito' : 'debito')}</span>
                    `}
                  </td>
                  <td class="text-right ${Number(t.amount) >= 0 ? 'positive' : 'negative'}" style="font-weight:bold">
                    ${Number(t.amount) >= 0 ? '+' : ''}${currencyFmt(Number(t.amount))}
                  </td>
                  <td class="text-right" style="font-weight:bold">${currencyFmt(t.running_balance)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="footer">David Melo Hub - Extrato gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm')}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] rounded-[28px] p-0 overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-[#1A1A1A] via-[#2A2A2A] to-[#1A1A1A] p-8 text-white">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl font-display text-white tracking-tight flex items-center gap-3">
                <FileText size={24} className="text-gold" /> Extrato da Conta
              </DialogTitle>
              <p className="text-white/60 text-xs mt-2">{account?.bank_name} - {account?.account_number}{account?.account_digit ? `-${account.account_digit}` : ''}</p>
            </div>
            <Button onClick={handlePrint} variant="outline" size="sm" className="border-white/20 text-white hover:bg-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest">
              <Printer size={14} className="mr-2" /> Imprimir
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-4" ref={printRef}>
          {/* Filters */}
          <div className="flex gap-4 items-end">
            <div className="space-y-1 flex-1"><Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">De</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10 rounded-xl text-xs" /></div>
            <div className="space-y-1 flex-1"><Label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Ate</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10 rounded-xl text-xs" /></div>
            <Button variant="outline" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }} className="h-10 rounded-xl text-[9px] font-bold uppercase tracking-widest">Limpar</Button>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
              <p className="text-[8px] font-black uppercase tracking-widest text-blue-400">Creditos</p>
              <p className="text-sm font-black text-blue-600 tabular-nums">{currencyFmt(totalCredits)}</p>
            </div>
            <div className="p-3 rounded-xl bg-red-50 border border-red-100">
              <p className="text-[8px] font-black uppercase tracking-widest text-red-400">Debitos</p>
              <p className="text-sm font-black text-red-500 tabular-nums">{currencyFmt(Math.abs(totalDebits))}</p>
            </div>
            <div className={cn("p-3 rounded-xl border", (totalCredits + totalDebits) >= 0 ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100")}>
              <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/50">Saldo</p>
              <p className={cn("text-sm font-black tabular-nums", (totalCredits + totalDebits) >= 0 ? "text-emerald-600" : "text-red-500")}>{currencyFmt(totalCredits + totalDebits)}</p>
            </div>
          </div>

          {/* Transaction List */}
          {isLoading ? (
            <div className="h-32 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gold" /></div>
          ) : runningBalance.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Nenhuma movimentacao encontrada</div>
          ) : (
            <div className="max-h-[350px] overflow-y-auto border border-border/20 rounded-xl">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-secondary/30 backdrop-blur-sm">
                  <tr>
                    <th className="text-left py-2.5 px-3 font-black text-[9px] uppercase tracking-widest text-muted-foreground/60">Data</th>
                    <th className="text-left py-2.5 px-3 font-black text-[9px] uppercase tracking-widest text-muted-foreground/60">Descricao</th>
                    <th className="text-left py-2.5 px-3 font-black text-[9px] uppercase tracking-widest text-muted-foreground/60">Info</th>
                    <th className="text-right py-2.5 px-3 font-black text-[9px] uppercase tracking-widest text-muted-foreground/60">Valor</th>
                    <th className="text-right py-2.5 px-3 font-black text-[9px] uppercase tracking-widest text-muted-foreground/60">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/10">
                  {runningBalance.map((t: any) => (
                    <tr key={t.id} className="hover:bg-secondary/5 transition-colors">
                      <td className="py-2.5 px-3 font-medium tabular-nums">{format(new Date(t.date + 'T12:00:00'), 'dd/MM/yyyy')}</td>
                      <td className="py-2.5 px-3">{t.description || '---'}</td>
                      <td className="py-2.5 px-3">
                        {t.source === 'conta_pagar' ? (
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[7px] font-bold uppercase bg-red-50 text-red-500">
                              Despesa
                            </span>
                            {t.payment_method && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[7px] font-bold uppercase bg-emerald-50 text-emerald-600">
                                {t.payment_method === 'pix' ? 'PIX' : t.payment_method === 'cartao' ? 'Cartao' : 'Dinheiro'}
                              </span>
                            )}
                            {t.document_number && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[7px] font-bold uppercase bg-amber-50 text-amber-600">
                                Doc: {t.document_number}
                              </span>
                            )}
                          </div>
                        ) : t.source === 'recebimento' ? (
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[7px] font-bold uppercase bg-blue-50 text-blue-600">
                              Recebimento
                            </span>
                            {t.payment_method && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[7px] font-bold uppercase bg-emerald-50 text-emerald-600">
                                {t.payment_method === 'pix' ? 'PIX' : t.payment_method === 'cartao' ? 'Cartao' : 'Dinheiro'}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase", Number(t.amount) >= 0 ? "bg-blue-50 text-blue-600" : "bg-red-50 text-red-500")}>
                            {Number(t.amount) >= 0 ? <ArrowDownLeft size={10} /> : <ArrowUpRight size={10} />}
                            {t.transaction_type || (Number(t.amount) >= 0 ? 'credito' : 'debito')}
                          </span>
                        )}
                      </td>
                      <td className={cn("py-2.5 px-3 text-right font-bold tabular-nums", Number(t.amount) >= 0 ? "text-blue-600" : "text-red-500")}>
                        {Number(t.amount) >= 0 ? '+' : ''}{currencyFmt(Number(t.amount))}
                      </td>
                      <td className={cn("py-2.5 px-3 text-right font-black tabular-nums", t.running_balance >= 0 ? "text-foreground" : "text-red-500")}>
                        {currencyFmt(t.running_balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default BankAccountsPage;
