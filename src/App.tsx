// @ts-nocheck
import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { OrdersProvider } from '@/contexts/OrdersContext';
import { SidebarProvider, useSidebar } from '@/contexts/SidebarContext';
import Login from '@/pages/Login';
import CompleteProfile from '@/pages/CompleteProfile';
import ResetPassword from '@/pages/ResetPassword';
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
import VistoriaOrdersList from '@/pages/vistoria/VistoriaOrdersList';
import VistoriaExecucaoMobile from '@/pages/vistoria/VistoriaExecucaoMobile';
import VistoriaBacklogMap from '@/pages/vistoria/VistoriaBacklogMap';
import CertificacaoOrdersList from '@/pages/certificacao/CertificacaoOrdersList';
import CertificacaoDetalhe from '@/pages/certificacao/CertificacaoDetalhe';
import { AppSidebar } from '@/components/AppSidebar';
import { Toaster } from '@/components/ui/toaster';

/** Tela cheia usada nos dois momentos em que ainda não há nada pra mostrar (sessão ou perfil carregando) — sem isso a tela fica em branco, indistinguível de um link quebrado no primeiro acesso. */
function FullScreenLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950">
      <Loader2 className="animate-spin text-slate-400" size={28} />
    </div>
  );
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const { session, profile, loading } = useAuth();
  if (loading) return <FullScreenLoading />;
  if (!session) return <Login />;
  if (!profile) return <FullScreenLoading />; // perfil ainda carregando logo após a sessão aparecer
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

/**
 * As únicas telas que sobrevivem a uma nova entrada no app — ver
 * `AbrirNoDashboard`.
 *
 * `/redefinir-senha` está aqui por um motivo diferente das outras: o link
 * chega por e-mail com o token na própria URL, então redirecionar para o
 * Dashboard mataria a recuperação de senha.
 */
const ROTAS_QUE_RESISTEM = [
  /^\/manutencao\/ordens\/[^/]+\/execucao$/,
  /^\/vistoria\/ordens\/[^/]+\/execucao$/,
  /^\/redefinir-senha$/,
];

/**
 * Ao entrar no app, leva para o Dashboard em vez de restaurar a última tela.
 *
 * O técnico fechava o app em qualquer lugar — numa OS que já tinha entregado,
 * num filtro, numa foto ampliada — e no dia seguinte reabria exatamente ali,
 * sem nada que explicasse por que estava naquela tela. O começo do turno é o
 * Dashboard.
 *
 * A exceção é execução de OS: ali é trabalho em andamento, e perder o lugar
 * custa caro para quem está em campo.
 *
 * Vale tanto para quem acabou de digitar a senha quanto para quem reabre o app
 * com a sessão ainda válida, porque para quem usa os dois casos são "abri o
 * app". Decide UMA vez por entrada — depois disso, navegar é com a pessoa — e
 * volta a valer se a sessão cair e ela entrar de novo.
 */
function AbrirNoDashboard() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const jaDecidiu = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!session) { jaDecidiu.current = false; return; }
    if (jaDecidiu.current) return;
    jaDecidiu.current = true;

    const caminho = location.pathname;
    if (caminho === '/') return;
    if (ROTAS_QUE_RESISTEM.some((rota) => rota.test(caminho))) return;
    navigate('/', { replace: true });
  }, [loading, session, location.pathname, navigate]);

  return null;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RequireAuth><HomeRoute /></RequireAuth>} />
      <Route path="/redefinir-senha" element={<RequireAuth><ResetPassword /></RequireAuth>} />
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
      <Route path="/vistoria/ordens" element={<RequireAuth><VistoriaOrdersList /></RequireAuth>} />
      <Route path="/vistoria/ordens/:id/execucao" element={<RequireAuth><VistoriaExecucaoMobile /></RequireAuth>} />
      <Route path="/vistoria/backlog" element={<RequireAuth><VistoriaBacklogMap /></RequireAuth>} />
      <Route path="/certificacao/ordens" element={<RequireAuth><CertificacaoOrdersList /></RequireAuth>} />
      {/* Uma tela de detalhe só, para os dois papéis: o técnico mede os pontos
          e o gestor confere os mesmos pontos. Duplicar a lista em duas telas
          seria duas versões da mesma coisa para manter iguais. */}
      <Route path="/certificacao/ordens/:id" element={<RequireAuth><CertificacaoDetalhe /></RequireAuth>} />
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
            <AbrirNoDashboard />
            <AppRoutes />
            <GlobalSidebar />
            <Toaster />
          </SidebarProvider>
        </OrdersProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

