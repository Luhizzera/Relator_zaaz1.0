// @ts-nocheck
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';

/** Destino do link de "esqueci minha senha" (ver Login.tsx) — o clique no e-mail já deixa uma sessão de recuperação ativa, essa tela só pede a nova senha. */
export default function ResetPassword() {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await updatePassword(password);
      if (error) setError(error);
      else setDone(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="bg-slate-900 px-6 py-8 text-center relative">
          <div className="absolute top-3 right-3">
            <ThemeToggle variant="ghost-dark" />
          </div>
          <img src="/images/logo-zaaz.jpeg" alt="ZAAZ" className="w-14 h-14 mx-auto rounded-lg mb-3 object-cover" />
          <h1 className="text-white font-black text-lg tracking-tight">Nova senha</h1>
          <p className="text-white/50 text-xs font-medium mt-0.5">Escolha uma nova senha para sua conta</p>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" className="p-6 space-y-4">
          {done ? (
            <div className="text-center space-y-3 py-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">Senha atualizada! Você já pode continuar usando o sistema.</p>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="text-sm font-bold text-blue-600 hover:underline"
              >
                Ir para o início
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  required
                  autoFocus
                  type="password"
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nova senha"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  required
                  type="password"
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Confirmar nova senha"
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
                Salvar nova senha
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
