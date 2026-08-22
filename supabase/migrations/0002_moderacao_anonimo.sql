-- ─────────────────────────────────────────────────────────────────────────────
-- 0002 — Vocabulário de moderação do feedback anônimo
--
-- POR QUÊ: o 0001 modelou a moderação como `aprovado | rejeitado | arquivado`,
-- que descreve um fluxo de publicação. Não é o que a GG faz. Ler um relato
-- anônimo termina em uma de duas decisões:
--
--   • tomei ciência e encerro aqui                        → resolution 'ciente'
--   • isto precisa chegar ao acompanhamento de alguém     → resolution 'direcionado'
--
-- Então a fila passa a ter dois estados (`pendente` / `moderado`) e a DECISÃO
-- vira uma coluna própria. Separar os dois eixos é o que permite ao quadro de
-- moderação derivar as três colunas sem inventar estado de negócio.
--
-- ⚠️ O que esta migration NÃO faz, de propósito: nenhuma ligação entre
-- `anonymous_feedbacks` e `feedbacks`. Continuam sendo fluxos independentes.
-- `directed_member_id` registra a quem o CONTEXTO foi levado — não cria, não
-- converte e não classifica um feedback de acompanhamento.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Decisão da moderação ────────────────────────────────────────────────

create type anon_resolution as enum ('ciente', 'direcionado');

alter table anonymous_feedbacks
  add column resolution         anon_resolution,
  -- Decisão da GG. NÃO confundir com `target_member_id`, que é sobre quem
  -- QUEM ENVIOU disse que o relato falava.
  add column directed_member_id uuid references members (id) on delete set null;

-- ─── 2. Novo vocabulário da fila ────────────────────────────────────────────
-- Postgres não deixa remover valor de enum, então o tipo é reconstruído. Os
-- registros existentes são traduzidos, não descartados: histórico é preservado.
--
--   pendente              → pendente
--   aprovado / arquivado  → moderado + ciente     (a GG olhou e encerrou)
--   rejeitado             → moderado + ciente     (idem; nada era "direcionado")
--
-- Nenhum registro antigo vira 'direcionado': direcionar é uma decisão que
-- ninguém pôde tomar antes desta migration existir. Inventar isso seria
-- fabricar uma decisão humana que nunca aconteceu.

create type anon_status_novo as enum ('pendente', 'moderado');

alter table anonymous_feedbacks
  alter column status drop default;

update anonymous_feedbacks
   set resolution = 'ciente'
 where status <> 'pendente'
   and resolution is null;

alter table anonymous_feedbacks
  alter column status type anon_status_novo
  using (case when status = 'pendente' then 'pendente' else 'moderado' end)::anon_status_novo;

alter table anonymous_feedbacks
  alter column status set default 'pendente';

drop type anon_status;
alter type anon_status_novo rename to anon_status;

-- ─── 3. Coerência entre decisão e estado ────────────────────────────────────
-- O banco garante o que a interface promete. Sem isto, um bug de tela poderia
-- deixar um feedback "moderado sem decisão" ou "direcionado para ninguém", e a
-- coluna do quadro ficaria indefinida.

alter table anonymous_feedbacks
  add constraint moderacao_coerente
    check (
      (status = 'pendente' and resolution is null and directed_member_id is null)
      or (status = 'moderado' and resolution is not null)
    ),

  -- Só "direcionado" aponta para uma pessoa. Tomar ciência de um relato sobre
  -- alguém não é a mesma coisa que direcioná-lo àquela pessoa.
  add constraint direcionamento_coerente
    check (
      (resolution = 'direcionado' and directed_member_id is not null)
      or (resolution is distinct from 'direcionado' and directed_member_id is null)
    );

-- ─── 4. Índices ─────────────────────────────────────────────────────────────
-- O quadro lê a fila inteira ordenada por data; a coluna de "Direcionados"
-- também é consultada a partir do perfil de um membro.

drop index if exists anonymous_feedbacks_status_idx;
create index anonymous_feedbacks_status_idx
  on anonymous_feedbacks (status, resolution, submitted_at desc);

create index anonymous_feedbacks_directed_idx
  on anonymous_feedbacks (directed_member_id)
  where directed_member_id is not null;
