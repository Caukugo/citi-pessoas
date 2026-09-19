-- ─────────────────────────────────────────────────────────────────────────────
-- 0023 — `citi_import_member_via_forms` só para `service_role`
--
-- POR QUÊ: a 0022 revogou `execute` de `public` e `anon`, mas esqueceu
-- `authenticated`. Todo projeto Supabase concede `execute` em função nova a
-- `anon`, `authenticated` e `service_role` por padrão (privilégio automático
-- de quem cria a função) — revogar só de `public`/`anon` (o padrão que
-- `citi_import_member`, da CSV, usa DE PROPÓSITO, porque a tela de importação
-- chama como usuário GG autenticado) deixou `authenticated` com acesso.
--
-- Verificado ao vivo no projeto de teste depois do `db push` da 0020–0022,
-- com `has_function_privilege('authenticated', ..., 'execute')` = true.
--
-- Isto importa porque `citi_import_member_via_forms` NÃO tem o mesmo desenho:
-- ela é chamada só pela Edge Function `google-forms-intake`, com
-- `service_role`, depois de conferir a assinatura HMAC do webhook. Sem esta
-- correção, qualquer conta de GG autenticada no navegador poderia chamar a
-- função diretamente por RPC — pulando a Edge Function, mas ainda sujeita a
-- `citi_assert_gg()` e a todas as validações de subárea/gestão. Não é uma
-- falha que exponha dado de outra pessoa, mas não é o desenho pretendido:
-- esta função é porta de entrada exclusiva do serviço servidor, como as
-- funções de CPF (`citi_set_member_cpf` e companhia, 0019).
--
-- ESTADO FINAL DECLARADO EXPLICITAMENTE (não só a diferença em relação à
-- 0022): `public`, `anon` e `authenticated` sem `execute`; só `service_role`
-- com `execute`. `revoke`/`grant` são idempotentes — repetir o que a 0022 já
-- tinha feito para `public`/`anon` não é erro, é documentar o estado inteiro
-- num lugar só, sem editar a migration já aplicada.
--
-- Mesma assinatura da 0022 — não é preciso recriar a função, só ajustar o grant.
-- ─────────────────────────────────────────────────────────────────────────────

revoke execute on function citi_import_member_via_forms(
  text, jsonb, text, text, uuid, uuid, date, text, text, text, text, integer, date
) from public;

revoke execute on function citi_import_member_via_forms(
  text, jsonb, text, text, uuid, uuid, date, text, text, text, text, integer, date
) from anon;

revoke execute on function citi_import_member_via_forms(
  text, jsonb, text, text, uuid, uuid, date, text, text, text, text, integer, date
) from authenticated;

grant execute on function citi_import_member_via_forms(
  text, jsonb, text, text, uuid, uuid, date, text, text, text, text, integer, date
) to service_role;

-- ─── Conferência: o estado final é exatamente o declarado acima ────────────

do $$
declare
  v_fn constant regprocedure :=
    'citi_import_member_via_forms(text, jsonb, text, text, uuid, uuid, date, text, text, text, text, integer, date)'::regprocedure;
begin
  if has_function_privilege('public', v_fn, 'execute') then
    raise exception 'CORREÇÃO FALHOU: public ainda pode executar citi_import_member_via_forms.';
  end if;

  if has_function_privilege('anon', v_fn, 'execute') then
    raise exception 'CORREÇÃO FALHOU: anon ainda pode executar citi_import_member_via_forms.';
  end if;

  if has_function_privilege('authenticated', v_fn, 'execute') then
    raise exception 'CORREÇÃO FALHOU: authenticated ainda pode executar citi_import_member_via_forms.';
  end if;

  if not has_function_privilege('service_role', v_fn, 'execute') then
    raise exception 'CORREÇÃO FALHOU: service_role perdeu o acesso que deveria manter.';
  end if;
end $$;
