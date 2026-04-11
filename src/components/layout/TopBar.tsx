import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, Menu, User, Bell } from 'lucide-react';

interface Props {
  onToggleSidebar: () => void;
}

const TopBar = ({ onToggleSidebar }: Props) => {
  const { profile, signOut } = useAuth();

  return (
    <header className="h-16 border-b border-border/20 bg-white/70 backdrop-blur-xl flex items-center justify-between px-4 md:px-8 z-10">
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-xl bg-secondary/40 hover:bg-gold/10 hover:text-gold transition-all duration-200 text-muted-foreground"
        >
          <Menu size={18} />
        </button>
        <div className="hidden lg:flex flex-col">
          <p className="text-[10px] font-black uppercase text-gold tracking-[0.2em] leading-none">David Melo Hub</p>
          <p className="text-[10px] font-medium text-muted-foreground/60 mt-1">Sistema de gestão integrado</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="relative p-2 rounded-xl hover:bg-secondary/50 transition-colors text-muted-foreground/60 hover:text-foreground">
          <Bell size={17} />
        </button>
        
        <div className="h-6 w-px bg-border/30" />

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-[11px] font-bold text-foreground leading-none">
              {profile?.full_name || 'David Melo'}
            </p>
            <p className="text-[9px] font-bold text-gold uppercase tracking-widest mt-1 opacity-70">
              {profile?.role || 'Admin'}
            </p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-gradient-gold flex items-center justify-center text-white font-bold shadow-sm">
             <User size={16} />
          </div>
        </div>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={signOut}
          className="h-9 w-9 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/5 rounded-xl transition-all"
        >
          <LogOut size={16} />
        </Button>
      </div>
    </header>
  );
};

export default TopBar;
