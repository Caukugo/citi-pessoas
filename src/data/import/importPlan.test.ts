import { describe, expect, it } from 'vitest';
import { MOCK_ORG_CATALOG } from '../mock/orgFixtures';
import type { Gestao } from '../types';
import {
  buildImportPlan,
  detectImageType,
  positionFitsSubarea,
  type ImportPhoto,
  type ImportPlanContext,
} from './importPlan';
import { parseMembersCsv } from './membersImport';

/**
 * Testes do PLANO de importação.
 *
 * Nenhum depende da data de hoje: `referenceDate` é sempre explícita. Um teste
 * de ciclo que passa hoje e falha em janeiro não testa regra nenhuma.
 */

const HOJE = '2026-09-17';

const GESTOES: Gestao[] = [
  { id: 'g-2025-1', name: '2025.1', startDate: '2025-01-01', endDate: '2025-06-30', status: 'finalizada' },
  { id: 'g-2025-2', name: '2025.2', startDate: '2025-07-01', endDate: '2025-12-31', status: 'finalizada' },
  { id: 'g-2026-1', name: '2026.1', startDate: '2026-01-01', endDate: '2026-06-30', status: 'finalizada' },
  { id: 'g-2026-2', name: '2026.2', startDate: '2026-07-01', endDate: '2026-12-31', status: 'ativa' },
];

const CABECALHO =
  'Área,Subárea,Cargo,Nome Completo,Email do CITi,Celular,Curso,' +
  'Departamento Acadêmico,Data de Nascimento,Gestão de Entrada,Foto Arquivo';

/** Um JPEG de mentira: só os bytes mágicos importam para a detecção. */
function jpegFake(name: string, size = 1024): ImportPhoto {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff], 0);
  return { name, path: name, bytes, contentType: detectImageType(bytes), size };
}

function contexto(overrides: Partial<ImportPlanContext> = {}): ImportPlanContext {
  return {
    catalog: MOCK_ORG_CATALOG,
    gestoes: GESTOES,
    existingEmails: {},
    photos: [],
    referenceDate: HOJE,
    ...overrides,
  };
}

function planFor(csv: string, overrides: Partial<ImportPlanContext> = {}) {
  return buildImportPlan(parseMembersCsv(csv), contexto(overrides));
}

/** Mensagens de erro (bloqueantes) de uma linha. */
function errosDa(row: { issues: { severity: string; message: string }[] }) {
  return row.issues.filter((i) => i.severity === 'error').map((i) => i.message);
}

function avisosDe(row: { issues: { severity: string; message: string }[] }) {
  return row.issues.filter((i) => i.severity === 'warning').map((i) => i.message);
}

