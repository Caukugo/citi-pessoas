import { describe, expect, it } from 'vitest';
import { MOCK_ORG_CATALOG } from './mock/orgFixtures';
import { findPositionsByLabel, normalizeLabel, positionMatchesLabel } from './positionLabels';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * "Presidência" é APELIDO, não cargo.
 *
 * O que estes testes protegem é uma frase só: todos os nomes da cadeira de CEO
 * resolvem o MESMO `position_id`. Enquanto isso valer, a planilha de um
 * semestre e a do seguinte caem na mesma linha do catálogo, o seletor de cargo
 * mostra uma opção só, e o filtro por cargo devolve a resposta inteira.
 *
 * O espelho disto no banco é `citi_resolve_position()` (migration 0017),
 * testado em `supabase/tests/0007_cargo_canonico_institucional.sql`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Todos os nomes pelos quais a cadeira é conhecida, como a decisão listou. */
const APELIDOS = [
  'Presidência',
  'CEO',
  'Diretor Institucional',
  'Diretora Institucional',
  'Diretoria Institucional',
  'Diretor(a) Institucional',
];

const CANONICO = MOCK_ORG_CATALOG.positions.find((p) => p.name === 'Diretor(a) Institucional')!;

describe('cargo canônico do Institucional', () => {
  it('existe UM cargo para a cadeira, e ele é o canônico', () => {
    const daCadeira = MOCK_ORG_CATALOG.positions.filter((position) =>
      APELIDOS.some((apelido) => positionMatchesLabel(position, apelido)),
    );

    expect(daCadeira).toHaveLength(1);
    expect(daCadeira[0].id).toBe(CANONICO.id);
  });

  it('o canônico é exatamente o que a gestão decidiu', () => {
    expect(CANONICO.name).toBe('Diretor(a) Institucional');
    expect(CANONICO.abbreviation).toBe('CEO');
    // Escopo de ÁREA INTEIRA: a cadeira não mora em subárea nenhuma.
    expect(CANONICO.subareaId).toBeNull();
    expect(CANONICO.isDirectorship).toBe(true);
    expect(CANONICO.continuationMonths).toBe(12);
    expect(CANONICO.isActive).toBe(true);
  });

  it('todos os apelidos resolvem o MESMO position_id', () => {
    const ids = new Set(
      APELIDOS.map((apelido) => {
        const achados = findPositionsByLabel(MOCK_ORG_CATALOG.positions, apelido);
        expect(achados).toHaveLength(1);
        return achados[0].id;
      }),
    );

    expect(ids).toEqual(new Set([CANONICO.id]));
  });

  it('resolve mesmo escrito com caixa, acento e espaço diferentes', () => {
    // É assim que uma planilha chega: digitada por gente, três semestres
    // seguidos, por três pessoas.
    const variacoes = [
      'presidencia',
      'PRESIDÊNCIA',
      '  Diretoria   Institucional  ',
      'ceo',
      'diretor(a) institucional',
    ];

    for (const texto of variacoes) {
      const achados = findPositionsByLabel(MOCK_ORG_CATALOG.positions, texto);
      expect(achados.map((p) => p.id)).toEqual([CANONICO.id]);
    }
  });

  it('o catálogo não tem mais um cargo chamado Presidência', () => {
    // Apelido resolve; cargo separado, não existe mais.
    expect(MOCK_ORG_CATALOG.positions.some((p) => p.name === 'Presidência')).toBe(false);
    expect(MOCK_ORG_CATALOG.positions.some((p) => p.name === 'Diretoria Institucional')).toBe(false);
  });

  it('um apelido pertence a um cargo só', () => {
    const donos = new Map<string, string[]>();
    for (const position of MOCK_ORG_CATALOG.positions) {
      for (const alias of position.aliases) {
        const chave = normalizeLabel(alias);
        donos.set(chave, [...(donos.get(chave) ?? []), position.id]);
      }
    }

    const disputados = [...donos.entries()].filter(([, ids]) => new Set(ids).size > 1);
    expect(disputados).toEqual([]);
  });
});

describe('a regra não vaza para outros cargos', () => {
  it('nome de outro cargo continua resolvendo só ele', () => {
    const analista = findPositionsByLabel(MOCK_ORG_CATALOG.positions, 'Analista de Dados');

    expect(analista).toHaveLength(1);
    expect(analista[0].name).toBe('Analista de Dados');
  });

  it('texto que não é cargo nenhum não resolve nada', () => {
    expect(findPositionsByLabel(MOCK_ORG_CATALOG.positions, 'Estagiário de Bordo')).toEqual([]);
    expect(findPositionsByLabel(MOCK_ORG_CATALOG.positions, '   ')).toEqual([]);
  });

  it('o mesmo nome em áreas diferentes devolve os dois — quem decide é a área', () => {
    // "Diretoria de Negócios" e "Diretoria de Soluções" são cadeiras
    // diferentes: consolidar por nome parecido seria inventar equivalência.
    const negocios = findPositionsByLabel(MOCK_ORG_CATALOG.positions, 'Diretoria de Negócios');
    const solucoes = findPositionsByLabel(MOCK_ORG_CATALOG.positions, 'Diretoria de Soluções');

    expect(negocios).toHaveLength(1);
    expect(solucoes).toHaveLength(1);
    expect(negocios[0].id).not.toBe(solucoes[0].id);
  });
});

