// src/lib/vistoriaOfflineQueue.ts
import Dexie, { type Table } from 'dexie';
import { addPendencia } from '@/lib/vistoriaService';

/**
 * Fila de ENVIO PENDENTE para pendências de vistoria registradas sem sinal.
 *
 * Diferença estrutural em relação a `manutencaoOfflineQueue.ts`: lá o item da
 * fila é só a MÍDIA, porque a OS já existe no servidor e a foto só precisa ser
 * anexada a ela depois. Aqui não existe nada no servidor ainda — a pendência
 * INTEIRA (foto + coordenada + observação + problemas) tem que ficar guardada
 * e ser reproduzida via `addPendencia` quando a conexão voltar. Por isso o
 * registro guardado espelha os argumentos daquela função, não um blob solto.
 *
 * Isso importa porque a vistoria é justamente a atividade que acontece sem
 * cobertura — a rota percorre backbone entre cidades. Antes desta fila, uma
 * falha de upload perdia foto, GPS e observação de uma vez só, e o técnico
 * nem sabia quais pendências tinha perdido, porque o modal já havia fechado.
 *
 * A ORDEM é significativa aqui (mais do que em manutenção): as pendências são
 * sequenciais ao longo do trajeto, e o mapa de registro manual abre na
 * anterior. Por isso o flush processa por `createdAt` crescente e para no
 * primeiro erro, em vez de seguir adiante — reproduzir fora de ordem
 * embaralharia a sequência da rota.
 */

export interface PendenciaPendente {
  id?: number;
  ordemVistoriaId: string;
  dataUrl: string;
  latitude: number;
  longitude: number;
  observacao?: string;
  /** Serializado por '||' — mesmo formato de `pendencias_vistoria.problemas`. */
  problemas?: string;
  createdAt: number;
}

class VistoriaOfflineDB extends Dexie {
  pendentes!: Table<PendenciaPendente>;

  constructor() {
    super('zaaz-vistoria-offline-v1');
    this.version(1).stores({
      pendentes: '++id, ordemVistoriaId, createdAt',
    });
  }
}

const db = new VistoriaOfflineDB();

export async function enqueuePendencia(item: Omit<PendenciaPendente, 'id' | 'createdAt'>): Promise<void> {
  await db.pendentes.add({ ...item, createdAt: Date.now() });
}

/** Itens ainda não enviados desta rota, em ordem de captura — a UI lista junto das já salvas. */
export async function listPendentes(ordemVistoriaId: string): Promise<PendenciaPendente[]> {
  return db.pendentes.where('ordemVistoriaId').equals(ordemVistoriaId).sortBy('createdAt');
}

export async function countPendentes(ordemVistoriaId: string): Promise<number> {
  return db.pendentes.where('ordemVistoriaId').equals(ordemVistoriaId).count();
}

/**
 * Tenta enviar as pendências guardadas desta rota, da mais antiga pra mais
 * nova. Para no primeiro erro (ver nota de ordem acima) e devolve quantas
 * subiram — o que sobrou continua na fila pra próxima tentativa.
 */
export async function flushPendentes(ordemVistoriaId: string): Promise<number> {
  const itens = await listPendentes(ordemVistoriaId);
  let sincronizadas = 0;

  for (const item of itens) {
    try {
      await addPendencia(
        item.ordemVistoriaId,
        item.dataUrl,
        item.latitude,
        item.longitude,
        item.observacao,
        item.problemas,
      );
      if (item.id != null) await db.pendentes.delete(item.id);
      sincronizadas += 1;
    } catch (err) {
      console.warn('[VistoriaOffline] Falha ao sincronizar pendência — mantém na fila e para aqui pra não trocar a ordem:', err);
      break;
    }
  }

  return sincronizadas;
}
