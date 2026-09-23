-- ─────────────────────────────────────────────────────────────────────────────
-- 0041 — Revoga grants indevidos de `anon` em oito tabelas (achado de auditoria
-- pré-deploy, `supabase/tests/0009_autorizacao_e_cpf.sql`, verificação 4)
--
-- POR QUÊ: a verificação 4 da 0009 prova, desde a 0019, que "`anon` não tem
-- grant em nenhuma tabela, exceto INSERT em feedback anônimo". Rodando a suíte
-- inteira contra um banco com TODAS as migrations (0001–0040) aplicadas, essa
-- verificação falha: `anon` tem 56 grants a mais do que deveria.
--
-- CAUSA: `anon`/`authenticated` recebem privilégio completo (SELECT, INSERT,
-- UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) em toda tabela nova por
-- padrão do projeto Supabase — fora de qualquer migration deste repositório
-- (mesmo mecanismo já documentado nas migrations 0039/0040 para `authenticated`
-- em `members`/`anonymous_feedbacks`). As migrations 0001/0002/0009/0019
-- revogaram isso explicitamente para o schema original. As oito tabelas
-- criadas DEPOIS (`0020`, `0021`, `0026`, `0033`) nunca passaram pelo mesmo
-- revoke — não por decisão de produto, só porque cada uma cuidou da própria
-- funcionalidade e não repetiu o padrão de segurança das migrations mais
-- antigas.
--
-- NÃO é "só uma expectativa de teste desatualizada": para as SEIS tabelas com
-- RLS ligada e policy `is_gg()` (`academic_campuses/courses/units`,
-- `anonymous_feedback_intake_config`, `anonymous_feedback_intake_failures`,
-- `member_intake_campaigns`), o grant sobrando é defesa em profundidade — a
-- RLS já bloqueia `anon` na prática, mas o GRANT de tabela inteira não deveria
-- existir mesmo assim. Só o GRANT, sozinho, não expõe nada nessas seis.
--
-- `x1_agenda` (criada na 0034) é a OITAVA da lista, mas de natureza diferente
-- das outras sete: é uma VIEW (`x1_appointments left join x1_appointment_
-- events`), criada com `security_invoker = true` — a consulta roda com o
-- privilégio e a RLS de QUEM CHAMA, não do dono da view. As DUAS tabelas de
-- origem já têm RLS ligada com policy `is_gg()` (`ALL` em `x1_appointments`,
-- `SELECT` em `x1_appointment_events`) — a mesma proteção de qualquer outra
-- tabela do produto. Auditado e confirmado por teste comportamental
-- (`set role anon; select * from x1_agenda;`): **negado por privilégio**
-- antes mesmo de a RLS entrar em jogo. Não há RLS "faltando" para adicionar —
-- uma view não tem RLS própria para ligar, e a das tabelas de origem já
-- cobre o caminho real. `SELECT` para `authenticated` nela é intencional
-- (o produto permite que toda conta veja a Agenda de X1); só o grant de
-- `anon` era o problema, e é isso que esta migration revoga.
--
-- O QUE ESTA MIGRATION FAZ:
--   Revoga de `anon`, table a table (view incluída), os privilégios que
--   sobraram. Nada é revogado de `authenticated` — os fluxos legítimos
--   (Administração lendo catálogo acadêmico, configurações de intake,
--   campanhas; Agenda de X1) continuam exatamente como estavam, sob a MESMA
--   RLS que já os protegia.
--
-- O QUE ESTA MIGRATION NÃO FAZ:
--   • Não toca em `authenticated`, `service_role` nem `PUBLIC`.
--   • Não cria, não altera e não remove nenhuma RLS policy.
--   • Não mexe em `security_invoker` nem na definição de `x1_agenda`.
--   • Não altera nenhuma tabela do schema original (0001/0002/0009/0019), que
--     já não tinha este problema.
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on table public.academic_campuses from anon;
revoke all on table public.academic_courses from anon;
revoke all on table public.academic_units from anon;
revoke all on table public.anonymous_feedback_intake_config from anon;
revoke all on table public.anonymous_feedback_intake_failures from anon;
revoke all on table public.google_forms_intake_config from anon;
revoke all on table public.member_intake_campaigns from anon;
revoke all on table public.x1_agenda from anon;

-- ─── Conferência: `anon` sem grant nenhum nessas oito, `authenticated` intacto ──
do $$
declare
  v_tabelas constant text[] := array[
    'academic_campuses', 'academic_courses', 'academic_units',
    'anonymous_feedback_intake_config', 'anonymous_feedback_intake_failures',
    'google_forms_intake_config', 'member_intake_campaigns', 'x1_agenda'
  ];
  v_tabela text;
  v_count  integer;
begin
  foreach v_tabela in array v_tabelas loop
    select count(*) into v_count
      from information_schema.role_table_grants
     where table_schema = 'public' and table_name = v_tabela and grantee = 'anon';

    if v_count <> 0 then
      raise exception 'CORREÇÃO FALHOU: anon ainda tem % grant(s) em %.', v_count, v_tabela;
    end if;

    if not has_table_privilege('authenticated', format('public.%I', v_tabela), 'select') then
      raise exception
        'CORREÇÃO FALHOU: authenticated perdeu SELECT em % — o fluxo legítimo quebraria.',
        v_tabela;
    end if;
  end loop;
end $$;
