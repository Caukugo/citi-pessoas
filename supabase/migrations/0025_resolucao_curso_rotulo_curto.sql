-- ─────────────────────────────────────────────────────────────────────────────
-- 0025 — `citi_resolve_academic_course` aceita o rótulo curto "Curso — Grau",
-- sem exigir o sufixo `(Campus)`, quando o campus já foi resolvido.
--
-- POR QUÊ: a resposta fictícia `.004` (teste real, projeto `citi-pessoas-test`)
-- enviou `campus = 'Recife'` e `course = 'Ciências Biológicas — Bacharelado'`.
-- Esse curso existe em mais de um campus (Recife e Vitória de Santo Antão), e
-- por isso o `forms_label` gerado pela 0020 inclui o campus para desambiguar:
-- `'Ciências Biológicas — Bacharelado (Recife)'`. O valor recebido não batia
-- nem com o `forms_label` completo nem com o `name` puro (sem grau) — a
-- função devolveu `curso_inexistente` e a resposta falhou antes de criar o
-- membro (comportamento CORRETO da 0020: nunca cria membro incompleto por um
-- curso não resolvido).
--
-- A CAUSA DE VERDADE: o sufixo `(Campus)` do `forms_label` é redundante do
-- ponto de vista da RESOLUÇÃO — o campus já chega como parâmetro separado
-- (`p_campus_label`) e já é resolvido primeiro. O sufixo só existe para
-- ajudar QUEM RESPONDE o formulário a não escolher errado lendo a lista de
-- opções; não deveria ser exigido de quem já informou o campus por fora.
--
-- MESMA ASSINATURA da 0020 — `citi_resolve_academic_course(text, text)`, os
-- mesmos quatro `outcome` que já existiam continuam significando a mesma
-- coisa, e ganha um quinto:
--
--   • ok                    — resolvido, único e sem ambiguidade
--   • campus_desconhecido   — campus não reconhecido
--   • curso_inexistente     — nome não existe em NENHUM campus do catálogo
--   • campus_incompativel   — o curso existe, mas não NESTE campus
--   • curso_ambiguo (NOVO)  — o nome puro (sem grau) casa com MAIS DE UM
--                             curso neste campus (Bacharelado E Licenciatura)
--                             — nunca escolhido por ordem alfabética
--
-- REGRA DE RESOLUÇÃO, DENTRO DO CAMPUS JÁ RESOLVIDO, NESTA ORDEM:
--   1. `forms_label` completo (compatibilidade com o que já funcionava);
--   2. rótulo curto "Nome — Grau" (o formato que causou a falha da `.004`);
--   3. nome puro, SÓ quando existe exatamente UM curso com esse nome neste
--      campus — dois (Bacharelado e Licenciatura) é `curso_ambiguo`, nunca
--      um desempate silencioso.
--
-- Em nenhum passo um curso de OUTRO campus é considerado — a distinção entre
-- `campus_incompativel` e `curso_inexistente` continua olhando o catálogo
-- inteiro só para CLASSIFICAR o erro, nunca para aceitar o curso errado.
--
-- A 0020 NÃO é editada: já foi aplicada. Esta substitui a função inteira, com
-- a mesma assinatura.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Normalização tolerante a travessão/hífen, só para comparar rótulos ─────
--
-- `citi_normalize_label` (0017) não mexe em pontuação — "Nome — Grau",
-- "Nome - Grau" e "Nome – Grau" (travessão, hífen, meia-risca) ficariam
-- DIFERENTES depois dela. Esta função canoniza o separador ANTES de chamar
-- `citi_normalize_label`, para comparar dois rótulos "Nome <separador> Grau"
-- sem depender de qual caractere de traço foi usado.

