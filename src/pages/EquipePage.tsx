import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Copy, Loader2, UserCog, Mail, Shield, Trash2, Settings } from 'lucide-react';

const ALL_MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'contratos', label: 'Contratos' },
  { key: 'documentos', label: 'Documentos' },
  { key: 'fornecedores', label: 'Fornecedores' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'crm', label: 'CRM / Gestão de Clientes' },
  { key: 'eventos', label: 'Eventos' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'financeiro', label: 'Financeiro (Dashboard, Pagamentos, Contas, Recebimentos, Conciliação, Contas Bancárias)' },
  { key: 'equipe', label: 'Equipe' },
];

const EquipePage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showPermissionsDialog, setShowPermissionsDialog] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedModules, setSelectedModules] = useState<string[]>(['dashboard']);
  const [editModules, setEditModules] = useState<string[]>([]);

  // Check if current user is admin
  const { data: isAdmin } = useQuery({
    queryKey: ['is_admin', user?.id],
    queryFn: async () => {
      const { data } = await supabase.rpc('has_role', { _user_id: user!.id, _role: 'admin' });
      return data;
    },
    enabled: !!user,
  });

  // Fetch team members (profiles + roles)
  const { data: members = [], isLoading: loadingMembers } = useQuery({
    queryKey: ['team_members'],
    queryFn: async () => {
      const { data: profiles } = await supabase.from('profiles').select('*');
      const { data: roles } = await supabase.from('user_roles').select('*');
      return (profiles || []).map(p => ({
        ...p,
        roles: (roles || []).filter(r => r.user_id === p.id).map(r => r.role),
      }));
    },
  });

  // Fetch invitations
  const { data: invitations = [] } = useQuery({
    queryKey: ['team_invitations'],
    queryFn: async () => {
      const { data } = await supabase.from('team_invitations').select('*').order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!isAdmin,
  });

  // Fetch module permissions for a specific user
  const { data: userPermissions = [] } = useQuery({
    queryKey: ['module_permissions', showPermissionsDialog],
    queryFn: async () => {
      const { data } = await supabase.from('module_permissions').select('module').eq('user_id', showPermissionsDialog!);
      return (data || []).map(d => d.module);
    },
    enabled: !!showPermissionsDialog,
  });

  // Create invitation
  const createInvite = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('team_invitations').insert({
        email: inviteEmail || null,
        invited_by: user!.id,
        modules: selectedModules,
      } as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      const link = `${window.location.origin}/convite/${data.token}`;
      navigator.clipboard.writeText(link);
      toast({ title: 'Convite criado!', description: 'Link copiado para a área de transferência.' });
      queryClient.invalidateQueries({ queryKey: ['team_invitations'] });
      setShowInviteDialog(false);
      setInviteEmail('');
      setSelectedModules(['dashboard']);
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  // Update permissions
  const updatePermissions = useMutation({
    mutationFn: async ({ userId, modules }: { userId: string; modules: string[] }) => {
      // Delete existing
      await supabase.from('module_permissions').delete().eq('user_id', userId);
      // Insert new
      if (modules.length > 0) {
        const { error } = await supabase.from('module_permissions').insert(
          modules.map(m => ({ user_id: userId, module: m })) as any
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: 'Permissões atualizadas!' });
      queryClient.invalidateQueries({ queryKey: ['module_permissions'] });
      setShowPermissionsDialog(null);
    },
  });

  // Delete invitation
  const deleteInvite = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('team_invitations').delete().eq('id', id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team_invitations'] }),
  });

  const toggleModule = (modules: string[], setModules: (m: string[]) => void, key: string) => {
    setModules(modules.includes(key) ? modules.filter(m => m !== key) : [...modules, key]);
  };

  const getInviteLink = (token: string) => `${window.location.origin}/convite/${token}`;

  if (!isAdmin) {
    return (
      <div className="space-y-4 animate-fade-in">
        <h1 className="text-2xl font-display text-foreground">Equipe</h1>
        <p className="text-muted-foreground">Você não tem permissão para gerenciar a equipe.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-foreground">Equipe</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie membros e permissões de acesso</p>
        </div>
        <Button onClick={() => setShowInviteDialog(true)} className="bg-gradient-gold text-white shadow-gold hover:opacity-90">
          <Plus size={18} className="mr-2" /> Convidar Membro
        </Button>
      </div>

      {/* Team Members */}
      <div className="grid gap-4">
        <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Membros ({members.length})</h2>
        {loadingMembers ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gold" size={32} /></div>
        ) : (
          <div className="grid gap-3">
            {members.map(member => (
              <div key={member.id} className="bg-card rounded-xl p-5 border border-border/50 flex items-center justify-between hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-gradient-gold flex items-center justify-center text-white font-bold text-sm shadow-gold-sm">
                    {(member.full_name || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{member.full_name || 'Sem nome'}</p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full ${
                    member.roles?.includes('admin') 
                      ? 'bg-gold/10 text-gold' 
                      : 'bg-secondary text-muted-foreground'
                  }`}>
                    <Shield size={12} className="inline mr-1" />
                    {member.roles?.includes('admin') ? 'Admin' : member.roles?.includes('manager') ? 'Gerente' : 'Colaborador'}
                  </span>
                  {member.id !== user?.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setShowPermissionsDialog(member.id);
                        setEditModules([]);
                      }}
                      className="text-muted-foreground hover:text-gold"
                    >
                      <Settings size={18} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Convites Pendentes</h2>
          <div className="grid gap-3">
            {invitations.map((inv: any) => (
              <div key={inv.id} className="bg-card rounded-xl p-4 border border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mail size={18} className="text-gold" />
                  <div>
                    <p className="text-sm font-bold">{inv.email || 'Link genérico'}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Status: <span className={inv.status === 'accepted' ? 'text-green-600' : 'text-gold'}>{inv.status === 'pending' ? 'Pendente' : 'Aceito'}</span>
                      {' • '}{(inv.modules || []).length} módulos
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {inv.status === 'pending' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(getInviteLink(inv.token));
                        toast({ title: 'Link copiado!' });
                      }}
                    >
                      <Copy size={14} className="mr-1" /> Copiar Link
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => deleteInvite.mutate(inv.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserCog size={20} /> Convidar Membro</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">E-mail (opcional)</Label>
              <Input
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="colaborador@email.com"
                type="email"
              />
              <p className="text-[10px] text-muted-foreground">Deixe em branco para gerar um link genérico</p>
            </div>
            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Módulos com Acesso</Label>
              <div className="grid gap-2 max-h-60 overflow-y-auto">
                {ALL_MODULES.map(mod => (
                  <label key={mod.key} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/30 cursor-pointer">
                    <Checkbox
                      checked={selectedModules.includes(mod.key)}
                      onCheckedChange={() => toggleModule(selectedModules, setSelectedModules, mod.key)}
                    />
                    <span className="text-sm">{mod.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>Cancelar</Button>
            <Button onClick={() => createInvite.mutate()} disabled={createInvite.isPending} className="bg-gradient-gold text-white">
              {createInvite.isPending ? <Loader2 className="animate-spin mr-2" size={16} /> : null}
              Gerar Link de Convite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Permissions Dialog */}
      <Dialog open={!!showPermissionsDialog} onOpenChange={() => setShowPermissionsDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Permissões de Módulos</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 max-h-60 overflow-y-auto">
            {ALL_MODULES.map(mod => (
              <label key={mod.key} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/30 cursor-pointer">
                <Checkbox
                  checked={(editModules.length > 0 ? editModules : userPermissions).includes(mod.key)}
                  onCheckedChange={() => {
                    const current = editModules.length > 0 ? editModules : [...userPermissions];
                    toggleModule(current, setEditModules, mod.key);
                  }}
                />
                <span className="text-sm">{mod.label}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPermissionsDialog(null)}>Cancelar</Button>
            <Button
              onClick={() => updatePermissions.mutate({ userId: showPermissionsDialog!, modules: editModules.length > 0 ? editModules : userPermissions })}
              disabled={updatePermissions.isPending}
              className="bg-gradient-gold text-white"
            >
              Salvar Permissões
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EquipePage;