describe('normalizeLabel espelha o banco', () => {
  it('tira acento, caixa e espaço repetido', () => {
    expect(normalizeLabel('  PRESIDÊNCIA  ')).toBe('presidencia');
    expect(normalizeLabel('Diretoria   Institucional')).toBe('diretoria institucional');
    expect(normalizeLabel('Diretor(a) Institucional')).toBe('diretor(a) institucional');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('as quatro cadeiras da decisão organizacional', () => {
  /** Cada cadeira, com tudo o que a gestão definiu. */
  const CADEIRAS = [
    {
      nome: 'Diretor(a) de Operações',
      sigla: 'COO',
      area: 'Gente e Gestão',
      apelidos: [
        'COO',
        'Diretor de Operações',
        'Diretora de Operações',
        'Diretoria de Operações',
        'Diretor de Gente e Gestão',
        'Diretora de Gente e Gestão',
        'Diretoria de Gente e Gestão',
        'Diretor(a) de Operações',
      ],
    },
    {
      nome: 'Diretor(a) de Negócios',
      sigla: 'CRO',
      area: 'Negócios',
      apelidos: [
        'CRO',
        'Diretor de Negócios',
        'Diretora de Negócios',
        'Diretoria de Negócios',
        'Diretor(a) de Negócios',
      ],
    },
    {
      nome: 'Diretor(a) de Soluções',
      sigla: 'CTO',
      area: 'Soluções',
      apelidos: [
        'CTO',
        'Diretor de Soluções',
        'Diretora de Soluções',
        'Diretoria de Soluções',
        'Diretor(a) de Soluções',
      ],
    },
    {
      nome: 'Diretor(a) Institucional',
      sigla: 'CEO',
      area: 'Institucional',
      apelidos: ['CEO', 'Presidência', 'Diretoria Institucional'],
    },
  ];

  it.each(CADEIRAS)('$sigla: todos os apelidos resolvem o mesmo cargo', ({ nome, apelidos }) => {
    const ids = new Set(
      apelidos.map((apelido) => {
        const achados = findPositionsByLabel(MOCK_ORG_CATALOG.positions, apelido);
        expect(achados).toHaveLength(1);
        return achados[0].id;
      }),
    );

    const canonico = MOCK_ORG_CATALOG.positions.find((p) => p.name === nome)!;
    expect(ids).toEqual(new Set([canonico.id]));
  });

  it.each(CADEIRAS)('$sigla é diretoria de área inteira, com 12 meses', ({ nome, sigla, area }) => {
    const cargo = MOCK_ORG_CATALOG.positions.find((p) => p.name === nome)!;
    const areaDoCargo = MOCK_ORG_CATALOG.areas.find((a) => a.id === cargo.areaId)!;

    expect(cargo.abbreviation).toBe(sigla);
    expect(areaDoCargo.name).toBe(area);
    // Escopo de ÁREA INTEIRA: nenhuma das quatro mora em subárea.
    expect(cargo.subareaId).toBeNull();
    expect(cargo.isDirectorship).toBe(true);
    // 12 meses porque está GRAVADO no cargo — nunca deduzido do nome.
    expect(cargo.continuationMonths).toBe(12);
  });

  it('as quatro cadeiras são cargos DIFERENTES', () => {
    const ids = CADEIRAS.map(
      ({ nome }) => MOCK_ORG_CATALOG.positions.find((p) => p.name === nome)!.id,
    );

    expect(new Set(ids).size).toBe(4);
  });

  it('a sigla também resolve, e é única no catálogo', () => {
    for (const { sigla, nome } of CADEIRAS) {
      const achados = findPositionsByLabel(MOCK_ORG_CATALOG.positions, sigla);
      expect(achados.map((p) => p.name)).toEqual([nome]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Customer Success', () => {
  const CS = MOCK_ORG_CATALOG.positions.find((p) => p.name === 'Customer Success')!;
  const LIDERES = MOCK_ORG_CATALOG.positions.filter((p) => p.name.startsWith('Líder de '));

  it('atende a área de Soluções inteira, sem subárea', () => {
    const area = MOCK_ORG_CATALOG.areas.find((a) => a.id === CS.areaId)!;

    expect(area.name).toBe('Soluções');
    expect(CS.subareaId).toBeNull();
    expect(CS.isActive).toBe(true);
  });

  it('NÃO é diretoria: 6 meses de continuação', () => {
    // Área inteira e diretoria são coisas diferentes. Confundir as duas daria
    // 12 meses a quem a decisão deu 6.
    expect(CS.isDirectorship).toBe(false);
    expect(CS.continuationMonths).toBe(6);
  });

  it('fica no mesmo nível dos Líderes de Produto, Dados e Desenvolvimento', () => {
    expect(LIDERES.length).toBeGreaterThanOrEqual(3);
    for (const lider of LIDERES) {
      expect(CS.level).toBe(lider.level);
    }
  });

  it('não é cargo de entrada de subárea nenhuma — nem pelo Google Forms', () => {
    const entradas = MOCK_ORG_CATALOG.subareas.map((sub) => sub.entryPositionId);
    expect(entradas).not.toContain(CS.id);

    // A regra vale para TODO cargo de área inteira: ninguém chega à empresa
    // como CTO, nem como Customer Success.
    const areaInteira = new Set(
      MOCK_ORG_CATALOG.positions.filter((p) => !p.subareaId).map((p) => p.id),
    );
    for (const entrada of entradas) {
      if (entrada) expect(areaInteira.has(entrada)).toBe(false);
    }
  });

  it('resolve pelo nome, com e sem caixa', () => {
    for (const texto of ['Customer Success', 'customer success', '  CUSTOMER   SUCCESS ']) {
      expect(findPositionsByLabel(MOCK_ORG_CATALOG.positions, texto).map((p) => p.id)).toEqual([
        CS.id,
      ]);
    }
  });
});
