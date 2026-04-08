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
    agency: '',
    account_number: '',
    description: '',
    account_type: 'corrente',
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
      if (editingAccount) {
        const { error } = await (supabase as any).from('bank_accounts').update(form).eq('id', editingAccount.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('bank_accounts').insert([form]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank_accounts'] });
      setDialogOpen(false);
      setEditingAccount(null);
      setForm({ bank_name: '', agency: '', account_number: '', description: '', account_type: 'corrente' });
      toast({ title: 'Sucesso', description: 'Conta bancária salva com sucesso!' });
    },
    onError: (error: any) => toast({ title: 'Erro', description: error.message, variant: 'destructive' })
  });

  return (
    <div className="p-6 space-y-8 animate-fade-in max-w-[1400px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display text-foreground tracking-tight">Contas Bancárias</h1>
          <p className="text-sm text-muted-foreground mt-1 font-body">Gerencie suas contas e saldos para conciliação</p>
        </div>
        <Button 
          onClick={() => { setEditingAccount(null); setDialogOpen(true); }}
          className="bg-gradient-gold hover:opacity-90 text-white font-semibold shadow-gold px-6 h-11 rounded-lg transition-all"
        >
          <Plus className="w-5 h-5 mr-2" /> Nova Conta
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full h-32 flex items-center justify-center text-muted-foreground font-medium">Carregando...</div>
        ) : accounts?.length === 0 ? (
          <div className="col-span-full p-20 text-center bg-card rounded-2xl border border-dashed border-border/60 premium-shadow">
            <Landmark className="mx-auto h-16 w-16 text-muted-foreground/20" />
            <p className="mt-4 text-muted-foreground font-medium">Nenhuma conta cadastrada</p>
            <Button 
              variant="outline" 
              onClick={() => setDialogOpen(true)}
              className="mt-6 border-gold text-gold hover:bg-gold/5"
            >
              Começar agora
            </Button>
          </div>
        ) : accounts?.map((account) => (
          <div key={account.id} className="bg-card premium-shadow rounded-2xl p-6 border border-border/40 hover:border-gold/30 transition-all group">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center text-gold group-hover:bg-gold group-hover:text-white transition-all duration-300">
                  <Building2 size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-foreground leading-tight">{account.bank_name}</h3>
                  <p className="text-xs text-muted-foreground font-medium">{account.description || 'Conta Padrão'}</p>
                </div>
              </div>
              <Badge variant={account.status === 'active' ? 'outline' : 'destructive'} 
                className={cn(
                  "px-2 px-1 text-[10px] font-bold uppercase tracking-wider",
                  account.status === 'active' ? 'border-success/30 text-success bg-success/5' : ''
                )}>
                {account.status === 'active' ? 'Ativa' : 'Inativa'}
              </Badge>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm mt-6 p-4 bg-secondary/30 rounded-xl border border-border/10">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-widest">Agência</Label>
                <p className="font-bold text-foreground">{account.agency}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-widest">Conta</Label>
                <p className="font-bold text-foreground">{account.account_number}</p>
              </div>
            </div>

            <div className="flex items-center justify-between mt-6 pt-5 border-t border-border/10">
               <div className="flex items-center gap-2">
                 <Badge variant="secondary" className="bg-secondary/50 text-muted-foreground text-[10px] uppercase font-bold">
                   {account.account_type}
                 </Badge>
               </div>
               <div className="flex gap-2">
                 <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-gold hover:bg-gold/5 transition-all" onClick={() => {
                   setEditingAccount(account);
                   setForm({
                     bank_name: account.bank_name,
                     agency: account.agency,
                     account_number: account.account_number,
                     description: account.description || '',
                     account_type: account.account_type || 'corrente',
                   });
                   setDialogOpen(true);
                 }}>
                   <Search size={18} />
                 </Button>
                 <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-all">
                   <Trash2 size={18} />
                 </Button>
               </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-background border-border/40 text-foreground max-w-lg rounded-2xl p-0 overflow-hidden shadow-2xl font-body">
          <div className="bg-gradient-gold p-8 text-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-display text-white">
                {editingAccount ? 'Editar Conta' : 'Nova Conta Bancária'}
              </DialogTitle>
              <p className="text-white/80 text-sm">Preencha os dados abaixo para vincular sua conta ao hub.</p>
            </DialogHeader>
          </div>
          
          <div className="p-8 space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Instituição Financeira</Label>
              <Input 
                value={form.bank_name} 
                onChange={e => setForm({...form, bank_name: e.target.value})} 
                className="bg-secondary/30 h-11 border-border/40 focus:border-gold"
                placeholder="Ex: Itaú, Nubank, Safra"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Agência</Label>
                <Input 
                  value={form.agency} 
                  onChange={e => setForm({...form, agency: e.target.value})} 
                  className="bg-secondary/30 h-11 border-border/40 focus:border-gold"
                  placeholder="0001"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Conta</Label>
                <Input 
                  value={form.account_number} 
                  onChange={e => setForm({...form, account_number: e.target.value})} 
                  className="bg-secondary/30 h-11 border-border/40 focus:border-gold"
                  placeholder="12345-6"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Apelido da Conta</Label>
              <Input 
                value={form.description} 
                onChange={e => setForm({...form, description: e.target.value})} 
                className="bg-secondary/30 h-11 border-border/40 focus:border-gold"
                placeholder="Ex: David Melo Hub - PJ"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Tipo de Conta</Label>
              <select 
                value={form.account_type}
                onChange={e => setForm({...form, account_type: e.target.value})}
                className="flex h-11 w-full rounded-md bg-secondary/30 border border-border/40 px-3 py-2 text-sm focus:border-gold text-foreground outline-none transition-all"
              >
                <option value="corrente">Conta Corrente</option>
                <option value="poupanca">Poupança</option>
                <option value="investimento">Investimento</option>
              </select>
            </div>
          </div>

          <div className="p-8 bg-secondary/10 border-t border-border/20 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDialogOpen(false)} className="text-muted-foreground font-bold uppercase text-[11px] tracking-widest">Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} className="bg-gold hover:bg-gold-light text-white font-bold h-11 px-8 rounded-lg shadow-gold uppercase text-[11px] tracking-widest">Salvar Conta</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BankAccountsPage;
