import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Auth from "@/pages/Auth";
import AppLayout from "@/components/layout/AppLayout";
import Dashboard from "@/pages/Dashboard";
import NotFound from "@/pages/NotFound";
import {
  ContratosPage, DocumentosPage, FornecedoresPage,
  AgendaPage
} from "@/pages/Modules";
import EventosPage from "@/pages/EventosPage";
import PagamentosPage from "@/pages/PagamentosPage";
import ContasPagarPage from "@/pages/ContasPagarPage";
import RecebimentosPage from "@/pages/RecebimentosPage";
import ConciliacaoPage from "@/pages/ConciliacaoPage";
import CRMPage from "@/pages/CRMPage";
import ClientesPage from "@/pages/ClientesPage";
import BankAccountsPage from "@/pages/BankAccountsPage";
import FinancialDashboard from "@/pages/FinancialDashboard";
import EquipePage from "@/pages/EquipePage";
import InvitePage from "@/pages/InvitePage";
import FormularioPage from "@/pages/FormularioPage";
import PublicChatPage from "@/pages/PublicChatPage";
import MensagensPage from "@/pages/MensagensPage";

const queryClient = new QueryClient();

const ProtectedRoutes = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse text-gold font-display text-xl">Carregando David Melo Hub...</div>
    </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <AppLayout />
  );
};

const ModuleRoute = ({ module, element }: { module: string; element: JSX.Element }) => {
  const { isAdmin, hasModuleAccess, loading } = useAuth();

  if (loading) return null;
  if (isAdmin || hasModuleAccess(module)) return element;

  return <Navigate to="/" replace />;
};

const AuthRoute = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <Auth />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <AuthProvider>
        <HashRouter>
          <Routes>
            <Route path="/auth" element={<AuthRoute />} />
            <Route path="/convite/:token" element={<InvitePage />} />
            <Route path="/formulario-publico" element={<FormularioPage publicView />} />
            <Route path="/chat/:token" element={<PublicChatPage />} />
            <Route path="/eventServiceSupplierChat/:token" element={<PublicChatPage />} />
            <Route element={<ProtectedRoutes />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/contratos" element={<ModuleRoute module="contratos" element={<ContratosPage />} />} />
              <Route path="/documentos" element={<ModuleRoute module="documentos" element={<DocumentosPage />} />} />
              <Route path="/fornecedores" element={<ModuleRoute module="fornecedores" element={<FornecedoresPage />} />} />
              <Route path="/clientes" element={<ModuleRoute module="clientes" element={<ClientesPage />} />} />
              <Route path="/crm" element={<ModuleRoute module="crm" element={<CRMPage />} />} />
              <Route path="/formulario" element={<ModuleRoute module="crm" element={<FormularioPage />} />} />
              <Route path="/eventos" element={<ModuleRoute module="eventos" element={<EventosPage />} />} />
              <Route path="/mensagens" element={<ModuleRoute module="crm" element={<MensagensPage />} />} />
              <Route path="/agenda" element={<ModuleRoute module="agenda" element={<AgendaPage />} />} />
              <Route path="/pagamentos" element={<ModuleRoute module="financeiro" element={<PagamentosPage />} />} />
              <Route path="/conciliacao" element={<ModuleRoute module="financeiro" element={<ConciliacaoPage />} />} />
              <Route path="/financeiro-dashboard" element={<ModuleRoute module="financeiro" element={<FinancialDashboard />} />} />
              <Route path="/contas-bancarias" element={<ModuleRoute module="financeiro" element={<BankAccountsPage />} />} />
              <Route path="/contas-pagar" element={<ModuleRoute module="financeiro" element={<ContasPagarPage />} />} />
              <Route path="/recebimentos" element={<ModuleRoute module="financeiro" element={<RecebimentosPage />} />} />
              <Route path="/equipe" element={<ModuleRoute module="equipe" element={<EquipePage />} />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </HashRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
