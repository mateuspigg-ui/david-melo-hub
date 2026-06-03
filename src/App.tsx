import { Suspense, lazy, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/layout/AppLayout";

// Retry dynamic imports once and reload the page if a stale chunk is detected
// (happens after a new deploy invalidates previously cached chunk hashes).
const lazyWithRetry = <T extends { default: React.ComponentType<any> }>(
  factory: () => Promise<T>,
) =>
  lazy(async () => {
    const reloadKey = `lazy-retry-${factory.toString()}`;
    try {
      return await factory();
    } catch (err: any) {
      const msg = String(err?.message || err);
      const isChunkError =
        msg.includes("Failed to fetch dynamically imported module") ||
        msg.includes("Importing a module script failed") ||
        msg.includes("error loading dynamically imported module");
      if (isChunkError && !sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, "1");
        window.location.reload();
        return new Promise<T>(() => {}); // never resolves, page is reloading
      }
      throw err;
    }
  });

const Auth = lazyWithRetry(() => import("@/pages/Auth"));
const Dashboard = lazyWithRetry(() => import("@/pages/Dashboard"));
const NotFound = lazyWithRetry(() => import("@/pages/NotFound"));
const ContratosPage = lazyWithRetry(() => import("@/pages/ContratosPage"));
const DocumentosPage = lazyWithRetry(() => import("@/pages/DocumentosPage"));
const FornecedoresPage = lazyWithRetry(() => import("@/pages/FornecedoresPage"));
const AgendaPage = lazyWithRetry(() => import("@/pages/AgendaPage"));
const EventosPage = lazyWithRetry(() => import("@/pages/EventosPage"));
const ContasPagarPage = lazyWithRetry(() => import("@/pages/ContasPagarPage"));
const RecebimentosPage = lazyWithRetry(() => import("@/pages/RecebimentosPage"));
const NotasFiscaisPage = lazyWithRetry(() => import("@/pages/NotasFiscaisPage"));
const ConciliacaoPage = lazyWithRetry(() => import("@/pages/ConciliacaoPage"));
const CRMPage = lazyWithRetry(() => import("@/pages/CRMPage"));
const ClientesPage = lazyWithRetry(() => import("@/pages/ClientesPage"));
const BankAccountsPage = lazyWithRetry(() => import("@/pages/BankAccountsPage"));
const FinancialDashboard = lazyWithRetry(() => import("@/pages/FinancialDashboard"));
const CalendarioFinanceiroPage = lazyWithRetry(() => import("@/pages/CalendarioFinanceiroPage"));
const EmpresasPage = lazyWithRetry(() => import("@/pages/EmpresasPage"));
const EquipePage = lazyWithRetry(() => import("@/pages/EquipePage"));
const InvitePage = lazyWithRetry(() => import("@/pages/InvitePage"));
const FormularioPage = lazyWithRetry(() => import("@/pages/FormularioPage"));
const PublicChatPage = lazyWithRetry(() => import("@/pages/PublicChatPage"));
const MensagensPage = lazyWithRetry(() => import("@/pages/MensagensPage"));
const AlmoxarifadoDashboardPage = lazyWithRetry(() => import("@/pages/AlmoxarifadoDashboardPage"));
const AlimentacaoPage = lazyWithRetry(() => import("@/pages/AlimentacaoPage"));
const MobiliarioDecoracaoPage = lazyWithRetry(() => import("@/pages/MobiliarioDecoracaoPage"));
const FloralPage = lazyWithRetry(() => import("@/pages/FloralPage"));
const SelecaoFestaPage = lazyWithRetry(() => import("@/pages/SelecaoFestaPage"));
const MovimentacoesEstoquePage = lazyWithRetry(() => import("@/pages/MovimentacoesEstoquePage"));
const RelatoriosEstoquePage = lazyWithRetry(() => import("@/pages/RelatoriosEstoquePage"));

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
                <Route path="/calendario-financeiro" element={<ModuleRoute module="financeiro" element={<CalendarioFinanceiroPage />} />} />
                <Route path="/empresas" element={<ModuleRoute module="financeiro" element={<EmpresasPage />} />} />
                <Route path="/contas-bancarias" element={<ModuleRoute module="financeiro" element={<BankAccountsPage />} />} />
                <Route path="/contas-pagar" element={<ModuleRoute module="financeiro" element={<ContasPagarPage />} />} />
                <Route path="/recebimentos" element={<ModuleRoute module="financeiro" element={<RecebimentosPage />} />} />
                <Route path="/notas-fiscais" element={<ModuleRoute module="financeiro" element={<NotasFiscaisPage />} />} />
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
