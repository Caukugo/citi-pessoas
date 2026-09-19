import type { OrgArea, OrgCatalog, OrgPosition, OrgSubarea } from '../types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Catálogo organizacional do modo mock.
 *
 * Espelha `supabase/migrations/0003_estrutura_organizacional.sql`. Existe para
 * a tela de importação funcionar sem banco, sem conta e sem internet — que é o
 * ponto do modo mock.
 *
 * ⚠️ MEXEU NA 0003? Mexa aqui também. Se os dois divergirem, uma planilha que
 * passa no mock falha no Supabase, e a pessoa vai procurar o bug na tela.
 *
 * Os ids seguem o formato uuid só para ficarem parecidos com os reais; eles não
 * correspondem aos do banco e não devem ser usados para nada além do mock.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const AREA_IDS = {
  gg: '0a000001-0000-4000-8000-000000000001',
  negocios: '0a000002-0000-4000-8000-000000000002',
  institucional: '0a000003-0000-4000-8000-000000000003',
  solucoes: '0a000004-0000-4000-8000-000000000004',
} as const;

const SUBAREA_IDS = {
  gg: '0b000001-0000-4000-8000-000000000001',
  comercial: '0b000002-0000-4000-8000-000000000002',
  marketing: '0b000003-0000-4000-8000-000000000003',
  institucional: '0b000004-0000-4000-8000-000000000004',
  inovacao: '0b000005-0000-4000-8000-000000000005',
  produto: '0b000006-0000-4000-8000-000000000006',
  dados: '0b000007-0000-4000-8000-000000000007',
  desenvolvimento: '0b000008-0000-4000-8000-000000000008',
} as const;

export const MOCK_AREAS: OrgArea[] = [
  { id: AREA_IDS.gg, name: 'Gente e Gestão', slug: 'gente-e-gestao', sortOrder: 1, isActive: true },
  { id: AREA_IDS.negocios, name: 'Negócios', slug: 'negocios', sortOrder: 2, isActive: true },
  {
    id: AREA_IDS.institucional,
    name: 'Institucional',
    slug: 'institucional',
    sortOrder: 3,
    isActive: true,
  },
  { id: AREA_IDS.solucoes, name: 'Soluções', slug: 'solucoes', sortOrder: 4, isActive: true },
];

export const MOCK_SUBAREAS: OrgSubarea[] = [
  {
    id: SUBAREA_IDS.gg,
    areaId: AREA_IDS.gg,
    name: 'Gente e Gestão',
    slug: 'gg-gente-e-gestao',
    sortOrder: 1,
    isActive: true,
  },
  {
    id: SUBAREA_IDS.comercial,
    areaId: AREA_IDS.negocios,
    name: 'Comercial',
    slug: 'negocios-comercial',
    sortOrder: 1,
    isActive: true,
  },
  {
    id: SUBAREA_IDS.marketing,
    areaId: AREA_IDS.negocios,
    name: 'Marketing',
    slug: 'negocios-marketing',
    sortOrder: 2,
    isActive: true,
  },
  {
    id: SUBAREA_IDS.institucional,
    areaId: AREA_IDS.institucional,
    name: 'Institucional',
    slug: 'institucional-institucional',
    sortOrder: 1,
    isActive: true,
  },
  {
    id: SUBAREA_IDS.inovacao,
    areaId: AREA_IDS.institucional,
    name: 'Inovação',
    slug: 'institucional-inovacao',
    sortOrder: 2,
    isActive: true,
  },
  {
    id: SUBAREA_IDS.produto,
    areaId: AREA_IDS.solucoes,
    name: 'Produto',
    slug: 'solucoes-produto',
    sortOrder: 1,
    isActive: true,
  },
  {
    id: SUBAREA_IDS.dados,
    areaId: AREA_IDS.solucoes,
    name: 'Dados',
    slug: 'solucoes-dados',
    sortOrder: 2,
    isActive: true,
  },
  {
    id: SUBAREA_IDS.desenvolvimento,
    areaId: AREA_IDS.solucoes,
    name: 'Desenvolvimento',
    slug: 'solucoes-desenvolvimento',
    sortOrder: 3,
    isActive: true,
  },
];

