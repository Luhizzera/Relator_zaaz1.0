import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, FileDown, ExternalLink, Loader2, RotateCcw, CheckCircle2 } from 'lucide-react';
import { getSignedRelatorioUrl } from '@/lib/supabaseClient';
import { useOrders } from '@/contexts/OrdersContext';
import { BackButton } from '@/components/BackButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/hooks/use-toast';

/**
 * Visão somente-leitura de uma OS de relatório já exportada. Substitui a
 * tela de coleta de dados (Photos.tsx) assim que `activeOrderStatus` vira
 * 'exportada' — evita reabrir o modo de edição por engano numa OS já
 * finalizada (só uma versão do arquivo é mantida, ver marcarRelatorioExportado).
 */
export function RelatorioFinalizadoView() {
  const navigate = useNavigate();
  const { config, activeOrderRelatorio, duplicarOrdemParaEdicao } = useOrders();
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(true);
  const [confirmEditar, setConfirmEditar] = useState(false);
  const [duplicando, setDuplicando] = useState(false);

  useEffect(() => {
    let ativo = true;
    if (!activeOrderRelatorio.path) { setLoadingUrl(false); return; }
    setLoadingUrl(true);
    getSignedRelatorioUrl(activeOrderRelatorio.path)
      .then((url) => { if (ativo) setSignedUrl(url); })
      .finally(() => { if (ativo) setLoadingUrl(false); });
    return () => { ativo = false; };
  }, [activeOrderRelatorio.path]);

  const isPdf = activeOrderRelatorio.tipo === 'pdf';

  const handleEditar = async () => {
    setConfirmEditar(false);
    setDuplicando(true);
    try {
      const novaOrdemId = await duplicarOrdemParaEdicao();
      toast({ title: 'Novo relatório criado', description: 'Os dados atuais foram copiados para edição.' });
      navigate(`/ordens/${novaOrdemId}/fotos`);
    } catch (err) {
      console.error('[Relatorio] Erro ao criar relatório para edição:', err);
      toast({ title: 'Não foi possível criar o novo relatório', variant: 'destructive' });
    } finally {
      setDuplicando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <BackButton to="/ordens" variant="ghost-light" label="Relatórios" />
        <ThemeToggle />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800/50 rounded-xl px-3 py-2.5">
          <CheckCircle2 size={16} className="shrink-0" />
          <p className="text-sm font-bold">Relatório finalizado</p>
        </div>

        <div>
          <h1 className="text-lg font-black text-slate-800 dark:text-slate-100">
            {config.codigoReferencia || 'Sem referência'}
          </h1>
          <p className="text-sm text-slate-500">{config.tituloRelatorio}</p>
          {config.local && <p className="text-xs text-slate-400 mt-1">{config.local}</p>}
        </div>

        {activeOrderRelatorio.geradoEm && (
          <p className="text-xs text-slate-400">
            Gerado em {new Date(activeOrderRelatorio.geradoEm).toLocaleString('pt-BR')}
          </p>
        )}

        {loadingUrl ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 className="animate-spin mr-2" size={18} /> Carregando arquivo...
          </div>
        ) : !signedUrl ? (
          <p className="text-sm text-slate-400 py-6 text-center">
            Não foi possível carregar o arquivo do relatório.
          </p>
        ) : isPdf ? (
          <div className="space-y-3">
            <iframe
              src={signedUrl}
              title="Relatório PDF"
              className="w-full h-[70vh] rounded-xl border border-slate-200 dark:border-slate-800"
            />
            <a
              href={signedUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold py-2.5 rounded-xl transition-colors"
            >
              <ExternalLink size={16} /> Abrir/baixar PDF
            </a>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <FileText size={26} className="text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-sm text-slate-500">
              Documento Word — não é possível pré-visualizar aqui, mas você pode baixar.
            </p>
            <a
              href={signedUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
            >
              <FileDown size={16} /> Baixar Word (.docx)
            </a>
          </div>
        )}

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <p className="text-[11px] text-slate-400 text-center mb-2">
            Relatório finalizado — não pode ser editado diretamente.
          </p>
          <button
            onClick={() => setConfirmEditar(true)}
            disabled={duplicando}
            className="w-full flex items-center justify-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 py-2 disabled:opacity-50"
          >
            {duplicando ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            Editar
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmEditar}
        title="Editar relatório finalizado?"
        description="Um novo relatório será criado com os dados atuais para você editar. Este continua salvo do jeito que está."
        confirmLabel="Criar novo para editar"
        variant="warning"
        onConfirm={handleEditar}
        onCancel={() => setConfirmEditar(false)}
      />
    </div>
  );
}

export default RelatorioFinalizadoView;
