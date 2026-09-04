// src/lib/vistoriaService.ts
import {
  supabase,
  uploadFotoVistoria,
  getSignedFotoVistoriaUrl,
  deleteFotoVistoriaFromStorage,
} from '@/lib/supabaseClient';
import type { OrdemVistoriaRow, PendenciaVistoriaRow, ProfileRow } from '@/lib/supabaseClient';
import {
  OrdemVistoria, PendenciaVistoria, PendenciaBacklog, StatusOrdemVistoria,
  corDaPendencia, TipoCorretivaVistoria, OrdemBacklog, corDaOrdem,
} from '@/types/vistoria';
import { createManutencaoOrder, addFotoManutencao } from '@/lib/manutencaoService';
import { reverseGeocode } from '@/lib/geocoding';
import type { ManutencaoOrdem, PrioridadeOS } from '@/types/manutencao';

/**
 * Camada de acesso a dados do módulo de Vistoria — anexo ao de Manutenção
 * (ver manutencaoService.ts). Escopo por papel/equipe é garantido pelas
 * policies de `supabase/migrations/0018_vistoria_backlog.sql` (Decisão 5-B:
 * isolamento real por supervisor, diferente do `can_manage_orders()`
 * genérico usado no resto do módulo de Manutenção) — não precisa ser
 * replicado aqui.
 */

const ORDEM_VISTORIA_SELECT = `
  *,
  tecnico:tecnico_id ( nome ),
  equipe:equipe_id ( nome ),
  responsavel:responsavel_id ( nome )
`;

interface OrdemVistoriaRowJoined extends OrdemVistoriaRow {
  tecnico?: { nome: string } | null;
  equipe?: { nome: string } | null;
  responsavel?: { nome: string } | null;
}

function rowToPendencia(row: PendenciaVistoriaRow): PendenciaVistoria {
  return {
    id: row.id,
    ordemVistoriaId: row.ordem_vistoria_id,
    storagePath: row.storage_path,
    latitude: row.latitude,
    longitude: row.longitude,
    observacao: row.observacao ?? undefined,
    problemas: row.problemas ?? undefined,
    ordemCorretivaId: row.ordem_corretiva_id,
    criadoPor: row.criado_por,
    createdAt: row.created_at,
  };
}

