import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Handshake, Calendar, DollarSign,
  UserCog, FileText, Building2, ShoppingBag, CreditCard,
  Landmark, Receipt, ArrowDownUp, ChevronDown, Lock, MessageCircle
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import logo from '@/assets/logo.png';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  module: string; // permission key
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    label: 'Administrativo',
    items: [
      { label: 'Dashboard', path: '/', icon: LayoutDashboard, module: 'dashboard' },
      { label: 'Contratos', path: '/contratos', icon: FileText, module: 'contratos' },
      { label: 'Documentos', path: '/documentos', icon: FileText, module: 'documentos' },
      { label: 'Fornecedores', path: '/fornecedores', icon: Building2, module: 'fornecedores' },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { label: 'Meus Clientes', path: '/clientes', icon: Users, module: 'clientes' },
      { label: 'Gestão de Clientes', path: '/crm', icon: Handshake, module: 'crm' },
      { label: 'Mensagens', path: '/mensagens', icon: MessageCircle, module: 'crm' },
      { label: 'Formulário', path: '/formulario', icon: FileText, module: 'crm' },
    ],
  },
  {
    label: 'Eventos',
    items: [
      { label: 'Eventos', path: '/eventos', icon: ShoppingBag, module: 'eventos' },
      { label: 'Agenda', path: '/agenda', icon: Calendar, module: 'agenda' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { label: 'Dashboard Financeiro', path: '/financeiro-dashboard', icon: LayoutDashboard, module: 'financeiro' },
      { label: 'Contas Bancárias', path: '/contas-bancarias', icon: Landmark, module: 'financeiro' },
      { label: 'Pagamentos', path: '/pagamentos', icon: CreditCard, module: 'financeiro' },
      { label: 'Conciliação', path: '/conciliacao', icon: ArrowDownUp, module: 'financeiro' },
      { label: 'Contas a Pagar', path: '/contas-pagar', icon: Receipt, module: 'financeiro' },
      { label: 'Recebimentos', path: '/recebimentos', icon: ArrowDownUp, module: 'financeiro' },
    ],
  },
  {
    label: 'Equipe',
    items: [
      { label: 'Equipe', path: '/equipe', icon: UserCog, module: 'equipe' },
    ],
  },
];

interface Props {
  collapsed?: boolean;
  mobile?: boolean;
  onNavigate?: () => void;
}

const AppSidebar = ({ collapsed, mobile = false, onNavigate }: Props) => {
  const location = useLocation();
  const { profile, hasModuleAccess, isAdmin } = useAuth();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    Object.fromEntries(sections.map(s => [s.label, true]))
  );

  const toggleSection = (label: string) => {
    setOpenSections(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : 'DM';

  return (
    <aside className={cn(
      "shrink-0 bg-white/78 backdrop-blur-xl flex flex-col border-r border-border/50 transition-all duration-300 shadow-xl z-20",
      mobile ? "h-full w-full" : "h-screen",
      mobile ? "w-[86vw] max-w-[340px]" : collapsed ? "w-20" : "w-72"
    )}>
      <div className={cn("flex items-center justify-center border-b border-border/10 bg-white/40 backdrop-blur-sm", mobile ? "p-5" : collapsed ? "p-4" : "p-8")}>
        <img src={logo} alt="David Melo" className={cn("transition-all duration-500", mobile ? "h-20" : collapsed ? "h-14 grayscale brightness-110" : "h-28")} />
      </div>

      <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-8 scrollbar-hide">
        {sections.map((section) => (
          <div key={section.label} className="space-y-3">
            {!collapsed && (
              <button
                onClick={() => toggleSection(section.label)}
                className="w-full flex items-center justify-between px-4 py-2 text-[10px] uppercase tracking-[0.25em] text-foreground/30 font-black hover:text-gold transition-colors"
              >
                {section.label}
                <ChevronDown className={cn(
                  "w-3 h-3 transition-transform duration-300",
                  !openSections[section.label] && "-rotate-90"
                )} />
              </button>
            )}
            {(collapsed || openSections[section.label]) && (
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  const canAccess = isAdmin || item.path === '/' || hasModuleAccess(item.module);

                  if (!canAccess) {
                    return (
                      <div
                        key={item.path}
                        className="flex items-center gap-4 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider text-muted-foreground/50 cursor-not-allowed"
                        title={collapsed ? `${item.label} (sem acesso)` : undefined}
                      >
                        <Icon size={18} />
                        {!collapsed && <span className="flex-1">{item.label}</span>}
                        {!collapsed && <Lock size={13} className="opacity-70" />}
                      </div>
                    );
                  }

                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-4 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 group",
                        isActive
                          ? "bg-gradient-gold text-white shadow-gold scale-[1.02]"
                          : "text-muted-foreground hover:bg-secondary/50 hover:text-gold"
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      <div className={cn(
                        "transition-transform duration-300",
                        isActive ? "scale-110" : "group-hover:scale-110"
                      )}>
                        <Icon size={18} />
                      </div>
                      {!collapsed && <span className="flex-1">{item.label}</span>}
                      {isActive && !collapsed && <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" />}
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className={cn("border-t border-border/10 bg-secondary/10", mobile ? "p-5" : collapsed ? "p-4 items-center" : "p-6")}>
         {!collapsed ? (
           <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl bg-gradient-gold flex items-center justify-center text-white font-bold shadow-gold-sm">{initials}</div>
             <div className="min-w-0">
               <p className="text-[10px] font-black uppercase text-foreground leading-none">{profile?.full_name || 'Usuário'}</p>
               <p className="text-[9px] font-bold text-muted-foreground mt-1 truncate">{profile?.role || 'Colaborador'}</p>
             </div>
           </div>
         ) : (
           <div className="w-10 h-10 mx-auto rounded-xl bg-gradient-gold flex items-center justify-center text-white font-bold shadow-gold-sm">{initials}</div>
         )}
      </div>
    </aside>
  );
};

export default AppSidebar;
