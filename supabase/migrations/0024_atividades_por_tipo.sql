-- 0024_atividades_por_tipo.sql
--
-- Os cinco templates de manutenção passaram a ter cada um a sua árvore de
-- atividades (ver ATIVIDADES_POR_TIPO em src/types/manutencao.ts), e a
-- operação definiu a grafia de cada atividade.
--
-- O relatório conta atividade por TEXTO. Sem esta migração, 'CTO quebrada'
-- (gravado antes) e 'CTO Quebrada' (gravado de agora em diante) virariam duas
-- linhas diferentes do mesmo defeito, e a quantidade por estado sairia
-- partida ao meio.
--
-- O texto da atividade vive em três lugares:
--   ocorrencias_manutencao.tipo        uma atividade por linha
--   ordens_manutencao.problema_informado   várias, serializadas por '||'
--   pendencias_vistoria.problemas          idem
--
-- Nas duas colunas serializadas a troca é feita item a item (split → troca →
-- join), e não por substituição de texto: 'CTO sem identificação' é prefixo de
-- 'CTO sem identificação (sem nome)', e um replace solto corromperia o
-- segundo ao renomear o primeiro.

begin;

create table if not exists _renomear_atividades_0024 (
  antigo text primary key,
  novo text not null
);

insert into _renomear_atividades_0024 (antigo, novo) values
  ('CTO quebrada',                          'CTO Quebrada'),
  ('CTO sem tampa',                         'CTO Sem Tampa'),
  ('CTO solta do poste',                    'CTO Solta'),
  ('CTO apresenta infestação de formigas',  'CTO Apresenta Infestação de Formigas'),
  ('Splitter quebrado',                     'Splitter Quebrado'),
  ('Splitter atenuado',                     'Splitter Atenuado'),
  ('Splitter roubado',                      'Splitter Roubado'),
  ('Adaptador/acoplador danificado',        'Adaptador/Acoplador Danificado'),
  ('Adaptador/acoplador roubado',           'Adaptador/Acoplador Roubado'),
  ('Drop danificado',                       'Drop Danificado'),
  ('Drop sem anilha de identificação',      'Drop sem anilha de Identificação'),
  ('Drop atenuado',                         'Drop com atenuação'),
  ('Rede sem identificação (sem plaqueta)', 'Rede sem identificação (plaquetas)')
on conflict (antigo) do update set novo = excluded.novo;

-- Atividades antigas que NÃO entram na renomeação, de propósito: elas não têm
-- equivalente nas árvores novas e continuam no histórico com o nome que têm —
-- 'CTO sem identificação (sem nome)', 'Adaptador/acoplador atenuado',
-- 'Drop com conector roubado', 'CTO não identificada' e
-- 'CTO sem plaquetas de identificação'. No relatório elas aparecem como linha
-- própria enquanto estiverem na janela de dados. Inventar um destino para elas
-- seria reescrever o que foi registrado em campo.

-- ── 1. Ocorrências (uma atividade por linha) ────────────────────────────────
update ocorrencias_manutencao o
   set tipo = r.novo
  from _renomear_atividades_0024 r
 where o.tipo = r.antigo;

-- ── 2. Problema informado na OS (lista serializada por '||') ────────────────
update ordens_manutencao o
   set problema_informado = sub.recomposto
  from (
    select o2.id,
           string_agg(coalesce(r.novo, item.valor), '||' order by item.ordem) as recomposto
      from ordens_manutencao o2
      cross join lateral unnest(string_to_array(o2.problema_informado, '||'))
             with ordinality as item(valor, ordem)
      left join _renomear_atividades_0024 r on r.antigo = item.valor
     where o2.problema_informado is not null
       and o2.problema_informado <> ''
     group by o2.id
  ) as sub
 where o.id = sub.id
   and o.problema_informado is distinct from sub.recomposto;

-- ── 3. Pendências de vistoria (mesma serialização) ──────────────────────────
update pendencias_vistoria p
   set problemas = sub.recomposto
  from (
    select p2.id,
           string_agg(coalesce(r.novo, item.valor), '||' order by item.ordem) as recomposto
      from pendencias_vistoria p2
      cross join lateral unnest(string_to_array(p2.problemas, '||'))
             with ordinality as item(valor, ordem)
      left join _renomear_atividades_0024 r on r.antigo = item.valor
     where p2.problemas is not null
       and p2.problemas <> ''
     group by p2.id
  ) as sub
 where p.id = sub.id
   and p.problemas is distinct from sub.recomposto;

drop table _renomear_atividades_0024;

commit;
