import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react';
import logo from '@/assets/logo.png';

const InvitePage = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [invitation, setInvitation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const fetchInvitation = async () => {
      const { data, error } = await supabase
        .from('team_invitations')
        .select('*')
        .eq('token', token!)
        .single();

      if (error || !data || data.status !== 'pending') {
        setInvalid(true);
      } else {
        setInvitation(data);
        if (data.email) setEmail(data.email);
      }
      setLoading(false);
    };
    if (token) fetchInvitation();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // 1. Create user account
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: window.location.origin,
        },
      });
      if (signUpError) throw signUpError;

      if (signUpData.user) {
        // 2. Accept invitation (creates permissions + role)
        const { error: rpcError } = await supabase.rpc('accept_invitation', {
          p_token: token!,
          p_user_id: signUpData.user.id,
        });
        if (rpcError) throw rpcError;
      }

      toast({
        title: 'Conta criada com sucesso!',
        description: 'Verifique seu e-mail para confirmar o cadastro e acessar o sistema.',
      });

      setTimeout(() => navigate('/auth'), 3000);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-gold" size={40} />
      </div>
    );
  }

  if (invalid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-4 max-w-md">
          <XCircle className="mx-auto text-destructive" size={48} />
          <h1 className="text-2xl font-display text-foreground">Convite Inválido</h1>
          <p className="text-muted-foreground">Este link de convite é inválido, já foi utilizado ou expirou.</p>
          <Button onClick={() => navigate('/auth')} variant="outline">Ir para Login</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6 font-body">
      <div className="w-full max-w-[440px] space-y-10 animate-fade-in py-12">
        <div className="flex flex-col items-center space-y-4">
          <img src={logo} alt="David Melo" className="h-32 w-auto" />
          <div className="text-center">
            <h1 className="text-2xl font-display text-foreground">Você foi convidado!</h1>
            <p className="text-xs text-muted-foreground mt-2">Crie suas credenciais para acessar o sistema</p>
          </div>
        </div>

        <div className="bg-white premium-shadow-lg rounded-[32px] p-10 border border-border/40 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-gold" />

          {invitation?.modules?.length > 0 && (
            <div className="mb-6 p-3 bg-secondary/30 rounded-xl">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Módulos com acesso</p>
              <div className="flex flex-wrap gap-1.5">
                {invitation.modules.map((m: string) => (
                  <span key={m} className="text-[10px] font-bold bg-gold/10 text-gold px-2.5 py-1 rounded-full uppercase tracking-wider">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nome Completo</Label>
              <Input
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Seu nome completo"
                required
                className="bg-secondary/20 border-border/10 focus:border-gold h-11 rounded-xl text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">E-mail</Label>
              <Input
                value={email}
                onChange={e => setEmail(e.target.value)}
                type="email"
                placeholder="seu@email.com"
                required
                disabled={!!invitation?.email}
                className="bg-secondary/20 border-border/10 focus:border-gold h-11 rounded-xl text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Criar Senha</Label>
              <div className="relative">
                <Input
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  className="bg-secondary/20 border-border/10 focus:border-gold h-11 rounded-xl text-sm pr-12"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-gold">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={submitting} className="w-full bg-gradient-gold text-white font-black h-11 rounded-xl shadow-gold uppercase text-[11px] tracking-[0.25em]">
              {submitting ? <Loader2 className="animate-spin mr-2" size={16} /> : <CheckCircle size={16} className="mr-2" />}
              Criar Minha Conta
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default InvitePage;
