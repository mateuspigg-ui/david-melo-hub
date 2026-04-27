import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Search, Building2, Phone, Instagram, Wallet, Trash2, LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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
    <div className="space-y-12 animate-fade-in max-w-[1700px] mx-auto pb-12">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 px-2">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 bg-gold rounded-full" />
            <h1 className="text-4xl md:text-5xl font-display text-foreground tracking-tighter uppercase leading-none">Rede de Parceiros</h1>
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.4em] text-gold/80 pl-4">David Melo Produções • Gestão de Fornecedores Estratégicos</p>
        </div>
        <Button 
          onClick={() => { setEditingSupplier(null); resetForm(); setDialogOpen(true); }}
          className="bg-gradient-gold hover:opacity-90 text-white font-bold h-14 px-10 rounded-2xl shadow-gold uppercase text-[11px] tracking-[0.2em] transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus size={20} className="mr-3" /> Novo Parceiro
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-2">
        {/* Search */}
        <div className="relative group max-w-xl flex-1">
          <Search size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-gold transition-colors z-10" />
          <Input 
            placeholder="Buscar parceiros por nome ou categoria..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-14 bg-white/50 backdrop-blur-sm border-border/30 focus:border-gold/50 h-14 rounded-2xl transition-all focus:ring-4 focus:ring-gold/5 premium-shadow text-sm font-medium"
          />
        </div>

        <div className="flex items-center gap-2 bg-white/30 backdrop-blur-md p-1.5 rounded-2xl border border-border/10 shadow-sm">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setViewMode('cards')}
            className={cn(
              "h-10 px-4 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all",
              viewMode === 'cards' ? 'bg-white text-gold shadow-sm border border-gold/10' : 'text-muted-foreground/60 hover:text-gold hover:bg-gold/5'
            )}
          >
            <LayoutGrid size={14} className="mr-2" /> Cards
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setViewMode('list')}
            className={cn(
              "h-10 px-4 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all",
              viewMode === 'list' ? 'bg-white text-gold shadow-sm border border-gold/10' : 'text-muted-foreground/60 hover:text-gold hover:bg-gold/5'
            )}
          >
            <List size={14} className="mr-2" /> Lista
          </Button>
        </div>
      </div>

      {/* Content Area */}
      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 px-2">
          {isLoading ? (
            <div className="col-span-full h-64 bg-white/30 backdrop-blur-md rounded-[40px] border border-border/10 flex items-center justify-center animate-pulse">
              <div className="flex flex-col items-center gap-4">
                <Building2 className="w-12 h-12 text-gold/20" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold/40">Sincronizando Rede...</p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="col-span-full bg-white/40 backdrop-blur-md rounded-[40px] p-24 border border-border/20 text-center flex flex-col items-center justify-center premium-shadow">
              <div className="w-20 h-20 rounded-3xl bg-secondary/30 flex items-center justify-center mb-6">
                <Building2 size={40} className="text-muted-foreground/30" />
              </div>
              <h3 className="text-2xl font-display text-foreground uppercase tracking-tight">Nenhum parceiro encontrado</h3>
              <p className="text-xs text-muted-foreground/60 mt-2 font-black uppercase tracking-widest max-w-xs leading-relaxed">
                {search ? 'Nenhum resultado para sua busca. Tente novos termos.' : 'Sua rede de fornecedores está vazia. Comece a cadastrar seus parceiros.'}
              </p>
            </div>
          ) : filtered.map((s: any) => (
            <div 
              key={s.id} 
              className="group relative bg-white rounded-[32px] p-8 border border-border/30 premium-shadow transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-gold/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
              
              <div className="relative z-10 flex flex-col h-full gap-8">
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 rounded-2xl bg-gold/10 flex items-center justify-center text-gold border border-gold/10 group-hover:bg-gold group-hover:text-white group-hover:rotate-6 transition-all duration-500 shadow-sm shrink-0">
                    <Building2 size={24} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xl font-display text-foreground tracking-tight uppercase group-hover:text-gold transition-colors truncate">{s.company_name}</h3>
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40 mt-1">Parceiro Homologado</p>
                  </div>
                </div>

                <div className="space-y-4 flex-1">
                  <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors group/item">
                    <div className="w-8 h-8 rounded-lg bg-secondary/30 flex items-center justify-center shrink-0 group-hover/item:bg-gold/10 group-hover/item:text-gold transition-colors">
                      <Phone size={14} />
                    </div>
                    <span className="truncate tracking-wide">{s.phone || '—'}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors group/item">
                    <div className="w-8 h-8 rounded-lg bg-secondary/30 flex items-center justify-center shrink-0 group-hover/item:bg-gold/10 group-hover/item:text-gold transition-colors">
                      <Instagram size={14} />
                    </div>
                    <span className="truncate lowercase">@{s.instagram || '—'}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors group/item">
                    <div className="w-8 h-8 rounded-lg bg-secondary/30 flex items-center justify-center shrink-0 group-hover/item:bg-gold/10 group-hover/item:text-gold transition-colors">
                      <Wallet size={14} />
                    </div>
                    <span className="truncate tracking-widest opacity-60 uppercase">{s.pix_details || '—'}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-6 border-t border-border/10">
                  <Button variant="ghost" size="sm" 
                    onClick={() => { setEditingSupplier(s); setForm({ ...s }); setDialogOpen(true); }}
                    className="text-[10px] font-black uppercase tracking-widest text-gold hover:bg-gold/10 rounded-xl px-4"
                  >
                    Ajustar Perfil
                  </Button>
                  <Button variant="ghost" size="icon" 
                    onClick={() => { if(window.confirm('Excluir este parceiro?')) deleteMutation.mutate(s.id); }}
                    className="h-10 w-10 text-muted-foreground/30 hover:text-rose-500 hover:bg-rose-50 rounded-xl"
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
