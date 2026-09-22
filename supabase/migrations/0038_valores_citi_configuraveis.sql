-- ─────────────────────────────────────────────────────────────────────────────
-- 0038 — Valores do CITi configuráveis pela Administração (ADM-004)
--
-- POR QUÊ: a lista dos valores era uma constante em `src/data/types.ts`. Mudar
-- um valor exigia editar código e fazer deploy — o que é o mesmo que dizer que
-- a gestão de 2027 herda os valores de 2026 e não tem como mexer. O comentário
-- que estava naquela constante já registrava a dívida: "a Administração passa a
-- permitir editá-los em fase posterior — quando isso acontecer, registros
-- antigos precisam continuar associados à versão vigente na época."
--
-- O QUE ESTA MIGRATION FAZ:
--
--   A. `settings.citi_values` — a lista viva, como jsonb na linha única que já
--      existe. Sem tabela nova e sem RLS nova de propósito: `settings` já tem
--      "GG lê configurações" / "GG altera configurações" (0001), e a lista tem
--      meia dúzia de itens editados algumas vezes por gestão.
--
--   B. Semeia os quatro valores vigentes, cada um com um `id` estável. O id
--      NUNCA muda: é ele que liga um X1 de 2026 ao valor depois que outra
--      gestão tirar aquele valor de circulação.
--
--   C. Faz o backfill de `x1s.citi_values`, acrescentando `valueId` em cada
--      avaliação já registrada. O casamento é pelo rótulo gravado, o que é
--      determinístico AQUI e só aqui: até esta migration, os quatro rótulos
--      eram os únicos que o formulário conseguia produzir.
--
-- O QUE ESTA MIGRATION NÃO FAZ:
--
--   • Não apaga nem reescreve nenhuma avaliação. O `value` de cada entrada — o
--     rótulo do dia da conversa — permanece exatamente como estava; `valueId`
--     entra AO LADO dele.
--   • Não versiona a lista por gestão. Não precisa: cada X1 carrega o rótulo
--     que valia quando foi escrito, e é isso que PROJECT_CONTEXT §11 pede.
--     Ver ADR-023.
--   • Não muda a assinatura de nenhuma RPC — `valueId` viaja dentro do jsonb
--     que `citi_registrar_x1` já recebe em `p_citi_values`.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── A. A coluna ─────────────────────────────────────────────────────────────

alter table settings
  add column if not exists citi_values jsonb not null default '[]'::jsonb;

comment on column settings.citi_values is
  'Valores do CITi (ADM-004): [{id, label, retiredAt}]. A ordem do array é a '
  'ordem de exibição. Aposentado (retiredAt preenchido) sai do formulário de '
  'X1 novo e continua legível no histórico — nunca é removido do array.';

-- Defesa mínima: a forma é um array. O resto da validação é do zod/model, que
-- é onde a pessoa recebe a mensagem de erro.
alter table settings
  drop constraint if exists settings_citi_values_e_array;

alter table settings
  add constraint settings_citi_values_e_array
  check (jsonb_typeof(citi_values) = 'array');

-- ─── B. Semente: os quatro valores vigentes ──────────────────────────────────
--
-- Os ids são literais fixos, e não `gen_random_uuid()`, porque precisam ser os
-- MESMOS em todo ambiente: são eles que o backfill (C) grava dentro dos X1 já
-- existentes, e os mesmos que `src/data/mock/fixtures.ts` usa. Se cada banco
-- sorteasse os seus, um dump de produção restaurado em outro lugar deixaria de
-- casar com o histórico.

update settings
   set citi_values = '[
     {"id": "ae3a14a0-9d42-4c04-855d-83244a0d2203", "label": "Eu sou o CITi",           "retiredAt": null},
     {"id": "8feacfaf-126f-4227-9ba1-18dc8b45e009", "label": "Obcecados por aprender",  "retiredAt": null},
     {"id": "d5c0837e-3a10-4850-974b-70d787933089", "label": "Obcecados por vencer",    "retiredAt": null},
     {"id": "15878374-6868-4e96-93d1-d2d54221cbcb", "label": "Obcecados por entregar",  "retiredAt": null}
   ]'::jsonb
 where id = 1
   and jsonb_array_length(citi_values) = 0;

-- ─── C. Backfill do histórico ────────────────────────────────────────────────
--
-- Cada entrada de `x1s.citi_values` ganha o `valueId` do valor de mesmo rótulo.
-- Uma entrada cujo rótulo não casar com nada fica EXATAMENTE como está, sem
-- `valueId` — o modelo trata `valueId` como opcional justamente para que um
-- registro antigo não precise ser inventado para caber.

update x1s
   set citi_values = (
     select jsonb_agg(entrada || coalesce(vinculo.extra, '{}'::jsonb) order by ordem)
       from jsonb_array_elements(x1s.citi_values) with ordinality as itens(entrada, ordem)
       left join lateral (
         select jsonb_build_object('valueId', valor->>'id') as extra
           from settings,
                jsonb_array_elements(settings.citi_values) as valores(valor)
          where settings.id = 1
            and valor->>'label' = itens.entrada->>'value'
          limit 1
       ) as vinculo on true
   )
 where jsonb_typeof(citi_values) = 'array'
   and jsonb_array_length(citi_values) > 0;
