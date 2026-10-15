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
--   ocorrencias_manutencao.tipo            uma atividade por linha
--   ordens_manutencao.problema_informado   várias, serializadas por '||'
--   pendencias_vistoria.problemas          idem
--
-- Nas duas colunas serializadas a troca é feita item a item (split → troca →
-- join), e não por substituição de texto: 'CTO sem identificação' é prefixo de
-- 'CTO sem identificação (sem nome)', e um replace solto corromperia o
-- segundo ao renomear o primeiro.
--
-- O de-para vai repetido nas três instruções, em listas VALUES, em vez de
-- morar numa tabela auxiliar criada aqui mesmo: o editor de SQL do Supabase
-- analisa o lote inteiro antes de executar qualquer coisa, e uma tabela criada
-- na mesma execução ainda não existe nesse momento — o que fazia a migração
-- falhar com "relation ... does not exist".
--
-- Atividades antigas que NÃO entram na renomeação, de propósito: elas não têm
-- equivalente nas árvores novas e continuam no histórico com o nome que têm —
-- 'CTO sem identificação (sem nome)', 'Adaptador/acoplador atenuado',
-- 'Drop com conector roubado', 'CTO não identificada' e
-- 'CTO sem plaquetas de identificação'. No relatório elas aparecem como linha
-- própria enquanto estiverem na janela de dados. Inventar um destino para elas
-- seria reescrever o que foi registrado em campo.

begin;

-- ── 1. Ocorrências (uma atividade por linha) ────────────────────────────────
update ocorrencias_manutencao o
   set tipo = r.novo
  from (values
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
  ) as r(antigo, novo)
 where o.tipo = r.antigo;

-- ── 2. Problema informado na OS (lista serializada por '||') ────────────────
with renomear(antigo, novo) as (
  values
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
), recomposto as (
  select o.id,
         string_agg(coalesce(r.novo, item.valor), '||' order by item.ordem) as texto
    from ordens_manutencao o
    cross join lateral unnest(string_to_array(o.problema_informado, '||'))
           with ordinality as item(valor, ordem)
    left join renomear r on r.antigo = item.valor
   where o.problema_informado is not null
     and o.problema_informado <> ''
   group by o.id
)
update ordens_manutencao o
   set problema_informado = recomposto.texto
  from recomposto
 where o.id = recomposto.id
   and o.problema_informado is distinct from recomposto.texto;

-- ── 3. Pendências de vistoria (mesma serialização) ──────────────────────────
with renomear(antigo, novo) as (
  values
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
), recomposto as (
  select p.id,
         string_agg(coalesce(r.novo, item.valor), '||' order by item.ordem) as texto
    from pendencias_vistoria p
    cross join lateral unnest(string_to_array(p.problemas, '||'))
           with ordinality as item(valor, ordem)
    left join renomear r on r.antigo = item.valor
   where p.problemas is not null
     and p.problemas <> ''
   group by p.id
)
update pendencias_vistoria p
   set problemas = recomposto.texto
  from recomposto
 where p.id = recomposto.id
   and p.problemas is distinct from recomposto.texto;

commit;