// ═══════════════════════════════════════════════════════════════════════════
describe('CSV válido', () => {
  const CSV = `${CABECALHO}
Gente e Gestão,Gente e Gestão,Analista de Gente e Gestão,Ana Piloto Souza,ana.piloto@teste.invalid,81999990001,Ciência da Computação,CIn,05/03/2006,2026.2,ana.jpg
Soluções,Desenvolvimento,Pessoa Desenvolvedora,Bruno Piloto Lima,bruno.piloto@teste.invalid,81999990002,Engenharia da Computação,CIn,12/07/2005,2026.2,bruno.jpg`;

  it('aprova as duas linhas e resolve área, subárea e cargo por id', () => {
    const plan = planFor(CSV, { photos: [jpegFake('ana.jpg'), jpegFake('bruno.jpg')] });

    expect(plan.hasBlockingErrors).toBe(false);
    expect(plan.summary.totalRows).toBe(2);
    expect(plan.summary.validRows).toBe(2);
    expect(plan.summary.invalidRows).toBe(0);
    expect(plan.summary.newMembers).toBe(2);
    expect(plan.summary.photosFound).toBe(2);
    expect(plan.summary.photosMissing).toBe(0);

    const [ana] = plan.rows;
    expect(ana.area?.name).toBe('Gente e Gestão');
    expect(ana.subarea?.name).toBe('Gente e Gestão');
    expect(ana.position?.name).toBe('Analista de Gente e Gestão');
    // O que vai para o banco são ids, não os textos da planilha.
    expect(ana.position?.id).toBeTruthy();
    expect(ana.subarea?.id).toBeTruthy();
    expect(ana.birthDate).toBe('2006-03-05');
    expect(ana.department).toBe('CIn');
  });

  it('usa o cargo da planilha, não o cargo inicial da subárea', () => {
    // Quem já está no CITi pode ser gerente ou diretor. Aplicar o cargo inicial
    // aqui rebaixaria meia empresa a analista.
    const csv = `${CABECALHO}
Soluções,Desenvolvimento,Líder de Desenvolvimento,Chefe Piloto,chefe.piloto@teste.invalid,,,,,2026.2,`;

    const [row] = planFor(csv).rows;

    expect(row.position?.name).toBe('Líder de Desenvolvimento');
    const inicial = MOCK_ORG_CATALOG.subareas.find((s) => s.id === row.subarea?.id)?.entryPositionId;
    expect(row.position?.id).not.toBe(inicial);
  });

  it('não importa CPF, RG nem endereço, mesmo se a planilha trouxer', () => {
    const csv = `${CABECALHO},CPF,RG,Endereço
Soluções,Dados,Analista de Dados,Dado Piloto,dado.piloto@teste.invalid,,,,,2026.2,,111.222.333-44,1234567,Rua X 99`;

    const plan = planFor(csv);

    expect(plan.unknownColumns).toEqual(['CPF', 'RG', 'Endereço']);
    // O payload guarda a linha como veio — mas nenhum desses vira coluna de
    // membro, porque não existe campo para eles no modelo.
    expect(Object.keys(plan.rows[0])).not.toContain('cpf');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('cabeçalho antigo', () => {
  it('calcula o ciclo a partir de "Entrada no CITi" quando é uma gestão', () => {
    const csv = `Área,Subárea,Cargo,Nome Completo,Email do CITi,Entrada no CITi
Negócios,Comercial,Gerente de Contas,Marina Antiga,marina@teste.invalid,2025.2`;

    const plan = planFor(csv);

    expect(plan.usedLegacyGestaoColumn).toBe(true);
    expect(plan.hasBlockingErrors).toBe(false);
    expect(plan.rows[0].gestao?.name).toBe('2025.2');
    expect(plan.rows[0].cycle).toEqual({
      startedOn: '2025-07-01',
      expectedEndOn: '2026-06-30',
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('ciclo e situação calculados', () => {
  it('gestão .1 gera ciclo de janeiro a dezembro do mesmo ano', () => {
    const csv = `${CABECALHO}
Soluções,Dados,Analista de Dados,Um Piloto,um.piloto@teste.invalid,,,,,2026.1,`;

    const [row] = planFor(csv).rows;

    expect(row.cycle).toEqual({ startedOn: '2026-01-01', expectedEndOn: '2026-12-31' });
    // 17/09/2026 ainda está dentro do ciclo.
    expect(row.computedStatus).toBe('ativo');
  });

  it('gestão .2 gera ciclo de julho a junho do ano seguinte', () => {
    const csv = `${CABECALHO}
Soluções,Dados,Analista de Dados,Dois Piloto,dois.piloto@teste.invalid,,,,,2026.2,`;

    const [row] = planFor(csv).rows;

    expect(row.cycle).toEqual({ startedOn: '2026-07-01', expectedEndOn: '2027-06-30' });
    expect(row.computedStatus).toBe('ativo');
  });

  it('ciclo já vencido NÃO entra inativo: a base atual emenda continuação', () => {
    const csv = `${CABECALHO}
Soluções,Dados,Analista de Dados,Antigo Piloto,antigo.piloto@teste.invalid,,,,,2025.1,`;

    const plan = planFor(csv);
    const [row] = plan.rows;

    // O ciclo INICIAL continua sendo o da gestão: 2025.1 termina em 31/12/2025.
    // Ele é histórico e não se estica.
    expect(row.cycle?.expectedEndOn).toBe('2025-12-31');

    // A planilha é a base ATUAL: quem está nela continua no CITi. Analista são
    // 6 meses por bloco — 01→06/2026 e 07→12/2026 alcançam 17/09/2026.
    expect(row.rosterContinuation?.cyclesAdded).toBe(2);
    expect(row.rosterContinuation?.monthsPerBlock).toEqual([6, 6]);
    expect(row.currentCycle).toEqual({
      startedOn: '2026-07-01',
      expectedEndOn: '2026-12-31',
    });
    expect(row.computedStatus).toBe('ativo');

    expect(plan.summary.willBeActive).toBe(1);
    expect(plan.summary.withInferredContinuation).toBe(1);
    expect(plan.summary.inferredCycles).toBe(2);
  });

  it('diretoria vencida recebe blocos de 12 meses, lidos do cargo', () => {
    const csv = `${CABECALHO}
Soluções,,Diretoria de Soluções,Chefe Antigo,chefe.antigo@teste.invalid,,,,,2025.1,`;

    const [row] = planFor(csv).rows;

    // Um bloco só já passa de 17/09/2026: 01/01/2026 → 31/12/2026.
    expect(row.rosterContinuation?.monthsPerBlock).toEqual([12]);
    expect(row.currentCycle?.expectedEndOn).toBe('2026-12-31');
    expect(row.computedStatus).toBe('ativo');
  });

  it('a continuação depende da data de referência, não do relógio', () => {
    const csv = `${CABECALHO}
Soluções,Dados,Analista de Dados,Tres Piloto,tres.piloto@teste.invalid,,,,,2026.1,`;

    // Mesmo CSV, duas datas: 2026.1 termina em 31/12/2026, e o ciclo vale
    // durante todo esse dia.
    expect(planFor(csv, { referenceDate: '2026-12-31' }).rows[0].rosterContinuation).toBeNull();

    const depois = planFor(csv, { referenceDate: '2027-01-01' }).rows[0];
    expect(depois.rosterContinuation?.cyclesAdded).toBe(1);
    expect(depois.currentCycle?.expectedEndOn).toBe('2027-06-30');
    // Em nenhuma das duas datas alguém entra inativo.
    expect(depois.computedStatus).toBe('ativo');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('apelido de cargo (Presidência = CEO = Diretor(a) Institucional)', () => {
  const CANONICO = MOCK_ORG_CATALOG.positions.find(
    (p) => p.name === 'Diretor(a) Institucional',
  )!;

  it.each([
    'Presidência',
    'CEO',
    'Diretor Institucional',
    'Diretora Institucional',
    'Diretoria Institucional',
    'Diretor(a) Institucional',
    'presidencia',
  ])('a planilha escrevendo "%s" entra no cargo canônico', (escrito) => {
    const csv = `${CABECALHO}
Institucional,,${escrito},Chefe Piloto,chefe.${escrito.length}@teste.invalid,,,,,2026.2,`;

    const [row] = planFor(csv).rows;

    expect(row.position?.id).toBe(CANONICO.id);
    expect(row.position?.name).toBe('Diretor(a) Institucional');
    // A cadeira cobre a ÁREA inteira: entra sem subárea, como qualquer
    // cargo de área inteira desde a 0014.
    expect(row.areaWide).toBe(true);
    expect(row.subarea).toBeNull();
    expect(errosDa(row)).toEqual([]);
  });

  it('subárea informada para a cadeira é descartada, com aviso informativo', () => {
    const csv = `${CABECALHO}
Institucional,Institucional,Presidência,Chefe Com Subarea,chefe.subarea@teste.invalid,,,,,2026.2,`;

    const [row] = planFor(csv).rows;

    expect(row.position?.id).toBe(CANONICO.id);
    expect(row.subarea).toBeNull();
    expect(row.importable).toBe(true);
    expect(row.issues.map((i) => i.severity)).toEqual(['info']);
  });

  it('diretoria vencida usa os 12 meses do cargo canônico', () => {
    const csv = `${CABECALHO}
Institucional,,Presidência,Chefe Antigo,chefe.antigo@teste.invalid,,,,,2025.1,`;

    const [row] = planFor(csv).rows;

    // 12 meses porque está GRAVADO no cargo — não porque o nome tem
    // "diretor" ou "presidência" dentro.
    expect(row.rosterContinuation?.monthsPerBlock).toEqual([12]);
    expect(row.computedStatus).toBe('ativo');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('diretorias por sigla e apelido (COO, CRO, CTO)', () => {
  const CASOS = [
    { escrito: 'Diretoria de Gente e Gestão', area: 'Gente e Gestão', canonico: 'Diretor(a) de Operações' },
    { escrito: 'COO', area: 'Gente e Gestão', canonico: 'Diretor(a) de Operações' },
    { escrito: 'Diretora de Operações', area: 'Gente e Gestão', canonico: 'Diretor(a) de Operações' },
    { escrito: 'Diretoria de Negócios', area: 'Negócios', canonico: 'Diretor(a) de Negócios' },
    { escrito: 'CRO', area: 'Negócios', canonico: 'Diretor(a) de Negócios' },
    { escrito: 'Diretoria de Soluções', area: 'Soluções', canonico: 'Diretor(a) de Soluções' },
    { escrito: 'CTO', area: 'Soluções', canonico: 'Diretor(a) de Soluções' },
  ];

  it.each(CASOS)('"$escrito" entra como $canonico, sem subárea', ({ escrito, area, canonico }) => {
    const csv = `${CABECALHO}
${area},,${escrito},Chefe Piloto,chefe.${escrito.length}.${area.length}@teste.invalid,,,,,2026.2,`;

    const [row] = planFor(csv).rows;

    expect(errosDa(row)).toEqual([]);
    expect(row.position?.name).toBe(canonico);
    // As quatro diretorias cobrem a ÁREA inteira.
    expect(row.areaWide).toBe(true);
    expect(row.subarea).toBeNull();
    expect(row.area?.name).toBe(area);
  });

  it.each(['Diretoria de Gente e Gestão', 'Diretoria de Negócios', 'CTO'])(
    'diretoria vencida ("%s") recebe blocos de 12 meses',
    (escrito) => {
      const area =
        escrito === 'CTO' ? 'Soluções' : escrito.includes('Gente') ? 'Gente e Gestão' : 'Negócios';
      const csv = `${CABECALHO}
${area},,${escrito},Chefe Antigo,antigo.${escrito.length}.${area.length}@teste.invalid,,,,,2025.1,`;

      const [row] = planFor(csv).rows;

      // 12 meses porque está gravado no CARGO, não porque o texto tem
      // "diretor" dentro.
      expect(row.rosterContinuation?.monthsPerBlock).toEqual([12]);
      expect(row.computedStatus).toBe('ativo');
    },
  );
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Customer Success na importação', () => {
  it('entra sem subárea, cobrindo a área de Soluções', () => {
    const csv = `${CABECALHO}
Soluções,,Customer Success,CS Piloto,cs.piloto@teste.invalid,,,,,2026.2,`;

    const [row] = planFor(csv).rows;

    expect(errosDa(row)).toEqual([]);
    expect(row.position?.name).toBe('Customer Success');
    expect(row.areaWide).toBe(true);
    expect(row.subarea).toBeNull();
  });

  it('subárea informada é descartada, com aviso informativo', () => {
    const csv = `${CABECALHO}
Soluções,Produto,Customer Success,CS Com Subarea,cs.subarea@teste.invalid,,,,,2026.2,`;

    const [row] = planFor(csv).rows;

    expect(row.subarea).toBeNull();
    expect(row.importable).toBe(true);
    expect(row.issues.map((i) => i.severity)).toEqual(['info']);
  });

  it('ciclo vencido recebe blocos de 6 meses — não é diretoria', () => {
    const csv = `${CABECALHO}
Soluções,,Customer Success,CS Antigo,cs.antigo@teste.invalid,,,,,2025.1,`;

    const [row] = planFor(csv).rows;

    // Área inteira e diretoria são coisas diferentes: cobrir a área toda não
    // dá 12 meses a ninguém.
    expect(row.position?.isDirectorship).toBe(false);
    expect(row.rosterContinuation?.monthsPerBlock).toEqual([6, 6]);
    expect(row.computedStatus).toBe('ativo');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('gestão inválida', () => {
  it('recusa formato fora de AAAA.1 / AAAA.2', () => {
    const csv = `${CABECALHO}
Soluções,Dados,Analista de Dados,Erro Piloto,erro.piloto@teste.invalid,,,,,2026.3,`;

    const plan = planFor(csv);

    expect(plan.hasBlockingErrors).toBe(true);
    expect(plan.rows[0].importable).toBe(false);
    expect(errosDa(plan.rows[0]).join(' ')).toContain('fora do formato');
  });

  it('recusa gestão bem formatada que não está cadastrada no banco', () => {
    const csv = `${CABECALHO}
Soluções,Dados,Analista de Dados,Futuro Piloto,futuro.piloto@teste.invalid,,,,,2031.1,`;

    const plan = planFor(csv);

    expect(plan.rows[0].importable).toBe(false);
    expect(errosDa(plan.rows[0]).join(' ')).toContain('não está cadastrada');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('e-mail duplicado', () => {
  it('recusa o mesmo e-mail duas vezes no arquivo, apontando a primeira linha', () => {
    const csv = `${CABECALHO}
Soluções,Dados,Analista de Dados,Primeira,repetido@teste.invalid,,,,,2026.2,
Soluções,Dados,Analista de Dados,Segunda,REPETIDO@Teste.Invalid,,,,,2026.2,`;

    const plan = planFor(csv);

    expect(plan.rows[0].importable).toBe(true);
    expect(plan.rows[1].importable).toBe(false);
    // Caixa diferente é a mesma pessoa: o e-mail é o identificador.
    expect(errosDa(plan.rows[1]).join(' ')).toContain('linha 2');
    expect(plan.hasBlockingErrors).toBe(true);
  });

  it('e-mail já cadastrado não é erro: é o caminho idempotente', () => {
    const csv = `${CABECALHO}
Soluções,Dados,Analista de Dados,Já Existe,ja.existe@teste.invalid,,,,,2026.2,`;

    const plan = planFor(csv, { existingEmails: { 'ja.existe@teste.invalid': 'mbr-123' } });

    expect(plan.hasBlockingErrors).toBe(false);
    expect(plan.rows[0].importable).toBe(true);
    expect(plan.rows[0].existingMemberId).toBe('mbr-123');
    expect(plan.summary.existingEmails).toBe(1);
    expect(plan.summary.newMembers).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('área, subárea ou cargo inexistente', () => {
  it('recusa subárea que não está no cadastro', () => {
    const csv = `${CABECALHO}
Soluções,Setor Fantasma,Analista de Dados,X Piloto,x.piloto@teste.invalid,,,,,2026.2,`;

    const plan = planFor(csv);

    expect(plan.rows[0].importable).toBe(false);
    expect(errosDa(plan.rows[0]).join(' ')).toContain('Setor Fantasma');
  });

  it('recusa área que não está no cadastro', () => {
    const csv = `${CABECALHO}
Área Fantasma,Dados,Analista de Dados,Y Piloto,y.piloto@teste.invalid,,,,,2026.2,`;

    const plan = planFor(csv);

    expect(plan.rows[0].importable).toBe(false);
    expect(errosDa(plan.rows[0]).join(' ')).toContain('Área "Área Fantasma"');
  });

  it('recusa cargo que não existe em lugar nenhum', () => {
    const csv = `${CABECALHO}
Soluções,Dados,Mestre Supremo,Z Piloto,z.piloto@teste.invalid,,,,,2026.2,`;

    const plan = planFor(csv);

    expect(plan.rows[0].importable).toBe(false);
    expect(errosDa(plan.rows[0]).join(' ')).toContain('não existe no cadastro');
  });

  it('recusa quando a subárea informada não pertence à área informada', () => {
    const csv = `${CABECALHO}
Negócios,Dados,Analista de Dados,W Piloto,w.piloto@teste.invalid,,,,,2026.2,`;

    const plan = planFor(csv);

    expect(plan.rows[0].importable).toBe(false);
    expect(errosDa(plan.rows[0]).join(' ')).toContain('não pertence à área');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('cargo incompatível com a subárea', () => {
  it('recusa cargo de outra subárea, distinguindo de "não existe"', () => {
    // "Analista de Dados" existe — mas em Dados, não em Desenvolvimento.
    const csv = `${CABECALHO}
Soluções,Desenvolvimento,Analista de Dados,V Piloto,v.piloto@teste.invalid,,,,,2026.2,`;

    const plan = planFor(csv);
    const mensagem = errosDa(plan.rows[0]).join(' ');

    expect(plan.rows[0].importable).toBe(false);
    expect(mensagem).toContain('não pertence à subárea');
    expect(mensagem).not.toContain('não existe no cadastro');
  });

  it('aceita o cargo de área inteira com qualquer subárea da área — e descarta a subárea', () => {
    // "Diretoria de Soluções" tem subarea_id nulo: vale para Produto, Dados e
    // Desenvolvimento. Nenhuma das três vira vínculo: a pessoa é da área toda.
    for (const subarea of ['Produto', 'Dados', 'Desenvolvimento']) {
      const csv = `${CABECALHO}
Soluções,${subarea},Diretoria de Soluções,Dir Piloto,dir.${subarea}@teste.invalid,,,,,2026.2,`;

      const [row] = planFor(csv).rows;
      expect(row.importable).toBe(true);
      expect(row.position?.name).toBe('Diretor(a) de Soluções');
      expect(row.subarea).toBeNull();
      expect(row.areaWide).toBe(true);
    }
  });

  it('recusa cargo de área inteira numa subárea de OUTRA área', () => {
    const csv = `${CABECALHO}
Negócios,Comercial,Diretoria de Soluções,U Piloto,u.piloto@teste.invalid,,,,,2026.2,`;

    expect(planFor(csv).rows[0].importable).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('data de nascimento ilegível', () => {
  const linha = (nascimento: string) => `${CABECALHO}
Soluções,Dados,Analista de Dados,Data Piloto,data.piloto@teste.invalid,,,,${nascimento},2026.2,`;

  it('não bloqueia a linha e deixa a data nula', () => {
    // Travar setenta pessoas por causa de uma data seria pior do que importar
    // e sinalizar. A informação não se perde: fica no payload.
    const [row] = planFor(linha('em 2006')).rows;

    expect(row.importable).toBe(true);
    expect(errosDa(row)).toEqual([]);
    expect(row.birthDate).toBeNull();
    expect(row.payload['Data de Nascimento']).toBe('em 2006');
  });

  it('vira aviso e pendência de revisão, com o valor recebido', () => {
    const [row] = planFor(linha('31/02/2006')).rows;

    expect(avisosDe(row)).toHaveLength(1);
    expect(row.reviews).toEqual([{ reason: 'invalid_birth_date', received: '31/02/2006' }]);
  });

  it('data válida não gera pendência nenhuma', () => {
    const [row] = planFor(linha('05/03/2006')).rows;

    expect(row.birthDate).toBe('2006-03-05');
    expect(row.reviews).toEqual([]);
  });

  it('campo VAZIO não gera aviso nem pendência', () => {
    // Ausência não é erro: ninguém precisa corrigir o que a planilha nunca
    // prometeu preencher.
    const [row] = planFor(linha('')).rows;

    expect(avisosDe(row)).toEqual([]);
    expect(row.reviews).toEqual([]);
    expect(row.birthDate).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('fotos', () => {
  const CSV = `${CABECALHO}
Soluções,Dados,Analista de Dados,Foto Piloto,foto.piloto@teste.invalid,,,,,2026.2,foto.jpg`;

  it('encontra a foto pelo valor de "Foto Arquivo", ignorando caixa e acento', () => {
    const plan = planFor(CSV, { photos: [jpegFake('FOTO.JPG')] });

    expect(plan.rows[0].photoStatus).toBe('ok');
    expect(plan.summary.photosFound).toBe(1);
  });

  it('foto ausente é AVISO, não erro: o membro entra sem foto', () => {
    const plan = planFor(CSV, { photos: [] });

    expect(plan.rows[0].photoStatus).toBe('ausente');
    expect(plan.rows[0].importable).toBe(true);
    expect(plan.hasBlockingErrors).toBe(false);
    expect(avisosDe(plan.rows[0]).join(' ')).toContain('não está no .zip');
    expect(plan.summary.photosMissing).toBe(1);
  });

  it('formato inválido é recusado pelo CONTEÚDO, não pela extensão', () => {
    // Um GIF renomeado para .jpg passaria numa checagem de extensão e só seria
    // recusado no bucket, depois de o membro já existir.
    const bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
    const disfarcado: ImportPhoto = {
      name: 'foto.jpg',
      path: 'foto.jpg',
      bytes,
      contentType: detectImageType(bytes),
      size: bytes.length,
    };

    const plan = planFor(CSV, { photos: [disfarcado] });

    expect(plan.rows[0].photoStatus).toBe('formato_invalido');
    expect(plan.rows[0].photo).toBeNull();
    // Continua importável: o problema é da foto, não da pessoa.
    expect(plan.rows[0].importable).toBe(true);
  });

  it('foto acima de 5 MB é recusada', () => {
    const grande = jpegFake('foto.jpg', 5 * 1024 * 1024 + 1);

    const plan = planFor(CSV, { photos: [grande] });

    expect(plan.rows[0].photoStatus).toBe('muito_grande');
    expect(plan.rows[0].photo).toBeNull();
    expect(avisosDe(plan.rows[0]).join(' ')).toContain('5 MB');
  });

  it('lista as fotos do zip que nenhuma linha usou', () => {
    const plan = planFor(CSV, { photos: [jpegFake('foto.jpg'), jpegFake('sobrando.png')] });

    expect(plan.unusedPhotos).toEqual(['sobrando.png']);
  });

  it('linha sem "Foto Arquivo" não gera aviso nenhum', () => {
    const csv = `${CABECALHO}
Soluções,Dados,Analista de Dados,Sem Foto,sem.foto@teste.invalid,,,,,2026.2,`;

    const [row] = planFor(csv).rows;

    expect(row.photoStatus).toBe('nao_informada');
    expect(avisosDe(row)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('detectImageType', () => {
  it('reconhece JPEG, PNG e WebP pelos bytes iniciais', () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(
      detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe('image/png');

    const webp = new Uint8Array(12);
    webp.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
    webp.set([...'WEBP'].map((c) => c.charCodeAt(0)), 8);
    expect(detectImageType(webp)).toBe('image/webp');
  });

  it('devolve null para qualquer outra coisa', () => {
    expect(detectImageType(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull();
    expect(detectImageType(new Uint8Array([]))).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('positionFitsSubarea', () => {
  const dados = MOCK_ORG_CATALOG.subareas.find((s) => s.slug === 'solucoes-dados');
  const comercial = MOCK_ORG_CATALOG.subareas.find((s) => s.slug === 'negocios-comercial');
  const analistaDados = MOCK_ORG_CATALOG.positions.find((p) => p.name === 'Analista de Dados');
  const diretoriaSolucoes = MOCK_ORG_CATALOG.positions.find(
    (p) => p.name === 'Diretor(a) de Soluções',
  );

  it('cargo de subárea só serve à própria subárea', () => {
    expect(positionFitsSubarea(analistaDados!, dados!)).toBe(true);
    expect(positionFitsSubarea(analistaDados!, comercial!)).toBe(false);
  });

  it('cargo de área inteira serve a qualquer subárea da área', () => {
    expect(positionFitsSubarea(diretoriaSolucoes!, dados!)).toBe(true);
    expect(positionFitsSubarea(diretoriaSolucoes!, comercial!)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('bloqueio da confirmação', () => {
  it('uma linha ruim trava o arquivo inteiro', () => {
    const csv = `${CABECALHO}
Soluções,Dados,Analista de Dados,Boa Linha,boa@teste.invalid,,,,,2026.2,
Soluções,Setor Fantasma,Analista de Dados,Linha Ruim,ruim@teste.invalid,,,,,2026.2,`;

    const plan = planFor(csv);

    // Importar "só as boas" deixaria planilha e banco em estados diferentes,
    // e ninguém saberia quais faltam.
    expect(plan.hasBlockingErrors).toBe(true);
    expect(plan.summary.validRows).toBe(1);
    expect(plan.summary.invalidRows).toBe(1);
  });

  it('coluna obrigatória ausente trava antes de olhar as linhas', () => {
    const csv = `Área,Subárea,Nome Completo
Soluções,Dados,Alguém`;

    const plan = planFor(csv);

    expect(plan.hasBlockingErrors).toBe(true);
    expect(plan.fileIssues.join(' ')).toContain('Cargo');
  });

  it('planilha sem linhas é bloqueada com mensagem própria', () => {
    const plan = planFor(CABECALHO);

    expect(plan.hasBlockingErrors).toBe(true);
    expect(plan.fileIssues.join(' ')).toContain('nenhuma linha');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('cargo de área inteira com subárea vazia', () => {
  // "Diretoria de Negócios" atua sobre Comercial E Marketing: não há uma
  // subárea para informar. A coluna vazia aqui NÃO é dado faltante.
  it('aceita Diretoria de Negócios na área Negócios sem subárea', () => {
    const csv = `${CABECALHO}
Negócios,,Diretoria de Negócios,Dir Negocios,dir.negocios@teste.invalid,,,,,2026.2,`;

    const plan = planFor(csv);
    const [row] = plan.rows;

    expect(plan.hasBlockingErrors).toBe(false);
    expect(row.importable).toBe(true);
    expect(row.issues).toEqual([]);
    expect(row.areaWide).toBe(true);
    // A subárea vai NULA para o banco, e a área sai do próprio cargo.
    expect(row.subarea).toBeNull();
    expect(row.area?.name).toBe('Negócios');
    expect(row.position?.name).toBe('Diretor(a) de Negócios');
    expect(row.position?.subareaId).toBeNull();
    // Não é pendência: nada para revisar depois.
    expect(row.reviews).toEqual([]);
    expect(plan.summary.validRows).toBe(1);
  });

  it('aceita Diretoria de Soluções na área Soluções sem subárea', () => {
    const csv = `${CABECALHO}
Soluções,,Diretoria de Soluções,Dir Solucoes,dir.solucoes@teste.invalid,,,,,2026.2,`;

    const plan = planFor(csv);
    const [row] = plan.rows;

    expect(plan.hasBlockingErrors).toBe(false);
    expect(row.areaWide).toBe(true);
    expect(row.subarea).toBeNull();
    expect(row.area?.name).toBe('Soluções');
    expect(row.reviews).toEqual([]);
  });

  it('sem área na planilha, o próprio cargo diz de qual área ele é', () => {
    const csv = `${CABECALHO}
,,Diretoria de Negócios,Dir Sem Area,dir.sem.area@teste.invalid,,,,,2026.2,`;

    const [row] = planFor(csv).rows;

    expect(row.importable).toBe(true);
    expect(row.areaWide).toBe(true);
    expect(row.area?.name).toBe('Negócios');
  });

  it('recusa cargo de área inteira informado na área errada', () => {
    // A Diretoria de Negócios não é de Soluções. Sem subárea para conferir,
    // a área é a única checagem que resta — e ela precisa valer.
    const csv = `${CABECALHO}
Soluções,,Diretoria de Negócios,Dir Errada,dir.errada@teste.invalid,,,,,2026.2,`;

    const plan = planFor(csv);
    const [row] = plan.rows;

    expect(row.importable).toBe(false);
    expect(row.areaWide).toBe(false);
    expect(errosDa(row).join(' ')).toContain('não pertence à área "Soluções"');
    expect(plan.hasBlockingErrors).toBe(true);
  });

  it('cargo de subárea continua exigindo a subárea', () => {
    // "Analista de Dados" mora em Dados. Sem subárea, ninguém saberia em que
    // time a pessoa entrou — isso continua bloqueando.
    const csv = `${CABECALHO}
Soluções,,Analista de Dados,Sem Subarea,sem.subarea@teste.invalid,,,,,2026.2,`;

    const plan = planFor(csv);
    const [row] = plan.rows;

    expect(row.importable).toBe(false);
    expect(row.areaWide).toBe(false);
    expect(errosDa(row).join(' ')).toContain('Subárea é obrigatória para o cargo');
  });

  it('a subárea informada é descartada, com aviso informativo e sem pendência', () => {
    // Planilha antiga trazia "Diretoria de Soluções" em Produto. A linha entra
    // — mas a pessoa não fica presa a Produto, porque ela é da área toda.
    const csv = `${CABECALHO}
Soluções,Produto,Diretoria de Soluções,Dir Produto,dir.produto@teste.invalid,,,,,2026.2,`;

    const plan = planFor(csv);
    const [row] = plan.rows;

    expect(row.importable).toBe(true);
    expect(plan.hasBlockingErrors).toBe(false);
    expect(row.subarea).toBeNull();
    expect(row.areaWide).toBe(true);
    expect(row.area?.name).toBe('Soluções');

    // Informativo: não é erro, não é aviso de pendência.
    const info = row.issues.filter((issue) => issue.severity === 'info');
    expect(info).toHaveLength(1);
    expect(info[0].message).toBe(
      'A subárea informada será ignorada porque este cargo atua sobre toda a área.',
    );
    expect(errosDa(row)).toEqual([]);
    expect(avisosDe(row)).toEqual([]);
    // Nada a revisar depois: `info` nunca vira `needs_review`.
    expect(row.reviews).toEqual([]);

    // O que a planilha mandou não se perde: segue no payload da submissão.
    expect(row.payload['Subárea']).toBe('Produto');
  });

  it('subárea vazia não gera aviso nenhum', () => {
    const csv = `${CABECALHO}
Negócios,,Diretoria de Negócios,Dir Vazio,dir.vazio@teste.invalid,,,,,2026.2,`;

    const [row] = planFor(csv).rows;

    expect(row.areaWide).toBe(true);
    expect(row.issues).toEqual([]);
  });

  it('cargo e subárea vazios continuam cobrando os dois', () => {
    // Sem cargo não há como saber se a subárea vazia seria permitida.
    const csv = `${CABECALHO}
Negócios,,,Ninguem,ninguem@teste.invalid,,,,,2026.2,`;

    const mensagens = errosDa(planFor(csv).rows[0]).join(' ');

    expect(mensagens).toContain('Cargo é obrigatório');
    expect(mensagens).toContain('Subárea é obrigatória');
  });
});
