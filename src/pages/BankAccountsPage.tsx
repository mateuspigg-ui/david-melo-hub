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
      const { data, error } = await supabase.from('bank_accounts').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingAccount) {
        const { error } = await supabase.from('bank_accounts').update(form).eq('id', editingAccount.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('bank_accounts').insert([form]);
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
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display text-gold tracking-wide">Contas Bancárias</h1>
          <p className="text-sm text-foreground/60 mt-1 font-body">Gerencie suas contas e saldos para conciliação</p>
        </div>
        <Button 
          onClick={() => { setEditingAccount(null); setDialogOpen(true); }}
          className="bg-gold hover:bg-gold-light text-dark font-medium shadow-gold"
        >
          <Plus className="w-5 h-5 mr-1" /> Nova Conta
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full h-32 flex items-center justify-center">Carregando...</div>
        ) : accounts?.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-dark-surface rounded-xl border border-border/30">
            <Landmark className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-muted-foreground">Nenhuma conta cadastrada</p>
          </div>
        ) : accounts?.map((account) => (
          <div key={account.id} className="glass-card bg-dark-card rounded-xl p-5 border border-border/30 hover:border-gold/50 transition-all shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gold/10 flex items-center justify-center text-gold">
                  <Building2 size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-foreground">{account.bank_name}</h3>
                  <p className="text-xs text-muted-foreground">{account.description || 'Sem descrição'}</p>
                </div>
              </div>
              <Badge variant={account.status === 'active' ? 'outline' : 'destructive'} className={account.status === 'active' ? 'border-green-500 text-green-500' : ''}>
                {account.status === 'active' ? 'Ativa' : 'Inativa'}
              </Badge>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm mt-4 p-3 bg-dark-surface/50 rounded-lg">
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Agência</Label>
                <p className="font-medium">{account.agency}</p>
              </div>
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Conta</Label>
                <p className="font-medium">{account.account_number}</p>
              </div>
            </div>

            <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/10">
               <span className="text-xs text-muted-foreground">Tipo: {account.account_type}</span>
               <div className="flex gap-2">
                 <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-gold" onClick={() => {
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
                   <Search size={16} />
                 </Button>
               </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-dark border-border/30 text-foreground">
          <DialogHeader>
            <DialogTitle className="text-xl font-display text-gold">
              {editingAccount ? 'Editar Conta' : 'Nova Conta Bancária'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome do Banco / Instituição</Label>
              <Input 
                value={form.bank_name} 
                onChange={e => setForm({...form, bank_name: e.target.value})} 
                className="bg-dark-surface border-border/40 focus:border-gold"
                placeholder="Ex: Itaú, Nubank, Banco do Brasil"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Agência</Label>
                <Input 
                  value={form.agency} 
                  onChange={e => setForm({...form, agency: e.target.value})} 
                  className="bg-dark-surface border-border/40 focus:border-gold"
                />
              </div>
              <div className="space-y-2">
                <Label>Conta</Label>
                <Input 
                  value={form.account_number} 
                  onChange={e => setForm({...form, account_number: e.target.value})} 
                  className="bg-dark-surface border-border/40 focus:border-gold"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descrição / Apelido</Label>
              <Input 
                value={form.description} 
                onChange={e => setForm({...form, description: e.target.value})} 
                className="bg-dark-surface border-border/40 focus:border-gold"
                placeholder="Ex: Conta Principal - David Melo"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Conta</Label>
              <select 
                value={form.account_type}
                onChange={e => setForm({...form, account_type: e.target.value})}
                className="flex h-10 w-full rounded-md bg-dark-surface border border-border/40 px-3 py-2 text-sm focus:border-gold text-foreground outline-none"
              >
                <option value="corrente">Conta Corrente</option>
                <option value="poupanca">Poupança</option>
                <option value="investimento">Investimento</option>
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-border/40 bg-dark-surface hover:bg-dark-surface/80">Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} className="bg-gold hover:bg-gold-light text-dark font-medium">Salvar Conta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BankAccountsPage;
