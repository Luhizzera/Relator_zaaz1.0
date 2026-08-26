import { useEffect, useState } from 'react';
import { X, Loader2, MapPin, CheckCircle2, ArrowRight } from 'lucide-react';
import { getSignedFotoVistoriaUrl } from '@/lib/supabaseClient';
import { gerarOSCorretivaDaPendencia } from '@/lib/vistoriaService';
import { PendenciaBacklog, TIPOS_CORRETIVA_VISTORIA, TipoCorretivaVistoria } from '@/types/vistoria';
import { PrioridadeOS, PRIORIDADE_LABEL, deserializeProblemas } from '@/types/manutencao';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface GerarCorretivaModalProps {
  pendencia: PendenciaBacklog;
  onClose: () => void;
  /** Disparado depois que a OS é gerada com sucesso — quem chama decide o que fazer (ex: recarregar o backlog). */
  onGerada: () => void;
  /** Navegar até a OS recém-criada (abre a tela de detalhe pra delegar) — opcional. */
  onAbrirOrdem?: (ordemId: string) => void;
}

const PRIORIDADES: PrioridadeOS[] = ['baixa', 'media', 'alta', 'critica'];

/**
 * Ação confirmada (Decisão 2-B) pra gerar a OS corretiva a partir de uma
 * pendência do backlog de Vistoria — não é 1-clique automático de propósito:
 * quem administra o backlog escolhe o tipo (CTO ou Rede) e a prioridade
 * antes de a OS nascer de verdade.
 */
export function GerarCorretivaModal({ pendencia, onClose, onGerada, onAbrirOrdem }: GerarCorretivaModalProps) {
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoCorretivaVistoria>(TIPOS_CORRETIVA_VISTORIA[0]);
  const [prioridade, setPrioridade] = useState<PrioridadeOS>('media');
  const [gerando, setGerando] = useState(false);
  const [ordemGerada, setOrdemGerada] = useState<{ id: string; numero: string } | null>(null);
  const problemasMarcados = deserializeProblemas(pendencia.problemas);

  useEffect(() => {
    let ativo = true;
    getSignedFotoVistoriaUrl(pendencia.storagePath).then((url) => { if (ativo) setFotoUrl(url); });
    return () => { ativo = false; };
  }, [pendencia.storagePath]);

  const handleGerar = async () => {
    setGerando(true);
    try {
      const nova = await gerarOSCorretivaDaPendencia(pendencia, { tipo, prioridade }, pendencia.ordemVistoriaNumero);
      toast({ title: `OS ${nova.numero} gerada` });
      setOrdemGerada({ id: nova.id, numero: nova.numero });
      onGerada();
    } catch (err) {
      console.error('[Vistoria] Erro ao gerar OS corretiva:', err);
      toast({ title: 'Não foi possível gerar a OS', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setGerando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900">
          <div>
            <h2 className="text-base font-black text-slate-800 dark:text-slate-100">Gerar OS corretiva</h2>
            <p className="text-xs text-slate-400">Vistoria {pendencia.ordemVistoriaNumero}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar">
            <X className="icon-md" />
          </button>
        </div>

        {ordemGerada ? (
          <div className="p-5 space-y-4 text-center">
            <div className="flex flex-col items-center gap-2 py-4">
              <CheckCircle2 className="icon-xl text-green-600" />
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">OS {ordemGerada.numero} criada</p>
              <p className="text-xs text-slate-400">Agora é só delegar um técnico de manutenção pra ela, na tela da OS.</p>
            </div>
            {onAbrirOrdem && (
              <button
                onClick={() => onAbrirOrdem(ordemGerada.id)}
                className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold py-2.5 rounded-xl transition-colors"
              >
                Abrir OS <ArrowRight size={16} />
              </button>
            )}
            <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-300">
              Fechar
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {fotoUrl ? (
              <img src={fotoUrl} alt="Pendência" className="w-full h-40 object-cover rounded-xl" />
            ) : (
              <div className="w-full h-40 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            )}
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <MapPin size={12} /> {pendencia.latitude.toFixed(6)}, {pendencia.longitude.toFixed(6)}
            </p>
            {/* O que o técnico marcou em campo — vira ocorrência e checklist
                de solução na OS, então quem confirma aqui já sabe o que a
                corretiva vai nascer contendo. */}
            {problemasMarcados.length > 0 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-400 mb-1">
                  Marcado pelo técnico
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {problemasMarcados.map((p) => (
                    <span key={p} className="text-xs font-bold px-2 py-1 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {pendencia.observacao && (
              <p className="text-sm text-slate-700 dark:text-slate-200">{pendencia.observacao}</p>
            )}

            <div className="h-px bg-slate-100 dark:bg-slate-800" />

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5 block">Tipo da OS</label>
              <div className="grid grid-cols-2 gap-2">
                {TIPOS_CORRETIVA_VISTORIA.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className={cn(
                      'px-3 py-2.5 rounded-xl text-sm font-bold border transition-colors',
                      tipo === t
                        ? 'bg-amber-500 border-amber-500 text-white'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300',
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5 block">Prioridade</label>
              <div className="grid grid-cols-4 gap-2">
                {PRIORIDADES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrioridade(p)}
                    className={cn(
                      'px-2 py-2 rounded-xl text-xs font-bold border transition-colors',
                      prioridade === p
                        ? 'bg-amber-500 border-amber-500 text-white'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300',
                    )}
                  >
                    {PRIORIDADE_LABEL[p]}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleGerar}
              disabled={gerando}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-bold py-2.5 rounded-xl transition-colors"
            >
              {gerando ? <Loader2 size={16} className="animate-spin" /> : 'Gerar OS'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
