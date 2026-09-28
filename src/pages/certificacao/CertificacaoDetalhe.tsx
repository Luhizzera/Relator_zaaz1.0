import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Loader2, MapPin, Camera, Image as ImageIcon, X, Check, AlertTriangle, RotateCcw, SignalHigh,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { normalizarFoto, mensagemErroFoto } from '@/lib/normalizarFoto';
import { getSignedFotoCertificacaoUrl } from '@/lib/supabaseClient';
import {
  OrdemCertificacao, PontoCertificacao, STATUS_CERTIFICACAO_LABEL, RESULTADO_LABEL,
  resultadoDoPonto, resumoCertificacao, limiteAceitavelDbm, formatarDbm, parseDbm, ResultadoPonto,
} from '@/types/certificacao';
import {
  getOrdemCertificacao, iniciarCertificacao, registrarMedicao, finalizarCertificacao,
  aprovarCertificacao, devolverCertificacao, cancelarCertificacao,
} from '@/lib/certificacaoService';

const RESULTADO_COR: Record<ResultadoPonto, string> = {
  pendente: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  aprovado: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  reprovado: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

/** Miniatura da foto do ponto — URL assinada, expira em 1h (ver getSignedFotoCertificacaoUrl). */
function FotoDoPonto({ storagePath, className }: { storagePath: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let ativo = true;
    getSignedFotoCertificacaoUrl(storagePath).then((u) => { if (ativo) setUrl(u); });
    return () => { ativo = false; };
  }, [storagePath]);

  if (!url) return <div className={cn('rounded-xl bg-slate-100 dark:bg-slate-800', className)} />;
  return <img src={url} alt="CTO com o powermeter" className={cn('rounded-xl object-cover', className)} />;
}

