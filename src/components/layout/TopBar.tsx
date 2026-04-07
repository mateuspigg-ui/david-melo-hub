import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, Menu, User } from 'lucide-react';

interface Props {
  onToggleSidebar: () => void;
}

const TopBar = ({ onToggleSidebar }: Props) => {
  const { profile, signOut } = useAuth();

  return (
    <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-6">
      <button
        onClick={onToggleSidebar}
        className="p-2 rounded-lg hover:bg-muted transition-colors text-foreground/70"
      >
        <Menu size={20} />
      </button>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <User size={16} className="text-primary" />
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-foreground">
              {profile?.full_name || 'Usuário'}
            </p>
            <p className="text-xs text-muted-foreground capitalize">
              {profile?.role || 'admin'}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={signOut}
          className="text-muted-foreground hover:text-destructive"
        >
          <LogOut size={18} />
        </Button>
      </div>
    </header>
  );
};

export default TopBar;
