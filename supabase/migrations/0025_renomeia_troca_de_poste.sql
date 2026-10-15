-- 0025_renomeia_troca_de_poste.sql
--
-- O modelo de manutenção "Troca de Poste" passou a se chamar "Problemas de
-- Rede" (ver TIPOS_MANUTENCAO em src/types/manutencao.ts). O nome anterior
-- descrevia a solução; o novo descreve o que se encontra em campo, que é o que
-- a árvore de atividades daquele modelo sempre listou — cabo solto, BAP
-- faltando, CTO e CEO soltas, cabo cortado, rede sem plaqueta.
--
-- As OS abertas com o nome antigo são renomeadas junto. Sem isto, elas
-- apareceriam como um sexto tipo na lista e seriam contadas em linha separada
-- no relatório por tipo e estado — o mesmo problema que a migração 0024
-- resolveu para as atividades.
--
-- A árvore de atividades NÃO muda, então `ocorrencias_manutencao.tipo` e
-- `problema_informado` ficam como estão.

begin;

update ordens_manutencao
   set tipo = 'Problemas de Rede'
 where tipo = 'Troca de Poste';

commit;
