import { createClient } from '@supabase/supabase-js';

// Adicione ao seu .env (Vite):
//   VITE_SUPABASE_URL=https://xxxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY=eyJ...
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    '[Supabase] Variáveis de ambiente ausentes. Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Sessão salva no localStorage — sobrevive a F5/fechar aba/reabrir o
    // site. Importante pro uso em campo: celular recarregando a aba por
    // falta de memória ou perda de sinal não pode forçar o técnico a
    // relogar no meio de uma execução.
    persistSession: true,
    // Mantém o token renovado automaticamente enquanto a aba estiver
    // aberta, evitando deslogar no meio do uso por expiração de token.
    autoRefreshToken: true,
  },
});

// ---- Tipos das tabelas (espelham supabase/migrations/*.sql) ----

export type UserRole = 'gestor' | 'supervisor' | 'tecnico_la' | 'tecnico_manutencao';

/** Setor é derivado automaticamente do cargo (ver UserManagement.toggleRole) — não é mais texto livre. */
export const SETOR_POR_ROLE: Record<UserRole, string> = {
  gestor: 'Gestão',
  supervisor: 'Supervisão',
  tecnico_la: 'Localização e Ativação',
  tecnico_manutencao: 'Manutenção',
};

export interface ProfileRow {
  id: string;
  nome: string;
  email: string;
  role: UserRole;
  ativo: boolean;
  equipe_id: string | null;
  /** Usado pra auto-preencher o campo "Setor" ao abrir uma OS de manutenção. */
  setor: string | null;
  /** false quando o cadastro (login Google sem nome no metadata) caiu no fallback do prefixo do e-mail — força a telinha de completar perfil. */
  nome_definido: boolean;
  created_at: string;
}

export type OrdemStatus = 'em_andamento' | 'concluida' | 'exportada' | 'cancelada';

export type RelatorioTipo = 'pdf' | 'docx';

export interface OrdemServicoRow {
  id: string;
  codigo_referencia: string;
  razao_social: string | null;
  titulo_relatorio: string | null;
  objetivo: string | null;
  local: string | null;
  header: string | null;
  footer: string | null;
  preset_id: string | null;
  checklist_options: string[];
  status: OrdemStatus;
  tecnico_id: string;
  created_at: string;
  updated_at: string;
  concluded_at: string | null;
  // Preenchidos quando o relatório é gerado (ExportModal) — só a última
  // versão é mantida, nunca um histórico de arquivos (ver marcarRelatorioExportado).
  relatorio_storage_path: string | null;
  relatorio_tipo: RelatorioTipo | null;
  relatorio_gerado_em: string | null;
}

export interface FotoRow {
  id: string;
  ordem_id: string;
  storage_path: string;
  description: string;
  observacoes: string;
  location: string | null;
  geo_attempted: boolean;
  ordem_index: number;
  created_at: string;
}

const FOTOS_BUCKET = 'fotos-relatorio';

/** Gera uma URL assinada (1h) para exibir uma foto privada do bucket. */
export async function getSignedPhotoUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(FOTOS_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);
  if (error) {
    console.error('[Supabase] Erro ao assinar URL da foto:', error);
    return null;
  }
  return data?.signedUrl ?? null;
}

