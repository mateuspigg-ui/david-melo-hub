import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Search, Folder, Download, Trash2, Info, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  { id: 'operacional', label: 'Operacional', color: 'text-blue-500 bg-blue-50' },
  { id: 'financeiro', label: 'Financeiro', color: 'text-emerald-500 bg-emerald-50' },
  { id: 'rh', label: 'RH / Pessoal', color: 'text-amber-500 bg-amber-50' },
  { id: 'juridico', label: 'Jurídico', color: 'text-gold bg-gold/5' },
  { id: 'marketing', label: 'Marketing', color: 'text-purple-500 bg-purple-50' },
  { id: 'outros', label: 'Outros', color: 'text-slate-500 bg-slate-50' }
];

export default function DocumentosPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<any>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [form, setForm] = useState({
    title: '',
    category: 'operacional',
    description: '',
    file_url: ''
  });

  const handleFileUpload = async (file: File) => {
    try {
      setUploadingFile(true);
      const ext = file.name.split('.').pop() || 'bin';
      const safeName = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[^a-zA-Z0-9-_]/g, '-')
        .toLowerCase();
      const fileName = `${Date.now()}-${safeName}.${ext}`;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const uploadPath = `${user?.id || 'public'}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(uploadPath, file, { upsert: true, contentType: file.type || undefined });

      if (uploadError) throw new Error(uploadError.message || 'Falha ao enviar arquivo para o bucket documentos.');

      const {
        data: { publicUrl },
      } = supabase.storage.from('documentos').getPublicUrl(uploadPath);

      if (!publicUrl) throw new Error('Arquivo enviado, mas URL publica nao foi gerada.');

      setForm((prev) => ({
        ...prev,
        file_url: publicUrl,
        title: prev.title || file.name.replace(/\.[^/.]+$/, ''),
      }));
      toast({ title: 'Upload concluido', description: 'Arquivo enviado com sucesso.' });
    } catch (error: any) {
      toast({ title: 'Erro no upload', description: error.message || 'Nao foi possivel enviar o arquivo.', variant: 'destructive' });
    } finally {
      setUploadingFile(false);
    }
  };

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['company_documents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_documents')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingDoc) {
        const { error } = await supabase.from('company_documents').update(form).eq('id', editingDoc.id);
        if (error) throw error;
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const { error } = await supabase.from('company_documents').insert([
          {
            ...form,
            created_by: user?.id || null,
          },
        ]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company_documents'] });
      setDialogOpen(false);
      resetForm();
      toast({ title: 'Sucesso', description: 'Documento registrado no Hub!', style: { backgroundColor: '#C5A059', color: '#fff' } });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' })
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('company_documents').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company_documents'] });
      toast({ title: 'Removido', description: 'Documento excluído do servidor.', variant: 'destructive' });
    }
  });

  const resetForm = () => setForm({ title: '', category: 'operacional', description: '', file_url: '' });

  const filtered = documents.filter((doc: any) => {
    const matchesSearch = doc.title.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || doc.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="p-8 space-y-10 animate-fade-in max-w-[1600px] mx-auto min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 border-b border-border/10 pb-10">
        <div>
          <h1 className="text-4xl font-display text-foreground tracking-tighter uppercase">Repositório de Documentos</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold mt-2 opacity-80">Gestão de Conhecimento David Melo Hub</p>
        </div>
        <Button 
          onClick={() => { setEditingDoc(null); resetForm(); setDialogOpen(true); }}
          className="bg-gradient-gold hover:opacity-95 text-white font-black h-12 px-10 rounded-xl shadow-gold uppercase text-[11px] tracking-[0.25em]"
        >
          <Plus size={20} className="mr-3" /> Adicionar Arquivo
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por título..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            className="pl-11 bg-white border-border/40 h-12 rounded-xl premium-shadow" 
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[200px] h-12 bg-white border-border/40 rounded-xl font-bold uppercase text-[10px] tracking-widest text-gold premium-shadow">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent className="bg-white shadow-2xl border-border/10">
            <SelectItem value="all" className="font-bold text-[10px] uppercase">Todas as Categorias</SelectItem>
            {CATEGORIES.map(cat => (
              <SelectItem key={cat.id} value={cat.id} className="font-bold text-[10px] uppercase">{cat.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {isLoading ? (
          <div className="col-span-full h-32 flex items-center justify-center text-gold animate-pulse text-[10px] font-black uppercase tracking-[0.4em]">Indexando Arquivos...</div>
        ) : filtered.map((doc: any) => {
          const category = CATEGORIES.find(c => c.id === doc.category) || CATEGORIES[CATEGORIES.length - 1];
          return (
            <div key={doc.id} className="bg-white premium-shadow rounded-[32px] border border-border/40 p-8 hover:border-gold/30 transition-all duration-500 group flex flex-col justify-between">
              <div className="space-y-6">
                <div className="flex items-start justify-between">
                  <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-sm", category.color)}>
                    <Folder size={28} />
                  </div>
                  <span className={cn("px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest", category.color)}>
                    {category.label}
                  </span>
                </div>
                
                <div>
                  <h3 className="font-display text-xl text-foreground tracking-tight uppercase line-clamp-2">{doc.title}</h3>
                  <p className="text-xs text-muted-foreground font-medium mt-3 line-clamp-3 leading-relaxed opacity-70">
                    {doc.description || 'Nenhuma descrição detalhada fornecida para este arquivo.'}
                  </p>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-border/10 flex items-center justify-between">
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => window.open(doc.file_url, '_blank')} className="h-10 w-10 text-gold hover:bg-gold/10 rounded-xl transition-all">
                    <Download size={18} />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => { setEditingDoc(doc); setForm({...doc}); setDialogOpen(true); }} className="h-10 w-10 text-muted-foreground hover:bg-secondary/50 rounded-xl transition-all">
                    <Info size={18} />
                  </Button>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { if(window.confirm('Excluir documento?')) deleteMutation.mutate(doc.id); }} className="h-10 w-10 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all">
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-white border-border/40 text-foreground max-w-lg rounded-[32px] p-0 overflow-hidden shadow-2xl font-body">
          <div className="bg-gradient-gold p-10 text-white">
            <DialogHeader>
              <DialogTitle className="text-3xl font-display text-white tracking-tight">Registro de Documento</DialogTitle>
              <p className="text-white/80 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Base de Conhecimento David Melo Hub</p>
            </DialogHeader>
          </div>
          <div className="p-10 space-y-6">
            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Título do Documento</Label>
                <Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="h-12 bg-secondary/20 border-border/10 rounded-xl font-bold" />
              </div>
              
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Categoria Operacional</Label>
                <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
                  <SelectTrigger className="h-12 bg-secondary/20 border-border/10 rounded-xl font-bold text-xs uppercase">
                    <SelectValue placeholder="Selecionar Categoria" />
                  </SelectTrigger>
                  <SelectContent className="bg-white shadow-2xl border-border/10">
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat.id} value={cat.id} className="font-bold text-[10px] uppercase">{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Descrição / Contexto</Label>
                <textarea 
                  value={form.description} 
                  onChange={e => setForm({...form, description: e.target.value})} 
                  className="w-full h-32 bg-secondary/20 border border-border/10 focus:border-gold rounded-xl font-medium p-4 text-sm" 
                  placeholder="Para que serve este documento?"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">URL de Acesso</Label>
                <Input value={form.file_url} onChange={e => setForm({...form, file_url: e.target.value})} placeholder="Link do arquivo no Storage" className="h-12 bg-secondary/20 border-border/10 rounded-xl font-medium text-xs" />
                <div className="flex items-center gap-2">
                  <input
                    id="document-upload"
                    type="file"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) await handleFileUpload(file);
                      e.currentTarget.value = '';
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('document-upload')?.click()}
                    disabled={uploadingFile}
                    className="h-10 rounded-xl font-black uppercase text-[10px] tracking-widest"
                  >
                    {uploadingFile ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    Upload do computador
                  </Button>
                  {form.file_url && <span className="text-[10px] font-bold text-emerald-600">Arquivo vinculado</span>}
                </div>
              </div>
            </div>
            
            <div className="flex justify-between items-center pt-8 border-t border-border/10">
              <Button variant="ghost" onClick={() => setDialogOpen(false)} className="text-[10px] font-black uppercase tracking-widest">Cancelar</Button>
              <Button onClick={() => saveMutation.mutate()} className="bg-gradient-gold text-white font-black h-12 px-12 rounded-xl shadow-gold uppercase text-[11px] tracking-[0.25em]">Registrar Arquivo</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
