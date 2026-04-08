import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Plus, Search, Phone, Mail, Instagram, Pencil, Trash2, User } from 'lucide-react';

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  created_at: string;
}

const emptyForm = { first_name: '', last_name: '', phone: '', email: '', instagram: '' };

const ClientesPage = () => {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyForm);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Client[];
    },
  });

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        first_name: form.first_name,
        last_name: form.last_name,
        phone: form.phone || null,
        email: form.email || null,
        instagram: form.instagram || null,
      };
      if (editingClient) {
        const { error } = await supabase.from('clients').update(payload).eq('id', editingClient.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clients').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      toast({ title: editingClient ? 'Cliente atualizado!' : 'Cliente criado!' });
      closeDialog();
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      toast({ title: 'Cliente removido!' });
      setDeleteId(null);
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingClient(null);
    setForm(emptyForm);
  };

  const openEdit = (c: Client) => {
    setEditingClient(c);
    setForm({
      first_name: c.first_name,
      last_name: c.last_name,
      phone: c.phone || '',
      email: c.email || '',
      instagram: c.instagram || '',
    });
    setDialogOpen(true);
  };

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      (c.email?.toLowerCase().includes(q) ?? false) ||
      (c.phone?.includes(q) ?? false)
    );
  });

  return (
    <div className="p-8 space-y-10 animate-fade-in max-w-[1600px] mx-auto min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-8 border-b border-border/10 pb-10">
        <div>
          <h1 className="text-4xl font-display text-foreground tracking-tighter uppercase whitespace-nowrap">Base de Clientes</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold mt-2 opacity-80">David Melo Produções • Gestão de Relacionamento</p>
        </div>
        <Button
          onClick={() => { setForm(emptyForm); setEditingClient(null); setDialogOpen(true); }}
          className="bg-gradient-gold hover:opacity-95 text-white font-black h-12 px-10 rounded-xl shadow-gold uppercase text-[11px] tracking-[0.25em] transition-all duration-300"
        >
          <Plus size={20} className="mr-3" /> Novo Cliente
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-xl group">
        <div className="absolute -inset-1 bg-gradient-gold opacity-0 group-focus-within:opacity-10 rounded-2xl blur transition duration-500" />
        <Search size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-gold transition-colors" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, email ou telefone..."
          className="pl-14 bg-white border-border/10 focus:border-gold h-14 rounded-2xl shadow-sm text-sm font-medium relative z-10"
        />
      </div>

      {/* Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card premium-shadow rounded-2xl p-6 border border-border/40 animate-pulse h-52" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card premium-shadow rounded-2xl p-20 border border-border/40 text-center flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
            <User size={32} className="text-muted-foreground/30" />
          </div>
          <p className="text-foreground font-bold text-lg mb-1">
            {search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
          </p>
          <p className="text-sm text-muted-foreground/60 mb-6 font-medium">
            {search ? 'Tente outros termos de busca.' : 'Comece cadastrando seu primeiro cliente.'}
          </p>
          {!search && (
            <Button variant="outline" onClick={() => setDialogOpen(true)} className="border-gold text-gold hover:bg-gold/5 font-bold uppercase text-[10px] tracking-widest">
              Cadastrar Agora
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="bg-card premium-shadow rounded-2xl p-6 border border-border/40 hover:border-gold/30 hover:-translate-y-1 transition-all duration-300 group"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center shrink-0 border border-gold/10 group-hover:bg-gold group-hover:text-white transition-all duration-300">
                    <span className="text-sm font-bold uppercase tracking-tighter">
                      {c.first_name[0]}{c.last_name?.[0] || ''}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-foreground truncate text-base tracking-tight leading-tight">
                      {c.first_name} {c.last_name}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-1 opacity-60">
                      Entrada: {new Date(c.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(c)} className="p-2 rounded-lg bg-secondary/50 text-muted-foreground hover:text-gold hover:bg-gold/10 transition-all">
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => setDeleteId(c.id)} className="p-2 rounded-lg bg-secondary/50 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                {c.phone && (
                  <div className="flex items-center gap-3 text-sm font-medium text-foreground/80 hover:text-gold transition-colors">
                    <div className="w-7 h-7 rounded-md bg-secondary/30 flex items-center justify-center">
                      <Phone size={14} className="text-gold/60" />
                    </div>
                    <span className="truncate">{c.phone}</span>
                  </div>
                )}
                {c.email && (
                  <div className="flex items-center gap-3 text-sm font-medium text-foreground/80 hover:text-gold transition-colors">
                    <div className="w-7 h-7 rounded-md bg-secondary/30 flex items-center justify-center">
                      <Mail size={14} className="text-gold/60" />
                    </div>
                    <span className="truncate">{c.email}</span>
                  </div>
                )}
                {c.instagram && (
                  <div className="flex items-center gap-3 text-sm font-medium text-foreground/80 hover:text-gold transition-colors">
                    <div className="w-7 h-7 rounded-md bg-secondary/30 flex items-center justify-center">
                      <Instagram size={14} className="text-gold/60" />
                    </div>
                    <span className="truncate">{c.instagram}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-md p-0 rounded-2xl shadow-2xl border-border/40 bg-background overflow-hidden">
          <div className="bg-gradient-gold p-8 text-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-display text-white">
                {editingClient ? 'Ajustar Cadastro' : 'Novo Cliente David Melo'}
              </DialogTitle>
              <p className="text-white/80 text-xs mt-1 font-medium font-body tracking-wide uppercase">Preencha os dados do cliente abaixo.</p>
            </DialogHeader>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); upsert.mutate(); }}
            className="p-8 space-y-6"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Primeiro Nome *</Label>
                <Input
                  required
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  className="bg-secondary/30 border-border/40 focus:border-gold h-11 h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Sobrenome</Label>
                <Input
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  className="bg-secondary/30 border-border/40 focus:border-gold h-11 h-11"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Telefone Principal</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="bg-secondary/30 border-border/40 focus:border-gold h-11 h-11"
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">E-mail Corporativo</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="bg-secondary/30 border-border/40 focus:border-gold h-11 h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-gold/80 ml-1">Perfil Instagram</Label>
              <Input
                value={form.instagram}
                onChange={(e) => setForm({ ...form, instagram: e.target.value })}
                className="bg-secondary/30 border-border/40 focus:border-gold h-11 h-11"
                placeholder="@usuario_premium"
              />
            </div>
            <div className="flex justify-end gap-3 pt-6 border-t border-border/10">
              <DialogClose asChild>
                <Button type="button" variant="ghost" className="text-muted-foreground font-bold uppercase text-[10px] tracking-widest">Cancelar</Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={upsert.isPending}
                className="bg-gold hover:bg-gold-light text-white font-bold h-11 px-8 rounded-lg shadow-gold uppercase text-[11px] tracking-widest"
              >
                {upsert.isPending ? 'Salvando...' : editingClient ? 'Confirmar Ajustes' : 'Registrar Cliente'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent className="bg-background border-border/40 rounded-2xl shadow-2xl p-0 overflow-hidden max-w-sm">
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="text-destructive h-8 w-8" />
            </div>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-foreground text-center font-display text-xl">Remover cliente?</AlertDialogTitle>
              <AlertDialogDescription className="text-center font-medium mt-2">Esta operação é permanente e removerá todos os dados históricos deste cliente.</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex flex-col gap-2 mt-8">
              <AlertDialogAction
                onClick={() => deleteId && remove.mutate(deleteId)}
                className="bg-destructive text-white hover:bg-destructive/90 rounded-xl h-12 font-bold uppercase text-[11px] tracking-widest"
              >
                Confirmar Exclusão
              </AlertDialogAction>
              <AlertDialogCancel className="border-none hover:bg-secondary/50 rounded-xl h-12 font-bold uppercase text-[11px] tracking-widest text-muted-foreground">Voltar</AlertDialogCancel>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ClientesPage;