/** Faz upload de uma foto (data URL base64) para o Storage e retorna o path salvo. */
export async function uploadPhoto(
  dataUrl: string,
  tecnicoId: string,
  ordemId: string,
  fotoId: string,
): Promise<string> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const path = `${tecnicoId}/${ordemId}/${fotoId}.jpg`;

  const { error } = await supabase.storage.from(FOTOS_BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export async function deletePhotoFromStorage(storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from(FOTOS_BUCKET).remove([storagePath]);
  if (error) console.error('[Supabase] Erro ao remover foto do storage:', error);
}

/** Duplica uma foto no Storage (sem re-upload) para uma nova OS — usado ao "editar" um relatório finalizado. */
export async function duplicatePhotoInStorage(
  fromPath: string,
  tecnicoId: string,
  novaOrdemId: string,
  fotoId: string,
): Promise<string> {
  const toPath = `${tecnicoId}/${novaOrdemId}/${fotoId}.jpg`;
  const { error } = await supabase.storage.from(FOTOS_BUCKET).copy(fromPath, toPath);
  if (error) throw error;
  return toPath;
}

const RELATORIOS_BUCKET = 'relatorios-exportados';

/**
 * Salva a versão gerada (PDF ou Word) de um relatório fotográfico. Só uma
 * versão é mantida por OS — path fixo por tipo (`{tecnico}/{ordem}.pdf` ou
 * `.docx`) com upsert, então gerar de novo simplesmente substitui a anterior.
 */
export async function uploadRelatorioExportado(
  blob: Blob,
  tecnicoId: string,
  ordemId: string,
  tipo: RelatorioTipo,
): Promise<string> {
  const path = `${tecnicoId}/${ordemId}.${tipo}`;
  const contentType = tipo === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const { error } = await supabase.storage.from(RELATORIOS_BUCKET).upload(path, blob, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export async function deleteRelatorioFromStorage(storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from(RELATORIOS_BUCKET).remove([storagePath]);
  if (error) console.error('[Supabase] Erro ao remover relatório exportado do storage:', error);
}

/** Gera uma URL assinada (1h) para abrir/baixar o relatório exportado. */
export async function getSignedRelatorioUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(RELATORIOS_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);
  if (error) {
    console.error('[Supabase] Erro ao assinar URL do relatório exportado:', error);
    return null;
  }
  return data?.signedUrl ?? null;
}

// ---- Domínio de Manutenção (Field Service) — espelha
// supabase/migrations/0001_manutencao_schema.sql. Ver src/types/manutencao.ts
// para o shape usado pela UI e src/lib/manutencaoService.ts para o mapeamento. ----

export type StatusOSRow =
  | 'aberta' | 'atribuida' | 'recebida' | 'deslocamento' | 'no_local' | 'em_execucao'
  | 'pausada' | 'aguardando_aprovacao' | 'aprovada' | 'reaberta' | 'cancelada' | 'concluida';

export type PrioridadeOSRow = 'baixa' | 'media' | 'alta' | 'critica';

export interface EquipeRow {
  id: string;
  nome: string;
  ativa: boolean;
  /** Supervisor que administra esta equipe — quem pode adicionar/remover técnicos dela. */
  supervisor_id: string | null;
  created_at: string;
}

export interface OrdemManutencaoRow {
  id: string;
  numero: string;

  tipo: string;
  origem: string;
  prioridade: PrioridadeOSRow;
  status: StatusOSRow;

  solicitante: string;
  setor: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;

  uf: string | null;
  municipio: string | null;
  bairro: string | null;
  endereco: string | null;
  numero_endereco: string | null;
  referencia: string | null;
  latitude: number | null;
  longitude: number | null;

  problema_informado: string | null;
  observacoes: string | null;

  equipe_id: string | null;
  tecnico_id: string | null;
  data_prevista: string | null;
  horario_previsto: string | null;

  execucao_inicio_em: string | null;
  execucao_fim_em: string | null;

  aprovado_por: string | null;
  aprovado_em: string | null;
  motivo_recusa: string | null;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;

  created_at: string;
  updated_at: string;
}

export interface OcorrenciaManutencaoRow {
  id: string;
  ordem_id: string;
  tipo: string;
  categoria: string;
  descricao: string;
  observacao: string | null;
  quantidade: number;
  created_at: string;
}

export interface MaterialManutencaoRow {
  id: string;
  ordem_id: string;
  material: string;
  quantidade: number;
  unidade: string;
  observacao: string | null;
  valor: number | null;
  created_at: string;
}

export interface ChecklistItemManutencaoRow {
  id: string;
  ordem_id: string;
  label: string;
  estado: 'pendente' | 'concluido' | 'nao_aplica';
  observacao: string | null;
  ordem_index: number;
}

export interface FotoManutencaoRow {
  id: string;
  ordem_id: string;
  storage_path: string;
  categoria: 'antes' | 'durante' | 'depois';
  descricao: string | null;
  created_at: string;
}

export interface VideoManutencaoRow {
  id: string;
  ordem_id: string;
  storage_path: string;
  descricao: string | null;
  created_at: string;
}

export interface HistoricoManutencaoRow {
  id: string;
  ordem_id: string;
  usuario_id: string | null;
  usuario_nome: string;
  acao: string;
  descricao: string | null;
  created_at: string;
}

const FOTOS_MANUTENCAO_BUCKET = 'fotos-manutencao';
const VIDEOS_MANUTENCAO_BUCKET = 'videos-manutencao';

/** Gera uma URL assinada (1h) para exibir uma foto privada de manutenção. */
export async function getSignedFotoManutencaoUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(FOTOS_MANUTENCAO_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);
  if (error) {
    console.error('[Supabase] Erro ao assinar URL da foto de manutenção:', error);
    return null;
  }
  return data?.signedUrl ?? null;
}

/** Faz upload de uma foto de manutenção (data URL base64) e retorna o path salvo. */
export async function uploadFotoManutencao(
  dataUrl: string,
  ordemId: string,
  fotoId: string,
): Promise<string> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const path = `${ordemId}/${fotoId}.jpg`;

  const { error } = await supabase.storage.from(FOTOS_MANUTENCAO_BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export async function deleteFotoManutencaoFromStorage(storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from(FOTOS_MANUTENCAO_BUCKET).remove([storagePath]);
  if (error) console.error('[Supabase] Erro ao remover foto de manutenção do storage:', error);
}

/** Gera uma URL assinada (1h) para reproduzir um vídeo privado de manutenção. */
export async function getSignedVideoManutencaoUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(VIDEOS_MANUTENCAO_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);
  if (error) {
    console.error('[Supabase] Erro ao assinar URL do vídeo de manutenção:', error);
    return null;
  }
  return data?.signedUrl ?? null;
}

/** Faz upload de um vídeo de manutenção (Blob) e retorna o path salvo. */
export async function uploadVideoManutencao(
  blob: Blob,
  ordemId: string,
  videoId: string,
  contentType = 'video/mp4',
): Promise<string> {
  const ext = contentType.includes('webm') ? 'webm' : 'mp4';
  const path = `${ordemId}/${videoId}.${ext}`;

  const { error } = await supabase.storage.from(VIDEOS_MANUTENCAO_BUCKET).upload(path, blob, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export async function deleteVideoManutencaoFromStorage(storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from(VIDEOS_MANUTENCAO_BUCKET).remove([storagePath]);
  if (error) console.error('[Supabase] Erro ao remover vídeo de manutenção do storage:', error);
}
