import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Link, Unlink, CheckCircle2, Loader2 } from 'lucide-react';

const currencyFmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type UnlinkedInstallment = {
  id: string;
  payment_id: string;
  installment_number: number;
  installment_count: number;
  due_date: string;
  amount: number;
  paid_at: string | null;
  client_name: string;
  event_name: string;
  selected_bank_account: string | null;
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartao',
  transferencia: 'Transferencia',
};

const PAYMENT_METHOD_BADGE: Record<string, string> = {
  pix: 'bg-blue-50 text-blue-600 border-blue-200',
  dinheiro: 'bg-amber-50 text-amber-700 border-amber-200',
  cartao_credito: 'bg-purple-50 text-purple-600 border-purple-200',
  transferencia: 'bg-slate-100 text-slate-600 border-slate-200',
};


export const LinkInstallmentsDialog = ({ open, onOpenChange }: Props) => {
  const qc = useQueryClient();
  const [bulkAccountId, setBulkAccountId] = useState<string>('');
  const [localChanges, setLocalChanges] = useState<Record<string, string>>({});

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bank_accounts_select_link'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('bank_accounts')
        .select('id, bank_name, account_number, account_digit')
        .eq('status', 'active')
        .order('bank_name');
      return data || [];
    },
  });

  const { data: unlinkedInstallments = [], isLoading } = useQuery({
    queryKey: ['unlinked_installments'],
    queryFn: async () => {
      const { data: installments, error } = await (supabase as any)
        .from('payment_installments')
        .select('id, payment_id, installment_number, due_date, amount, paid_at, bank_account_id')
        .not('paid_at', 'is', null)
        .is('bank_account_id', null)
        .order('due_date', { ascending: false });
      if (error) throw error;
      if (!installments?.length) return [];

      const paymentIds = [...new Set(installments.map((i: any) => i.payment_id as string))] as string[];
      const { data: payments } = await supabase
        .from('payments')
        .select('id, client_id, event_id, installment_count, clients(id, first_name, last_name), events(id, title)')
        .in('id', paymentIds);

      const paymentMap = new Map((payments || []).map((p: any) => [p.id, p]));

      return installments.map((inst: any) => {
        const payment = paymentMap.get(inst.payment_id);
        const client = payment?.clients;
        const event = payment?.events;
        return {
          ...inst,
          installment_count: payment?.installment_count || 0,
          client_name: client ? `${client.first_name || ''} ${client.last_name || ''}`.trim() : '---',
          event_name: event?.title || '---',
          selected_bank_account: null,
        };
      });
    },
  });

  const effectiveInstallments = useMemo(() => {
    return unlinkedInstallments.map((inst: any) => ({
      ...inst,
      selected_bank_account: localChanges[inst.id] || inst.selected_bank_account,
    }));
  }, [unlinkedInstallments, localChanges]);

  const handleSelectAccount = (installmentId: string, accountId: string) => {
    setLocalChanges(prev => ({ ...prev, [installmentId]: accountId }));
  };

  const handleBulkAssign = () => {
    if (!bulkAccountId) return;
    const updates: Record<string, string> = {};
    for (const inst of effectiveInstallments) {
      updates[inst.id] = bulkAccountId;
    }
    setLocalChanges(prev => ({ ...prev, ...updates }));
    setBulkAccountId('');
    toast({
      title: 'Conta atribuida',
      description: `${Object.keys(updates).length} parcelas vinculadas a conta selecionada.`,
      style: { backgroundColor: '#C5A059', color: '#fff' },
    });
  };

  const changedCount = Object.keys(localChanges).length;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates = Object.entries(localChanges);
      const results = await Promise.allSettled(
        updates.map(([id, bankAccountId]) =>
          (supabase as any)
            .from('payment_installments')
            .update({ bank_account_id: bankAccountId || null })
            .eq('id', id)
        )
      );
      const errors = results.filter(r => r.status === 'rejected');
      if (errors.length > 0) {
        throw new Error(`${errors.length} parcelas falharam ao salvar.`);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank_accounts_installment_payments'] });
      qc.invalidateQueries({ queryKey: ['bank_accounts_installment_payments', undefined] });
      qc.invalidateQueries({ queryKey: ['payment_installments_all'] });
      qc.invalidateQueries({ queryKey: ['unlinked_installments'] });
      setLocalChanges({});
      onOpenChange(false);
      toast({
        title: 'Vinculacao concluida',
        description: 'Parcelas vinculadas às contas bancarias com sucesso.',
        style: { backgroundColor: '#C5A059', color: '#fff' },
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao vincular',
        description: error.message || 'Nao foi possivel vincular as parcelas.',
        variant: 'destructive',
      });
    },
  });

  const accountLabel = (id: string) => {
    if (id === '__cash__') return 'Espécie (Dinheiro)';
    const acc = bankAccounts.find((a: any) => a.id === id);
    if (!acc) return id;
    return `${acc.bank_name} ${acc.account_number}${acc.account_digit ? '-' + acc.account_digit : ''}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-display">
            <Link size={20} className="text-gold" />
            Vincular Parcelas as Contas Bancarias
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground gap-3">
              <Loader2 className="animate-spin" size={20} />
              Carregando parcelas...
            </div>
          ) : effectiveInstallments.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-4 py-12">
              <CheckCircle2 size={48} className="text-emerald-400" />
              <p className="text-sm font-bold">Todas as parcelas pagas ja estao vinculadas a uma conta bancaria.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 p-4 bg-secondary/30 rounded-xl border border-border/30">
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Atribuicao em massa:</span>
                <Select value={bulkAccountId} onValueChange={setBulkAccountId}>
                  <SelectTrigger className="flex-1 h-10 bg-white border-border/40">
                    <SelectValue placeholder="Selecionar conta para todas..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__cash__">Espécie (Dinheiro)</SelectItem>
                    {bankAccounts.map((acc: any) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.bank_name} {acc.account_number}{acc.account_digit ? '-' + acc.account_digit : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkAssign}
                  disabled={!bulkAccountId}
                  className="border-gold/40 text-gold hover:bg-gold hover:text-white uppercase text-[10px] tracking-widest font-black"
                >
                  Aplicar a Todas
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto border border-border/30 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-border/20">
                      <th className="text-left py-3 px-4 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Cliente</th>
                      <th className="text-left py-3 px-4 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Evento</th>
                      <th className="text-center py-3 px-4 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Parcela</th>
                      <th className="text-left py-3 px-4 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Vencimento</th>
                      <th className="text-left py-3 px-4 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Pgto</th>
                      <th className="text-right py-3 px-4 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Valor</th>
                      <th className="text-left py-3 px-4 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em] min-w-[200px]">Conta Bancaria</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/10">
                    {effectiveInstallments.map((inst: any) => {
                      const hasChange = !!localChanges[inst.id];
                      return (
                        <tr key={inst.id} className={cn("transition-colors", hasChange && "bg-gold/5")}>
                          <td className="py-3 px-4 font-bold text-xs">{inst.client_name}</td>
                          <td className="py-3 px-4 text-xs text-muted-foreground">{inst.event_name}</td>
                          <td className="py-3 px-4 text-center">
                            <Badge variant="outline" className="text-[10px] border-gold/30 text-gold bg-gold/5">
                              {inst.installment_number}{inst.installment_count ? `/${inst.installment_count}` : ''}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-xs text-muted-foreground">
                            {format(new Date(inst.due_date), 'dd/MM/yy')}
                          </td>
                          <td className="py-3 px-4 text-xs text-muted-foreground">
                            {inst.paid_at ? format(new Date(inst.paid_at), 'dd/MM/yy') : '---'}
                          </td>
                          <td className="py-3 px-4 text-right text-xs font-bold tabular-nums">
                            {currencyFmt(inst.amount)}
                          </td>
                          <td className="py-3 px-4">
                            <Select
                              value={inst.selected_bank_account || ''}
                              onValueChange={(val) => handleSelectAccount(inst.id, val)}
                            >
                              <SelectTrigger className={cn(
                                "h-8 text-[11px] border",
                                inst.selected_bank_account
                                  ? "border-emerald-300 bg-emerald-50/50"
                                  : "border-border/40 bg-white"
                              )}>
                                <SelectValue placeholder="Selecionar..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__cash__" className="text-[11px]">Espécie (Dinheiro)</SelectItem>
                                {bankAccounts.map((acc: any) => (
                                  <SelectItem key={acc.id} value={acc.id} className="text-[11px]">
                                    {acc.bank_name} {acc.account_number}{acc.account_digit ? '-' + acc.account_digit : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="border-t border-border/20 pt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground uppercase text-[10px] tracking-widest font-black">
            Cancelar
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={changedCount === 0 || saveMutation.isPending}
            className="bg-gradient-gold hover:opacity-90 text-white font-bold h-10 px-8 rounded-xl shadow-gold uppercase text-[11px] tracking-widest"
          >
            {saveMutation.isPending ? (
              <><Loader2 className="animate-spin mr-2" size={14} /> Salvando...</>
            ) : (
              <>Salvar {changedCount > 0 ? `(${changedCount})` : ''}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
