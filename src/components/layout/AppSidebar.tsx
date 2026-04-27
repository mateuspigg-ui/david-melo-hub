import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Handshake, Calendar, DollarSign,
  UserCog, FileText, Building2, ShoppingBag, CreditCard,
  Landmark, Receipt, ArrowDownUp, ChevronDown, Lock,
  MessageSquare, Boxes
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
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
      { label: 'Mensagens', path: '/mensagens', icon: MessageSquare, module: 'crm' },
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
    label: 'Almoxarifado',
    items: [
      { label: 'Dashboard do Estoque', path: '/almoxarifado', icon: Boxes, module: 'almoxarifado' },
      { label: 'Alimentação', path: '/almoxarifado/alimentacao', icon: Boxes, module: 'almoxarifado' },
      { label: 'Mobiliário e Decoração', path: '/almoxarifado/mobiliario-decoracao', icon: Boxes, module: 'almoxarifado' },
      { label: 'Seleção por Festa', path: '/almoxarifado/selecao-festa', icon: Boxes, module: 'almoxarifado' },
      { label: 'Movimentações', path: '/almoxarifado/movimentacoes', icon: Boxes, module: 'almoxarifado' },
      { label: 'Relatórios', path: '/almoxarifado/relatorios', icon: Boxes, module: 'almoxarifado' },
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
  const queryClient = useQueryClient();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    Object.fromEntries(sections.map(s => [s.label, true]))
  );

  // Total de mensagens não lidas pela equipe
  const { data: unreadChats = 0 } = useQuery({
    queryKey: ['chat_unread_total'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('lead_chats')
        .select('unread_company');
      if (error) return 0;
      return (data || []).reduce((acc: number, row: any) => acc + (row.unread_company || 0), 0);
    },
    refetchInterval: 15000,
  });

  useEffect(() => {
    const channel = supabase
      .channel('sidebar-chat-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_chats' }, () => {
        queryClient.invalidateQueries({ queryKey: ['chat_unread_total'] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const toggleSection = (label: string) => {
    setOpenSections(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : 'DM';

  return (
    <aside className={cn(
      "shrink-0 bg-gradient-to-b from-[#FFF9EE] via-white to-[#F6F8FC] backdrop-blur-xl flex flex-col border-r border-gold/20 shadow-[8px_0_28px_-20px_rgba(197,160,89,0.55)] transition-all duration-500 z-20",
      mobile ? "h-full w-full" : "h-screen",
      mobile ? "w-[86vw] max-w-[340px]" : collapsed ? "w-24" : "w-80"
    )}>
      <div className={cn("flex items-center justify-center bg-gradient-to-b from-gold/10 to-transparent border-b border-gold/15 p-10", mobile ? "p-6" : collapsed ? "p-4" : "p-10")}>
        <NavLink to="/" onClick={onNavigate} className="inline-flex" title="Ir para a página inicial">
          <img src={logo} alt="David Melo" className={cn("transition-all duration-700 hover:scale-105", mobile ? "h-20" : collapsed ? "h-12 grayscale brightness-110" : "h-32")} />
        </NavLink>
      </div>

      <nav className="flex-1 overflow-y-auto py-6 px-6 space-y-10 scrollbar-hide">
        {sections.map((section) => (
          <div key={section.label} className="space-y-4">
            {!collapsed && (
              <button
                onClick={() => toggleSection(section.label)}
                className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-gold/80 hover:text-gold-dark transition-colors font-display"
              >
                {section.label}
                <ChevronDown className={cn(
                  "w-3 h-3 transition-transform duration-500",
                  !openSections[section.label] && "-rotate-90"
                )} />
              </button>
            )}
            {(collapsed || openSections[section.label]) && (
              <div className="space-y-1.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  const canAccess = isAdmin || item.path === '/' || hasModuleAccess(item.module);

                  if (!canAccess) {
                    return (
                      <div
                        key={item.path}
                        className="flex items-center gap-4 px-4 py-3 rounded-2xl text-[11px] font-medium tracking-wide text-amber-900/40 cursor-not-allowed opacity-60"
                        title={collapsed ? `${item.label} (sem acesso)` : undefined}
                      >
                        <div className="w-8 h-8 rounded-xl bg-amber-100/50 border border-amber-200/60 flex items-center justify-center shrink-0">
                          <Icon size={16} />
                        </div>
                        {!collapsed && <span className="flex-1">{item.label}</span>}
                        {!collapsed && <Lock size={12} className="opacity-40" />}
                      </div>
                    );
                  }

                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-4 px-4 py-3 rounded-[20px] text-[12px] font-semibold tracking-wide transition-all duration-500 group relative overflow-hidden",
                        isActive
                          ? "bg-gradient-gold text-white shadow-gold-sm scale-[1.02] border-t border-white/20"
                          : "text-foreground/80 hover:bg-white/85 hover:text-gold-dark border border-transparent hover:border-gold/25 hover:shadow-sm"
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all duration-500",
                        isActive ? "bg-white/20 shadow-inner" : "bg-amber-50 border border-amber-100 group-hover:bg-gold/12 group-hover:border-gold/30"
                      )}>
                        <Icon size={16} className={cn("transition-transform duration-500", isActive ? "scale-110" : "group-hover:scale-110")} />
                      </div>
                      
                      {!collapsed && <span className="flex-1 transition-colors duration-300">{item.label}</span>}
                      
                      {item.path === '/mensagens' && unreadChats > 0 && (
                        <span className={cn(
                          "ml-auto text-[9px] font-black rounded-full px-2 py-0.5 min-w-[20px] text-center shadow-sm",
                          isActive ? "bg-white text-gold" : "bg-gold text-white"
                        )}>
                          {unreadChats > 99 ? '99+' : unreadChats}
                        </span>
                      )}
                      
                      {isActive && !collapsed && (
                        <div className="absolute right-0 top-0 h-full w-1 bg-white/40 blur-[2px]" />
                      )}
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className={cn("bg-gradient-to-t from-gold/10 to-transparent border-t border-gold/15", mobile ? "p-5" : collapsed ? "p-4 flex flex-col items-center" : "p-8")}>
         {!collapsed ? (
           <div className="flex items-center gap-4 p-2 rounded-[24px] bg-white/75 border border-gold/20 premium-shadow">
             <div className="w-12 h-12 rounded-2xl bg-gradient-gold flex items-center justify-center text-white font-black shadow-gold-sm text-sm border-t border-white/20">{initials}</div>
             <div className="min-w-0">
               <p className="text-[14px] font-semibold tracking-tight text-foreground leading-none font-display">{profile?.full_name?.split(' ')[0] || 'Usuário'}</p>
               <div className="flex items-center gap-1.5 mt-1.5">
                 <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                 <p className="text-[10px] font-semibold text-foreground/55 tracking-wide truncate">{profile?.role || 'Acesso Ativo'}</p>
                </div>
              </div>
            </div>
         ) : (
           <div className="w-12 h-12 rounded-2xl bg-gradient-gold flex items-center justify-center text-white font-black shadow-gold-sm text-sm border-t border-white/20">{initials}</div>
         )}
      </div>
    </aside>
  );
};

export default AppSidebar;
