import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import {
  supabase,
  OrdemServicoRow,
  OrdemStatus,
  FotoRow,
  RelatorioTipo,
  uploadPhoto,
  deletePhotoFromStorage,
  getSignedPhotoUrl,
  uploadRelatorioExportado,
  deleteRelatorioFromStorage,
  duplicatePhotoInStorage,
} from '@/lib/supabaseClient';
import { useAuth } from './AuthContext';
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh';
import { ReportConfig, Photo } from '@/types/report';

export const DEFAULT_CHECKLIST: string[] = [
  'Instalado no cabo de fibra a Placa de Identificação',
  'Não temos ativo de rede de cabo de fibra óptica Zaaz nesse local',
  'Instalado no cabo de fibra a Placa de Identificação e executado adequações',
  'Este poste é de propriedade particular',
  'Os cabos e equipamentos soltos existentes, são de terceiros',
];

const defaultConfig: ReportConfig = {
  documentName: '',
  razaoSocial: 'ZAAZ PROVEDOR DE INTERNET E TELECOMUNICAÇÕES',
  tituloRelatorio: 'RESPOSTAS DE NOTIFICAÇÃO',
  objetivo: 'TAREFA DE REGULARIZAÇÃO DE REDE ÓPTICA',
  codigoReferencia: '',
  local: '',
  header: '',
  footer: '',
  presetId: 'rede-optica',
  checklistOptions: DEFAULT_CHECKLIST,
};

// Resumo usado nas telas de Dashboard / Lista de OS
export interface OrdemSummary extends OrdemServicoRow {
  tecnico_nome?: string;
  total_fotos?: number;
}

interface OrdersContextType {
  // ---- Lista de ordens (Dashboard / OrdersList) ----
  orders: OrdemSummary[];
  loadingOrders: boolean;
  refreshOrders: (silencioso?: boolean) => Promise<void>;
  createOrder: () => Promise<string>; // retorna o id da nova OS
  deleteOrder: (id: string) => Promise<void>;
  setOrderStatus: (id: string, status: OrdemStatus) => Promise<void>;

  // ---- Ordem ativa (tela de edição — compatível com o antigo ReportContext) ----
  activeOrderId: string | null;
  openOrder: (id: string) => Promise<void>;
  config: ReportConfig;
  setConfig: (config: ReportConfig) => void;
  photos: Photo[];
  addPhoto: (photo: Photo) => Promise<void>;
  updatePhotoDescription: (id: string, description: string) => void;
  updatePhotoObservacoes: (id: string, observacoes: string) => void;
  removePhoto: (id: string) => Promise<void>;
  clearAllPhotos: () => void;
  reorderPhotos: (reordered: Photo[]) => void;
  savingActiveOrder: boolean;
  saveActiveOrder: (overrideConfig?: ReportConfig) => Promise<void>;

  // ---- Relatório exportado (PDF/Word) da ordem ativa ----
  activeOrderStatus: OrdemStatus | null;
  activeOrderRelatorio: { path: string | null; tipo: RelatorioTipo | null; geradoEm: string | null };
  marcarRelatorioExportado: (blob: Blob, tipo: RelatorioTipo) => Promise<void>;
  /** Um relatório 'exportada' é travado — "editar" cria uma OS nova com os mesmos dados, sem tocar na original. Retorna o id da nova OS. */
  duplicarOrdemParaEdicao: () => Promise<string>;
}

const OrdersContext = createContext<OrdersContextType | undefined>(undefined);

