import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Search, Building2, Phone, Instagram, Wallet, Trash2, LayoutGrid, List, MapPin, FileText, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { fetchCnpj } from '@/lib/cnpjLookup';

export default function FornecedoresPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const emptyForm = {
    company_name: '', cpf_cnpj: '', person_type: 'juridica', birth_date: '', ie: '', im: '', suframa: '',
    address_street: '', address_number: '', address_complement: '', address_neighborhood: '', address_city: '', address_state: '', address_zip: '',
    phone: '', email: '', pix_details: '', instagram: '', notes: ''
  };
  const [form, setForm] = useState(emptyForm);

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
        const { error } = await (supabase as any).from('suppliers').update(form).eq('id', editingSupplier.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('suppliers').insert([form]);
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

      if (error && /foreign key|constraint|violates/i.test(String(error.message || ''))) {
        const { error: unlinkPayablesError } = await supabase
          .from('accounts_payable')
          .update({ supplier_id: null } as any)
          .eq('supplier_id', id);
        if (unlinkPayablesError) throw unlinkPayablesError;

        const retry = await supabase.from('suppliers').delete().eq('id', id);
        if (retry.error) throw retry.error;
        return;
      }

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['accounts_payable'] });
      toast({ title: 'Removido', description: 'Fornecedor excluído.', variant: 'destructive' });
    },
    onError: (e: any) => toast({ title: 'Erro ao excluir fornecedor', description: e?.message || 'Verifique vínculos existentes.', variant: 'destructive' })
  });

  const resetForm = () => setForm({ ...emptyForm });

  const getInitials = (name: string) => {
    const parts = (name || '').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (parts[0] || '?').slice(0, 2).toUpperCase();
  };

  const getFullAddress = (s: any) => {
    const parts = [s.address_street, s.address_number, s.address_neighborhood, s.address_city, s.address_state].filter(Boolean);
    return parts.join(', ') || null;
  };

  const filtered = useMemo(() => {
    return suppliers
      .filter((s: any) => s.company_name.toLowerCase().includes(search.toLowerCase()))
      .sort((a: any, b: any) => String(a.company_name || '').localeCompare(String(b.company_name || ''), 'pt-BR', { sensitivity: 'base' }));
  }, [suppliers, search]);

  return (
    <div className="space-y-5 animate-fade-in max-w-[1700px] mx-auto pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 px-2">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="h-6 w-1 bg-gold rounded-full" />
            <h1 className="text-3xl md:text-4xl font-display text-foreground tracking-tighter uppercase leading-none">Rede de Parceiros</h1>
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-gold/80 pl-4">Gestão de Fornecedores Estratégicos</p>
        </div>
        <Button
          onClick={() => { setEditingSupplier(null); resetForm(); setDialogOpen(true); }}
          className="bg-gradient-gold hover:opacity-90 text-white font-bold h-10 px-6 rounded-xl shadow-gold uppercase text-[10px] tracking-[0.15em]"
        >
          <Plus size={16} className="mr-2" /> Novo Parceiro
        </Button>
      </div>

      {/* Search + View Toggle */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-2">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            placeholder="Buscar parceiro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-9 rounded-lg bg-white border-border/40 focus:border-gold/50 text-xs"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-muted-foreground mr-1">{filtered.length} parceiro{filtered.length !== 1 ? 's' : ''}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setViewMode('cards')}
            className={cn("h-8 px-3 rounded-lg text-[10px] font-bold uppercase tracking-widest", viewMode === 'cards' ? 'bg-gold/10 text-gold border border-gold/20' : 'text-muted-foreground hover:text-gold')}>
            <LayoutGrid size={13} className="mr-1.5" /> Cards
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setViewMode('list')}
            className={cn("h-8 px-3 rounded-lg text-[10px] font-bold uppercase tracking-widest", viewMode === 'list' ? 'bg-gold/10 text-gold border border-gold/20' : 'text-muted-foreground hover:text-gold')}>
            <List size={13} className="mr-1.5" /> Lista
          </Button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 px-2">
          {isLoading ? (
            <div className="col-span-full h-40 bg-white rounded-2xl border border-border/20 flex items-center justify-center animate-pulse">
              <div className="flex flex-col items-center gap-3">
                <Building2 className="w-8 h-8 text-gold/20" />
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold/40">Carregando...</p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="col-span-full bg-white rounded-2xl p-16 border border-border/20 text-center flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-xl bg-secondary/30 flex items-center justify-center mb-4">
                <Building2 size={28} className="text-muted-foreground/30" />
              </div>
              <h3 className="text-lg font-display text-foreground uppercase tracking-tight">Nenhum parceiro</h3>
              <p className="text-xs text-muted-foreground/60 mt-1.5 max-w-xs">
                {search ? 'Nenhum resultado para sua busca.' : 'Cadastre seus parceiros estratégicos.'}
              </p>
            </div>
          ) : filtered.map((s: any) => (
            <div key={s.id} className="group bg-white rounded-2xl border border-border/25 premium-shadow overflow-hidden hover:shadow-lg hover:border-gold/20 transition-all duration-300">
              <div className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center text-gold font-black text-xs border border-gold/10 group-hover:bg-gold group-hover:text-white transition-all duration-300 shrink-0">
                    {getInitials(s.company_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-foreground tracking-tight uppercase truncate group-hover:text-gold transition-colors">{s.company_name}</h3>
                    {s.cpf_cnpj && <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{s.cpf_cnpj}</p>}
                  </div>
                </div>

                <div className="space-y-1.5">
                  {s.phone && (
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Phone size={11} className="text-gold/60 shrink-0" />
                      <span className="truncate">{s.phone}</span>
                    </div>
                  )}
                  {s.email && (
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Mail size={11} className="text-gold/60 shrink-0" />
                      <span className="truncate">{s.email}</span>
                    </div>
                  )}
                  {s.instagram && (
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Instagram size={11} className="text-gold/60 shrink-0" />
                      <span className="truncate lowercase">@{s.instagram}</span>
                    </div>
                  )}
                  {getFullAddress(s) && (
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <MapPin size={11} className="text-gold/60 shrink-0" />
                      <span className="truncate">{getFullAddress(s)}</span>
                    </div>
                  )}
                  {s.pix_details && (
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Wallet size={11} className="text-gold/60 shrink-0" />
                      <span className="truncate uppercase text-[10px] tracking-wider opacity-70">{s.pix_details}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex border-t border-border/15">
                <button
                  onClick={() => { setEditingSupplier(s); setForm({ ...s }); setDialogOpen(true); }}
                  className="flex-1 py-2 text-[9px] font-bold uppercase tracking-widest text-gold hover:bg-gold/5 transition-colors"
                >
                  Editar
                </button>
                <div className="w-px bg-border/15" />
                <button
                  onClick={() => { if (window.confirm('Excluir este parceiro?')) deleteMutation.mutate(s.id); }}
                  className="px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 hover:text-destructive hover:bg-destructive/5 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border/25 premium-shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-secondary/15 border-b border-border/20">
                  <th className="text-left py-2.5 px-4 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Fornecedor</th>
                  <th className="text-left py-2.5 px-4 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">CNPJ / CPF</th>
                  <th className="text-left py-2.5 px-4 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 hidden lg:table-cell">Endereço</th>
                  <th className="text-left py-2.5 px-4 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Telefone</th>
                  <th className="text-left py-2.5 px-4 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 hidden md:table-cell">Instagram</th>
                  <th className="text-left py-2.5 px-4 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 hidden xl:table-cell">PIX</th>
                  <th className="text-right py-2.5 px-4 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/10">
                {filtered.map((s: any) => (
                  <tr key={s.id} className="hover:bg-gold/[0.02] transition-colors group">
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-gold/10 flex items-center justify-center text-gold text-[9px] font-black shrink-0 border border-gold/10">
                          {getInitials(s.company_name)}
                        </div>
                        <span className="font-bold text-foreground truncate">{s.company_name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-muted-foreground">{s.cpf_cnpj || '—'}</td>
                    <td className="py-2.5 px-4 text-muted-foreground truncate max-w-[200px] hidden lg:table-cell">{getFullAddress(s) || '—'}</td>
                    <td className="py-2.5 px-4 text-muted-foreground">{s.phone || '—'}</td>
                    <td className="py-2.5 px-4 text-muted-foreground hidden md:table-cell">{s.instagram ? `@${s.instagram}` : '—'}</td>
                    <td className="py-2.5 px-4 text-muted-foreground hidden xl:table-cell">{s.pix_details || '—'}</td>
                    <td className="py-2.5 px-4">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => { setEditingSupplier(s); setForm({ ...s }); setDialogOpen(true); }}
                          className="h-7 px-2.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 hover:text-gold">
                          Editar
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => { if (window.confirm('Excluir este parceiro?')) deleteMutation.mutate(s.id); }}
                          className="h-7 w-7 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/5">
                          <Trash2 size={12} />
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
        <DialogContent className="bg-white border-border/40 text-foreground max-w-2xl max-h-[90vh] rounded-[32px] p-0 overflow-hidden shadow-2xl font-body flex flex-col">
          <div className="bg-gradient-gold p-10 text-white relative">
            <DialogHeader>
              <DialogTitle className="text-3xl font-display text-white tracking-tight">{editingSupplier ? 'Editar Pessoa' : 'Nova Pessoa'}</DialogTitle>
              <p className="text-white/80 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Ecossistema Operacional David Melo</p>
            </DialogHeader>
          </div>
          <div className="p-6 md:p-10 space-y-6 overflow-y-auto min-h-0">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">CPF/CNPJ</Label>
                  <Input
                    value={form.cpf_cnpj}
                    onChange={e => setForm({...form, cpf_cnpj: e.target.value})}
                    onBlur={async (e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      if (digits.length === 14) {
                        const data = await fetchCnpj(digits);
                        if (data) {
                          setForm(prev => ({
                            ...prev,
                            company_name: prev.company_name || data.nome || data.fantasia || "",
                            address_street: prev.address_street || data.logradouro || "",
                            address_number: prev.address_number || data.numero || "",
                            address_complement: prev.address_complement || data.complemento || "",
                            address_neighborhood: prev.address_neighborhood || data.bairro || "",
                            address_city: prev.address_city || data.municipio || "",
                            address_state: prev.address_state || data.uf || "",
                            address_zip: prev.address_zip || data.cep || "",
                            phone: prev.phone || data.telefone || "",
                            email: prev.email || data.email || "",
                            ie: prev.ie || data.inscricao_estadual || "",
                          }));
                          toast({ title: "Dados do CNPJ carregados", style: { backgroundColor: '#C5A059', color: '#fff' } });
                        } else {
                          toast({ title: "CNPJ nao encontrado", variant: "destructive" });
                        }
                      }
                    }}
                    className="h-12 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold"
                    placeholder="00.000.000/0000-00 ou 000.000.000-00"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Nome *</Label>
                  <Input value={form.company_name} onChange={e => setForm({...form, company_name: e.target.value})} className="h-12 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Tipo de Pessoa</Label>
                  <select value={form.person_type} onChange={e => setForm({...form, person_type: e.target.value})} className="h-12 w-full rounded-xl border border-border/10 bg-secondary/20 px-3 font-bold text-sm focus:border-gold">
                    <option value="juridica">Jurídica</option>
                    <option value="fisica">Física</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Inscrição Estadual</Label>
                  <Input value={form.ie} onChange={e => setForm({...form, ie: e.target.value})} className="h-12 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" placeholder="IE" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Inscrição Municipal</Label>
                  <Input value={form.im} onChange={e => setForm({...form, im: e.target.value})} className="h-12 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" placeholder="IM" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Telefone</Label>
                  <Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="h-12 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" placeholder="(00) 00000-0000" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">E-mail</Label>
                  <Input value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="h-12 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" placeholder="email@exemplo.com" type="email" />
                </div>
              </div>

              <div className="border-t border-border/10 pt-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Endereço</p>
                <div className="grid grid-cols-[1fr_80px] gap-3">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Logradouro</Label>
                    <Input value={form.address_street} onChange={e => setForm({...form, address_street: e.target.value})} className="h-12 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" placeholder="Rua, Avenida..." />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Nº</Label>
                    <Input value={form.address_number} onChange={e => setForm({...form, address_number: e.target.value})} className="h-12 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" placeholder="Nº" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Bairro</Label>
                    <Input value={form.address_neighborhood} onChange={e => setForm({...form, address_neighborhood: e.target.value})} className="h-12 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" placeholder="Bairro" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Complemento</Label>
                    <Input value={form.address_complement} onChange={e => setForm({...form, address_complement: e.target.value})} className="h-12 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" placeholder="Sala, Andar..." />
                  </div>
                </div>
                <div className="grid grid-cols-[1fr_80px] gap-3 mt-3">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Cidade</Label>
                    <Input value={form.address_city} onChange={e => setForm({...form, address_city: e.target.value})} className="h-12 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" placeholder="Cidade" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">UF</Label>
                    <Input value={form.address_state} onChange={e => setForm({...form, address_state: e.target.value.toUpperCase().slice(0, 2)})} className="h-12 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold uppercase" placeholder="UF" />
                  </div>
                </div>
                <div className="space-y-2 mt-3">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">CEP</Label>
                  <Input value={form.address_zip} onChange={e => setForm({...form, address_zip: e.target.value})} className="h-12 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold max-w-[200px]" placeholder="00000-000" />
                </div>
              </div>

              <div className="border-t border-border/10 pt-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Dados Complementares</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Dados PIX</Label>
                    <Input value={form.pix_details} onChange={e => setForm({...form, pix_details: e.target.value})} className="h-12 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" placeholder="Chave PIX" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Instagram</Label>
                    <Input value={form.instagram} onChange={e => setForm({...form, instagram: e.target.value})} className="h-12 bg-secondary/20 border-border/10 focus:border-gold rounded-xl font-bold" placeholder="@usuario" />
                  </div>
                </div>
                <div className="space-y-2 mt-3">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Observações</Label>
                  <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="w-full h-24 bg-secondary/20 border border-border/10 focus:border-gold rounded-xl font-bold p-4 text-sm resize-none" placeholder="Notas sobre o fornecedor..." />
                </div>
              </div>
            </div>
            <div className="flex justify-between items-center pt-6 border-t border-border/10 gap-4">
              <Button variant="ghost" onClick={() => setDialogOpen(false)} className="text-[10px] font-black uppercase tracking-widest">Cancelar</Button>
              <Button onClick={() => saveMutation.mutate()} className="bg-gradient-gold text-white font-black h-12 px-10 rounded-xl shadow-gold uppercase text-[11px] tracking-widest">Gravar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
