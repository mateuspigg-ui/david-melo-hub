import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Search, Building2, Phone, Instagram, Wallet, Trash2, LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

export default function FornecedoresPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [form, setForm] = useState({
    company_name: '',
    phone: '',
    pix_details: '',
    instagram: ''
  });

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('*').order('company_name');
      if (error) throw error;
      return data;
    }
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingSupplier) {
        const { error } = await supabase.from('suppliers').update(form).eq('id', editingSupplier.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('suppliers').insert([form]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      setDialogOpen(false);
      resetForm();
      toast({ title: 'Sucesso', description: 'Dados do fornecedor atualizados!', style: { backgroundColor: '#C5A059', color: '#fff' } });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' })
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('suppliers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast({ title: 'Removido', description: 'Fornecedor excluído.', variant: 'destructive' });
    }
  });

  const resetForm = () => setForm({ company_name: '', phone: '', pix_details: '', instagram: '' });

  const filtered = useMemo(() => {
    return suppliers
      .filter((s: any) => s.company_name.toLowerCase().includes(search.toLowerCase()))
      .sort((a: any, b: any) => String(a.company_name || '').localeCompare(String(b.company_name || ''), 'pt-BR', { sensitivity: 'base' }));
  }, [suppliers, search]);

  return (
    <div className="p-8 space-y-10 animate-fade-in max-w-[1600px] mx-auto min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 border-b border-border/10 pb-10">
        <div>
          <h1 className="text-4xl font-display text-foreground tracking-tighter uppercase">Gestão de Fornecedores</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold mt-2 opacity-80">Parceiros Estratégicos David Melo Hub</p>
        </div>
        <Button 
          onClick={() => { setEditingSupplier(null); resetForm(); setDialogOpen(true); }}
          className="bg-gradient-gold hover:opacity-95 text-white font-black h-12 px-10 rounded-xl shadow-gold uppercase text-[11px] tracking-[0.25em] transition-all duration-300"
        >
          <Plus size={20} className="mr-3" /> Novo Parceiro
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input 
          placeholder="Buscar parceiros..." 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
          className="pl-11 bg-white border-border/40 focus:border-gold h-12 rounded-xl premium-shadow" 
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={viewMode === 'cards' ? 'default' : 'outline'}
          onClick={() => setViewMode('cards')}
          className={`h-10 px-4 rounded-xl font-bold uppercase text-[10px] tracking-widest ${viewMode === 'cards' ? 'bg-gradient-gold text-white' : 'border-border/30'}`}
        >
          <LayoutGrid size={14} className="mr-2" /> Cards
        </Button>
        <Button
          type="button"
          variant={viewMode === 'list' ? 'default' : 'outline'}
          onClick={() => setViewMode('list')}
          className={`h-10 px-4 rounded-xl font-bold uppercase text-[10px] tracking-widest ${viewMode === 'list' ? 'bg-gradient-gold text-white' : 'border-border/30'}`}
        >
          <List size={14} className="mr-2" /> Lista
        </Button>
      </div>

      {viewMode === 'cards' ? (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {isLoading ? (
          <div className="col-span-full h-32 flex items-center justify-center animate-pulse text-gold uppercase tracking-widest text-[10px] font-black">Carregando Parceiros...</div>
        ) : filtered.map((s: any) => (
          <div key={s.id} className="bg-white premium-shadow rounded-[28px] p-8 border border-border/40 hover:border-gold/30 transition-all duration-500 group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gold/[0.03] rounded-full -mr-16 -mt-16 group-hover:scale-125 transition-transform duration-700" />
            <div className="flex flex-col h-full gap-6">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-secondary/30 flex items-center justify-center text-gold group-hover:bg-gold group-hover:text-white transition-all duration-500 shadow-sm">
                  <Building2 size={28} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-xl text-foreground tracking-tight uppercase truncate">{s.company_name}</h3>
                  <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-1 opacity-60">Parceiro Hub</p>
                </div>
              </div>

              <div className="space-y-4 p-5 bg-secondary/[0.15] rounded-2xl border border-border/5">
                <div className="flex items-center gap-3">
                  <Phone size={14} className="text-gold" />
                  <span className="text-xs font-bold text-foreground">{s.phone || '---'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Instagram size={14} className="text-gold" />
                  <span className="text-xs font-bold text-foreground">@{s.instagram || '---'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Wallet size={14} className="text-gold" />
                  <span className="text-[10px] font-black text-muted-foreground uppercase truncate tracking-tight">{s.pix_details || '---'}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border/10">
                <Button variant="ghost" size="sm" 
                  onClick={() => { setEditingSupplier(s); setForm({ ...s }); setDialogOpen(true); }}
                  className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-gold"
                >
                  Editar Dados
                </Button>
                <Button variant="ghost" size="icon" 
                  onClick={() => { if(window.confirm('Excluir este parceiro?')) deleteMutation.mutate(s.id); }}
                  className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      ) : (
        <div className="bg-white premium-shadow rounded-2xl border border-border/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/10 border-b border-border/20">
                  <th className="text-left py-4 px-6 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Fornecedor</th>
                  <th className="text-left py-4 px-6 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Telefone</th>
                  <th className="text-left py-4 px-6 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Instagram</th>
                  <th className="text-left py-4 px-6 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">PIX</th>
                  <th className="text-right py-4 px-6 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/10">
                {filtered.map((s: any) => (
                  <tr key={s.id} className="hover:bg-secondary/5 transition-colors">
                    <td className="py-4 px-6 font-bold">{s.company_name}</td>
                    <td className="py-4 px-6 text-sm">{s.phone || '---'}</td>
                    <td className="py-4 px-6 text-sm">{s.instagram ? `@${s.instagram}` : '---'}</td>
                    <td className="py-4 px-6 text-xs text-muted-foreground uppercase">{s.pix_details || '---'}</td>
                    <td className="py-4 px-6">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => { setEditingSupplier(s); setForm({ ...s }); setDialogOpen(true); }} className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-gold">Editar</Button>
                        <Button variant="ghost" size="icon" onClick={() => { if(window.confirm('Excluir este parceiro?')) deleteMutation.mutate(s.id); }} className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-white border-border/40 text-foreground max-w-md max-h-[90vh] rounded-[32px] p-0 overflow-hidden shadow-2xl font-body flex flex-col">
          <div className="bg-gradient-gold p-10 text-white relative">
            <DialogHeader>
              <DialogTitle className="text-3xl font-display text-white tracking-tight">Cadastro de Parceiro</DialogTitle>
              <p className="text-white/80 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Ecossistema Operacional David Melo</p>
            </DialogHeader>
          </div>
          <div className="p-6 md:p-10 space-y-6 overflow-y-auto min-h-0">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Razão Social / Nome</Label>
                <Input value={form.company_name} onChange={e => setForm({...form, company_name: e.target.value})} className="h-12 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Contato (WhatsApp)</Label>
                <Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="h-12 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Identificador Instagram</Label>
                <Input value={form.instagram} onChange={e => setForm({...form, instagram: e.target.value})} className="h-12 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Dados de Faturamento (PIX)</Label>
                <textarea 
                  value={form.pix_details} 
                  onChange={e => setForm({...form, pix_details: e.target.value})} 
                  className="w-full h-24 bg-secondary/20 border border-border/10 focus:border-gold rounded-xl font-bold p-4 text-sm" 
                />
              </div>
            </div>
            <div className="flex justify-between items-center pt-6 border-t border-border/10 gap-4">
              <Button variant="ghost" onClick={() => setDialogOpen(false)} className="text-[10px] font-black uppercase tracking-widest">Cancelar</Button>
              <Button onClick={() => saveMutation.mutate()} className="bg-gradient-gold text-white font-black h-12 px-10 rounded-xl shadow-gold uppercase text-[11px] tracking-widest">Finalizar Cadastro</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
