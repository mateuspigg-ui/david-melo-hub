import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Handshake, Calendar, DollarSign,
  UserCog, FileText, Building2, ShoppingBag, CreditCard,
  Landmark, Receipt, ArrowDownUp, ChevronDown
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import logo from '@/assets/logo.png';

interface NavSection {
  label: string;
  items: { label: string; path: string; icon: React.ElementType }[];
}

const sections: NavSection[] = [
  {
    label: 'Administrativo',
    items: [
      { label: 'Dashboard', path: '/', icon: LayoutDashboard },
      { label: 'Contratos', path: '/contratos', icon: FileText },
      { label: 'Documentos', path: '/documentos', icon: FileText },
      { label: 'Fornecedores', path: '/fornecedores', icon: Building2 },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { label: 'Meus Clientes', path: '/clientes', icon: Users },
      { label: 'Gestão de Clientes', path: '/crm', icon: Handshake },
    ],
  },
  {
    label: 'Eventos',
    items: [
      { label: 'Eventos', path: '/eventos', icon: ShoppingBag },
      { label: 'Agenda', path: '/agenda', icon: Calendar },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { label: 'Pagamentos', path: '/pagamentos', icon: CreditCard },
      { label: 'Conciliação', path: '/conciliacao', icon: Landmark },
      { label: 'Contas a Pagar', path: '/contas-pagar', icon: Receipt },
      { label: 'Recebimentos', path: '/recebimentos', icon: ArrowDownUp },
    ],
  },
  {
    label: 'Equipe',
    items: [
      { label: 'Equipe', path: '/equipe', icon: UserCog },
    ],
  },
];

interface Props {
  collapsed?: boolean;
}

const AppSidebar = ({ collapsed }: Props) => {
  const location = useLocation();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    Object.fromEntries(sections.map(s => [s.label, true]))
  );

  const toggleSection = (label: string) => {
    setOpenSections(prev => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <aside className={cn(
      "h-screen bg-sidebar flex flex-col border-r border-sidebar-border transition-all duration-300",
      collapsed ? "w-16" : "w-64"
    )}>
      <div className="p-4 flex items-center justify-center border-b border-sidebar-border">
        <img src={logo} alt="David Melo" className={cn("transition-all", collapsed ? "h-8" : "h-14")} />
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {sections.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <button
                onClick={() => toggleSection(section.label)}
                className="w-full flex items-center justify-between px-3 py-2 text-[10px] uppercase tracking-[0.15em] text-sidebar-foreground/40 font-semibold hover:text-sidebar-foreground/60 transition-colors"
              >
                {section.label}
                <ChevronDown className={cn(
                  "w-3 h-3 transition-transform",
                  !openSections[section.label] && "-rotate-90"
                )} />
              </button>
            )}
            {(collapsed || openSections[section.label]) && section.items.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={18} className={cn(isActive && "text-sidebar-primary")} />
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
};

export default AppSidebar;