export function OrdersProvider({ children }: { children: ReactNode }) {
  const { session, profile, canManageOrders } = useAuth();

  // ---- Estado: lista ----
  const [orders, setOrders] = useState<OrdemSummary[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const refreshOrders = useCallback(async (silencioso = false) => {
    if (!session) return;
    if (!silencioso) setLoadingOrders(true);
    try {
      let query = supabase
        .from('ordens_servico')
        .select('*, fotos(count)')
        .order('created_at', { ascending: false });

      if (!canManageOrders) query = query.eq('tecnico_id', session.user.id);

      const { data, error } = await query;
      if (error) throw error;

      const tecnicoIds = Array.from(new Set((data ?? []).map((o: any) => o.tecnico_id)));
      const { data: profiles } = tecnicoIds.length
        ? await supabase.from('profiles').select('id, nome').in('id', tecnicoIds)
        : { data: [] as any[] };
      const nomeMap = new Map((profiles ?? []).map((p: any) => [p.id, p.nome]));

      setOrders(
        (data ?? []).map((o: any) => ({
          ...o,
          tecnico_nome: nomeMap.get(o.tecnico_id) ?? '—',
          total_fotos: o.fotos?.[0]?.count ?? 0,
        })),
      );
    } catch (err) {
      console.error('[Orders] Erro ao listar ordens:', err);
    } finally {
      if (!silencioso) setLoadingOrders(false);
    }
  }, [session, canManageOrders]);

  const createOrder = useCallback(async (): Promise<string> => {
    if (!session) throw new Error('Não autenticado');
    const { data, error } = await supabase
      .from('ordens_servico')
      .insert({
        tecnico_id: session.user.id,
        checklist_options: DEFAULT_CHECKLIST,
        razao_social: defaultConfig.razaoSocial,
        titulo_relatorio: defaultConfig.tituloRelatorio,
        objetivo: defaultConfig.objetivo,
        preset_id: defaultConfig.presetId,
      })
      .select('id')
      .single();
    if (error) throw error;
    await refreshOrders();
    return data.id as string;
  }, [session, refreshOrders]);

  const deleteOrder = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('ordens_servico').delete().eq('id', id);
      if (error) throw error;
      setOrders((prev) => prev.filter((o) => o.id !== id));
    },
    [],
  );

  const setOrderStatus = useCallback(async (id: string, status: OrdemStatus) => {
    const patch: any = { status };
    if (status === 'concluida' || status === 'exportada') patch.concluded_at = new Date().toISOString();
    const { error } = await supabase.from('ordens_servico').update(patch).eq('id', id);
    if (error) throw error;
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }, []);

  // ---- Estado: ordem ativa ----
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [config, setConfig] = useState<ReportConfig>(defaultConfig);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [savingActiveOrder, setSavingActiveOrder] = useState(false);
  const [activeOrderStatus, setActiveOrderStatus] = useState<OrdemStatus | null>(null);
  const [activeOrderRelatorio, setActiveOrderRelatorio] = useState<{
    path: string | null; tipo: RelatorioTipo | null; geradoEm: string | null;
  }>({ path: null, tipo: null, geradoEm: null });

  const configToRow = (c: ReportConfig) => ({
    codigo_referencia: c.codigoReferencia,
    razao_social: c.razaoSocial,
    titulo_relatorio: c.tituloRelatorio,
    objetivo: c.objetivo,
    local: c.local,
    header: c.header,
    footer: c.footer,
    preset_id: c.presetId,
    checklist_options: c.checklistOptions ?? DEFAULT_CHECKLIST,
  });

  const rowToConfig = (r: OrdemServicoRow): ReportConfig => ({
    documentName: '',
    razaoSocial: r.razao_social ?? defaultConfig.razaoSocial,
    tituloRelatorio: r.titulo_relatorio ?? defaultConfig.tituloRelatorio,
    objetivo: r.objetivo ?? defaultConfig.objetivo,
    codigoReferencia: r.codigo_referencia ?? '',
    local: r.local ?? '',
    header: r.header ?? '',
    footer: r.footer ?? '',
    presetId: r.preset_id ?? 'rede-optica',
    checklistOptions: r.checklist_options?.length ? r.checklist_options : DEFAULT_CHECKLIST,
  });

  const openOrder = useCallback(async (id: string) => {
    setActiveOrderId(id);
    // Evita mostrar por um instante o status/relatório da ordem anterior
    // enquanto esta ainda carrega (ex: piscar a visão "finalizado" errada).
    setActiveOrderStatus(null);
    setActiveOrderRelatorio({ path: null, tipo: null, geradoEm: null });
    const [{ data: ordem, error: ordemErr }, { data: fotos, error: fotosErr }] = await Promise.all([
      supabase.from('ordens_servico').select('*').eq('id', id).single(),
      supabase.from('fotos').select('*').eq('ordem_id', id).order('ordem_index', { ascending: true }),
    ]);
    if (ordemErr) throw ordemErr;
    if (fotosErr) throw fotosErr;

    const ordemRow = ordem as OrdemServicoRow;
    setConfig(rowToConfig(ordemRow));
    setActiveOrderStatus(ordemRow.status);
    setActiveOrderRelatorio({
      path: ordemRow.relatorio_storage_path,
      tipo: ordemRow.relatorio_tipo,
      geradoEm: ordemRow.relatorio_gerado_em,
    });

    const resolved: Photo[] = await Promise.all(
      ((fotos ?? []) as FotoRow[]).map(async (f) => ({
        id: f.id,
        src: (await getSignedPhotoUrl(f.storage_path)) ?? '',
        description: f.description ?? '',
        observacoes: f.observacoes ?? '',
        location: f.location,
        geoAttempted: f.geo_attempted,
      })),
    );
    setPhotos(resolved);
  }, []);

  const saveActiveOrder = useCallback(async (overrideConfig?: ReportConfig) => {
    if (!activeOrderId) return;
    setSavingActiveOrder(true);
    try {
      const { error } = await supabase
        .from('ordens_servico')
        .update(configToRow(overrideConfig ?? config))
        .eq('id', activeOrderId);
      if (error) throw error;
    } finally {
      setSavingActiveOrder(false);
    }
  }, [activeOrderId, config]);

  /**
   * Chamada pelo ExportModal depois de gerar o PDF/Word. Salva a versão
   * (substituindo a anterior, mesmo que de tipo diferente — só uma versão
   * é mantida por OS) e marca a OS como 'exportada', o que faz OrdemFotos
   * trocar a tela de coleta de dados pela visão somente-leitura.
   */
  const marcarRelatorioExportado = useCallback(async (blob: Blob, tipo: RelatorioTipo) => {
    if (!activeOrderId || !session) return;

    if (activeOrderRelatorio.path && activeOrderRelatorio.tipo !== tipo) {
      await deleteRelatorioFromStorage(activeOrderRelatorio.path);
    }

    const path = await uploadRelatorioExportado(blob, session.user.id, activeOrderId, tipo);
    const geradoEm = new Date().toISOString();
    const patch = {
      relatorio_storage_path: path,
      relatorio_tipo: tipo,
      relatorio_gerado_em: geradoEm,
      status: 'exportada' as OrdemStatus,
      concluded_at: geradoEm,
    };

    const { error } = await supabase.from('ordens_servico').update(patch).eq('id', activeOrderId);
    if (error) throw error;

    setActiveOrderStatus('exportada');
    setActiveOrderRelatorio({ path, tipo, geradoEm });
    setOrders((prev) => prev.map((o) => (o.id === activeOrderId ? { ...o, ...patch } : o)));
  }, [activeOrderId, session, activeOrderRelatorio]);

  /**
   * Um relatório finalizado ('exportada') é travado — não dá pra editar a OS
   * original. "Editar" aqui cria uma OS NOVA com a mesma config e as mesmas
   * fotos (copiadas no Storage, sem re-upload), deixando a original intacta
   * e ainda com o arquivo já exportado.
   */
  const duplicarOrdemParaEdicao = useCallback(async (): Promise<string> => {
    if (!activeOrderId || !session) throw new Error('Nenhuma OS ativa para duplicar.');

    const { data: novaOrdem, error } = await supabase
      .from('ordens_servico')
      .insert({ tecnico_id: session.user.id, ...configToRow(config) })
      .select('id')
      .single();
    if (error) throw error;
    const novaOrdemId = novaOrdem.id as string;

    const { data: fotosAtuais } = await supabase
      .from('fotos')
      .select('*')
      .eq('ordem_id', activeOrderId)
      .order('ordem_index', { ascending: true });

    for (const foto of (fotosAtuais ?? []) as FotoRow[]) {
      try {
        const fotoId = crypto.randomUUID();
        const novoPath = await duplicatePhotoInStorage(foto.storage_path, session.user.id, novaOrdemId, fotoId);
        await supabase.from('fotos').insert({
          id: fotoId,
          ordem_id: novaOrdemId,
          storage_path: novoPath,
          description: foto.description,
          observacoes: foto.observacoes,
          location: foto.location,
          geo_attempted: foto.geo_attempted,
          ordem_index: foto.ordem_index,
        });
      } catch (fotoErr) {
        // Não trava a duplicação inteira por causa de uma foto — o usuário
        // ainda consegue editar o resto e readicionar essa se precisar.
        console.error('[Orders] Erro ao duplicar foto:', fotoErr);
      }
    }

    await refreshOrders();
    return novaOrdemId;
  }, [activeOrderId, session, config, refreshOrders]);

  const addPhoto = useCallback(
    async (newPhoto: Photo) => {
      if (!activeOrderId || !session) return;
      // Mostra a foto imediatamente (preview local em base64) enquanto sobe pro storage
      setPhotos((prev) => [...prev, newPhoto]);

      try {
        const storagePath = await uploadPhoto(newPhoto.src, session.user.id, activeOrderId, newPhoto.id);
        const { data, error } = await supabase
          .from('fotos')
          .insert({
            ordem_id: activeOrderId,
            storage_path: storagePath,
            description: newPhoto.description || '',
            observacoes: newPhoto.observacoes || '',
            location: newPhoto.location ?? null,
            geo_attempted: newPhoto.geoAttempted ?? false,
            ordem_index: photos.length,
          })
          .select('id')
          .single();
        if (error) throw error;

        // Substitui o id temporário local pelo id definitivo do banco
        setPhotos((prev) => prev.map((p) => (p.id === newPhoto.id ? { ...p, id: data.id } : p)));
      } catch (err) {
        console.error('[Orders] Erro ao salvar foto:', err);
      }
    },
    [activeOrderId, session, photos.length],
  );

  const updatePhotoDescription = useCallback((id: string, description: string) => {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, description } : p)));
    supabase.from('fotos').update({ description }).eq('id', id).then(({ error }) => {
      if (error) console.error('[Orders] Erro ao salvar descrição:', error);
    });
  }, []);

  const updatePhotoObservacoes = useCallback((id: string, observacoes: string) => {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, observacoes } : p)));
    supabase.from('fotos').update({ observacoes }).eq('id', id).then(({ error }) => {
      if (error) console.error('[Orders] Erro ao salvar observações:', error);
    });
  }, []);

  const removePhoto = useCallback(async (id: string) => {
    const photo = photos.find((p) => p.id === id);
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    const { data } = await supabase.from('fotos').select('storage_path').eq('id', id).single();
    if (data?.storage_path) await deletePhotoFromStorage(data.storage_path);
    await supabase.from('fotos').delete().eq('id', id);
  }, [photos]);

  const clearAllPhotos = useCallback(() => setPhotos([]), []);
  const reorderPhotos = useCallback((reordered: Photo[]) => setPhotos(reordered), []);

  // Realtime: só a LISTA (Dashboard/OrdersList) recarrega sozinha. Não
  // aplicamos no editor da ordem ativa (Config/Photos) porque `openOrder`
  // reseta o formulário a partir do banco — se disparasse a cada evento,
  // correria o risco de sobrescrever edição de texto em andamento do próprio
  // usuário antes do autosave debounced salvar.
  useRealtimeRefresh([{ table: 'ordens_servico' }], () => refreshOrders(true));

  return (
    <OrdersContext.Provider
      value={{
        orders,
        loadingOrders,
        refreshOrders,
        createOrder,
        deleteOrder,
        setOrderStatus,
        activeOrderId,
        openOrder,
        config,
        setConfig,
        photos,
        addPhoto,
        updatePhotoDescription,
        updatePhotoObservacoes,
        removePhoto,
        clearAllPhotos,
        reorderPhotos,
        savingActiveOrder,
        saveActiveOrder,
        activeOrderStatus,
        activeOrderRelatorio,
        marcarRelatorioExportado,
        duplicarOrdemParaEdicao,
      }}
    >
      {children}
    </OrdersContext.Provider>
  );
}

export function useOrders() {
  const context = useContext(OrdersContext);
  if (!context) throw new Error('useOrders must be used within OrdersProvider');
  return context;
}

/**
 * Camada de compatibilidade: mantém o mesmo formato do antigo `useReport()`
 * para que PhotoCard.tsx / ExportModal.tsx / Config.tsx continuem funcionando
 * sem alterações — basta trocar o import de '@/contexts/ReportContext' para
 * '@/contexts/OrdersContext'.
 */
export function useReport() {
  const {
    config,
    setConfig,
    photos,
    addPhoto,
    updatePhotoDescription,
    updatePhotoObservacoes,
    removePhoto,
    clearAllPhotos,
    reorderPhotos,
    saveActiveOrder,
  } = useOrders();

  return {
    config,
    setConfig,
    photos,
    addPhoto,
    updatePhotoDescription,
    updatePhotoObservacoes,
    removePhoto,
    clearAllPhotos,
    reorderPhotos,
    saveActiveOrder,
    getReportData: () => ({ config, photos }),
    resetReport: () => {},
  };
}
