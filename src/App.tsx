// @ts-nocheck
import { Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { OrdersProvider } from '@/contexts/OrdersContext';
import { SidebarProvider, useSidebar } from '@/contexts/SidebarContext';
import Login from '@/pages/Login';
import CompleteProfile from '@/pages/CompleteProfile';
import Dashboard from '@/pages/Dashboard';
import OrdersList from '@/pages/OrdersList';
import UserManagement from '@/pages/UserManagement';
import OrdemEditor from '@/pages/OrdemEditor';
import OrdemFotos from '@/pages/OrdemFotos';
import NotFound from '@/pages/NotFound';
import ManutencaoDashboard from '@/pages/manutencao/ManutencaoDashboard';
import ManutencaoOrdersList from '@/pages/manutencao/ManutencaoOrdersList';
import ManutencaoOrderDetail from '@/pages/manutencao/ManutencaoOrderDetail';
import ManutencaoExecucaoMobile from '@/pages/manutencao/ManutencaoExecucaoMobile';
import NovaOrdemManutencao from '@/pages/manutencao/NovaOrdemManutencao';
import MinhaEquipe from '@/pages/manutencao/MinhaEquipe';
import { AppSidebar } from '@/components/AppSidebar';
import { Toaster } from '@/components/ui/toaster';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { session, profile, loading } = useAuth();
  if (loading) return null; // ou um spinner
  if (!session) return <Login />;
  if (!profile) return null; // perfil ainda carregando logo após a sessão aparecer
  if (!profile.nome_definido) return <CompleteProfile />;
  return children;
}

/**
 * Tela inicial ("/") depende do papel: gestor/supervisor caem direto no
 * Dashboard de Manutenção (é o que eles tocam no dia a dia); técnico cai no
 * Dashboard de relatório fotográfico (resumo dos dois domínios).
 */
function HomeRoute() {
  const { canManageOrders } = useAuth();
  return canManageOrders ? <ManutencaoDashboard /> : <Dashboard />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RequireAuth><HomeRoute /></RequireAuth>} />
      <Route path="/ordens" element={<RequireAuth><OrdersList /></RequireAuth>} />
      <Route path="/ordens/:id" element={<RequireAuth><OrdemEditor /></RequireAuth>} />
      <Route path="/ordens/:id/fotos" element={<RequireAuth><OrdemFotos /></RequireAuth>} />
      <Route path="/usuarios" element={<RequireAuth><UserManagement /></RequireAuth>} />
      <Route path="/manutencao" element={<RequireAuth><ManutencaoDashboard /></RequireAuth>} />
      <Route path="/manutencao/nova" element={<RequireAuth><NovaOrdemManutencao /></RequireAuth>} />
      <Route path="/manutencao/ordens" element={<RequireAuth><ManutencaoOrdersList /></RequireAuth>} />
      <Route path="/manutencao/ordens/:id" element={<RequireAuth><ManutencaoOrderDetail /></RequireAuth>} />
      <Route path="/manutencao/ordens/:id/execucao" element={<RequireAuth><ManutencaoExecucaoMobile /></RequireAuth>} />
      <Route path="/manutencao/equipe" element={<RequireAuth><MinhaEquipe /></RequireAuth>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

/** Monta a sidebar UMA vez, fora das rotas, pra ficar disponível em qualquer tela sem prop drilling. */
function GlobalSidebar() {
  const { isOpen, close } = useSidebar();
  return <AppSidebar isOpen={isOpen} onClose={close} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <OrdersProvider>
          <SidebarProvider>
            <AppRoutes />
            <GlobalSidebar />
            <Toaster />
          </SidebarProvider>
        </OrdersProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

