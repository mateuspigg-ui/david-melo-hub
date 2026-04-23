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

const createInvitationToken = () => {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
};

const EquipePage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showPermissionsDialog, setShowPermissionsDialog] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedModules, setSelectedModules] = useState<string[]>(['dashboard']);
  const [generatedInviteLink, setGeneratedInviteLink] = useState('');
  const [editModules, setEditModules] = useState<string[]>([]);
  const [editModulesDirty, setEditModulesDirty] = useState(false);
  const [editIsAdmin, setEditIsAdmin] = useState(false);

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

      return (profiles || [])
        .map(p => ({
          ...p,
          roles: (roles || []).filter(r => r.user_id === p.id).map(r => r.role),
        }))
        .filter((p) => (p.roles || []).length > 0);
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
      const token = createInvitationToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      if (inviteEmail) {
        await supabase
          .from('team_invitations')
          .delete()
          .eq('email', inviteEmail)
          .eq('status', 'pending');
      }

      const { data, error } = await supabase.from('team_invitations').insert({
        email: inviteEmail || null,
        invited_by: user!.id,
        token,
        modules: selectedModules,
        expires_at: expiresAt,
      } as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (data: any) => {
      try {
        const inviteToken = String(data?.token || '').trim();
        const link = `${window.location.origin}/#/convite/${encodeURIComponent(inviteToken)}`;
        setGeneratedInviteLink(link);

        try {
          await navigator.clipboard.writeText(link);
        } catch {
          // Clipboard can fail in some browsers/contexts; link remains visible for manual copy.
        }

        let emailSent = false;
        if (data?.email) {
          try {
            const { error } = await supabase.functions.invoke('send-team-invite-email', {
              body: {
                email: data.email,
                inviteLink: link,
                modules: data.modules || [],
              },
            });
            if (!error) emailSent = true;
          } catch {
            emailSent = false;
          }
        }

        toast({
          title: 'Convite enviado!',
          description: emailSent
            ? 'E-mail enviado com sucesso. O link também está disponível abaixo para cópia.'
            : 'Link do convite gerado. Copie o link abaixo para compartilhar.',
        });

        queryClient.invalidateQueries({ queryKey: ['team_invitations'] });
        setInviteEmail('');
        setSelectedModules(['dashboard']);
      } catch (err: any) {
        toast({
          title: 'Convite criado, mas houve um erro na exibição',
          description: err?.message || 'Reabra a tela de equipe e copie o link do convite pendente.',
          variant: 'destructive',
        });
      }
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  // Update permissions
  const updatePermissions = useMutation({
    mutationFn: async ({ userId, modules, makeAdmin }: { userId: string; modules: string[]; makeAdmin: boolean }) => {
      const safeModules = modules.length > 0 ? modules : ['dashboard'];

      if (makeAdmin) {
        const { error: adminError } = await supabase.from('user_roles').insert({ user_id: userId, role: 'admin' as any });
        if (adminError && !adminError.message?.includes('duplicate key')) throw adminError;

        const { error: removeMemberError } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId)
          .eq('role', 'team_member');
        if (removeMemberError) throw removeMemberError;

        return;
      }

      const { error: removeAdminError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', 'admin');
      if (removeAdminError) throw removeAdminError;

      const { error: memberError } = await supabase.from('user_roles').insert({ user_id: userId, role: 'team_member' as any });
      if (memberError && !memberError.message?.includes('duplicate key')) throw memberError;

      const { error: clearModulesError } = await supabase.from('module_permissions').delete().eq('user_id', userId);
      if (clearModulesError) throw clearModulesError;

      const { error: modulesError } = await supabase.from('module_permissions').insert(
        safeModules.map(m => ({ user_id: userId, module: m })) as any
      );
      if (modulesError) throw modulesError;
    },
    onSuccess: () => {
      toast({ title: 'Permissões atualizadas!' });
      queryClient.invalidateQueries({ queryKey: ['team_members'] });
      queryClient.invalidateQueries({ queryKey: ['module_permissions'] });
      setShowPermissionsDialog(null);
      setEditModules([]);
      setEditModulesDirty(false);
      setEditIsAdmin(false);
    },
    onError: (err: any) => {
      toast({
        title: 'Erro ao atualizar permissões',
        description: err?.message || 'Não foi possível salvar as alterações.',
        variant: 'destructive',
      });
    },
  });

  // Delete invitation
  const deleteInvite = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('team_invitations').delete().eq('id', id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team_invitations'] }),
  });

  // Remove member access
  const removeMember = useMutation({
    mutationFn: async ({ userId, email }: { userId: string; email?: string | null }) => {
      const operations: Promise<any>[] = [
        Promise.resolve(supabase.from('module_permissions').delete().eq('user_id', userId)),
        Promise.resolve(supabase.from('user_roles').delete().eq('user_id', userId)),
      ];

      if (email) {
        operations.push(
          Promise.resolve(
            supabase
              .from('team_invitations')
              .delete()
              .eq('email', email)
              .eq('status', 'pending')
          )
        );
      }

      const results = await Promise.all(operations);
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: () => {
      toast({ title: 'Membro removido da equipe!' });
      queryClient.invalidateQueries({ queryKey: ['team_members'] });
      queryClient.invalidateQueries({ queryKey: ['module_permissions'] });
      queryClient.invalidateQueries({ queryKey: ['team_invitations'] });
    },
    onError: (err: any) => {
      toast({
        title: 'Erro ao remover membro',
        description: err?.message || 'Não foi possível remover o membro da equipe.',
        variant: 'destructive',
      });
    },
  });

  const toggleModule = (modules: string[], setModules: (m: string[]) => void, key: string) => {
    setModules(modules.includes(key) ? modules.filter(m => m !== key) : [...modules, key]);
  };

  const getInviteLink = (token: string) => `${window.location.origin}/#/convite/${encodeURIComponent(String(token || '').trim())}`;

  if (!isAdmin) {
    return (
      <div className="space-y-4 animate-fade-in">
        <h1 className="text-4xl font-display text-foreground tracking-tighter uppercase">Equipe</h1>
        <p className="text-muted-foreground">Você não tem permissão para gerenciar a equipe.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-display text-foreground tracking-tighter uppercase">Equipe</h1>
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
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setShowPermissionsDialog(member.id);
                          setEditModules([]);
                          setEditModulesDirty(false);
                          setEditIsAdmin(member.roles?.includes('admin') || false);
                        }}
                        className="text-muted-foreground hover:text-gold"
                        title="Permissões"
                      >
                        <Settings size={18} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const confirmed = window.confirm(`Excluir o membro ${member.full_name || member.email || 'selecionado'} da equipe?`);
                          if (!confirmed) return;
                          removeMember.mutate({ userId: member.id, email: member.email });
                        }}
                        className="text-muted-foreground hover:text-destructive"
                        title="Excluir membro"
                        disabled={removeMember.isPending}
                      >
                        <Trash2 size={18} />
                      </Button>
                    </>
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
      <Dialog
        open={showInviteDialog}
        onOpenChange={(open) => {
          setShowInviteDialog(open);
          if (!open) setGeneratedInviteLink('');
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserCog size={20} /> Convidar Membro</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 overflow-y-auto min-h-0">
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

            {generatedInviteLink && (
              <div className="space-y-2 rounded-lg border border-gold/30 bg-gold/5 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-gold">Convite enviado</p>
                <div className="flex gap-2">
                  <Input value={generatedInviteLink} readOnly className="font-mono text-xs" />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(generatedInviteLink);
                        toast({ title: 'Link copiado!' });
                      } catch {
                        toast({ title: 'Não foi possível copiar automaticamente', description: 'Copie o link manualmente.', variant: 'destructive' });
                      }
                    }}
                  >
                    <Copy size={14} className="mr-1" /> Copiar
                  </Button>
                </div>
              </div>
            )}
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
      <Dialog
        open={!!showPermissionsDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowPermissionsDialog(null);
            setEditModules([]);
            setEditModulesDirty(false);
            setEditIsAdmin(false);
          }
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Permissões de Módulos</DialogTitle>
          </DialogHeader>
          <div className="rounded-lg border border-border/60 p-3 bg-secondary/20">
            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox
                checked={editIsAdmin}
                onCheckedChange={(value) => setEditIsAdmin(!!value)}
              />
              <span className="text-sm font-semibold">Administrador (acesso total)</span>
            </label>
            <p className="text-[11px] text-muted-foreground mt-2">
              Quando ativado, o colaborador tem acesso total ao sistema e pode gerenciar equipe e permissões.
            </p>
          </div>
          <div className="grid gap-2 max-h-60 overflow-y-auto">
            {ALL_MODULES.map(mod => (
              <label key={mod.key} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/30 cursor-pointer">
                <Checkbox
                  checked={(editModulesDirty ? editModules : userPermissions).includes(mod.key)}
                  disabled={editIsAdmin}
                  onCheckedChange={() => {
                    const current = editModulesDirty ? editModules : [...userPermissions];
                    setEditModulesDirty(true);
                    toggleModule(current, setEditModules, mod.key);
                  }}
                />
                <span className="text-sm">{mod.label}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowPermissionsDialog(null);
                setEditModules([]);
                setEditModulesDirty(false);
                setEditIsAdmin(false);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => updatePermissions.mutate({
                userId: showPermissionsDialog!,
                modules: editModulesDirty ? editModules : userPermissions,
                makeAdmin: editIsAdmin,
              })}
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