function MedirPontoModal({
  ponto, margemDb, onClose, onSalvo,
}: {
  ponto: PontoCertificacao;
  margemDb: number;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [sinal, setSinal] = useState(ponto.sinalMedidoDbm != null ? String(ponto.sinalMedidoDbm).replace('.', ',') : '');
  const [observacao, setObservacao] = useState(ponto.observacao ?? '');
  const [foto, setFoto] = useState<string | null>(null);
  const [processandoFoto, setProcessandoFoto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);

  const medido = parseDbm(sinal);
  const limite = limiteAceitavelDbm(ponto.sinalEsperadoDbm, margemDb);
  const resultadoPrevisto: ResultadoPonto = medido == null ? 'pendente' : (medido >= limite ? 'aprovado' : 'reprovado');
  // Potência óptica em CTO é negativa. Um valor positivo passa por qualquer
  // limite negativo, então o erro de digitação mais provável é justamente o que
  // aprovaria um ponto ruim em silêncio.
  const sinalPositivoSuspeito = medido != null && medido > 0;
  // Foto é o que sustenta a medição no certificado. Só dispensa se o ponto já
  // tiver uma (remedição depois de devolução, quando a foto continua válida).
  const temFoto = !!foto || !!ponto.storagePath;
  const podeSalvar = medido != null && temFoto && !salvando && !processandoFoto;

  const handleFoto = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setProcessandoFoto(true);
    try {
      setFoto(await normalizarFoto(arquivo));
    } catch (err) {
      console.error('[Certificação] Foto ilegível:', err);
      toast({ title: 'Não foi possível usar esta foto', description: mensagemErroFoto(err), variant: 'destructive' });
    } finally {
      setProcessandoFoto(false);
      if (cameraRef.current) cameraRef.current.value = '';
      if (galeriaRef.current) galeriaRef.current.value = '';
    }
  };

  const handleSalvar = async () => {
    if (!podeSalvar || medido == null) return;
    setSalvando(true);
    try {
      await registrarMedicao(ponto, { sinalMedidoDbm: medido, dataUrl: foto, observacao: observacao.trim() || null });
      toast({ title: 'Medição registrada' });
      onSalvo();
      onClose();
    } catch (err) {
      console.error('[Certificação] Erro ao registrar medição:', err);
      toast({ title: 'Não foi possível salvar', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900">
          <div className="min-w-0">
            <h2 className="text-base font-black text-slate-800 dark:text-slate-100 truncate">{ponto.nomeCto}</h2>
            <p className="text-xs text-slate-400">
              Esperado {formatarDbm(ponto.sinalEsperadoDbm)} · aceita até {formatarDbm(limite)}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {ponto.refazer && (
            <div className="flex items-start gap-2 text-xs font-semibold text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 rounded-xl p-3">
              <RotateCcw size={14} className="shrink-0 mt-0.5" />
              <span>
                O gestor pediu para refazer esta medição.
                {ponto.motivoRefazer ? ` Motivo: ${ponto.motivoRefazer}` : ''}
              </span>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5 block">
              Sinal medido <span className="text-red-500">*</span>
            </label>
            <input
              value={sinal}
              onChange={(e) => setSinal(e.target.value)}
              inputMode="text"
              placeholder="-18,40"
              className="w-full px-3 py-2.5 text-lg font-black rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
            {sinalPositivoSuspeito && (
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 mt-1.5">
                <AlertTriangle size={12} /> Sinal positivo é incomum — confira se faltou o sinal de menos.
              </p>
            )}
            {medido != null && (
              <p className={cn(
                'inline-flex items-center gap-1.5 text-[11px] font-black px-2 py-1 rounded-full mt-2',
                RESULTADO_COR[resultadoPrevisto],
              )}>
                {RESULTADO_LABEL[resultadoPrevisto]} · diferença de {(medido - ponto.sinalEsperadoDbm).toFixed(2).replace('.', ',')} dB
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5 block">
              Foto da CTO com o powermeter <span className="text-red-500">*</span>
            </label>
            {foto ? (
              <div className="relative">
                <img src={foto} alt="Medição" className="w-full rounded-xl" />
                <button
                  onClick={() => setFoto(null)}
                  className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-black/60 text-white flex items-center justify-center"
                  aria-label="Remover foto"
                >
                  <X size={16} />
                </button>
              </div>
            ) : ponto.storagePath ? (
              <div className="space-y-1.5">
                <FotoDoPonto storagePath={ponto.storagePath} className="w-full h-40" />
                <p className="text-[11px] text-slate-400">Foto da medição anterior. Tire outra se a leitura mudou.</p>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                disabled={processandoFoto}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-sm font-bold text-slate-700 dark:text-slate-300 disabled:opacity-60"
              >
                {processandoFoto ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />} Câmera
              </button>
              <button
                type="button"
                onClick={() => galeriaRef.current?.click()}
                disabled={processandoFoto}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-sm font-bold text-slate-700 dark:text-slate-300 disabled:opacity-60"
              >
                {processandoFoto ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />} Galeria
              </button>
            </div>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFoto(e.target.files?.[0])} />
            <input ref={galeriaRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFoto(e.target.files?.[0])} />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5 block">
              Observação <span className="font-normal normal-case text-slate-500 dark:text-slate-400">(opcional)</span>
            </label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={3}
              placeholder="Algo que explique a leitura, se necessário..."
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 resize-none"
            />
          </div>

          <button
            onClick={handleSalvar}
            disabled={!podeSalvar}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-bold transition-colors"
          >
            {salvando ? <Loader2 size={16} className="animate-spin" /> : 'Salvar medição'}
          </button>
          {!temFoto && (
            <p className="text-[11px] text-slate-400 text-center -mt-2">
              A foto é obrigatória: é ela que sustenta a medição no certificado.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DevolverModal({
  ordem, onClose, onDevolvido,
}: {
  ordem: OrdemCertificacao;
  onClose: () => void;
  onDevolvido: () => void;
}) {
  // Já vem marcado o que reprovou: é o motivo mais comum de devolver, e deixar
  // o gestor marcar isso à mão em obra grande só convida a esquecer um ponto.
  const [selecionados, setSelecionados] = useState<Set<string>>(
    () => new Set(ordem.pontos.filter((p) => resultadoDoPonto(p, ordem.margemDb) === 'reprovado').map((p) => p.id)),
  );
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  const alternar = (id: string) => setSelecionados((antes) => {
    const proximo = new Set(antes);
    if (proximo.has(id)) proximo.delete(id); else proximo.add(id);
    return proximo;
  });

  const handleDevolver = async () => {
    if (selecionados.size === 0 || enviando) return;
    setEnviando(true);
    try {
      await devolverCertificacao(ordem.id, motivo.trim(), [...selecionados]);
      toast({ title: 'Certificação devolvida ao técnico' });
      onDevolvido();
      onClose();
    } catch (err) {
      console.error('[Certificação] Erro ao devolver:', err);
      toast({ title: 'Não foi possível devolver', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-base font-black text-slate-800 dark:text-slate-100">Devolver para refazer</h2>
          <p className="text-xs text-slate-400">Marque as CTOs que precisam ser medidas de novo.</p>
        </div>

        <div className="p-5 space-y-3">
          <div className="space-y-1.5">
            {ordem.pontos.map((p) => {
              const resultado = resultadoDoPonto(p, ordem.margemDb);
              return (
                <label key={p.id} className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selecionados.has(p.id)}
                    onChange={() => alternar(p.id)}
                    className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{p.nomeCto}</span>
                    <span className="block text-[11px] text-slate-400">
                      {formatarDbm(p.sinalMedidoDbm)} · esperado {formatarDbm(p.sinalEsperadoDbm)}
                    </span>
                  </span>
                  <span className={cn('text-[10px] font-black px-2 py-0.5 rounded-full shrink-0', RESULTADO_COR[resultado])}>
                    {RESULTADO_LABEL[resultado]}
                  </span>
                </label>
              );
            })}
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5 block">Motivo</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder="O que o técnico precisa corrigir..."
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 resize-none"
            />
          </div>

          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-600 dark:text-slate-300">
              Cancelar
            </button>
            <button
              onClick={handleDevolver}
              disabled={selecionados.size === 0 || enviando}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-bold transition-colors"
            >
              {enviando && <Loader2 size={14} className="animate-spin" />} Devolver {selecionados.size > 0 && `(${selecionados.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CertificacaoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile, canManageOrders, isTecnicoManutencao } = useAuth();
  const [ordem, setOrdem] = useState<OrdemCertificacao | null>(null);
  const [loading, setLoading] = useState(true);
  const [pontoEmMedicao, setPontoEmMedicao] = useState<PontoCertificacao | null>(null);
  const [showDevolver, setShowDevolver] = useState(false);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [agindo, setAgindo] = useState(false);

  const carregar = () => {
    if (!id) return;
    setLoading(true);
    getOrdemCertificacao(id)
      .then(setOrdem)
      .catch((err) => console.error('[Certificação] Erro ao carregar:', err))
      .finally(() => setLoading(false));
  };

  useEffect(carregar, [id]);
  useRealtimeRefresh(
    [
      { table: 'ordens_certificacao', filter: `id=eq.${id}` },
      { table: 'pontos_certificacao', filter: `ordem_certificacao_id=eq.${id}` },
    ],
    carregar,
  );

  const resumo = useMemo(() => (ordem ? resumoCertificacao(ordem) : null), [ordem]);

  const souTecnicoDaOs = !!ordem && ordem.tecnicoId === profile?.id;
  const podeMedir = souTecnicoDaOs && isTecnicoManutencao
    && (ordem?.status === 'em_andamento' || ordem?.status === 'reaberta');
  const podeConferir = canManageOrders && ordem?.status === 'finalizada';

  const agir = async (acao: () => Promise<void>, sucesso: string) => {
    setAgindo(true);
    try {
      await acao();
      toast({ title: sucesso });
      carregar();
    } catch (err) {
      console.error('[Certificação] Erro na ação:', err);
      toast({ title: 'Não foi possível concluir', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setAgindo(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-400">
        <Loader2 className="animate-spin mr-2" size={18} /> Carregando...
      </div>
    );
  }

  if (!ordem || !resumo) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 space-y-6">
        <PageHeader title="Certificação" backTo="/certificacao/ordens" />
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center">
          <p className="text-sm text-slate-400">Certificação não encontrada, ou sem permissão para vê-la.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 space-y-5 pb-28">
      <PageHeader
        title={ordem.numero}
        subtitle={ordem.titulo}
        backTo="/certificacao/ordens"
      />

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {STATUS_CERTIFICACAO_LABEL[ordem.status]}
          </span>
          <span className="text-[11px] text-slate-400">{ordem.equipe || 'Sem equipe'} · {ordem.tecnico || 'sem técnico'}</span>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-lg font-black text-slate-800 dark:text-slate-100">{resumo.total}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase">CTOs</p>
          </div>
          <div>
            <p className="text-lg font-black text-green-600 dark:text-green-400">{resumo.aprovados}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Aprovadas</p>
          </div>
          <div>
            <p className="text-lg font-black text-red-600 dark:text-red-400">{resumo.reprovados}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Reprovadas</p>
          </div>
          <div>
            <p className="text-lg font-black text-slate-500 dark:text-slate-400">{resumo.pendentes}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase">A medir</p>
          </div>
        </div>

        <p className="text-[11px] text-slate-400">
          Margem aceita: {ordem.margemDb} dB abaixo do esperado.
          {ordem.observacoes ? ` ${ordem.observacoes}` : ''}
        </p>
      </div>

      {ordem.status === 'reaberta' && (
        <div className="flex items-start gap-2 text-xs font-semibold text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 rounded-2xl p-4">
          <RotateCcw size={14} className="shrink-0 mt-0.5" />
          <span>
            Devolvida pelo gestor: {resumo.aRefazer} ponto(s) para refazer.
            {ordem.motivoDevolucao ? ` Motivo: ${ordem.motivoDevolucao}` : ''}
          </span>
        </div>
      )}

      <div className="space-y-2">
        {ordem.pontos.map((ponto) => {
          const resultado = resultadoDoPonto(ponto, ordem.margemDb);
          const clicavel = podeMedir;
          const Tag = clicavel ? 'button' : 'div';
          return (
            <Tag
              key={ponto.id}
              onClick={clicavel ? () => setPontoEmMedicao(ponto) : undefined}
              className={cn(
                'w-full flex items-center gap-3 bg-white dark:bg-slate-900 rounded-2xl border p-3 text-left transition-colors',
                ponto.refazer
                  ? 'border-orange-300 dark:border-orange-800'
                  : 'border-slate-200 dark:border-slate-800',
                clicavel && 'hover:border-amber-300',
              )}
            >
              {ponto.storagePath
                ? <FotoDoPonto storagePath={ponto.storagePath} className="w-14 h-14 shrink-0" />
                : <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-300">
                    <SignalHigh size={18} />
                  </div>}

              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{ponto.nomeCto}</p>
                <p className="text-[11px] text-slate-400 flex items-center gap-1 truncate">
                  <MapPin size={10} /> {ponto.latitude.toFixed(5)}, {ponto.longitude.toFixed(5)}
                </p>
                <p className="text-[11px] mt-0.5">
                  <span className="text-slate-400">Esperado {formatarDbm(ponto.sinalEsperadoDbm)}</span>
                  {ponto.sinalMedidoDbm != null && (
                    <span className="font-bold text-slate-700 dark:text-slate-200"> · medido {formatarDbm(ponto.sinalMedidoDbm)}</span>
                  )}
                </p>
                {ponto.refazer && (
                  <p className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 mt-0.5 truncate">
                    Refazer{ponto.motivoRefazer ? `: ${ponto.motivoRefazer}` : ''}
                  </p>
                )}
              </div>

              <span className={cn('text-[10px] font-black px-2 py-1 rounded-full shrink-0', RESULTADO_COR[resultado])}>
                {RESULTADO_LABEL[resultado]}
              </span>
            </Tag>
          );
        })}
      </div>

      {/* Barra de ação fixa: em campo, o técnico não deveria ter que rolar até
          o fim de uma obra com 30 CTOs para achar o botão. */}
      {(podeMedir || podeConferir || (souTecnicoDaOs && ordem.status === 'aberta') || (canManageOrders && ordem.status !== 'cancelada' && ordem.status !== 'aprovada')) && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 p-3 flex items-center gap-2">
          {souTecnicoDaOs && ordem.status === 'aberta' && (
            <button
              onClick={() => agir(() => iniciarCertificacao(ordem.id), 'Certificação iniciada')}
              disabled={agindo}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-bold"
            >
              {agindo && <Loader2 size={16} className="animate-spin" />} Iniciar certificação
            </button>
          )}

          {podeMedir && (
            <button
              onClick={() => agir(() => finalizarCertificacao(ordem), 'Enviada para conferência')}
              disabled={agindo || !resumo.prontaParaConferencia}
              title={resumo.prontaParaConferencia ? undefined : 'Meça todas as CTOs antes de enviar'}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-bold"
            >
              {agindo ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Enviar para conferência
              {!resumo.prontaParaConferencia && ` (${resumo.medidos}/${resumo.total})`}
            </button>
          )}

          {podeConferir && (
            <>
              <button
                onClick={() => setShowDevolver(true)}
                disabled={agindo}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-orange-300 dark:border-orange-800 text-orange-600 dark:text-orange-400 text-sm font-bold"
              >
                <RotateCcw size={16} /> Devolver
              </button>
              <button
                onClick={() => agir(() => aprovarCertificacao(ordem.id), 'Certificação aprovada')}
                disabled={agindo}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-bold"
              >
                {agindo ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Aprovar
              </button>
            </>
          )}

          {canManageOrders && ordem.status !== 'cancelada' && ordem.status !== 'aprovada' && !podeConferir && (
            <button
              onClick={() => setConfirmarCancelar(true)}
              disabled={agindo}
              className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 text-sm font-bold"
            >
              Cancelar OS
            </button>
          )}
        </div>
      )}

      {pontoEmMedicao && (
        <MedirPontoModal
          ponto={pontoEmMedicao}
          margemDb={ordem.margemDb}
          onClose={() => setPontoEmMedicao(null)}
          onSalvo={carregar}
        />
      )}

      {showDevolver && (
        <DevolverModal ordem={ordem} onClose={() => setShowDevolver(false)} onDevolvido={carregar} />
      )}

      <ConfirmDialog
        isOpen={confirmarCancelar}
        title="Cancelar certificação?"
        description="A OS sai do fluxo e as medições já feitas ficam apenas como histórico."
        confirmLabel="Cancelar OS"
        onCancel={() => setConfirmarCancelar(false)}
        onConfirm={async () => {
          setConfirmarCancelar(false);
          await agir(() => cancelarCertificacao(ordem.id), 'Certificação cancelada');
          navigate('/certificacao/ordens');
        }}
      />
    </div>
  );
}