create or replace function citi_normalize_course_label(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select citi_normalize_label(
    regexp_replace(coalesce(p_value, ''), '\s*[-–—]\s*', ' - ', 'g')
  );
$$;

comment on function citi_normalize_course_label(text) is
  'Como citi_normalize_label, mas primeiro canoniza hífen/en-dash/em-dash para " - " — permite comparar "Nome — Grau" com "Nome - Grau" como o mesmo rótulo.';

revoke execute on function citi_normalize_course_label(text) from public, anon;
grant execute on function citi_normalize_course_label(text) to authenticated, service_role;

-- ─── Resolver campus + curso (substituída) ──────────────────────────────────

create or replace function citi_resolve_academic_course(
  p_campus_label text,
  p_course_label text
)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_campus      academic_campuses%rowtype;
  v_course      academic_courses%rowtype;
  v_unit        academic_units%rowtype;
  v_norm_label  text := citi_normalize_course_label(p_course_label);
  v_norm_name   text := citi_normalize_label(p_course_label);
  v_count       integer;
begin
  select * into v_campus
    from academic_campuses
   where is_active and citi_normalize_label(name) = citi_normalize_label(p_campus_label);

  if not found then
    return jsonb_build_object('outcome', 'campus_desconhecido');
  end if;

  -- ── 1 e 2: forms_label completo OU rótulo curto "Nome — Grau", NESTE campus ──
  -- Os dois usam a MESMA comparação (citi_normalize_course_label) — para os
  -- 92 cursos sem ambiguidade, forms_label E o rótulo curto já são o mesmo
  -- texto, então as duas branches do `or` casam a mesma linha. Para os 14
  -- ambíguos, forms_label tem o sufixo de campus e o rótulo curto não —
  -- ambos continuam resolvendo, porque o campus já foi filtrado por
  -- `campus_id = v_campus.id` antes de qualquer comparação de texto.
  select * into v_course
    from academic_courses
   where is_active
     and campus_id = v_campus.id
     and (
       citi_normalize_course_label(forms_label) = v_norm_label
       or citi_normalize_course_label(name || ' - ' || degree) = v_norm_label
     )
   limit 1;

  if found then
    select * into v_unit from academic_units where id = v_course.academic_unit_id;
    return jsonb_build_object(
      'outcome', 'ok',
      'course_id', v_course.id,
      'course_name', v_course.name,
      'degree', v_course.degree,
      'campus_id', v_campus.id,
      'campus_name', v_campus.name,
      'academic_unit_id', v_course.academic_unit_id,
      'academic_unit_name', v_unit.name,
      'academic_unit_sigla', v_unit.sigla
    );
  end if;

  -- ── 3: nome puro (sem grau), só se for único NESTE campus ──
  -- "Física" em Recife é Bacharelado E Licenciatura: o nome puro sozinho não
  -- diz qual. Nunca desempata por ordem alfabética — conta quantos batem e
  -- só resolve quando a resposta é exatamente um.
  select count(*) into v_count
    from academic_courses
   where is_active and campus_id = v_campus.id and normalized_name = v_norm_name;

  if v_count = 1 then
    select * into v_course
      from academic_courses
     where is_active and campus_id = v_campus.id and normalized_name = v_norm_name;

    select * into v_unit from academic_units where id = v_course.academic_unit_id;
    return jsonb_build_object(
      'outcome', 'ok',
      'course_id', v_course.id,
      'course_name', v_course.name,
      'degree', v_course.degree,
      'campus_id', v_campus.id,
      'campus_name', v_campus.name,
      'academic_unit_id', v_course.academic_unit_id,
      'academic_unit_name', v_unit.name,
      'academic_unit_sigla', v_unit.sigla
    );
  elsif v_count > 1 then
    return jsonb_build_object('outcome', 'curso_ambiguo');
  end if;

  -- ── Nada bateu NESTE campus — classifica o erro olhando o catálogo inteiro ──
  -- (só para escolher a MENSAGEM certa; um curso de outro campus nunca é
  -- aceito por causa disto — todas as seleções acima já filtraram por
  -- campus_id antes de comparar texto nenhum).
  if exists (
    select 1 from academic_courses
     where is_active
       and (
         citi_normalize_course_label(forms_label) = v_norm_label
         or citi_normalize_course_label(name || ' - ' || degree) = v_norm_label
         or normalized_name = v_norm_name
       )
  ) then
    return jsonb_build_object('outcome', 'campus_incompativel');
  end if;

  return jsonb_build_object('outcome', 'curso_inexistente');
end;
$$;

comment on function citi_resolve_academic_course(text, text) is
  'Resolve campus+curso do catálogo da UFPE, aceitando forms_label completo OU o rótulo curto "Nome — Grau" dentro do campus resolvido. outcome: ok | campus_desconhecido | curso_inexistente | campus_incompativel | curso_ambiguo.';

revoke execute on function citi_resolve_academic_course(text, text) from public, anon;
grant execute on function citi_resolve_academic_course(text, text) to authenticated, service_role;