/**
 * `subareaId: null` = cargo que vale para a ÁREA inteira. É o caso das
 * diretorias de Negócios e de Soluções, que atuam sobre mais de uma subárea.
 */
function position(
  index: number,
  areaId: string,
  subareaId: string | null,
  name: string,
  level: number,
  isDirectorship = false,
  extras: { abbreviation?: string; aliases?: string[] } = {},
): OrgPosition {
  return {
    id: `0c${String(index).padStart(6, '0')}-0000-4000-8000-${String(index).padStart(12, '0')}`,
    areaId,
    subareaId,
    name,
    abbreviation: extras.abbreviation ?? null,
    // Apelidos do MESMO cargo. Espelha `position_aliases` (migration 0017).
    aliases: extras.aliases ?? [],
    level,
    isDirectorship,
    // A regra de continuação fica GRAVADA no cargo, nunca deduzida do nome.
    continuationMonths: isDirectorship ? 12 : 6,
    isActive: true,
  };
}

export const MOCK_POSITIONS: OrgPosition[] = [
  // Gente e Gestão — a cadeira de COO cobre a ÁREA inteira (migration 0018).
  position(1, AREA_IDS.gg, null, 'Diretor(a) de Operações', 1, true, {
    abbreviation: 'COO',
    aliases: [
      'COO',
      'Diretor de Operações',
      'Diretora de Operações',
      'Diretoria de Operações',
      'Diretor de Gente e Gestão',
      'Diretora de Gente e Gestão',
      'Diretoria de Gente e Gestão',
      'Diretor(a) de Operações',
    ],
  }),
  position(2, AREA_IDS.gg, SUBAREA_IDS.gg, 'Gerente de Gente e Gestão', 2),
  position(3, AREA_IDS.gg, SUBAREA_IDS.gg, 'Especialista em Gente e Gestão', 3),
  position(4, AREA_IDS.gg, SUBAREA_IDS.gg, 'Analista de Gente e Gestão', 4),

  // Negócios — o CRO cobre Comercial E Marketing.
  position(5, AREA_IDS.negocios, null, 'Diretor(a) de Negócios', 1, true, {
    abbreviation: 'CRO',
    aliases: [
      'CRO',
      'Diretor de Negócios',
      'Diretora de Negócios',
      'Diretoria de Negócios',
      'Diretor(a) de Negócios',
    ],
  }),
  position(6, AREA_IDS.negocios, SUBAREA_IDS.comercial, 'Gerente de Comercial', 2),
  position(7, AREA_IDS.negocios, SUBAREA_IDS.comercial, 'Gerente de Contas-Chave', 3),
  position(8, AREA_IDS.negocios, SUBAREA_IDS.comercial, 'Gerente de Contas', 4),
  position(9, AREA_IDS.negocios, SUBAREA_IDS.marketing, 'Gerente de Marketing', 2),
  position(10, AREA_IDS.negocios, SUBAREA_IDS.marketing, 'Especialista de Marketing', 3),
  position(11, AREA_IDS.negocios, SUBAREA_IDS.marketing, 'Analista de Marketing', 4),

  // Institucional — a cadeira de CEO é UMA só. "Presidência" e "Diretoria
  // Institucional" eram dois cargos para a mesma pessoa até a migration 0017;
  // hoje são apelidos, e o cargo cobre a ÁREA inteira.
  position(13, AREA_IDS.institucional, null, 'Diretor(a) Institucional', 1, true, {
    abbreviation: 'CEO',
    aliases: [
      'Presidência',
      'CEO',
      'Diretor Institucional',
      'Diretora Institucional',
      'Diretoria Institucional',
      'Diretor(a) Institucional',
    ],
  }),
  position(14, AREA_IDS.institucional, SUBAREA_IDS.institucional, 'Gerente Institucional', 3),
  position(15, AREA_IDS.institucional, SUBAREA_IDS.institucional, 'Relationship Manager', 4),
  position(16, AREA_IDS.institucional, SUBAREA_IDS.inovacao, 'Head de Inovação', 1),
  position(17, AREA_IDS.institucional, SUBAREA_IDS.inovacao, 'Agente de Inovação', 2),

  // Soluções — o CTO cobre Produto, Dados E Desenvolvimento.
  position(18, AREA_IDS.solucoes, null, 'Diretor(a) de Soluções', 1, true, {
    abbreviation: 'CTO',
    aliases: [
      'CTO',
      'Diretor de Soluções',
      'Diretora de Soluções',
      'Diretoria de Soluções',
      'Diretor(a) de Soluções',
    ],
  }),
  // Customer Success atende a área inteira, no MESMO nível dos Líderes — mas
  // não é diretoria: 6 meses de continuação, como qualquer cargo não diretivo.
  // Hoje não lidera ninguém; isso é um fato do momento, não uma regra do cargo.
  position(31, AREA_IDS.solucoes, null, 'Customer Success', 2),
  position(19, AREA_IDS.solucoes, SUBAREA_IDS.produto, 'Líder de Produto', 2),
  position(20, AREA_IDS.solucoes, SUBAREA_IDS.produto, 'Gerente de Produto', 3),
  position(21, AREA_IDS.solucoes, SUBAREA_IDS.produto, 'Especialista em Produto', 4),
  position(22, AREA_IDS.solucoes, SUBAREA_IDS.produto, 'Analista de Produto', 5),
  position(23, AREA_IDS.solucoes, SUBAREA_IDS.dados, 'Líder de Dados', 2),
  position(24, AREA_IDS.solucoes, SUBAREA_IDS.dados, 'Gerente de Dados', 3),
  position(25, AREA_IDS.solucoes, SUBAREA_IDS.dados, 'Especialista em Dados', 4),
  position(26, AREA_IDS.solucoes, SUBAREA_IDS.dados, 'Analista de Dados', 5),
  position(27, AREA_IDS.solucoes, SUBAREA_IDS.desenvolvimento, 'Líder de Desenvolvimento', 2),
  position(28, AREA_IDS.solucoes, SUBAREA_IDS.desenvolvimento, 'Gerente de Software', 3),
  position(29, AREA_IDS.solucoes, SUBAREA_IDS.desenvolvimento, 'Analista de Software', 4),
  position(30, AREA_IDS.solucoes, SUBAREA_IDS.desenvolvimento, 'Pessoa Desenvolvedora', 5),
];

/** Cargo inicial de cada subárea — usado só nas entradas futuras pelo Forms. */
const ENTRY_POSITION_BY_SUBAREA: Record<string, string> = {
  [SUBAREA_IDS.gg]: 'Analista de Gente e Gestão',
  [SUBAREA_IDS.comercial]: 'Gerente de Contas',
  [SUBAREA_IDS.marketing]: 'Analista de Marketing',
  [SUBAREA_IDS.institucional]: 'Relationship Manager',
  [SUBAREA_IDS.inovacao]: 'Agente de Inovação',
  [SUBAREA_IDS.produto]: 'Analista de Produto',
  [SUBAREA_IDS.dados]: 'Analista de Dados',
  [SUBAREA_IDS.desenvolvimento]: 'Pessoa Desenvolvedora',
};

export const MOCK_ORG_CATALOG: OrgCatalog = {
  areas: MOCK_AREAS,
  subareas: MOCK_SUBAREAS.map((subarea) => ({
    ...subarea,
    entryPositionId:
      MOCK_POSITIONS.find(
        (p) => p.areaId === subarea.areaId && p.name === ENTRY_POSITION_BY_SUBAREA[subarea.id],
      )?.id ?? null,
  })),
  positions: MOCK_POSITIONS,
};
