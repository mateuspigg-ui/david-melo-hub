import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Auth from "@/pages/Auth";
import AppLayout from "@/components/layout/AppLayout";
import Dashboard from "@/pages/Dashboard";
import NotFound from "@/pages/NotFound";
import {
  ContratosPage, DocumentosPage, FornecedoresPage,
  AgendaPage, EquipePage
} from "@/pages/Modules";
import EventosPage from "@/pages/EventosPage";
import PagamentosPage from "@/pages/PagamentosPage";
import ContasPagarPage from "@/pages/ContasPagarPage";
import RecebimentosPage from "@/pages/RecebimentosPage";
import ConciliacaoPage from "@/pages/ConciliacaoPage";
import CRMPage from "@/pages/CRMPage";
import ClientesPage from "@/pages/ClientesPage";

const queryClient = new QueryClient();

const ProtectedRoutes = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark">
        <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <AppLayout />
  );
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
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<AuthRoute />} />
            <Route element={<ProtectedRoutes />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/contratos" element={<ContratosPage />} />
              <Route path="/documentos" element={<DocumentosPage />} />
              <Route path="/fornecedores" element={<FornecedoresPage />} />
              <Route path="/clientes" element={<ClientesPage />} />
              <Route path="/crm" element={<CRMPage />} />
              <Route path="/eventos" element={<EventosPage />} />
              <Route path="/agenda" element={<AgendaPage />} />
              <Route path="/pagamentos" element={<PagamentosPage />} />
              <Route path="/conciliacao" element={<ConciliacaoPage />} />
              <Route path="/contas-pagar" element={<ContasPagarPage />} />
              <Route path="/recebimentos" element={<RecebimentosPage />} />
              <Route path="/equipe" element={<EquipePage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
