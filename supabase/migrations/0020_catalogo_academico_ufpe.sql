-- ─────────────────────────────────────────────────────────────────────────────
-- 0020 — Catálogo acadêmico da UFPE (campus, unidade acadêmica, curso)
--
-- POR QUÊ: a integração do Google Forms vai receber "campus" e "curso" como
-- texto escrito por gente, e precisa validar essa combinação ANTES de criar um
-- membro — uma resposta "Vitória de Santo Antão" + "Ciência da Computação"
-- (curso que só existe no Recife) não pode virar cadastro incompleto em
-- silêncio. Este catálogo é a fonte de verdade dessa validação.
--
-- ESCOPO: só os TRÊS campi atuais da UFPE — Recife, Caruaru (Campus do
-- Agreste) e Vitória de Santo Antão. Não modela Campus Sertão nem Campus
-- Centro (não são campi de graduação presencial regular hoje e estão fora do
-- pedido).
--
-- FONTE: só páginas oficiais da UFPE, lidas por raspagem direta do HTML (não
-- por resumo de IA — uma primeira tentativa via resumo automático veio
-- incompleta e com cursos de campi diferentes misturados):
--   • https://www.ufpe.br/cursos/graduacao/campus-recife    (87 cursos)
--   • https://www.ufpe.br/cursos/graduacao/campus-caruaru   (13 cursos)
--   • https://www.ufpe.br/cursos/graduacao/campus-vitoria   (6 cursos)
--   • https://www.ufpe.br/campi  (nome oficial de cada campus e de cada
--     unidade acadêmica — sigla × nome por extenso)
--
-- "UNIDADE ACADÊMICA", NÃO "DEPARTAMENTO": CIn, CAC, CTG, CAA e CAV são
-- Centros/Unidades Acadêmicas na estrutura oficial da UFPE — não departamentos
-- (um Centro tem vários departamentos dentro dele). O modelo usa o termo
-- correto de propósito.
--
-- CHAVE DE RESOLUÇÃO: um curso pode existir em mais de um campus (ex.:
-- Medicina em Recife E em Caruaru, com corpo docente e unidade diferentes) —
-- por isso a chave é SEMPRE (campus, curso), nunca curso sozinho.
--
-- ANOMALIA DE FONTE DOCUMENTADA: a página do Recife rotula um link como
-- "Ciências Biológicas /Ciênciais Ambientais" (erro de digitação do próprio
-- site da UFPE — "Ciênciais" não existe). O `href` desse link
-- (/ciencias-ambientais) e o título do menu lateral da mesma página
-- ("Curso de Ciências Ambientais - Bacharelado (CB)") confirmam que é o curso
-- "Ciências Ambientais", separado de "Ciências Biológicas". Gravado como
-- "Ciências Ambientais" — a correção do rótulo mal formatado da fonte, não uma
-- invenção de curso.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Campi ──────────────────────────────────────────────────────────────────

