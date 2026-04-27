import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, Menu, User, Bell } from 'lucide-react';

interface Props {
  onToggleSidebar: () => void;
  isMobile?: boolean;
}

const TopBar = ({ onToggleSidebar, isMobile = false }: Props) => {
  const { profile, signOut } = useAuth();

  return (
    <header className="h-16 md:h-20 border-b border-border/10 bg-white/40 backdrop-blur-2xl flex items-center justify-between px-6 md:px-12 z-10 transition-all">
      <div className="flex items-center gap-6 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="group relative h-10 w-10 flex items-center justify-center rounded-[14px] bg-white border border-border/20 shadow-sm hover:border-gold/30 hover:shadow-md transition-all active:scale-95"
        >
          <Menu size={18} className="text-muted-foreground group-hover:text-gold transition-colors" />
        </button>
        <div className="flex flex-col min-w-0">
          <p className="text-[10px] font-black uppercase text-gold tracking-[0.4em] leading-none truncate">Sistema • David Melo</p>
          <p className="text-[10px] font-bold text-muted-foreground/30 mt-1.5 hidden sm:block tracking-widest uppercase">Console de Comando Executivo</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-2">
          <button className="relative group h-10 w-10 flex items-center justify-center rounded-[14px] bg-white/50 border border-transparent hover:border-border/20 hover:bg-white transition-all">
            <Bell size={17} className="text-muted-foreground group-hover:text-gold transition-colors" />
            <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-rose-500 border-2 border-white animate-pulse" />
          </button>
          
          <div className="h-4 w-px bg-border/20 mx-2" />
        </div>

        <div className="flex items-center gap-4 pl-2">
          <div className="text-right hidden sm:block">
            <p className="text-[11px] font-black text-foreground uppercase tracking-widest leading-none">
              {profile?.full_name?.split(' ')[0] || 'Usuário'}
            </p>
            <div className="flex items-center justify-end gap-1.5 mt-1">
              <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-tighter">Online</span>
              <div className="w-1 h-1 rounded-full bg-emerald-500" />
            </div>
          </div>
          
          <div className="relative group cursor-pointer">
            <div className="w-11 h-11 rounded-2xl bg-gradient-gold p-[2px] shadow-gold-sm transition-transform group-hover:scale-105 active:scale-95">
              <div className="w-full h-full rounded-[14px] bg-white flex items-center justify-center text-gold">
                 <User size={18} />
              </div>
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            className="h-10 w-10 text-muted-foreground/30 hover:text-rose-500 hover:bg-rose-50 rounded-[14px] transition-all ml-2"
          >
            <LogOut size={16} />
          </Button>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
