import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
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
    <div className="min-h-screen flex items-center justify-center bg-background p-6 font-body">
      <div className="w-full max-w-[440px] space-y-12 animate-fade-in py-12">
        <div className="flex flex-col items-center space-y-6">
          <div className="relative group">
            <div className="absolute -inset-4 bg-gold/10 rounded-full blur-2xl group-hover:bg-gold/20 transition-all duration-700" />
            <img src={logo} alt="David Melo" className="h-64 w-auto relative z-10" />
          </div>
          <div className="text-center relative">
            <h1 className="text-4xl font-display text-foreground tracking-tighter uppercase leading-none">Gestão de Ecossistema</h1>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-gold mt-3 opacity-80">David Melo • Hub Integrado</p>
          </div>
        </div>

        <div className="bg-white premium-shadow-lg rounded-[32px] p-12 border border-border/40 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-gold" />
          
          <form onSubmit={handleSubmit} className="space-y-8">
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
              className="w-full bg-gradient-gold hover:opacity-95 text-white font-black h-12 rounded-xl shadow-gold uppercase text-[11px] tracking-[0.25em] mt-2 transition-all duration-300"
            >
              {loading ? (
                <Loader2 className="animate-spin mr-3" size={18} />
              ) : null}
              {isLogin ? 'Autenticar' : 'Criar Perfil'}
            </Button>
          </form>

          <div className="mt-10 text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-[10px] font-black uppercase tracking-widest text-gold/60 hover:text-gold transition-all"
            >
              {isLogin ? 'Solicitar Acesso ao Sistema' : 'Já possui credenciais? Login'}
            </button>
          </div>
        </div>
        
        <div className="text-center">
           <p className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-[0.2em]">&copy; 2024 David Melo Hub. Todos os direitos reservados.</p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
