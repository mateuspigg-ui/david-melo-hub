import { Suspense, lazy, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
const Auth = lazy(() => import("@/pages/Auth"));
import AppLayout from "@/components/layout/AppLayout";
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const ContratosPage = lazy(() => import("@/pages/ContratosPage"));
const DocumentosPage = lazy(() => import("@/pages/DocumentosPage"));
const FornecedoresPage = lazy(() => import("@/pages/FornecedoresPage"));
const AgendaPage = lazy(() => import("@/pages/AgendaPage"));
const EventosPage = lazy(() => import("@/pages/EventosPage"));
const ContasPagarPage = lazy(() => import("@/pages/ContasPagarPage"));
const RecebimentosPage = lazy(() => import("@/pages/RecebimentosPage"));
const ConciliacaoPage = lazy(() => import("@/pages/ConciliacaoPage"));
const CRMPage = lazy(() => import("@/pages/CRMPage"));
const ClientesPage = lazy(() => import("@/pages/ClientesPage"));
const BankAccountsPage = lazy(() => import("@/pages/BankAccountsPage"));
const FinancialDashboard = lazy(() => import("@/pages/FinancialDashboard"));
const EmpresasPage = lazy(() => import("@/pages/EmpresasPage"));
const EquipePage = lazy(() => import("@/pages/EquipePage"));
const InvitePage = lazy(() => import("@/pages/InvitePage"));
const FormularioPage = lazy(() => import("@/pages/FormularioPage"));
const PublicChatPage = lazy(() => import("@/pages/PublicChatPage"));
const MensagensPage = lazy(() => import("@/pages/MensagensPage"));
const AlmoxarifadoDashboardPage = lazy(() => import("@/pages/AlmoxarifadoDashboardPage"));
const AlimentacaoPage = lazy(() => import("@/pages/AlimentacaoPage"));
const MobiliarioDecoracaoPage = lazy(() => import("@/pages/MobiliarioDecoracaoPage"));
const FloralPage = lazy(() => import("@/pages/FloralPage"));
const SelecaoFestaPage = lazy(() => import("@/pages/SelecaoFestaPage"));
const MovimentacoesEstoquePage = lazy(() => import("@/pages/MovimentacoesEstoquePage"));
const RelatoriosEstoquePage = lazy(() => import("@/pages/RelatoriosEstoquePage"));

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

const ModuleRoute = ({ module, element }: { module: string; element: ReactNode }) => {
  const { isAdmin, hasModuleAccess, loading } = useAuth();

  if (loading) return null;
  if (isAdmin || hasModuleAccess(module)) return <>{element}</>;

  return <Navigate to="/" replace />;
};

const AuthRoute = () => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <Auth />;
};

const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="animate-pulse text-gold font-display text-xl">Carregando David Melo Hub...</div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <AuthProvider>
        <HashRouter>
          <Suspense fallback={<PageFallback />}>
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
                <Route path="/pagamentos" element={<ModuleRoute module="financeiro" element={<RecebimentosPage />} />} />
                <Route path="/conciliacao" element={<ModuleRoute module="financeiro" element={<ConciliacaoPage />} />} />
                <Route path="/financeiro-dashboard" element={<ModuleRoute module="financeiro" element={<FinancialDashboard />} />} />
                <Route path="/empresas" element={<ModuleRoute module="financeiro" element={<EmpresasPage />} />} />
                <Route path="/contas-bancarias" element={<ModuleRoute module="financeiro" element={<BankAccountsPage />} />} />
                <Route path="/contas-pagar" element={<ModuleRoute module="financeiro" element={<ContasPagarPage />} />} />
                <Route path="/recebimentos" element={<ModuleRoute module="financeiro" element={<RecebimentosPage />} />} />
                <Route path="/equipe" element={<ModuleRoute module="equipe" element={<EquipePage />} />} />
                <Route path="/almoxarifado" element={<ModuleRoute module="almoxarifado" element={<AlmoxarifadoDashboardPage />} />} />
                <Route path="/almoxarifado/alimentacao" element={<ModuleRoute module="almoxarifado" element={<AlimentacaoPage />} />} />
                <Route path="/almoxarifado/mobiliario-decoracao" element={<ModuleRoute module="almoxarifado" element={<MobiliarioDecoracaoPage />} />} />
                <Route path="/almoxarifado/floral" element={<ModuleRoute module="almoxarifado" element={<FloralPage />} />} />
                <Route path="/almoxarifado/selecao-festa" element={<ModuleRoute module="almoxarifado" element={<SelecaoFestaPage />} />} />
                <Route path="/almoxarifado/movimentacoes" element={<ModuleRoute module="almoxarifado" element={<MovimentacoesEstoquePage />} />} />
                <Route path="/almoxarifado/relatorios" element={<ModuleRoute module="almoxarifado" element={<RelatoriosEstoquePage />} />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </HashRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