create table academic_campuses (
  id           uuid primary key default gen_random_uuid(),
  -- Nome usado no Forms e nas telas: "Recife", "Caruaru", "Vitória de Santo Antão".
  name         text not null unique,
  -- Nome oficial completo, como a UFPE registra em ufpe.br/campi. Caruaru é
  -- "identificado internamente como Campus do Agreste" — é este o campo que
  -- guarda essa designação institucional.
  official_name text not null,
  slug         text not null unique,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger academic_campuses_updated_at
  before update on academic_campuses for each row execute function set_updated_at();

insert into academic_campuses (name, official_name, slug) values
  ('Recife',                    'Campus Joaquim Amazonas, no Recife',        'recife'),
  ('Caruaru',                   'Campus Acadêmico do Agreste, em Caruaru',   'caruaru'),
  ('Vitória de Santo Antão',    'Campus Acadêmico da Vitória, em Vitória de Santo Antão', 'vitoria-de-santo-antao');

-- ─── Unidades acadêmicas ────────────────────────────────────────────────────

create table academic_units (
  id         uuid primary key default gen_random_uuid(),
  sigla      text not null unique,
  name       text not null unique,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger academic_units_updated_at
  before update on academic_units for each row execute function set_updated_at();

insert into academic_units (sigla, name) values
  ('CAC',  'Centro de Artes e Comunicação'),
  ('CB',   'Centro de Biociências'),
  ('CCEN', 'Centro de Ciências Exatas e da Natureza'),
  ('CCJ',  'Centro de Ciências Jurídicas'),
  ('CCM',  'Centro de Ciências Médicas'),
  ('CCS',  'Centro de Ciências da Saúde'),
  ('CCSA', 'Centro de Ciências Sociais Aplicadas'),
  ('CE',   'Centro de Educação'),
  ('CFCH', 'Centro de Filosofia e Ciências Humanas'),
  ('CIN',  'Centro de Informática'),
  ('CTG',  'Centro de Tecnologia e Geociências'),
  ('CAA',  'Centro Acadêmico do Agreste'),
  ('CAV',  'Centro Acadêmico de Vitória');

-- ─── Cursos ──────────────────────────────────────────────────────────────────

create table academic_courses (
  id                uuid primary key default gen_random_uuid(),
  campus_id         uuid not null references academic_campuses (id) on delete restrict,
  academic_unit_id  uuid not null references academic_units (id) on delete restrict,

  -- Nome do curso, sem grau/modalidade: "Educação Física", não
  -- "Educação Física - Bacharelado". O grau é a coluna ao lado.
  name              text not null,
  -- Grau/modalidade — só existe como coluna separada porque alguns cursos têm
  -- mais de uma opção no MESMO campus (Bacharelado e Licenciatura).
  degree            text not null
    check (degree in ('Bacharelado', 'Licenciatura', 'Bacharelado Interdisciplinar', 'Licenciatura Intercultural')),

  -- Rótulo pronto para aparecer como opção no Google Forms. Já vem com o
  -- campus explícito quando o mesmo nome de curso existe em mais de um campus
  -- — é o que evita a pessoa escolher errado sem perceber.
  forms_label       text not null,

  -- Nome comparável (minúsculas, sem acento, espaços colapsados), gerado pela
  -- MESMA função que o resto do catálogo usa para resolver rótulo → registro
  -- (`citi_normalize_label`, da 0017). É a chave que a resolução usa.
  normalized_name   text generated always as (citi_normalize_label(name)) stored,

  is_active         boolean not null default true,
  -- Página oficial de onde este curso foi extraído — para auditoria futura,
  -- se a oferta da UFPE mudar.
  source_url        text not null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- A chave de resolução real é (campus, curso); `degree` desempata quando o
  -- mesmo curso tem mais de um grau no mesmo campus.
  unique (campus_id, name, degree)
);

create index academic_courses_campus_idx on academic_courses (campus_id);
create index academic_courses_unit_idx   on academic_courses (academic_unit_id);
create index academic_courses_norm_idx   on academic_courses (normalized_name);

create trigger academic_courses_updated_at
  before update on academic_courses for each row execute function set_updated_at();

insert into academic_courses (campus_id, academic_unit_id, name, degree, forms_label, source_url)
select c.id, u.id, d.name, d.degree, d.forms_label, d.source_url
  from (values
  ('caruaru', 'CAA', 'Administração', 'Bacharelado', 'Administração — Bacharelado (Caruaru)', 'https://www.ufpe.br/administracao-bacharelado-caa'),
  ('caruaru', 'CAA', 'Bacharelado Interdisciplinar em Ciência e Tecnologia', 'Bacharelado Interdisciplinar', 'Bacharelado Interdisciplinar em Ciência e Tecnologia', 'https://www.ufpe.br/caa/nicen/ciencia-tecnologia'),
  ('caruaru', 'CAA', 'Ciências Econômicas', 'Bacharelado', 'Ciências Econômicas — Bacharelado (Caruaru)', 'https://www.ufpe.br/ciencias-economicas-bacharelado-caa'),
  ('caruaru', 'CAA', 'Comunicação Social', 'Bacharelado', 'Comunicação Social — Bacharelado', 'https://www.ufpe.br/comunicacao-social-bacharelado-caa'),
  ('caruaru', 'CAA', 'Design', 'Bacharelado', 'Design — Bacharelado (Caruaru)', 'https://www.ufpe.br/design-bacharelado-caa'),
  ('caruaru', 'CAA', 'Engenharia Civil', 'Bacharelado', 'Engenharia Civil — Bacharelado (Caruaru)', 'https://www.ufpe.br/engenharia-civil-bacharelado-caa'),
  ('caruaru', 'CAA', 'Engenharia de Produção', 'Bacharelado', 'Engenharia de Produção — Bacharelado (Caruaru)', 'https://www.ufpe.br/engenharia-de-producao-bacharelado-caa'),
  ('caruaru', 'CAA', 'Física', 'Licenciatura', 'Física — Licenciatura (Caruaru)', 'https://www.ufpe.br/fisica-licenciatura-caa'),
  ('caruaru', 'CAA', 'Intercultural Indígena', 'Licenciatura Intercultural', 'Intercultural Indígena — Licenciatura Intercultural', 'https://www.ufpe.br/interculturalindigenacaa'),
  ('caruaru', 'CAA', 'Matemática', 'Licenciatura', 'Matemática — Licenciatura (Caruaru)', 'https://www.ufpe.br/matematica-licenciatura-caa'),
  ('caruaru', 'CAA', 'Medicina', 'Bacharelado', 'Medicina — Bacharelado (Caruaru)', 'https://www.ufpe.br/medicina-bacharelado-caa'),
  ('caruaru', 'CAA', 'Pedagogia', 'Licenciatura', 'Pedagogia — Licenciatura (Caruaru)', 'https://www.ufpe.br/pedagogia-licenciatura-caa'),
  ('caruaru', 'CAA', 'Química', 'Licenciatura', 'Química — Licenciatura (Caruaru)', 'https://www.ufpe.br/quimica-licenciatura-caa'),
  ('recife', 'CCSA', 'Administração', 'Bacharelado', 'Administração — Bacharelado (Recife)', 'https://www.ufpe.br/administracao-bacharelado-ccsa'),
  ('recife', 'CFCH', 'Arqueologia', 'Bacharelado', 'Arqueologia — Bacharelado', 'https://www.ufpe.br/arqueologia-bacharelado-cfch'),
  ('recife', 'CAC', 'Arquitetura e Urbanismo', 'Bacharelado', 'Arquitetura e Urbanismo — Bacharelado', 'https://www.ufpe.br/arquitetura-e-urbanismo-bacharelado-cac'),
  ('recife', 'CAC', 'Artes Visuais', 'Bacharelado', 'Artes Visuais — Bacharelado', 'https://www.ufpe.br/artes-visuais-bacharelado-cac'),
  ('recife', 'CAC', 'Artes Visuais', 'Licenciatura', 'Artes Visuais — Licenciatura', 'https://www.ufpe.br/artes-visuais-licenciatura-cac'),
  ('recife', 'CAC', 'Biblioteconomia', 'Bacharelado', 'Biblioteconomia — Bacharelado', 'https://www.ufpe.br/biblioteconomia-bacharelado-cac'),
  ('recife', 'CB', 'Biomedicina', 'Bacharelado', 'Biomedicina — Bacharelado', 'https://www.ufpe.br/biomedicina-bacharelado-cb'),
  ('recife', 'CIN', 'Ciência da Computação', 'Bacharelado', 'Ciência da Computação — Bacharelado', 'https://www.ufpe.br/ciencia-da-computacao-bacharelado-cin'),
  ('recife', 'CFCH', 'Ciência Política', 'Bacharelado', 'Ciência Política — Bacharelado', 'https://www.ufpe.br/ciencia-politica-bacharelado-cfch'),
  ('recife', 'CB', 'Ciências Ambientais', 'Bacharelado', 'Ciências Ambientais — Bacharelado', 'https://www.ufpe.br/ciencias-ambientais'),
  ('recife', 'CCSA', 'Ciências Atuariais', 'Bacharelado', 'Ciências Atuariais — Bacharelado', 'https://www.ufpe.br/ciencias-atuariais-bacharelado-ccsa'),
  ('recife', 'CB', 'Ciências Biológicas', 'Bacharelado', 'Ciências Biológicas — Bacharelado (Recife)', 'https://www.ufpe.br/ciencias-biologicas'),
  ('recife', 'CB', 'Ciências Biológicas', 'Licenciatura', 'Ciências Biológicas — Licenciatura (Recife)', 'https://www.ufpe.br/ciencias-biologicas-licenciatura-cb'),
  ('recife', 'CCSA', 'Ciências Contábeis', 'Bacharelado', 'Ciências Contábeis — Bacharelado', 'https://www.ufpe.br/ciencias-contabeis-bacharelado-ccsa'),
  ('recife', 'CCSA', 'Ciências Econômicas', 'Bacharelado', 'Ciências Econômicas — Bacharelado (Recife)', 'https://www.ufpe.br/ciencias-economicas-bacharelado-ccsa'),
  ('recife', 'CFCH', 'Ciências Sociais', 'Bacharelado', 'Ciências Sociais — Bacharelado', 'https://www.ufpe.br/ciencias-sociais-bacharelado-cfch'),
  ('recife', 'CFCH', 'Ciências Sociais', 'Licenciatura', 'Ciências Sociais — Licenciatura', 'https://www.ufpe.br/ciencias-sociais-licenciatura-cfch'),
  ('recife', 'CAC', 'Cinema e Audiovisual', 'Bacharelado', 'Cinema e Audiovisual — Bacharelado', 'https://www.ufpe.br/cinema-bacharelado-cac'),
  ('recife', 'CAC', 'Dança', 'Licenciatura', 'Dança — Licenciatura', 'https://www.ufpe.br/danca-licenciatura-cac'),
  ('recife', 'CAC', 'Design', 'Bacharelado', 'Design — Bacharelado (Recife)', 'https://www.ufpe.br/design-bacharelado-cac'),
  ('recife', 'CCJ', 'Direito', 'Bacharelado', 'Direito — Bacharelado', 'https://www.ufpe.br/direito-bacharelado-ccj'),
  ('recife', 'CCS', 'Educação Física', 'Bacharelado', 'Educação Física — Bacharelado (Recife)', 'https://www.ufpe.br/educacao-fisica-bacharelado-ccs'),
  ('recife', 'CCS', 'Educação Física', 'Licenciatura', 'Educação Física — Licenciatura (Recife)', 'https://www.ufpe.br/educacao-fisica-licenciatura-ccs'),
  ('recife', 'CCS', 'Enfermagem', 'Bacharelado', 'Enfermagem — Bacharelado (Recife)', 'https://www.ufpe.br/enfermagem-bacharelado-ccs'),
  ('recife', 'CTG', 'Engenharia Biomédica', 'Bacharelado', 'Engenharia Biomédica — Bacharelado', 'https://www.ufpe.br/engenharia-biomedica-bacharelado-ctg'),
  ('recife', 'CTG', 'Engenharia Cartográfica e de Agrimensura', 'Bacharelado', 'Engenharia Cartográfica e de Agrimensura — Bacharelado', 'https://www.ufpe.br/engenharia-cartografica-bacharelado-ctg'),
  ('recife', 'CTG', 'Engenharia Civil', 'Bacharelado', 'Engenharia Civil — Bacharelado (Recife)', 'https://www.ufpe.br/engenharia-civil-bacharelado-ctg'),
  ('recife', 'CIN', 'Engenharia da Computação', 'Bacharelado', 'Engenharia da Computação — Bacharelado', 'https://www.ufpe.br/engenharia-da-computacao-bacharelado-cin'),
  ('recife', 'CTG', 'Engenharia de Alimentos', 'Bacharelado', 'Engenharia de Alimentos — Bacharelado', 'https://www.ufpe.br/engenharia-de-alimentos-bacharelado-ctg'),
  ('recife', 'CTG', 'Engenharia de Controle e Automação', 'Bacharelado', 'Engenharia de Controle e Automação — Bacharelado', 'https://www.ufpe.br/engenharia-de-controle-e-automacao-bacharelado-ctg'),
  ('recife', 'CTG', 'Engenharia de Energia', 'Bacharelado', 'Engenharia de Energia — Bacharelado', 'https://www.ufpe.br/engenharia-de-energia-bacharelado-ctg'),
  ('recife', 'CTG', 'Engenharia de Materiais', 'Bacharelado', 'Engenharia de Materiais — Bacharelado', 'https://www.ufpe.br/engenharia-de-materiais-bacharelado-ctg'),
  ('recife', 'CTG', 'Engenharia de Minas', 'Bacharelado', 'Engenharia de Minas — Bacharelado', 'https://www.ufpe.br/minas'),
  ('recife', 'CTG', 'Engenharia de Produção', 'Bacharelado', 'Engenharia de Produção — Bacharelado (Recife)', 'https://www.ufpe.br/ep'),
  ('recife', 'CTG', 'Engenharia de Telecomunicações', 'Bacharelado', 'Engenharia de Telecomunicações — Bacharelado', 'https://www.ufpe.br/engenharia-telecomunicacoes-bacharelado-ctg'),
  ('recife', 'CTG', 'Engenharia Elétrica', 'Bacharelado', 'Engenharia Elétrica — Bacharelado', 'https://www.ufpe.br/engenharia-eletrica-bacharelado-ctg'),
  ('recife', 'CTG', 'Engenharia Eletrônica', 'Bacharelado', 'Engenharia Eletrônica — Bacharelado', 'https://www.ufpe.br/engenharia-eletronica-bacharelado-ctg'),
  ('recife', 'CTG', 'Engenharia Mecânica', 'Bacharelado', 'Engenharia Mecânica — Bacharelado', 'https://www.ufpe.br/engenharia-mecanica-bacharelado-ctg'),
  ('recife', 'CTG', 'Engenharia Naval', 'Bacharelado', 'Engenharia Naval — Bacharelado', 'https://www.ufpe.br/engenharia-naval-bacharelado-ctg'),
  ('recife', 'CTG', 'Engenharia Química', 'Bacharelado', 'Engenharia Química — Bacharelado', 'https://www.ufpe.br/engenharia-quimica-bacharelado-ctg'),
  ('recife', 'CCEN', 'Estatística', 'Bacharelado', 'Estatística — Bacharelado', 'https://www.ufpe.br/estatistica-bacharelado-ccen'),
  ('recife', 'CAC', 'Estudos de Mídia', 'Bacharelado', 'Estudos de Mídia — Bacharelado', 'https://www.ufpe.br/estudos-de-midia-bacharelado-cac'),
  ('recife', 'CAC', 'Expressão Gráfica', 'Licenciatura', 'Expressão Gráfica — Licenciatura', 'https://www.ufpe.br/expressao-grafica-licenciatura-cac'),
  ('recife', 'CCS', 'Farmácia', 'Bacharelado', 'Farmácia — Bacharelado', 'https://www.ufpe.br/farmacia-bacharelado-ccs'),
  ('recife', 'CFCH', 'Filosofia', 'Bacharelado', 'Filosofia — Bacharelado', 'https://www.ufpe.br/filosofia-bacharelado-cfch'),
  ('recife', 'CFCH', 'Filosofia', 'Licenciatura', 'Filosofia — Licenciatura', 'https://www.ufpe.br/filosofia-licenciatura-cfch'),
  ('recife', 'CCEN', 'Física', 'Bacharelado', 'Física — Bacharelado (Recife)', 'https://www.ufpe.br/fisica-bacharelado-ccen'),
  ('recife', 'CCEN', 'Física', 'Licenciatura', 'Física — Licenciatura (Recife)', 'https://www.ufpe.br/fisica-licenciatura-ccen'),
  ('recife', 'CCS', 'Fisioterapia', 'Bacharelado', 'Fisioterapia — Bacharelado', 'https://www.ufpe.br/fisioterapia-bacharelado-ccs'),
  ('recife', 'CCS', 'Fonoaudiologia', 'Bacharelado', 'Fonoaudiologia — Bacharelado', 'https://www.ufpe.br/fonoaudiologia-bacharelado-ccs'),
  ('recife', 'CFCH', 'Geografia', 'Bacharelado', 'Geografia — Bacharelado', 'https://www.ufpe.br/geografia-bacharelado-cfch'),
  ('recife', 'CFCH', 'Geografia', 'Licenciatura', 'Geografia — Licenciatura', 'https://www.ufpe.br/geografia-licenciatura-cfch'),
  ('recife', 'CTG', 'Geologia', 'Bacharelado', 'Geologia — Bacharelado', 'https://www.ufpe.br/geologia-bacharelado-ctg'),
  ('recife', 'CAC', 'Gestão da Informação', 'Bacharelado', 'Gestão da Informação — Bacharelado', 'https://www.ufpe.br/gestao-da-informacao-bacharelado-cac'),
  ('recife', 'CFCH', 'História', 'Bacharelado', 'História — Bacharelado', 'https://www.ufpe.br/historia-bacharelado-cfch'),
  ('recife', 'CFCH', 'História', 'Licenciatura', 'História — Licenciatura', 'https://www.ufpe.br/historia-licenciatura-cfch'),
  ('recife', 'CCSA', 'Hotelaria', 'Bacharelado', 'Hotelaria — Bacharelado', 'https://www.ufpe.br/hotelaria-bacharelado-ccsa'),
  ('recife', 'CAC', 'Jornalismo', 'Bacharelado', 'Jornalismo — Bacharelado', 'https://www.ufpe.br/jornalismo-bacharelado-cac'),
  ('recife', 'CAC', 'Letras', 'Bacharelado', 'Letras — Bacharelado', 'https://www.ufpe.br/letras-bacharelado-cac'),
  ('recife', 'CAC', 'Letras Espanhol', 'Licenciatura', 'Letras Espanhol — Licenciatura', 'https://www.ufpe.br/letras-espanhol-licenciatura-cac'),
  ('recife', 'CAC', 'Letras Francês', 'Licenciatura', 'Letras Francês — Licenciatura', 'https://www.ufpe.br/letras-frances-licenciatura-cac'),
  ('recife', 'CAC', 'Letras Inglês', 'Licenciatura', 'Letras Inglês — Licenciatura', 'https://www.ufpe.br/letras-ingles-licenciatura-cac'),
  ('recife', 'CAC', 'Letras Libras', 'Licenciatura', 'Letras Libras — Licenciatura', 'https://www.ufpe.br/letras-libras-licenciatura-cac'),
  ('recife', 'CAC', 'Letras Português', 'Licenciatura', 'Letras Português — Licenciatura', 'https://www.ufpe.br/letras-portugues-licenciatura-cac'),
  ('recife', 'CCEN', 'Matemática', 'Bacharelado', 'Matemática — Bacharelado (Recife)', 'https://www.ufpe.br/dmat/graduacao/matematica-bacharelado-ccen'),
  ('recife', 'CCEN', 'Matemática', 'Licenciatura', 'Matemática — Licenciatura (Recife)', 'https://www.ufpe.br/dmat/graduacao/matematica-licenciatura-ccen'),
  ('recife', 'CCM', 'Medicina', 'Bacharelado', 'Medicina — Bacharelado (Recife)', 'https://www.ufpe.br/ccm/medicina-bacharelado'),
  ('recife', 'CFCH', 'Museologia', 'Bacharelado', 'Museologia — Bacharelado', 'https://www.ufpe.br/museologia-bacharelado-cfch'),
  ('recife', 'CAC', 'Música', 'Licenciatura', 'Música — Licenciatura', 'https://www.ufpe.br/musica-licenciatura-cac'),
  ('recife', 'CAC', 'Música Canto', 'Bacharelado', 'Música Canto — Bacharelado', 'https://www.ufpe.br/musica-canto-bacharelado-cac'),
  ('recife', 'CAC', 'Música Instrumento', 'Bacharelado', 'Música Instrumento — Bacharelado', 'https://www.ufpe.br/musica-instrumento-bacharelado-cac'),
  ('recife', 'CCS', 'Nutrição', 'Bacharelado', 'Nutrição — Bacharelado (Recife)', 'https://www.ufpe.br/nutricao-bacharelado-ccs'),
  ('recife', 'CTG', 'Oceanografia', 'Bacharelado', 'Oceanografia — Bacharelado', 'https://www.ufpe.br/oceanografia'),
  ('recife', 'CCS', 'Odontologia', 'Bacharelado', 'Odontologia — Bacharelado', 'https://www.ufpe.br/odontologia-bacharelado-ccs'),
  ('recife', 'CE', 'Pedagogia', 'Licenciatura', 'Pedagogia — Licenciatura (Recife)', 'https://www.ufpe.br/pedagogia-licenciatura-ce'),
  ('recife', 'CFCH', 'Psicologia', 'Bacharelado', 'Psicologia — Bacharelado', 'https://www.ufpe.br/psicologia-bacharelado-cfch'),
  ('recife', 'CAC', 'Publicidade e Propaganda', 'Bacharelado', 'Publicidade e Propaganda — Bacharelado', 'https://www.ufpe.br/publicidade-e-propaganda-bacharelado-cac'),
  ('recife', 'CCEN', 'Química', 'Bacharelado', 'Química — Bacharelado (Recife)', 'https://www.ufpe.br/quimica-bacharelado-ccen'),
  ('recife', 'CCEN', 'Química', 'Licenciatura', 'Química — Licenciatura (Recife)', 'https://www.ufpe.br/quimica-licenciatura-ccen'),
  ('recife', 'CTG', 'Química Industrial', 'Bacharelado', 'Química Industrial — Bacharelado', 'https://www.ufpe.br/quimica-industrial-bacharelado-ctg'),
  ('recife', 'CAC', 'Radio, TV e Internet', 'Bacharelado', 'Radio, TV e Internet — Bacharelado', 'https://www.ufpe.br/radio-tv-e-internet-bacharelado-cac'),
  ('recife', 'CCSA', 'Secretariado Executivo', 'Bacharelado', 'Secretariado Executivo — Bacharelado', 'https://www.ufpe.br/secretariado-bacharelado-ccsa'),
  ('recife', 'CCSA', 'Serviço Social', 'Bacharelado', 'Serviço Social — Bacharelado', 'https://www.ufpe.br/servico-social-bacharelado-ccsa'),
  ('recife', 'CIN', 'Sistemas de Informação', 'Bacharelado', 'Sistemas de Informação — Bacharelado', 'https://www.ufpe.br/sistemas-de-informacao-bacharelado-cin'),
  ('recife', 'CAC', 'Teatro', 'Licenciatura', 'Teatro — Licenciatura', 'https://www.ufpe.br/teatro-licenciatura-cac'),
  ('recife', 'CCS', 'Terapia Ocupacional', 'Bacharelado', 'Terapia Ocupacional — Bacharelado', 'https://www.ufpe.br/terapia-ocupacional-bacharelado-ccs'),
  ('recife', 'CCSA', 'Turismo', 'Bacharelado', 'Turismo — Bacharelado', 'https://www.ufpe.br/turismo-bacharelado-ccsa'),
  ('vitoria-de-santo-antao', 'CAV', 'Ciências Biológicas', 'Licenciatura', 'Ciências Biológicas — Licenciatura (Vitória de Santo Antão)', 'https://www.ufpe.br/ciencias-biologicas-licenciatura-cav'),
  ('vitoria-de-santo-antao', 'CAV', 'Educação Física', 'Bacharelado', 'Educação Física — Bacharelado (Vitória de Santo Antão)', 'https://www.ufpe.br/educacao-fisica-bacharelado-cav'),
  ('vitoria-de-santo-antao', 'CAV', 'Educação Física', 'Licenciatura', 'Educação Física — Licenciatura (Vitória de Santo Antão)', 'https://www.ufpe.br/educacao-fisica-licenciatura-cav'),
  ('vitoria-de-santo-antao', 'CAV', 'Enfermagem', 'Bacharelado', 'Enfermagem — Bacharelado (Vitória de Santo Antão)', 'https://www.ufpe.br/enfermagem-bacharelado-cav'),
  ('vitoria-de-santo-antao', 'CAV', 'Nutrição', 'Bacharelado', 'Nutrição — Bacharelado (Vitória de Santo Antão)', 'https://www.ufpe.br/nutricao-bacharelado-cav'),
  ('vitoria-de-santo-antao', 'CAV', 'Saúde Coletiva', 'Bacharelado', 'Saúde Coletiva — Bacharelado', 'https://www.ufpe.br/saude-coletiva-bacharelado-cav')
  ) as d (campus_slug, unit_sigla, name, degree, forms_label, source_url)
  join academic_campuses c on c.slug = d.campus_slug
  join academic_units    u on u.sigla = d.unit_sigla
on conflict (campus_id, name, degree) do nothing;

-- Conferência: todo curso da lista tem que ter entrado. Se um `campus_slug` ou
-- `unit_sigla` estiver escrito errado acima, o `join` descarta a linha em
-- silêncio — esta checagem transforma isso em erro de migration, não em curso
-- faltando descoberto meses depois.
do $$
declare
  v_esperado constant integer := 106;
  v_real     integer;
begin
  select count(*) into v_real from academic_courses;
  if v_real <> v_esperado then
    raise exception 'Catálogo acadêmico incompleto: esperado % cursos, encontrado %.', v_esperado, v_real;
  end if;
end $$;

-- ─── Resolver campus + curso ────────────────────────────────────────────────
--
-- A validação do Forms precisa distinguir três erros diferentes, porque a
-- mensagem certa (e a decisão de criar ou não o membro) depende de qual é:
--   • curso_inexistente     — este nome não existe em NENHUM campus do catálogo
--   • campus_incompativel   — o curso existe, mas não NESTE campus
--   • campus_desconhecido   — o campus em si não foi reconhecido
-- Nenhum dos três deixa passar: quem chama trata tudo que não for 'ok' como
-- falha estrutural (não cria membro incompleto).
--
-- O RÓTULO DO CURSO é comparado primeiro contra `forms_label` (o texto que a
-- opção do Forms deveria usar — já vem com o grau, e com o campus quando há
-- ambiguidade) e só depois contra `name` puro. Isso resolve os 14 cursos que
-- existem com Bacharelado E Licenciatura no mesmo campus sem exigir uma
-- pergunta de "grau" separada no formulário: quem monta o Forms com o rótulo
-- sugerido (`forms_label`) já desambigua sozinho; quem manda só o nome do
-- curso simples continua funcionando para os 92 cursos sem essa ambiguidade.

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
  v_campus academic_campuses%rowtype;
  v_course academic_courses%rowtype;
  v_unit   academic_units%rowtype;
  v_norm_course text := citi_normalize_label(p_course_label);
begin
  select * into v_campus
    from academic_campuses
   where is_active and citi_normalize_label(name) = citi_normalize_label(p_campus_label);

  if not found then
    return jsonb_build_object('outcome', 'campus_desconhecido');
  end if;

  if not exists (
    select 1 from academic_courses
     where is_active
       and (citi_normalize_label(forms_label) = v_norm_course or normalized_name = v_norm_course)
  ) then
    return jsonb_build_object('outcome', 'curso_inexistente');
  end if;

  select * into v_course
    from academic_courses
   where is_active
     and campus_id = v_campus.id
     and (citi_normalize_label(forms_label) = v_norm_course or normalized_name = v_norm_course)
   -- Rótulo com o grau explícito (forms_label) desempata antes do nome puro.
   order by (citi_normalize_label(forms_label) = v_norm_course) desc, degree
   limit 1;

  if not found then
    return jsonb_build_object('outcome', 'campus_incompativel');
  end if;

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
end;
$$;

comment on function citi_resolve_academic_course(text, text) is
  'Resolve campus+curso do catálogo da UFPE. outcome: ok | campus_desconhecido | curso_inexistente | campus_incompativel.';

revoke execute on function citi_resolve_academic_course(text, text) from public, anon;
grant execute on function citi_resolve_academic_course(text, text) to authenticated, service_role;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Mesmo padrão de `areas/subareas/positions` (0003): catálogo institucional,
-- não pessoal, mas a plataforma é interna — só GG lê e escreve. A Edge Function
-- lê com `service_role`, que ignora RLS.

alter table academic_campuses enable row level security;
alter table academic_units    enable row level security;
alter table academic_courses  enable row level security;

create policy "GG lê e escreve campi" on academic_campuses
  for all using (is_gg()) with check (is_gg());
create policy "GG lê e escreve unidades acadêmicas" on academic_units
  for all using (is_gg()) with check (is_gg());
create policy "GG lê e escreve cursos" on academic_courses
  for all using (is_gg()) with check (is_gg());
