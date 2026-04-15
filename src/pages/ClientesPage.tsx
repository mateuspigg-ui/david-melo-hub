import { useMemo, useState } from 'react';
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
import { Plus, Search, Phone, Mail, Instagram, Pencil, Trash2, User, LayoutGrid, List, Hash, MapPin } from 'lucide-react';

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  cpf_cnpj: string | null;
  address: string | null;
  created_at: string;
}

interface ClosedLead {
  id: string;
  title: string;
  client_id: string | null;
  event_date: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  clients: { first_name: string; last_name: string; phone: string | null } | null;
}

interface ClientLeadEntry {
  client_id: string | null;
  created_at: string;
}

const emptyForm = { first_name: '', last_name: '', phone: '', email: '', instagram: '', cpf_cnpj: '', address: '' };

const ClientesPage = () => {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [selectedClosedLeadId, setSelectedClosedLeadId] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
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

  const { data: closedLeads = [] } = useQuery({
    queryKey: ['closed_leads_without_client'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, title, client_id, event_date, first_name, last_name, phone, clients(first_name, last_name, phone)')
        .eq('stage', 'fechados')
        .order('event_date', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ClosedLead[];
    },
  });

  const { data: clientLeadEntries = [] } = useQuery({
    queryKey: ['client_lead_entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('client_id, created_at')
        .not('client_id', 'is', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as ClientLeadEntry[];
    },
  });

  const firstLeadEntryByClient = useMemo(() => {
    return clientLeadEntries.reduce<Record<string, string>>((acc, item) => {
      if (!item.client_id || acc[item.client_id]) return acc;
      acc[item.client_id] = item.created_at;
      return acc;
    }, {});
  }, [clientLeadEntries]);

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        first_name: form.first_name,
        last_name: form.last_name,
        phone: form.phone || null,
        email: form.email || null,
        instagram: form.instagram || null,
        cpf_cnpj: form.cpf_cnpj.trim(),
        address: form.address.trim(),
      };

      if (!payload.cpf_cnpj) throw new Error('Preencha o CPF/CNPJ do cliente.');
      if (!payload.address) throw new Error('Preencha o endereço do cliente.');
      if (editingClient) {
        const { error } = await supabase.from('clients').update(payload).eq('id', editingClient.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('clients').insert(payload).select('id').single();
        if (error) throw error;

        if (selectedClosedLeadId && data?.id) {
          const { error: linkError } = await supabase
            .from('leads')
            .update({ client_id: data.id })
            .eq('id', selectedClosedLeadId);
          if (linkError) throw linkError;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['closed_leads_without_client'] });
      qc.invalidateQueries({ queryKey: ['client_lead_entries'] });
      toast({ title: editingClient ? 'Cliente atualizado!' : 'Cliente criado!' });
      closeDialog();
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const unlinkClientReferences = async () => {
        const updates = [
          supabase.from('contracts').update({ client_id: null }).eq('client_id', id),
          supabase.from('events').update({ client_id: null }).eq('client_id', id),
          supabase.from('leads').update({ client_id: null }).eq('client_id', id),
          supabase.from('payments').update({ client_id: null }).eq('client_id', id),
        ];

        const results = await Promise.all(updates);
        const failed = results.find((result) => result.error);
        if (failed?.error) throw failed.error;
      };

      const { error } = await supabase.from('clients').delete().eq('id', id);

      if (error && /foreign key|constraint|violates/i.test(error.message || '')) {
        await unlinkClientReferences();
        const retry = await supabase.from('clients').delete().eq('id', id);
        if (retry.error) throw retry.error;
        return;
      }

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['events'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['client_lead_entries'] });
      toast({ title: 'Cliente removido!' });
      setDeleteId(null);
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingClient(null);
    setSelectedClosedLeadId('');
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
      cpf_cnpj: c.cpf_cnpj || '',
      address: c.address || '',
    });
    setDialogOpen(true);
  };

  const handleSelectClosedLead = (leadId: string) => {
    setSelectedClosedLeadId(leadId);
    const selected = closedLeads.find((lead) => lead.id === leadId);
    if (!selected) return;

    const firstName = selected.clients?.first_name || selected.first_name || '';
    const lastName = selected.clients?.last_name || selected.last_name || '';
    const phone = selected.clients?.phone || selected.phone || '';

    setForm((prev) => ({
      ...prev,
      first_name: firstName,
      last_name: lastName,
      phone,
    }));
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return clients
      .filter((c) => (
        c.first_name.toLowerCase().includes(q) ||
        c.last_name.toLowerCase().includes(q) ||
        (c.email?.toLowerCase().includes(q) ?? false) ||
        (c.phone?.includes(q) ?? false) ||
        (c.cpf_cnpj?.toLowerCase().includes(q) ?? false) ||
        (c.address?.toLowerCase().includes(q) ?? false)
      ))
      .sort((a, b) => {
        const nameA = `${a.first_name} ${a.last_name || ''}`.trim();
        const nameB = `${b.first_name} ${b.last_name || ''}`.trim();
        return nameA.localeCompare(nameB, 'pt-BR', { sensitivity: 'base' });
      });
  }, [clients, search]);

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
          placeholder="Buscar por nome, email, telefone, CPF/CNPJ ou endereço..."
          className="pl-14 bg-white border-border/10 focus:border-gold h-14 rounded-2xl shadow-sm text-sm font-medium relative z-10"
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
            <Button variant="outline" onClick={() => { setForm(emptyForm); setEditingClient(null); setSelectedClosedLeadId(''); setDialogOpen(true); }} className="border-gold text-gold hover:bg-gold/5 font-bold uppercase text-[10px] tracking-widest">
              Cadastrar Agora
            </Button>
          )}
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((c) => {
            const entryDate = firstLeadEntryByClient[c.id] || c.created_at;
            return (
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
                      Entrada: {new Date(entryDate).toLocaleDateString('pt-BR')}
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
                {c.cpf_cnpj && (
                  <div className="flex items-center gap-3 text-sm font-medium text-foreground/80 hover:text-gold transition-colors">
                    <div className="w-7 h-7 rounded-md bg-secondary/30 flex items-center justify-center">
                      <Hash size={14} className="text-gold/60" />
                    </div>
                    <span className="truncate">{c.cpf_cnpj}</span>
                  </div>
                )}
                {c.address && (
                  <div className="flex items-start gap-3 text-sm font-medium text-foreground/80 hover:text-gold transition-colors">
                    <div className="w-7 h-7 rounded-md bg-secondary/30 flex items-center justify-center mt-0.5 shrink-0">
                      <MapPin size={14} className="text-gold/60" />
                    </div>
                    <span className="break-words">{c.address}</span>
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
            );
          })}
        </div>
      ) : (
        <div className="bg-card premium-shadow rounded-2xl border border-border/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/10 border-b border-border/20">
                  <th className="text-left py-4 px-6 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Cliente</th>
                  <th className="text-left py-4 px-6 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Contato</th>
                  <th className="text-left py-4 px-6 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Documento</th>
                  <th className="text-left py-4 px-6 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Endereço</th>
                  <th className="text-left py-4 px-6 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Entrada</th>
                  <th className="text-right py-4 px-6 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/10">
                {filtered.map((c) => {
                  const entryDate = firstLeadEntryByClient[c.id] || c.created_at;
                  return (
                    <tr key={c.id} className="hover:bg-secondary/5 transition-colors">
                      <td className="py-4 px-6">
                        <p className="font-bold text-foreground">{c.first_name} {c.last_name}</p>
                        {c.instagram && <p className="text-xs text-muted-foreground">{c.instagram}</p>}
                      </td>
                      <td className="py-4 px-6">
                        <p className="text-sm">{c.phone || 'Sem telefone'}</p>
                        <p className="text-xs text-muted-foreground">{c.email || 'Sem e-mail'}</p>
                      </td>
                      <td className="py-4 px-6 text-sm text-foreground/80">
                        {c.cpf_cnpj || 'Não informado'}
                      </td>
                      <td className="py-4 px-6 text-sm text-foreground/80 max-w-[320px]">
                        <span className="break-words">{c.address || 'Não informado'}</span>
                      </td>
                      <td className="py-4 px-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {new Date(entryDate).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEdit(c)} className="p-2 rounded-lg bg-secondary/50 text-muted-foreground hover:text-gold hover:bg-gold/10 transition-all">
                            <Pencil size={16} />
                          </button>
                          <button onClick={() => setDeleteId(c.id)} className="p-2 rounded-lg bg-secondary/50 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all">
                            <Trash2 size={16} />
                          </button>
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

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-2xl h-[90vh] flex flex-col p-0 rounded-[28px] shadow-[0_25px_50px_-12px_rgba(218,165,32,0.15)] border-border/40 bg-background overflow-hidden font-body">
          {/* Header - Fixed */}
          <div className="bg-gradient-gold p-6 text-white flex-none relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl opacity-50" />
            <DialogHeader>
              <DialogTitle className="text-2xl font-display text-white tracking-tight">
                {editingClient ? 'Ajustar Perfil' : 'Novo Cliente Premium'}
              </DialogTitle>
              <p className="text-white/80 text-[10px] font-black uppercase tracking-[0.2em] mt-1 italic">
                David Melo Hub • Gestão de Base
              </p>
            </DialogHeader>
          </div>

          {/* Body - Scrollable */}
          <div className="flex-1 overflow-y-auto p-8 bg-white/50 backdrop-blur-sm">
            <form id="client-form" onSubmit={(e) => { e.preventDefault(); upsert.mutate(); }} className="space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {!editingClient && (
                  <div className="sm:col-span-2 space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Importar de Lead Fechado (Opcional)</Label>
                    <select
                      value={selectedClosedLeadId}
                      onChange={(e) => handleSelectClosedLead(e.target.value)}
                      className="flex h-12 w-full rounded-xl bg-secondary/20 border border-border/10 px-3 text-sm font-bold shadow-sm focus:border-gold outline-none"
                    >
                      <option value="">Selecionar lead fechado</option>
                      {closedLeads.map((lead) => (
                        <option key={lead.id} value={lead.id}>
                          {`${lead.clients?.first_name || lead.first_name || ''} ${lead.clients?.last_name || lead.last_name || ''}`.trim() || 'Sem nome'}
                          {lead.title ? ` (${lead.title})` : ''}
                          {(lead.clients?.phone || lead.phone) ? ` • ${lead.clients?.phone || lead.phone}` : ''}
                          {lead.client_id ? ' • já vinculado' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Primeiro Nome *</Label>
                  <Input
                    required
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    className="bg-secondary/20 border-border/10 focus:border-gold h-12 rounded-xl text-sm font-bold shadow-sm"
                    placeholder="Ex: David"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Sobrenome</Label>
                  <Input
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    className="bg-secondary/20 border-border/10 focus:border-gold h-12 rounded-xl text-sm font-bold shadow-sm"
                    placeholder="Ex: Melo"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Telefone / WhatsApp</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="bg-secondary/20 border-border/10 focus:border-gold h-12 rounded-xl text-sm font-bold shadow-sm"
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Endereço de E-mail (Opcional)</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="bg-secondary/20 border-border/10 focus:border-gold h-12 rounded-xl text-sm font-bold shadow-sm"
                    placeholder="cliente@email.com (opcional)"
                  />
                  <p className="text-[10px] text-muted-foreground/70 font-bold ml-1">Você pode salvar sem preencher este campo.</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">CPF/CNPJ *</Label>
                  <Input
                    required
                    value={form.cpf_cnpj}
                    onChange={(e) => setForm({ ...form, cpf_cnpj: e.target.value })}
                    className="bg-secondary/20 border-border/10 focus:border-gold h-12 rounded-xl text-sm font-bold shadow-sm"
                    placeholder="000.000.000-00 ou 00.000.000/0000-00"
                  />
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Endereço *</Label>
                  <Input
                    required
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="bg-secondary/20 border-border/10 focus:border-gold h-12 rounded-xl text-sm font-bold shadow-sm"
                    placeholder="Rua, número, bairro, cidade - UF"
                  />
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-gold/80 ml-1">Instagram (Opcional)</Label>
                  <Input
                    value={form.instagram}
                    onChange={(e) => setForm({ ...form, instagram: e.target.value })}
                    className="bg-secondary/20 border-border/10 focus:border-gold h-12 rounded-xl text-sm font-bold shadow-sm"
                    placeholder="@usuario (opcional)"
                  />
                  <p className="text-[10px] text-muted-foreground/70 font-bold ml-1">Você pode salvar sem preencher este campo.</p>
                </div>
              </div>
            </form>
          </div>

          {/* Footer - Fixed */}
          <div className="p-6 bg-white border-t border-border/10 flex-none flex justify-between items-center gap-6">
            <Button variant="ghost" onClick={closeDialog} className="h-12 px-8 text-muted-foreground font-black uppercase text-[10px] tracking-[0.2em] rounded-xl hover:bg-secondary/50 transition-all">
              Descartar
            </Button>
            <Button 
              form="client-form"
              type="submit"
              disabled={upsert.isPending}
              className="bg-gradient-gold hover:opacity-90 text-white font-black h-12 px-12 rounded-xl shadow-gold uppercase text-[11px] tracking-[0.25em] transition-all duration-300"
            >
              {upsert.isPending ? 'Sincronizando...' : (editingClient ? 'Confirmar Ajustes' : 'Registrar Cliente')}
            </Button>
          </div>
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
              <AlertDialogDescription className="text-center font-medium mt-2">Esta operação é permanente. Os vínculos com histórico serão removidos para permitir a exclusão.</AlertDialogDescription>
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
