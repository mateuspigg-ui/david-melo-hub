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
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

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
      const cpfCnpj = form.cpf_cnpj.trim();
      const address = form.address.trim();
      if (!cpfCnpj) throw new Error('Preencha o CPF/CNPJ do cliente.');
      if (!address) throw new Error('Preencha o endereço do cliente.');

      const payload: any = {
        first_name: form.first_name,
        last_name: form.last_name,
        phone: form.phone || null,
        email: form.email || null,
        instagram: form.instagram || null,
        cpf_cnpj: cpfCnpj,
        address: address,
      };

      if (editingClient) {
        const { error } = await (supabase as any).from('clients').update(payload).eq('id', editingClient.id);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any).from('clients').insert(payload).select('id').single();
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
  return (
    <div className="space-y-12 animate-fade-in max-w-[1700px] mx-auto pb-12">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 px-2">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 bg-gold rounded-full" />
            <h1 className="text-4xl md:text-5xl font-display text-foreground tracking-tighter uppercase leading-none">Base de Clientes</h1>
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.4em] text-gold/80 pl-4">David Melo Produções • Gestão de Relacionamento Premium</p>
        </div>
        <Button
          onClick={() => { setForm(emptyForm); setEditingClient(null); setDialogOpen(true); }}
          className="bg-gradient-gold hover:opacity-90 text-white font-bold h-14 px-10 rounded-2xl shadow-gold uppercase text-[11px] tracking-[0.2em] transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus size={20} className="mr-3" /> Novo Cliente
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-2">
        {/* Search */}
        <div className="relative group max-w-xl flex-1">
          <Search size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground/40 group-focus-within:text-gold transition-colors z-10" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, email, telefone, CPF/CNPJ ou endereço..."
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
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 px-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 bg-white/40 rounded-[32px] animate-pulse border border-border/20 shadow-sm" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mx-2 bg-white/40 backdrop-blur-md rounded-[40px] p-24 border border-border/20 text-center flex flex-col items-center justify-center premium-shadow">
          <div className="w-20 h-20 rounded-3xl bg-secondary/30 flex items-center justify-center mb-6">
            <User size={40} className="text-muted-foreground/30" />
          </div>
          <h3 className="text-2xl font-display text-foreground uppercase tracking-tight">Nenhum cliente na base</h3>
          <p className="text-xs text-muted-foreground/60 mt-2 font-black uppercase tracking-widest max-w-xs leading-relaxed">
            {search ? 'Nenhum resultado para sua busca. Tente novos termos.' : 'Sua lista de clientes está vazia. Comece a construir seu império.'}
          </p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 px-2">
          {filtered.map((c) => {
            const entryDate = firstLeadEntryByClient[c.id] || c.created_at;
            const initials = `${c.first_name[0]}${c.last_name?.[0] || ''}`.toUpperCase();
            
            return (
              <div
                key={c.id}
                className="group bg-white rounded-[32px] border border-border/30 p-8 premium-shadow transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-gold/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                
                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex items-start justify-between mb-8">
                    <div className="w-16 h-16 rounded-2xl bg-gold/10 flex items-center justify-center text-gold border border-gold/10 group-hover:bg-gold group-hover:text-white group-hover:rotate-6 transition-all duration-500 shadow-sm">
                      <span className="text-lg font-black tracking-tighter">{initials}</span>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                      <button onClick={() => openEdit(c)} className="h-10 w-10 flex items-center justify-center rounded-xl bg-secondary/80 text-muted-foreground hover:text-gold hover:bg-gold/10 transition-all shadow-sm">
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => setDeleteId(c.id)} className="h-10 w-10 flex items-center justify-center rounded-xl bg-secondary/80 text-muted-foreground hover:text-rose-500 hover:bg-rose-50 transition-all shadow-sm">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1 mb-8">
                    <h4 className="text-xl font-display text-foreground tracking-tight leading-tight uppercase group-hover:text-gold transition-colors">
                      {c.first_name} {c.last_name}
                    </h4>
                    <p className="text-[10px] text-muted-foreground/40 font-black uppercase tracking-[0.2em]">
                      Desde {format(new Date(entryDate), "MMM yyyy", { locale: ptBR })}
                    </p>
                  </div>

                  <div className="space-y-4 flex-1">
                    {c.phone && (
                      <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors group/item">
                        <div className="w-8 h-8 rounded-lg bg-secondary/30 flex items-center justify-center shrink-0 group-hover/item:bg-gold/10 group-hover/item:text-gold transition-colors">
                          <Phone size={14} />
                        </div>
                        <span className="truncate tracking-wide">{c.phone}</span>
                      </div>
                    )}
                    {c.email && (
                      <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors group/item">
                        <div className="w-8 h-8 rounded-lg bg-secondary/30 flex items-center justify-center shrink-0 group-hover/item:bg-gold/10 group-hover/item:text-gold transition-colors">
                          <Mail size={14} />
                        </div>
                        <span className="truncate tracking-tight lowercase">{c.email}</span>
                      </div>
                    )}
                    {c.cpf_cnpj && (
                      <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors group/item">
                        <div className="w-8 h-8 rounded-lg bg-secondary/30 flex items-center justify-center shrink-0 group-hover/item:bg-gold/10 group-hover/item:text-gold transition-colors">
                          <Hash size={14} />
                        </div>
                        <span className="truncate tracking-widest opacity-60">{c.cpf_cnpj}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mx-2 bg-white rounded-[32px] border border-border/30 premium-shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/20 border-b border-border/10">
                  <th className="text-left py-6 px-8 text-muted-foreground font-black text-[10px] uppercase tracking-[0.3em]">Perfil do Cliente</th>
                  <th className="text-left py-6 px-8 text-muted-foreground font-black text-[10px] uppercase tracking-[0.3em]">Contato Executivo</th>
                  <th className="text-left py-6 px-8 text-muted-foreground font-black text-[10px] uppercase tracking-[0.3em]">Fiscal / Endereço</th>
                  <th className="text-left py-6 px-8 text-muted-foreground font-black text-[10px] uppercase tracking-[0.3em]">Data Entrada</th>
                  <th className="text-right py-6 px-8 text-muted-foreground font-black text-[10px] uppercase tracking-[0.3em]">Gestão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/5">
                {filtered.map((c) => {
                  const entryDate = firstLeadEntryByClient[c.id] || c.created_at;
                  return (
                    <tr key={c.id} className="group hover:bg-gold/5 transition-colors duration-300">
                      <td className="py-6 px-8">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-gold/5 flex items-center justify-center text-gold font-black text-xs border border-gold/10 group-hover:bg-gold group-hover:text-white transition-all duration-500">
                            {c.first_name[0]}
                          </div>
                          <div>
                            <p className="font-bold text-foreground text-base tracking-tight uppercase group-hover:text-gold transition-colors">{c.first_name} {c.last_name}</p>
                            {c.instagram && <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-0.5 opacity-60">{c.instagram}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="py-6 px-8">
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-foreground tracking-wide">{c.phone || '—'}</p>
                          <p className="text-[10px] text-muted-foreground font-medium lowercase tracking-tight">{c.email || '—'}</p>
                        </div>
                      </td>
                      <td className="py-6 px-8">
                        <div className="space-y-1 max-w-[280px]">
                          <p className="text-[10px] font-black text-foreground/70 uppercase tracking-widest">{c.cpf_cnpj || 'Não Informado'}</p>
                          <p className="text-[10px] text-muted-foreground font-bold line-clamp-1">{c.address || 'Sem Endereço'}</p>
                        </div>
                      </td>
                      <td className="py-6 px-8">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">
                          {format(new Date(entryDate), "dd MMM yyyy", { locale: ptBR })}
                        </span>
                      </td>
                      <td className="py-6 px-8">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <button onClick={() => openEdit(c)} className="h-9 w-9 flex items-center justify-center rounded-lg bg-white border border-border/20 text-muted-foreground hover:text-gold hover:border-gold/30 transition-all shadow-sm">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => setDeleteId(c.id)} className="h-9 w-9 flex items-center justify-center rounded-lg bg-white border border-border/20 text-muted-foreground hover:text-rose-500 hover:border-rose-200 transition-all shadow-sm">
                            <Trash2 size={14} />
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
