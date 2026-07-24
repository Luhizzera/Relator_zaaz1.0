// @ts-nocheck
import React, { useState } from 'react';
import { Loader2, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';

/** Gate exibido no primeiro acesso de quem entrou via Google sem nome disponível no metadata (ver migração 0012). */
export default function CompleteProfile() {
  const { completeProfile, signOut } = useAuth();
  const [nome, setNome] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error } = await completeProfile(nome);
      if (error) setError(error);
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
          <h1 className="text-white font-black text-lg tracking-tight">Complete seu perfil</h1>
          <p className="text-white/50 text-xs font-medium mt-0.5">Sua conta Google não trouxe um nome — informe abaixo</p>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" className="p-6 space-y-4">
          <div className="relative">
            <UserIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              required
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome completo"
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
            Salvar e continuar
          </button>

          <button
            type="button"
            onClick={() => signOut()}
            className="w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}
