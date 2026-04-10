import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Loader2, BarChart3, ShieldCheck, CheckCircle2 } from 'lucide-react';
import logo from '@/assets/logo.png';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        await signIn(email, password);
      } else {
        await signUp(email, password, fullName);
        toast({
          title: 'Conta criada!',
          description: 'Verifique seu email para confirmar o cadastro.',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(218,165,32,0.15),_transparent_48%),linear-gradient(135deg,_hsl(var(--background))_0%,_hsl(var(--secondary))_100%)] p-4 md:p-8 font-body">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-[1200px] overflow-hidden rounded-[28px] border border-border/40 bg-white/70 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.25)] backdrop-blur-sm animate-fade-in lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative hidden lg:flex flex-col justify-between overflow-hidden border-r border-border/20 bg-[linear-gradient(150deg,#0f172a_0%,#1e293b_45%,#334155_100%)] p-10 text-white">
          <div className="absolute -top-24 -right-20 h-72 w-72 rounded-full bg-gold/25 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-52 w-52 rounded-full bg-white/10 blur-3xl" />

          <div className="relative z-10 space-y-6">
            <div className="inline-flex items-center gap-3 rounded-2xl border border-white/25 bg-white/10 px-5 py-3 backdrop-blur-sm">
              <img src={logo} alt="David Melo" className="h-36 w-auto drop-shadow-[0_10px_24px_rgba(0,0,0,0.35)]" />
            </div>
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold/90">Plataforma Oficial David Melo</p>
              <h1 className="text-4xl font-display leading-tight tracking-tight">Gestão Comercial Inteligente para equipes de alta performance</h1>
              <p className="text-sm text-white/75 max-w-[420px]">
                Visual moderno, pipeline organizado e decisões rápidas em um hub único de operação.
              </p>
            </div>
          </div>

          <div className="relative z-10 grid gap-3">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
              <div className="flex items-center gap-2 text-gold text-xs font-black uppercase tracking-widest">
                <BarChart3 className="h-4 w-4" /> Pipeline visual
              </div>
              <p className="mt-2 text-xs text-white/80">Leads, tarefas e progresso em tempo real para todo o time.</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
              <div className="flex items-center gap-2 text-gold text-xs font-black uppercase tracking-widest">
                <ShieldCheck className="h-4 w-4" /> Acesso seguro
              </div>
              <p className="mt-2 text-xs text-white/80">Controle por perfil de usuário e autenticação centralizada.</p>
            </div>
          </div>
        </div>

        <div className="relative flex flex-col justify-center p-6 md:p-10 lg:p-12">
          <div className="mx-auto w-full max-w-[460px]">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gold">David Melo Hub</p>
                <h2 className="mt-2 text-3xl font-display tracking-tight text-foreground">
                  {isLogin ? 'Bem-vindo de volta' : 'Crie sua conta'}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isLogin ? 'Acesse seu CRM com segurança.' : 'Ative seu acesso para começar a operar.'}
                </p>
              </div>
              <div className="hidden md:flex h-16 w-16 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10 text-gold overflow-hidden">
                <img src={logo} alt="Logo David Melo" className="h-14 w-auto" />
              </div>
            </div>

            <div className="rounded-3xl border border-border/40 bg-white p-6 md:p-8 shadow-[0_20px_50px_-25px_rgba(15,23,42,0.25)]">
              <form onSubmit={handleSubmit} className="space-y-6">
            {!isLogin && (
              <div className="space-y-3">
                <Label htmlFor="fullName" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Nome Completo do Gestor</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="bg-secondary/20 border-border/10 focus:border-gold h-12 rounded-xl text-sm font-bold shadow-sm"
                  placeholder="Ex: João da Silva"
                  required
                />
              </div>
            )}

            <div className="space-y-3">
              <Label htmlFor="email" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">E-mail Corporativo</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-secondary/20 border-border/10 focus:border-gold h-12 rounded-xl text-sm font-bold shadow-sm"
                placeholder="nome@davidmelo.com"
                required
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <Label htmlFor="password" title="passwordLabel" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Senha de Acesso</Label>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-secondary/20 border-border/10 focus:border-gold h-12 rounded-xl text-sm font-bold shadow-sm pr-12"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-gold transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-gold hover:opacity-95 text-white font-black h-12 rounded-xl shadow-gold uppercase text-[11px] tracking-[0.2em] transition-all duration-300"
                >
                  {loading ? (
                    <Loader2 className="animate-spin mr-3" size={18} />
                  ) : null}
                  {isLogin ? 'Entrar no CRM' : 'Criar Perfil'}
                </Button>
              </form>

              <div className="mt-6 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                <p className="text-[11px] font-semibold text-emerald-800">
                  Ambiente protegido com autenticação centralizada e permissões por módulo.
                </p>
              </div>

              <div className="mt-7 text-center">
                <button
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-[10px] font-black uppercase tracking-widest text-gold/70 hover:text-gold transition-all"
                >
                  {isLogin ? 'Solicitar Acesso ao Sistema' : 'Já possui credenciais? Login'}
                </button>
              </div>
            </div>

            <div className="mt-8 text-center lg:hidden">
              <img src={logo} alt="David Melo" className="h-32 w-auto mx-auto" />
              <p className="mt-3 text-[10px] font-black uppercase tracking-[0.3em] text-gold">Gestão Comercial Integrada</p>
            </div>

            <div className="mt-8 text-center">
              <p className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-[0.2em]">&copy; 2024 David Melo Hub. Todos os direitos reservados.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
