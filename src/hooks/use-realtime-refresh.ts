import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

export interface RealtimeSubscription {
  table: string;
  /** Filtro Postgres do Supabase Realtime, ex: `id=eq.${id}` ou `ordem_id=eq.${id}`. Sem filtro, escuta a tabela inteira. */
  filter?: string;
}

/**
 * Assina mudanças em uma ou mais tabelas via Supabase Realtime e chama
 * `onChange` (debounced) sempre que algo mudar — usado para recarregar a
 * tela sem precisar de F5. Requer que a tabela esteja na publicação
 * `supabase_realtime` (ver supabase/migrations/0005_realtime.sql).
 *
 * Uma única ação do usuário costuma gerar vários eventos em sequência (ex:
 * criar uma OS insere a linha principal + checklist + histórico) — por isso
 * o debounce, para recarregar uma vez só em vez de várias.
 */
export function useRealtimeRefresh(
  subscriptions: RealtimeSubscription[],
  onChange: () => void,
  debounceMs = 500,
): void {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Chave estável — evita re-assinar o canal a cada render só porque o
  // caller passou um array literal novo com o mesmo conteúdo.
  const key = subscriptions.map((s) => `${s.table}:${s.filter ?? ''}`).join('|');

  useEffect(() => {
    if (subscriptions.length === 0) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onChangeRef.current(), debounceMs);
    };

    const channel = supabase.channel(`realtime-${key}-${Math.random().toString(36).slice(2)}`);
    subscriptions.forEach(({ table, filter }) => {
      channel.on(
        'postgres_changes' as any,
        filter ? { event: '*', schema: 'public', table, filter } : { event: '*', schema: 'public', table },
        trigger,
      );
    });
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, debounceMs]);
}
