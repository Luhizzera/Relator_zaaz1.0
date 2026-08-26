import { useMemo, useState } from 'react';
import { X, Loader2, FileSpreadsheet, Globe, Package } from 'lucide-react';
import { exportarPendencias, type FormatoExportacao } from '@/lib/vistoriaExport';
import type { PendenciaBacklog } from '@/types/vistoria';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export type EscopoExportacao = 'todos' | 'atividade' | 'selecionados';

interface ExportarPendenciasModalProps {
  /** Universo já visível na tela (respeitando o filtro de equipe) — o recorte é aplicado sobre isto. */
  pendencias: PendenciaBacklog[];
  /** Pontos marcados pelo polígono; vazio quando não há seleção. */
  selecionadas: PendenciaBacklog[];
  /** Recorte inicial — a tela abre já em "selecionados" quando existe seleção. */
  escopoInicial?: EscopoExportacao;
  onClose: () => void;
}

const FORMATOS: { valor: FormatoExportacao; label: string; detalhe: string; icone: typeof Globe }[] = [
  { valor: 'xlsx', label: 'Excel', detalhe: 'Tabela .xlsx', icone: FileSpreadsheet },
  { valor: 'kml', label: 'KML', detalhe: 'Google Earth', icone: Globe },
  { valor: 'kmz', label: 'KMZ', detalhe: 'KML compactado', icone: Package },
];

export function ExportarPendenciasModal({
  pendencias, selecionadas, escopoInicial, onClose,
}: ExportarPendenciasModalProps) {
  const [formato, setFormato] = useState<FormatoExportacao>('xlsx');
  const [escopo, setEscopo] = useState<EscopoExportacao>(
    escopoInicial ?? (selecionadas.length > 0 ? 'selecionados' : 'todos'),
  );
  const [rotaId, setRotaId] = useState('');
  const [exportando, setExportando] = useState(false);

  // "Atividade" = a rota de vistoria. Lista só as que têm ponto no que está
  // visível, pra não oferecer recorte que resultaria em arquivo vazio.
  const atividades = useMemo(() => {
    const mapa = new Map<string, { id: string; numero: string; titulo?: string; total: number }>();
    pendencias.forEach((p) => {
      const atual = mapa.get(p.ordemVistoriaId);
      if (atual) atual.total += 1;
      else mapa.set(p.ordemVistoriaId, {
        id: p.ordemVistoriaId,
        numero: p.ordemVistoriaNumero,
        titulo: p.ordemVistoriaTitulo,
        total: 1,
      });
    });
    return Array.from(mapa.values()).sort((a, b) => a.numero.localeCompare(b.numero));
  }, [pendencias]);

  const alvo = useMemo(() => {
    if (escopo === 'selecionados') return selecionadas;
    if (escopo === 'atividade') return rotaId ? pendencias.filter((p) => p.ordemVistoriaId === rotaId) : [];
    return pendencias;
  }, [escopo, selecionadas, pendencias, rotaId]);

  const handleExportar = async () => {
    if (alvo.length === 0) return;
    setExportando(true);
    try {
      const sufixo = escopo === 'atividade'
        ? (atividades.find((a) => a.id === rotaId)?.numero ?? 'atividade')
        : escopo === 'selecionados' ? 'selecionados' : 'todos';
      await exportarPendencias(alvo, formato, `pontos-vistoria-${sufixo}`);
      toast({ title: `${alvo.length} ponto(s) exportado(s)` });
      onClose();
    } catch (err) {
      console.error('[Vistoria] Erro ao exportar pontos:', err);
      toast({ title: 'Não foi possível exportar', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setExportando(false);
    }
  };

  const opcaoEscopo = (valor: EscopoExportacao, label: string, contagem: number, desabilitada?: boolean) => (
    <button
      key={valor}
      type="button"
      disabled={desabilitada}
      onClick={() => setEscopo(valor)}
      className={cn(
        'w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors disabled:opacity-40',
        escopo === valor
          ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800',
      )}
    >
      <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{label}</span>
      <span className="text-xs font-bold text-slate-400 shrink-0">{contagem}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900">
          <h2 className="text-base font-black text-slate-800 dark:text-slate-100">Exportar pontos</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2 block">Formato</label>
            <div className="grid grid-cols-3 gap-2">
              {FORMATOS.map(({ valor, label, detalhe, icone: Icone }) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setFormato(valor)}
                  className={cn(
                    'flex flex-col items-center gap-1 px-2 py-3 rounded-xl border transition-colors',
                    formato === valor
                      ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300',
                  )}
                >
                  <Icone size={18} />
                  <span className="text-sm font-bold">{label}</span>
                  <span className="text-[10px] text-slate-400 text-center leading-tight">{detalhe}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2 block">Quais pontos</label>
            <div className="space-y-2">
              {opcaoEscopo('todos', 'Todos os pontos', pendencias.length)}
              {opcaoEscopo('atividade', 'Por atividade', rotaId ? alvo.length : atividades.length, atividades.length === 0)}
              {opcaoEscopo('selecionados', 'Pontos selecionados', selecionadas.length, selecionadas.length === 0)}
            </div>

            {escopo === 'atividade' && (
              <select
                value={rotaId}
                onChange={(e) => setRotaId(e.target.value)}
                className="mt-2 w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="">Selecione a atividade</option>
                {atividades.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.numero}{a.titulo ? ` — ${a.titulo}` : ''} ({a.total})
                  </option>
                ))}
              </select>
            )}

            {selecionadas.length === 0 && (
              <p className="mt-2 text-[11px] text-slate-400">
                Para exportar uma seleção, desenhe um polígono no mapa com Shift ou pelo botão &quot;Polígono&quot;.
              </p>
            )}
          </div>

          <button
            onClick={handleExportar}
            disabled={alvo.length === 0 || exportando}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-bold transition-colors"
          >
            {exportando && <Loader2 size={14} className="animate-spin" />}
            {alvo.length === 0 ? 'Nenhum ponto no recorte' : `Exportar ${alvo.length} ponto(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
