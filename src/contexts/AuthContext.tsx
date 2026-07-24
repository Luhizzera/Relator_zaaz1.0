import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase, ProfileRow, UserRole } from '@/lib/supabaseClient';

interface AuthContextType {
  session: Session | null;
  profile: ProfileRow | null;
  role: UserRole | null;
  isGestor: boolean;
  isSupervisor: boolean;
  /** Técnico LA ou de Manutenção — cobre os dois pra checagens que não distinguem o tipo (ex: rotear pra execução mobile). */
  isTecnico: boolean;
  /** Identifica o problema em campo e abre a OS — não executa o reparo. */
  isTecnicoLA: boolean;
  /** Recebe a delegação e executa o reparo em campo. */
  isTecnicoManutencao: boolean;
  /** Gestor ou supervisor — quem distribui/acompanha OS (não executa em campo). */
  canManageOrders: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, nome: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  /** Preenche o nome de quem entrou via Google sem `full_name`/`name` no metadata (ver migração 0012) e marca o perfil como completo. */
  completeProfile: (nome: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) {
      console.error('[Auth] Erro ao carregar perfil:', error);
      setProfile(null);
      return;
    }
    setProfile(data as ProfileRow);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) loadProfile(session.user.id);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string, nome: string) => {
    // Checagem só de UX — feedback imediato sem round-trip. A regra de
    // verdade mora no banco (gatilho handle_new_user, ver migração 0011),
    // que barra o cadastro mesmo se alguém chamar a API direto sem passar
    // por essa tela.
    if (!/@(zaaztelecom\.com\.br|gmail\.com)$/i.test(email.trim())) {
      return { error: 'Cadastro permitido apenas para e-mails @zaaztelecom.com.br ou @gmail.com' };
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nome } },
    });
    return { error: error?.message ?? null };
  };

  // Serve tanto pra login quanto pra cadastro — na primeira vez que a conta
  // Google aparece, o gatilho handle_new_user (mesmo do e-mail/senha) cria o
  // profile sozinho; nas próximas, só loga. Sem `hd` de propósito: isso
  // restringiria o seletor do Google a só um domínio Workspace, o que
  // bloquearia contas @gmail.com pessoais — e essas agora são aceitas (ver
  // migração 0011). Quem barra de verdade é o gatilho no banco, que roda pra
  // qualquer jeito de criar o usuário, OAuth incluído.
  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    return { error: error?.message ?? null };
  };

  const completeProfile = async (nome: string) => {
    if (!session?.user) return { error: 'Sessão inválida.' };
    const nomeTrim = nome.trim();
    if (!nomeTrim) return { error: 'Informe um nome.' };
    const { error } = await supabase
      .from('profiles')
      .update({ nome: nomeTrim, nome_definido: true })
      .eq('id', session.user.id);
    if (error) return { error: error.message };
    await loadProfile(session.user.id);
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const role = profile?.role ?? null;

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        role,
        isGestor: role === 'gestor',
        isSupervisor: role === 'supervisor',
        isTecnico: role === 'tecnico_la' || role === 'tecnico_manutencao',
        isTecnicoLA: role === 'tecnico_la',
        isTecnicoManutencao: role === 'tecnico_manutencao',
        canManageOrders: role === 'gestor' || role === 'supervisor',
        loading,
        signIn,
        signUp,
        signInWithGoogle,
        completeProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
