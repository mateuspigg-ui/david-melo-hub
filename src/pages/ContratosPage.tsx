import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Search, FileText, User, Calendar, CheckCircle2, Clock, Trash2, Upload, Loader2, Eye, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

export default function ContratosPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<any>(null);
  const [form, setForm] = useState({
    title: '',
    client_id: '',
    event_id: '',
    signed_status: 'draft',
    file_url: ''
  });
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const handleDownload = (url: string, title: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = title;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
      const bucketsToTry = ['contratos', 'Contratos', 'contracts', 'contrato', 'documents', 'storage'];
      let uploadSuccess = false;
      let finalPublicUrl = '';
      let lastError = null;

      const currentProjectId = import.meta.env.VITE_SUPABASE_URL?.split('//')[1]?.split('.')[0];

      for (const bucketName of bucketsToTry) {
        console.log(`Tentando upload no bucket: ${bucketName}...`);
        const { error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(fileName, file, { upsert: true });

        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from(bucketName)
            .getPublicUrl(fileName);
          
          finalPublicUrl = publicUrl;
          uploadSuccess = true;
          break;
        } else {
          lastError = uploadError;
        }
      }

      if (uploadSuccess) {
        setForm(prev => ({ ...prev, file_url: finalPublicUrl }));
        toast({ title: 'Upload concluído!', description: 'Arquivo salvo com sucesso.' });
      } else {
        console.error('ERRO FINAL:', lastError);
        alert(`FALHA NO UPLOAD:\n\nProjeto ID Conectado: ${currentProjectId}\n\nErro do Supabase: ${(lastError as any)?.message}\nBuckets tentados: ${bucketsToTry.join(', ')}\n\nPor favor, confirme se o balde no seu Supabase tem um destes nomes exatamente.`);
      }
    } catch (error: any) {
      console.error('Erro no processo de upload:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['contracts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('*, clients(first_name, last_name), events(title)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const { data: clients = [] } = useQuery({
    queryKey: ['clients-contracts'],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('id, first_name, last_name').order('first_name');
      return data || [];
    }
  });

  const { data: events = [] } = useQuery({
    queryKey: ['events-contracts'],
    queryFn: async () => {
      const { data } = await supabase.from('events').select('id, title').order('title');
      return data || [];
    }
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, signed_at: form.signed_status === 'signed' ? new Date().toISOString() : null };
      if (editingContract) {
        const { error } = await supabase.from('contracts').update(payload).eq('id', editingContract.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('contracts').insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] });
      setDialogOpen(false);
      resetForm();
      toast({ title: 'Sucesso', description: 'Contrato salvo no ecossistema!', style: { backgroundColor: '#C5A059', color: '#fff' } });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' })
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contracts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: 'Removido', description: 'Contrato excluído.', variant: 'destructive' });
    }
  });

  const resetForm = () => setForm({ title: '', client_id: '', event_id: '', signed_status: 'draft', file_url: '' });

  const filtered = contracts.filter((c: any) => c.title.toLowerCase().includes(search.toLowerCase()));

  const statusMap: any = {
    draft: { label: 'Rascunho', color: 'bg-slate-100 text-slate-500', icon: Clock },
    pending: { label: 'Pendente', color: 'bg-amber-100 text-amber-600', icon: Clock },
    signed: { label: 'Assinado', color: 'bg-emerald-100 text-emerald-600', icon: CheckCircle2 }
  };

  return (
    <div className="p-8 space-y-10 animate-fade-in max-w-[1600px] mx-auto min-h-screen">
      <div className="flex items-center justify-between mb-12">
            <div>
              <h1 className="text-5xl font-display text-red-600 tracking-tighter uppercase">Gestão de Contratos</h1>
              <p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.3em] mt-2 ml-1">Archive Executivo David Melo</p>
            </div>
            <Button onClick={() => { setEditingContract(null); setForm({ title: '', client_id: '', event_id: '', signed_status: 'draft', file_url: '' }); setDialogOpen(true); }} className="bg-gold hover:bg-gold-light text-white px-8 h-14 rounded-full font-bold text-xs uppercase tracking-widest transition-all hover:scale-105 active:scale-95 shadow-lg shadow-gold/20">
              <Plus className="mr-2 h-4 w-4" /> Novo Contrato
            </Button>
          </div>

      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input 
          placeholder="Buscar contratos por título..." 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
          className="pl-11 bg-white border-border/40 h-12 rounded-xl premium-shadow" 
        />
      </div>

      <div className="bg-white premium-shadow rounded-[32px] border border-border/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary/10 border-b border-border/20">
                <th className="text-left py-6 px-8 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Contrato</th>
                <th className="text-left py-6 px-8 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Cliente</th>
                <th className="text-left py-6 px-8 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Evento</th>
                <th className="text-left py-6 px-8 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Status</th>
                <th className="text-left py-6 px-8 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Data</th>
                <th className="text-right py-6 px-8 text-muted-foreground font-black text-[10px] uppercase tracking-[0.2em]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/10">
              {isLoading ? (
                <tr><td colSpan={6} className="py-20 text-center text-gold font-black uppercase tracking-[0.3em] text-xs">Sincronizando Jurídico...</td></tr>
              ) : filtered.map((c: any) => {
                const Status = statusMap[c.signed_status] || statusMap.draft;
                const Icon = Status.icon;
                return (
                  <tr key={c.id} className="hover:bg-secondary/5 transition-colors group">
                    <td className="py-6 px-8">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center text-gold">
                          <FileText size={20} />
                        </div>
                        <span className="font-bold text-foreground text-sm uppercase tracking-tight">{c.title}</span>
                      </div>
                    </td>
                    <td className="py-6 px-8">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <User size={14} className="text-gold/60" />
                        <span className="font-medium text-xs">
                          {c.clients ? `${c.clients.first_name} ${c.clients.last_name}` : '---'}
                        </span>
                      </div>
                    </td>
                    <td className="py-6 px-8">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar size={14} className="text-gold/60" />
                        <span className="font-medium text-xs uppercase opacity-80">{c.events?.title || '---'}</span>
                      </div>
                    </td>
                    <td className="py-6 px-8">
                      <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center w-fit gap-1.5 ${Status.color}`}>
                        <Icon size={12} /> {Status.label}
                      </span>
                    </td>
                    <td className="py-6 px-8 text-[10px] font-bold text-muted-foreground uppercase opacity-60">
                      {format(new Date(c.created_at), 'dd MMM yyyy')}
                    </td>
                    <td className="py-6 px-8 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {c.file_url && (
                          <>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => { setPreviewUrl(c.file_url); setIsPreviewOpen(true); }}
                              className="h-8 w-8 text-gold hover:bg-gold/10"
                              title="Visualizar"
                            >
                              <Eye size={16} />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleDownload(c.file_url, c.title)}
                              className="h-8 w-8 text-emerald-500 hover:bg-emerald-50"
                              title="Baixar"
                            >
                              <Download size={16} />
                            </Button>
                          </>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => { setEditingContract(c); setForm({ ...c }); setDialogOpen(true); }} className="text-[10px] font-black uppercase text-gold">Editar</Button>
                        <Button variant="ghost" size="icon" onClick={() => { if(window.confirm('Excluir contrato?')) deleteMutation.mutate(c.id); }} className="h-8 w-8 text-muted-foreground hover:text-destructive"><Trash2 size={14} /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-white border-border/40 text-foreground max-w-lg rounded-[32px] p-0 overflow-hidden shadow-2xl font-body">
          <div className="bg-gradient-gold p-10 text-white">
            <DialogHeader>
              <DialogTitle className="text-3xl font-display text-white tracking-tight">Registro de Contrato</DialogTitle>
              <p className="text-white/80 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Compliance Executivo David Melo</p>
            </DialogHeader>
          </div>
          <div className="p-10 space-y-6">
            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Identificação / Título do Contrato</Label>
                <Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="h-12 bg-secondary/20 border-border/10 rounded-xl font-bold" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Vincular Cliente</Label>
                  <Select value={form.client_id} onValueChange={v => setForm({...form, client_id: v})}>
                    <SelectTrigger className="h-12 bg-secondary/20 border-border/10 rounded-xl font-bold text-xs uppercase">
                      <SelectValue placeholder="Selecionar Cliente" />
                    </SelectTrigger>
                    <SelectContent className="bg-white shadow-2xl border-border/10">
                      {clients.map((cli: any) => (
                        <SelectItem key={cli.id} value={cli.id} className="font-bold text-[10px] uppercase">{cli.first_name} {cli.last_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Status de Assinatura</Label>
                  <Select value={form.signed_status} onValueChange={v => setForm({...form, signed_status: v})}>
                    <SelectTrigger className="h-12 bg-secondary/20 border-border/10 rounded-xl font-bold text-xs uppercase">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent className="bg-white shadow-2xl border-border/10">
                      <SelectItem value="draft" className="font-bold text-[10px] uppercase">Rascunho</SelectItem>
                      <SelectItem value="pending" className="font-bold text-[10px] uppercase text-amber-500">Pendente</SelectItem>
                      <SelectItem value="signed" className="font-bold text-[10px] uppercase text-emerald-500">Assinado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Projeto / Evento Relacionado</Label>
                <Select value={form.event_id} onValueChange={v => setForm({...form, event_id: v})}>
                  <SelectTrigger className="h-12 bg-secondary/20 border-border/10 rounded-xl font-bold text-xs uppercase">
                    <SelectValue placeholder="Selecionar Evento" />
                  </SelectTrigger>
                  <SelectContent className="bg-white shadow-2xl border-border/10">
                    {events.map((ev: any) => (
                      <SelectItem key={ev.id} value={ev.id} className="font-bold text-[10px] uppercase">{ev.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Anexo do Contrato (PDF/Img)</Label>
                <div className="flex gap-2">
                  <Input 
                    value={form.file_url} 
                    onChange={e => setForm({...form, file_url: e.target.value})} 
                    placeholder="https://..." 
                    className="h-12 bg-secondary/20 border-border/10 rounded-xl font-medium text-xs flex-1" 
                  />
                  <div className="relative">
                    <input
                      type="file"
                      id="file-upload"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={isUploading}
                      accept=".pdf,.doc,.docx,.jpg,.png"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isUploading}
                      onClick={() => document.getElementById('file-upload')?.click()}
                      className="h-12 w-12 rounded-xl border-gold/30 text-gold hover:bg-gold/10"
                    >
                      {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                    </Button>
                  </div>
                </div>
                <p className="text-[9px] text-muted-foreground ml-1 opacity-60 uppercase font-bold tracking-wider">
                  {isUploading ? 'Enviando arquivo para o servidor...' : 'Clique no ícone para subir um arquivo local'}
                </p>
              </div>
            </div>
            
            <div className="flex justify-between items-center pt-8 border-t border-border/10">
              <Button variant="ghost" onClick={() => setDialogOpen(false)} className="text-[10px] font-black uppercase tracking-widest">Descartar</Button>
              <Button onClick={() => saveMutation.mutate()} className="bg-gradient-gold text-white font-black h-12 px-12 rounded-xl shadow-gold uppercase text-[11px] tracking-[0.25em]">Salvar Contrato</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-5xl h-[85vh] p-0 bg-slate-900 border-none overflow-hidden rounded-[32px] shadow-2xl">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-6 bg-slate-800 text-white">
              <div>
                <h3 className="text-xl font-display uppercase tracking-tight">Visualização do Contrato</h3>
                <p className="text-[10px] text-white/40 font-black uppercase tracking-[0.2em] mt-1">Conferência David Melo Hub</p>
              </div>
              <div className="flex gap-4">
                <Button 
                  variant="outline" 
                  onClick={() => previewUrl && handleDownload(previewUrl, 'contrato')}
                  className="text-white border-white/20 hover:bg-white/10 font-bold uppercase text-[10px] tracking-widest h-10 px-6"
                >
                  <Download size={14} className="mr-2" /> Baixar PDF
                </Button>
                <Button variant="ghost" onClick={() => setIsPreviewOpen(false)} className="text-white hover:bg-white/10 font-bold uppercase text-[10px] tracking-widest h-10">Fechar</Button>
              </div>
            </div>
            <div className="flex-1 bg-slate-950 p-4 relative">
              {previewUrl && (
                previewUrl.toLowerCase().endsWith('.png') || 
                previewUrl.toLowerCase().endsWith('.jpg') || 
                previewUrl.toLowerCase().endsWith('.jpeg') ||
                previewUrl.includes('image')
              ) ? (
                <div className="w-full h-full flex items-center justify-center">
                  <img src={previewUrl} alt="Preview" className="max-w-full max-h-full object-contain rounded-lg" />
                </div>
              ) : (
                <iframe 
                  src={previewUrl?.includes('?') ? `${previewUrl}&view=fit` : previewUrl || ''} 
                  className="w-full h-full rounded-lg border-none bg-white"
                  title="PDF Preview"
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
