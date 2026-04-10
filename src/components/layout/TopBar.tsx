import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, Menu, User } from 'lucide-react';

interface Props {
  onToggleSidebar: () => void;
}

const TopBar = ({ onToggleSidebar }: Props) => {
  const { profile, signOut } = useAuth();

  return (
    <header className="h-20 border-b border-border/30 bg-white/65 backdrop-blur-xl flex items-center justify-between px-6 md:px-8 z-10">
      <div className="flex items-center gap-6">
        <button
          onClick={onToggleSidebar}
          className="p-2.5 rounded-xl bg-secondary/30 hover:bg-gold/10 hover:text-gold transition-all duration-300 text-muted-foreground shadow-sm"
        >
          <Menu size={20} />
        </button>
        <div className="hidden lg:flex flex-col">
          <p className="text-[10px] font-black uppercase text-gold tracking-[0.22em] leading-none">David Melo Hub</p>
          <p className="text-xs font-bold text-foreground/85 mt-1">Sistema operacional • Performance estável</p>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4 pl-6 border-l border-border/10">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-black text-foreground uppercase tracking-tight leading-none">
              {profile?.full_name || 'David Melo'}
            </p>
            <p className="text-[10px] font-bold text-gold uppercase tracking-[0.2em] mt-1.5 opacity-80">
              {profile?.role || 'Diretor Executivo'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-gradient-gold flex items-center justify-center text-white font-bold shadow-gold-sm border border-white/20">
             <User size={18} />
          </div>
        </div>
        
        <div className="px-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            className="h-10 w-10 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-xl transition-all"
          >
            <LogOut size={18} />
          </Button>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
