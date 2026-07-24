// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { Loader2, Lock, Mail, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';

function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}

export default function Login() {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [signupDone, setSignupDone] = useState(false);

  // O login com Google redireciona pra fora e volta — se o gatilho do banco
  // rejeitar a conta (domínio errado), o Supabase manda o erro de volta na
  // própria URL, não como retorno de função. A mensagem crua que vem daí
  // costuma ser genérica ("Database error saving new user", já que o
  // Supabase não repassa o texto exato da exceção do Postgres por padrão) —
  // trocamos por uma mensagem clara nesse caso específico.
  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const searchParams = new URLSearchParams(window.location.search);
    const raw = hashParams.get('error_description') || searchParams.get('error_description');
    if (raw) {
      const decoded = decodeURIComponent(raw.replace(/\+/g, ' '));
      setError(
        /database error|saving new user/i.test(decoded)
          ? 'Login com Google permitido apenas para contas @zaaztelecom.com.br ou @gmail.com.'
          : decoded,
      );
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password);
        if (error) setError(error);
      } else {
        const { error } = await signUp(email, password, nome);
        if (error) setError(error);
        else setSignupDone(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      setError(error);
      setGoogleLoading(false);
    }
    // Sem erro: a página vai navegar pro Google, não precisa desligar o loading.
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="bg-slate-900 px-6 py-8 text-center relative">
          <div className="absolute top-3 right-3">
            <ThemeToggle variant="ghost-dark" />
          </div>
          <img src="/images/logo-zaaz.jpeg" alt="ZAAZ" className="w-14 h-14 mx-auto rounded-lg mb-3 object-cover" />
          <h1 className="text-white font-black text-lg tracking-tight">ZAAZ SYSTEM</h1>
          <p className="text-white/50 text-xs font-medium mt-0.5">Relatórios & Manutenção</p>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" className="p-6 space-y-4">
          {signupDone ? (
            <div className="text-center space-y-3 py-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Conta criada! Verifique seu e-mail para confirmar o cadastro e depois faça login.
              </p>
              <button
                type="button"
                onClick={() => { setMode('login'); setSignupDone(false); }}
                className="text-sm font-bold text-blue-600 hover:underline"
              >
                Voltar para o login
              </button>
            </div>
          ) : (
            <>
              {mode === 'signup' && (
                <div className="relative">
                  <UserIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Nome completo"
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="E-mail"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  required
                  type="password"
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Senha"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {error && (
                <p className="text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className={cn(
                  'w-full py-2.5 rounded-xl text-sm font-bold text-white transition-colors',
                  'bg-blue-600 hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2',
                )}
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                {mode === 'login' ? 'Entrar' : 'Criar conta'}
              </button>

              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">ou</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              </div>

              {/* Serve tanto pra entrar quanto pra cadastrar — não precisa de
                  um botão separado por modo, é a mesma ação do lado do Google. */}
              <button
                type="button"
                onClick={handleGoogle}
                disabled={googleLoading}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
              >
                {googleLoading ? <Loader2 size={16} className="animate-spin" /> : <GoogleIcon />}
                Continuar com Google
              </button>

              <button
                type="button"
                onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); }}
                className="w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                {mode === 'login' ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entrar'}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
