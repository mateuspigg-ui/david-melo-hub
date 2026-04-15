import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profile: Profile | null;
  isAdmin: boolean;
  allowedModules: string[];
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasModuleAccess: (module: string) => boolean;
}

interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  phone: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [allowedModules, setAllowedModules] = useState<string[]>([]);

  const withTimeout = async <T,>(promise: Promise<T>, ms = 10000): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Tempo limite ao carregar contexto do usuário.')), ms);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  const loadUserContext = async (userId: string) => {
    await withTimeout(Promise.all([fetchProfile(userId), fetchPermissions(userId)]));
  };

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    setProfile(data);
  };

  const fetchPermissions = async (userId: string) => {
    // Check admin
    const { data: adminCheck } = await supabase.rpc('has_role', { _user_id: userId, _role: 'admin' as any });
    const admin = !!adminCheck;
    setIsAdmin(admin);

    if (admin) {
      // Admin has access to everything
      setAllowedModules(['all']);
    } else {
      const { data } = await supabase.from('module_permissions').select('module').eq('user_id', userId);
      setAllowedModules((data || []).map(d => d.module));
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        try {
          setSession(session);
          setUser(session?.user ?? null);
          if (session?.user) {
            await loadUserContext(session.user.id);
          } else {
            setProfile(null);
            setIsAdmin(false);
            setAllowedModules([]);
          }
        } catch (error) {
          console.error('Falha ao carregar contexto do usuário:', error);
        }
      }
    );

    withTimeout(supabase.auth.getSession(), 10000).then(async ({ data: { session } }) => {
      setLoading(true);
      try {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await loadUserContext(session.user.id);
        }
      } catch (error) {
        console.error('Falha ao restaurar sessão do usuário:', error);
      } finally {
        setLoading(false);
      }
    }).catch((error) => {
      console.error('Falha ao obter sessão inicial:', error);
      setLoading(false);
    });

    const forceReleaseLoading = setTimeout(() => {
      setLoading(false);
    }, 12000);

    return () => {
      clearTimeout(forceReleaseLoading);
      subscription.unsubscribe();
    };
  }, []);

  const hasModuleAccess = (module: string) => {
    if (isAdmin || allowedModules.includes('all')) return true;
    return allowedModules.includes(module);
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, profile, isAdmin, allowedModules, signIn, signUp, signOut, hasModuleAccess }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