function rowToOrdemVistoria(row: OrdemVistoriaRowJoined, pendencias: PendenciaVistoriaRow[]): OrdemVistoria {
  return {
    id: row.id,
    numero: row.numero,
    titulo: row.titulo,
    status: row.status,

    equipe: row.equipe?.nome ?? undefined,
    equipeId: row.equipe_id,
    tecnico: row.tecnico?.nome ?? undefined,
    tecnicoId: row.tecnico_id,
    responsavel: row.responsavel?.nome ?? undefined,
    responsavelId: row.responsavel_id,

    dataPrevista: row.data_prevista,
    observacoes: row.observacoes,

    utmInicioLat: row.utm_inicio_lat,
    utmInicioLng: row.utm_inicio_lng,
    utmFimLat: row.utm_fim_lat,
    utmFimLng: row.utm_fim_lng,

    pendencias: pendencias.map(rowToPendencia),

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listOrdensVistoria(): Promise<OrdemVistoria[]> {
  const { data, error } = await supabase
    .from('ordens_vistoria')
    .select(ORDEM_VISTORIA_SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as OrdemVistoriaRowJoined[];
  if (rows.length === 0) return [];

  const { data: pendData, error: pendError } = await supabase
    .from('pendencias_vistoria')
    .select('*')
    .in('ordem_vistoria_id', rows.map((r) => r.id))
    .order('created_at', { ascending: true });
  if (pendError) throw pendError;
  const pendPorOrdem = new Map<string, PendenciaVistoriaRow[]>();
  (pendData ?? []).forEach((p) => {
    const lista = pendPorOrdem.get(p.ordem_vistoria_id) ?? [];
    lista.push(p as PendenciaVistoriaRow);
    pendPorOrdem.set(p.ordem_vistoria_id, lista);
  });

  return rows.map((row) => rowToOrdemVistoria(row, pendPorOrdem.get(row.id) ?? []));
}

export async function getOrdemVistoria(id: string): Promise<OrdemVistoria | null> {
  const { data, error } = await supabase
    .from('ordens_vistoria')
    .select(ORDEM_VISTORIA_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: pendData, error: pendError } = await supabase
    .from('pendencias_vistoria')
    .select('*')
    .eq('ordem_vistoria_id', id)
    .order('created_at', { ascending: true });
  if (pendError) throw pendError;

  return rowToOrdemVistoria(data as OrdemVistoriaRowJoined, (pendData ?? []) as PendenciaVistoriaRow[]);
}

/** Cria a rota — ação de supervisor (na própria equipe) ou gestor (qualquer equipe). RLS garante o resto. */
export async function createOrdemVistoria(partial: {
  titulo: string;
  equipeId: string;
  tecnicoId?: string | null;
  dataPrevista?: string | null;
  observacoes?: string | null;
  utmInicio?: { lat: number; lng: number } | null;
  utmFim?: { lat: number; lng: number } | null;
}): Promise<OrdemVistoria> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  const { data: ordemRow, error } = await supabase
    .from('ordens_vistoria')
    .insert({
      titulo: partial.titulo,
      equipe_id: partial.equipeId,
      tecnico_id: partial.tecnicoId ?? null,
      responsavel_id: userId,
      data_prevista: partial.dataPrevista ?? null,
      observacoes: partial.observacoes ?? null,
      utm_inicio_lat: partial.utmInicio?.lat ?? null,
      utm_inicio_lng: partial.utmInicio?.lng ?? null,
      utm_fim_lat: partial.utmFim?.lat ?? null,
      utm_fim_lng: partial.utmFim?.lng ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;

  const criada = await getOrdemVistoria(ordemRow.id);
  if (!criada) throw new Error('Falha ao carregar a rota de vistoria recém-criada.');
  return criada;
}

async function updateStatusVistoria(id: string, status: StatusOrdemVistoria): Promise<void> {
  const { error } = await supabase.from('ordens_vistoria').update({ status }).eq('id', id);
  if (error) throw error;
}

export const iniciarVistoria = (id: string) => updateStatusVistoria(id, 'em_andamento');
export const concluirVistoria = (id: string) => updateStatusVistoria(id, 'concluida');
export const cancelarVistoria = (id: string) => updateStatusVistoria(id, 'cancelada');

/** Delega uma rota já criada sem técnico (fila de atribuição do gestor/supervisor). Não muda status — o técnico ainda precisa "Iniciar Rota". */
export async function delegarTecnicoVistoria(ordemId: string, tecnicoId: string): Promise<void> {
  const { error } = await supabase.from('ordens_vistoria').update({ tecnico_id: tecnicoId }).eq('id', ordemId);
  if (error) throw error;
}

/** Registra uma pendência (foto + geolocalização + observação) na rota em andamento. */
export async function addPendencia(
  ordemVistoriaId: string,
  dataUrl: string,
  latitude: number,
  longitude: number,
  observacao?: string,
  /** Serializado por '||' (ver serializeProblemas) — vira `problemaInformado` da corretiva. */
  problemas?: string,
): Promise<PendenciaVistoria> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  const pendenciaId = crypto.randomUUID();
  const storagePath = await uploadFotoVistoria(dataUrl, ordemVistoriaId, pendenciaId);

  const { data, error } = await supabase
    .from('pendencias_vistoria')
    .insert({
      id: pendenciaId,
      ordem_vistoria_id: ordemVistoriaId,
      storage_path: storagePath,
      latitude,
      longitude,
      observacao: observacao ?? null,
      problemas: problemas || null,
      criado_por: userId,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToPendencia(data as PendenciaVistoriaRow);
}

export async function removePendencia(pendencia: PendenciaVistoria): Promise<void> {
  const { error } = await supabase.from('pendencias_vistoria').delete().eq('id', pendencia.id);
  if (error) throw error;
  await deleteFotoVistoriaFromStorage(pendencia.storagePath);
}

/**
 * Backlog pronto para o mapa — cor sempre calculada (Decisão 3-A), nunca
 * lida de uma coluna própria. RLS já devolve só o que o papel/equipe de
 * quem chama pode ver (Decisão 5-B); `equipeId` aqui é só um filtro de UI
 * (ex: gestor escolhendo uma equipe específica dentre as que ele já vê).
 */
export async function listPendenciasBacklog(filtro?: { equipeId?: string }): Promise<PendenciaBacklog[]> {
  let query = supabase
    .from('ordens_vistoria')
    .select('id, numero, titulo, equipe_id')
    .neq('status', 'cancelada');
  if (filtro?.equipeId) query = query.eq('equipe_id', filtro.equipeId);
  const { data: ordensData, error: ordensError } = await query;
  if (ordensError) throw ordensError;

  const ordensPorId = new Map((ordensData ?? []).map((o) => [o.id, o]));
  if (ordensPorId.size === 0) return [];

  const { data: pendData, error: pendError } = await supabase
    .from('pendencias_vistoria')
    .select('*')
    .in('ordem_vistoria_id', Array.from(ordensPorId.keys()))
    .order('created_at', { ascending: false });
  if (pendError) throw pendError;

  const pendencias = (pendData ?? []) as PendenciaVistoriaRow[];
  const corretivaIds = pendencias.map((p) => p.ordem_corretiva_id).filter((id): id is string => !!id);

  const corretivasPorId = new Map<string, { numero: string; status: string }>();
  if (corretivaIds.length > 0) {
    const { data: corretivasData, error: corretivasError } = await supabase
      .from('ordens_manutencao')
      .select('id, numero, status')
      .in('id', corretivaIds);
    if (corretivasError) throw corretivasError;
    (corretivasData ?? []).forEach((o) => corretivasPorId.set(o.id, { numero: o.numero, status: o.status }));
  }

  return pendencias.map((row) => {
    const ordemVistoria = ordensPorId.get(row.ordem_vistoria_id);
    const corretiva = row.ordem_corretiva_id ? corretivasPorId.get(row.ordem_corretiva_id) : undefined;
    return {
      ...rowToPendencia(row),
      ordemVistoriaNumero: ordemVistoria?.numero ?? '—',
      ordemVistoriaTitulo: ordemVistoria?.titulo ?? undefined,
      ordemCorretivaNumero: corretiva?.numero ?? null,
      ordemCorretivaStatus: corretiva?.status ?? null,
      cor: corDaPendencia(corretiva?.status ?? null),
    };
  });
}

/**
 * OS de manutenção com coordenada, prontas pro mapa de backlog — a camada que
 * convive com as pendências de vistoria.
 *
 * Exclui `origem = 'Vistoria'`: essas corretivas nasceram de uma pendência que
 * já está plotada, e mostrar as duas colocaria dois pinos no mesmo ponto.
 * Exclui também as canceladas, pelo mesmo motivo que listPendenciasBacklog
 * ignora rotas canceladas — não são backlog, são histórico.
 *
 * Sem coordenada não há o que plotar; OS antigas abertas antes da coleta de
 * GPS simplesmente não entram.
 */
export async function listOrdensBacklog(filtro?: { equipeId?: string }): Promise<OrdemBacklog[]> {
  let query = supabase
    .from('ordens_manutencao')
    .select('id, numero, tipo, origem, prioridade, status, latitude, longitude, municipio, bairro, endereco, created_at, equipe:equipe_id ( nome ), tecnico:tecnico_id ( nome ), equipe_id')
    .neq('origem', 'Vistoria')
    .neq('status', 'cancelada')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);
  if (filtro?.equipeId) query = query.eq('equipe_id', filtro.equipeId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((o) => {
    const row = o as typeof o & { equipe?: { nome: string } | null; tecnico?: { nome: string } | null };
    return {
      id: row.id,
      numero: row.numero,
      tipo: row.tipo,
      origem: row.origem,
      prioridade: row.prioridade,
      status: row.status,
      latitude: row.latitude as number,
      longitude: row.longitude as number,
      municipio: row.municipio,
      bairro: row.bairro,
      endereco: row.endereco,
      equipe: row.equipe?.nome ?? null,
      tecnico: row.tecnico?.nome ?? null,
      createdAt: row.created_at,
      cor: corDaOrdem(row.status),
    };
  });
}

async function blobParaDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Gera a OS corretiva a partir de uma pendência (clique no pino vermelho do
 * mapa, já confirmado no modal — Decisão 2-B). Reaproveita 100% do fluxo de
 * manutenção: nasce 'aberta', sem técnico/equipe (delegação é a tela que já
 * existe, `DelegarTecnicoModal`). A foto da pendência é copiada como foto
 * "antes" da nova OS.
 */
export async function gerarOSCorretivaDaPendencia(
  pendencia: PendenciaVistoria,
  opts: { tipo: TipoCorretivaVistoria; prioridade?: PrioridadeOS },
  ordemVistoriaNumero: string,
): Promise<ManutencaoOrdem> {
  if (pendencia.ordemCorretivaId) {
    throw new Error('Esta pendência já tem uma OS corretiva gerada.');
  }

  // Sem isso a corretiva nascia só com lat/lng: municipio/bairro/endereco/uf
  // ficavam nulos, então ela sumia do gráfico "OS por Cidade", do filtro de
  // cidade e da coluna Cidade no Excel — e o técnico recebia coordenadas onde
  // as outras OS trazem rua e bairro. Mesma função do wizard de abertura
  // (NovaOrdemManutencao.tsx); `createManutencaoOrder` normaliza a cidade.
  // Falha de rede/rate-limit devolve null e não pode impedir a OS de nascer.
  // Sem o fallback de número aproximado: aqui é um clique só (não um
  // formulário sendo preenchido), e o Overpass custa ~9s quando os espelhos
  // estão fora — caro demais para um número de imóvel a 60m de um ponto de
  // rede que já tem GPS exato e nome da via.
  const addr = await reverseGeocode(pendencia.latitude, pendencia.longitude, {
    buscarNumeroAproximado: false,
  });

  const novaOrdem = await createManutencaoOrder({
    tipo: opts.tipo,
    origem: 'Vistoria',
    prioridade: opts.prioridade ?? 'media',
    solicitante: `Pendência da Vistoria ${ordemVistoriaNumero}`,
    observacoes: pendencia.observacao ?? undefined,
    // O que o técnico marcou em campo. `createManutencaoOrder` repassa isso
    // pra sincronizarOcorrenciasEChecklist, que cria as ocorrências reais e
    // ACRESCENTA ao checklist padrão os itens de solução correspondentes
    // (SOLUCAO_PROBLEMA_CTO) — sem ninguém preencher à mão. Note que é
    // acréscimo, não substituição: os 6 itens genéricos de higiene de CTO
    // continuam lá, então a corretiva nasce com 6 + um por problema marcado.
    problemaInformado: pendencia.problemas ?? undefined,
    latitude: pendencia.latitude,
    longitude: pendencia.longitude,
    uf: addr?.uf || undefined,
    municipio: addr?.municipio || undefined,
    bairro: addr?.bairro || undefined,
    endereco: addr?.endereco || undefined,
    numeroEndereco: addr?.numeroEndereco || undefined,
    referencia: addr?.referencia || undefined,
  });

  const fotoUrl = await getSignedFotoVistoriaUrl(pendencia.storagePath);
  if (fotoUrl) {
    const res = await fetch(fotoUrl);
    const blob = await res.blob();
    const dataUrl = await blobParaDataUrl(blob);
    await addFotoManutencao(novaOrdem.id, dataUrl, 'antes');
  }

  const { error } = await supabase
    .from('pendencias_vistoria')
    .update({ ordem_corretiva_id: novaOrdem.id })
    .eq('id', pendencia.id);
  if (error) throw error;

  return novaOrdem;
}

/** Supervisores ativos — usado pra montar o seletor de equipe/técnico ao criar uma rota (mesmo padrão de DelegarTecnicoModal.tsx). */
export async function listTecnicosParaVistoria(equipeId: string): Promise<Pick<ProfileRow, 'id' | 'nome' | 'email'>[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nome, email')
    .eq('equipe_id', equipeId)
    .eq('role', 'tecnico_manutencao')
    .eq('ativo', true)
    .order('nome', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Pick<ProfileRow, 'id' | 'nome' | 'email'>[];
}
