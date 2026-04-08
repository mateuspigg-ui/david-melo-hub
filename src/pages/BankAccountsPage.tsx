import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Building2, Landmark, Search, MoreVertical, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const BankAccountsPage = () => {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [form, setForm] = useState({
    bank_name: '',
    bank_code: '',
    agency: '',
    account_number: '',
    account_digit: '',
    description: '',
    account_type: 'corrente',
    default_initial_balance: 0,
    accounting_account_id: ''
  });

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['bank_accounts'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('bank_accounts').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, default_initial_balance: Number(form.default_initial_balance) };
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
      toast({ title: 'Sucesso', description: 'Dados bancários atualizados!', style: { backgroundColor: '#C5A059', color: '#fff' } });
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
      toast({ title: 'Removido', description: 'Conta excluída com sucesso.', variant: 'destructive' });
    },
    onError: (e: any) => toast({ title: 'Erro ao excluir', description: e.message, variant: 'destructive' })
  });

  const resetForm = () => {
    setForm({
      bank_name: '', bank_code: '', agency: '', account_number: '',
      account_digit: '', description: '', account_type: 'corrente',
      default_initial_balance: 0, accounting_account_id: ''
    });
  };

  return (
    <div className="p-8 space-y-10 animate-fade-in max-w-[1500px] mx-auto min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 border-b border-border/10 pb-10">
        <div>
          <h1 className="text-4xl font-display text-foreground tracking-tighter uppercase">Contas Bancárias</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold mt-2 opacity-80">Gestão e Custódia de Ativos David Melo</p>
        </div>
        <Button 
          onClick={() => { setEditingAccount(null); resetForm(); setDialogOpen(true); }}
          className="bg-gradient-gold hover:opacity-95 text-white font-black h-12 px-10 rounded-xl shadow-gold uppercase text-[11px] tracking-[0.25em] transition-all duration-300"
        >
          <Plus size={20} className="mr-3" /> Registrar Conta
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {isLoading ? (
          <div className="col-span-full h-64 flex flex-col items-center justify-center text-muted-foreground gap-4 bg-white/50 rounded-[32px] border border-dashed border-border/40">
            <Landmark className="w-12 h-12 animate-pulse opacity-20" />
            <span className="text-[10px] font-black uppercase tracking-widest">Sincronizando Base de Dados...</span>
          </div>
        ) : accounts?.length === 0 ? (
          <div className="col-span-full p-24 text-center bg-white rounded-[32px] border border-dashed border-border/40 premium-shadow relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gold/[0.02] rounded-full -mr-32 -mt-32" />
            <Landmark className="mx-auto h-20 w-20 text-gold/10 mb-6" />
            <h3 className="text-xl font-display text-foreground uppercase tracking-tight">Vazio de Ativos</h3>
            <p className="mt-2 text-muted-foreground text-sm font-medium">Nenhuma instituição financeira vinculada ao hub.</p>
            <Button 
              onClick={() => setDialogOpen(true)}
              className="mt-10 bg-secondary/50 hover:bg-gold hover:text-white text-gold font-black px-10 h-12 rounded-xl border border-gold/20 transition-all uppercase text-[11px] tracking-widest"
            >
              Iniciar Cadastro
            </Button>
          </div>
        ) : accounts?.map((account) => (
          <div key={account.id} className="bg-white premium-shadow rounded-[28px] p-8 border border-border/40 hover:border-gold/30 transition-all duration-500 group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gold/[0.03] rounded-full -mr-16 -mt-16 group-hover:scale-125 transition-transform duration-700" />
            
            <div className="flex justify-between items-start mb-8 relative z-10">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-secondary/30 flex items-center justify-center text-gold group-hover:bg-gold group-hover:text-white transition-all duration-500 shadow-sm">
                  <Building2 size={28} />
                </div>
                <div>
                  <h3 className="font-display text-xl text-foreground tracking-tight uppercase leading-none">{account.bank_name}</h3>
                  <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-2 opacity-60">ID: {account.bank_code || '---'}</p>
                </div>
              </div>
              <Badge variant="outline" 
                className={cn(
                  "px-3 py-1 text-[9px] font-black uppercase tracking-[0.15em] rounded-full",
                  account.status === 'active' ? 'border-emerald-500/20 text-emerald-500 bg-emerald-500/5' : 'border-destructive/20 text-destructive bg-destructive/5'
                )}>
                {account.status === 'active' ? 'Ativo' : 'Offline'}
              </Badge>
            </div>
            
            <div className="grid grid-cols-2 gap-6 p-6 bg-secondary/[0.15] rounded-2xl border border-border/5 relative z-10">
              <div className="space-y-1">
                <p className="text-[9px] uppercase text-muted-foreground font-black tracking-widest opacity-60">Agência</p>
                <p className="text-sm font-black text-foreground">{account.agency}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[9px] uppercase text-muted-foreground font-black tracking-widest opacity-60">Conta & Dígito</p>
                <p className="text-sm font-black text-foreground">{account.account_number}{account.account_digit ? `-${account.account_digit}` : ''}</p>
              </div>
            </div>

            <div className="flex items-center justify-between mt-10 pt-6 border-t border-border/10">
               <div>
                  <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest opacity-40">{account.account_type}</p>
               </div>
               <div className="flex gap-3">
                 <button 
                   onClick={() => {
                     setEditingAccount(account);
                     setForm({
                       bank_name: account.bank_name,
                       bank_code: account.bank_code || '',
                       agency: account.agency,
                       account_number: account.account_number,
                       account_digit: account.account_digit || '',
                       description: account.description || '',
                       account_type: account.account_type || 'corrente',
                       default_initial_balance: account.default_initial_balance || 0,
                       accounting_account_id: account.accounting_account_id || ''
                     });
                     setDialogOpen(true);
                   }}
                   className="w-10 h-10 rounded-xl bg-secondary/40 flex items-center justify-center text-muted-foreground hover:text-gold hover:bg-gold/10 transition-all shadow-sm"
                 >
                   <Search size={18} />
                 </button>
                 <button 
                   onClick={() => {
                     if (window.confirm('Confirmar exclusão desta custódia?')) {
                       deleteMutation.mutate(account.id);
                     }
                   }}
                   className="w-10 h-10 rounded-xl bg-secondary/40 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all shadow-sm"
                 >
                   <Trash2 size={18} />
                 </button>
               </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open && !saveMutation.isPending) setDialogOpen(false); }}>
        <DialogContent className="bg-white border-border/40 text-foreground max-w-2xl rounded-[32px] p-0 overflow-hidden shadow-[0_25px_50px_-12px_rgba(218,165,32,0.15)] font-body">
          <div className="bg-gradient-gold p-10 text-white relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl opacity-50" />
            <DialogHeader>
              <DialogTitle className="text-3xl font-display text-white tracking-tight">
                {editingAccount ? 'Refinar Protocolo' : 'Novo Registro de Custódia'}
              </DialogTitle>
              <p className="text-white/80 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Central de Inteligência David Melo Hub</p>
            </DialogHeader>
          </div>
          
          <div className="p-10 space-y-8 bg-white/50 backdrop-blur-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Instituição Bancária</Label>
                <Input 
                  value={form.bank_name} 
                  onChange={e => setForm({...form, bank_name: e.target.value})} 
                  className="bg-secondary/20 h-12 border-border/10 focus:border-gold rounded-xl font-bold px-4"
                  placeholder="Ex: Itaú, XP, BTG"
                />
              </div>
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Código do Banco</Label>
                <Input 
                  value={form.bank_code} 
                  onChange={e => setForm({...form, bank_code: e.target.value})} 
                  className="bg-secondary/20 h-12 border-border/10 focus:border-gold rounded-xl font-bold px-4"
                  placeholder="Ex: 341, 077"
                />
              </div>

              <div className="grid grid-cols-3 gap-4 md:col-span-2">
                <div className="space-y-3">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Agência</Label>
                  <Input 
                    value={form.agency} 
                    onChange={e => setForm({...form, agency: e.target.value})} 
                    className="bg-secondary/20 h-12 border-border/10 focus:border-gold rounded-xl font-bold text-center"
                    placeholder="0001"
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Número da Conta</Label>
                  <Input 
                    value={form.account_number} 
                    onChange={e => setForm({...form, account_number: e.target.value})} 
                    className="bg-secondary/20 h-12 border-border/10 focus:border-gold rounded-xl font-bold text-center"
                    placeholder="12345"
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Dígito</Label>
                  <Input 
                    value={form.account_digit} 
                    onChange={e => setForm({...form, account_digit: e.target.value})} 
                    className="bg-secondary/20 h-12 border-border/10 focus:border-gold rounded-xl font-bold text-center"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="space-y-3 md:col-span-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Apelido de Identificação</Label>
                <Input 
                  value={form.description} 
                  onChange={e => setForm({...form, description: e.target.value})} 
                  className="bg-secondary/20 h-12 border-border/10 focus:border-gold rounded-xl font-bold px-4"
                  placeholder="Ex: David Melo Hub - Operacional Principal"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Modalidade Contratual</Label>
                <select 
                  value={form.account_type}
                  onChange={e => setForm({...form, account_type: e.target.value})}
                  className="flex h-12 w-full rounded-xl bg-secondary/20 border border-border/10 px-4 py-2 text-xs font-black uppercase tracking-widest focus:border-gold text-foreground outline-none shadow-sm"
                >
                  <option value="corrente">Corrente Executiva</option>
                  <option value="poupanca">Poupança / Reserva</option>
                  <option value="investimento">Investimento Privado</option>
                </select>
              </div>

              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Saldo Inicial Auditoria (R$)</Label>
                <Input 
                  type="number"
                  value={form.default_initial_balance} 
                  onChange={e => setForm({...form, default_initial_balance: Number(e.target.value)})} 
                  className="bg-gold/5 h-12 border-gold/20 focus:border-gold rounded-xl font-display text-xl text-gold text-center"
                />
              </div>

              <div className="space-y-3 md:col-span-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Cód. Integração Contábil (Razão)</Label>
                <Input 
                  value={form.accounting_account_id} 
                  onChange={e => setForm({...form, accounting_account_id: e.target.value})} 
                  className="bg-secondary/20 h-12 border-border/10 focus:border-gold rounded-xl font-mono text-sm px-4"
                  placeholder="Ex: 1.01.02.01.0001"
                />
              </div>
            </div>

            <div className="flex justify-between items-center gap-6 pt-10 border-t border-border/10">
              <Button variant="ghost" onClick={() => setDialogOpen(false)} className="h-12 px-8 text-muted-foreground font-black uppercase text-[10px] tracking-[0.2em] rounded-xl hover:bg-secondary/40">
                Descartar
              </Button>
              <Button 
                onClick={() => saveMutation.mutate()} 
                disabled={saveMutation.isPending}
                className="bg-gradient-gold hover:opacity-95 text-white font-black h-12 px-12 rounded-xl shadow-gold uppercase text-[11px] tracking-[0.25em] transition-all duration-300"
              >
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-3 animate-spin" /> : null}
                Finalizar Protocolo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BankAccountsPage;
