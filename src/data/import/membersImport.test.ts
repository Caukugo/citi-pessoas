import { describe, expect, it } from 'vitest';
import { columnLabel, isGestaoName, parseFlexibleDate, parseMembersCsv } from './membersImport';

/**
 * Testes da LEITURA da planilha.
 *
 * O ponto: um arquivo com problemas gera um RELATÓRIO, não uma importação pela
 * metade nem uma exceção no meio do caminho. A validação contra o banco (área,
 * subárea, cargo, gestão) é testada em `importPlan.test.ts` — aqui só se
 * verifica o que dá para saber lendo o arquivo.
 */

const CABECALHO =
  'Área,Subárea,Cargo,Nome Completo,Email do CITi,Celular,Curso,' +
  'Departamento Acadêmico,Data de Nascimento,Gestão de Entrada,Foto Arquivo';

describe('parseMembersCsv — colunas oficiais', () => {
  it('lê as onze colunas e normaliza o que deve ser normalizado', () => {
    const csv = `${CABECALHO}
Soluções,Desenvolvimento,Pessoa Desenvolvedora,  Helena   Vasconcelos ,HELENA.Vasconcelos@Teste.Invalid,(81) 99999-0000,Ciência da Computação,CIn,05/03/2006,2026.1,helena.jpg`;

    const { rows, missingColumns, unknownColumns } = parseMembersCsv(csv);

    expect(missingColumns).toHaveLength(0);
    expect(unknownColumns).toHaveLength(0);
    expect(rows).toHaveLength(1);

    const [row] = rows;
    // Linha 2 do arquivo: o cabeçalho é a linha 1.
    expect(row.line).toBe(2);
    // Espaço repetido some, mas o nome próprio mantém acento e caixa.
    expect(row.values.fullName).toBe('Helena Vasconcelos');
    // E-mail é o identificador: sempre minúsculo.
    expect(row.values.email).toBe('helena.vasconcelos@teste.invalid');
    expect(row.values.subarea).toBe('Desenvolvimento');
    expect(row.values.position).toBe('Pessoa Desenvolvedora');
    expect(row.values.gestao).toBe('2026.1');
    expect(row.values.photoFile).toBe('helena.jpg');
    expect(row.values.department).toBe('CIn');
  });

  it('aceita cabeçalho sem acento, com caixa trocada e espaço sobrando', () => {
    const csv = `area,  SUBAREA ,cargo,nome completo,email do citi,gestao de entrada
Soluções,Dados,Analista de Dados,Solange Peixoto,solange@teste.invalid,2026.2`;

    const { rows, missingColumns } = parseMembersCsv(csv);

    expect(missingColumns).toHaveLength(0);
    expect(rows[0].values.subarea).toBe('Dados');
    expect(rows[0].values.gestao).toBe('2026.2');
  });

  it('remove o BOM que o Excel coloca no começo do arquivo', () => {
    const csv = `\uFEFF${CABECALHO}
Soluções,Dados,Analista de Dados,Solange Peixoto,solange@teste.invalid,,,,,2026.2,`;

    const { rows, missingColumns } = parseMembersCsv(csv);

    // Sem tratar o BOM, "Área" viraria "\uFEFFÁrea" e nada casaria.
    expect(missingColumns).toHaveLength(0);
    expect(rows[0].values.subarea).toBe('Dados');
  });

  it('guarda a linha original inteira, para o payload da submissão', () => {
    const csv = `${CABECALHO}
Soluções,Dados,Analista de Dados,Solange Peixoto,solange@teste.invalid,81999990000,Estatística,CCEN,,2026.2,solange.png`;

    expect(parseMembersCsv(csv).rows[0].raw).toMatchObject({
      'Nome Completo': 'Solange Peixoto',
      Curso: 'Estatística',
      'Foto Arquivo': 'solange.png',
    });
  });

  it('lista as colunas que não reconheceu em vez de ignorá-las em silêncio', () => {
    const csv = `${CABECALHO},CPF,Endereço
Soluções,Dados,Analista de Dados,Solange Peixoto,solange@teste.invalid,,,,,2026.2,,123,Rua X`;

    const { unknownColumns } = parseMembersCsv(csv);

    // CPF e endereço não pertencem a esta plataforma: aparecem como
    // desconhecidos e nunca são importados.
    expect(unknownColumns).toEqual(['CPF', 'Endereço']);
  });

  it('avisa quando falta uma coluna obrigatória', () => {
    const csv = `Área,Subárea,Nome Completo,Gestão de Entrada
Soluções,Dados,Solange Peixoto,2026.2`;

    const { missingColumns } = parseMembersCsv(csv);

    expect(missingColumns).toContain('position');
    expect(missingColumns).toContain('email');
  });
});

describe('parseMembersCsv — compatibilidade com o cabeçalho antigo', () => {
  it('usa "Entrada no CITi" como gestão quando o valor é AAAA.1 / AAAA.2', () => {
    const csv = `Área,Subárea,Cargo,Nome Completo,Email do CITi,Entrada no CITi
Negócios,Comercial,Gerente de Contas,Marina Antiga,marina@teste.invalid,2025.2`;

    const { rows, missingColumns, usedLegacyGestaoColumn } = parseMembersCsv(csv);

    expect(usedLegacyGestaoColumn).toBe(true);
    expect(missingColumns).toHaveLength(0);
    expect(rows[0].values.gestao).toBe('2025.2');
  });

  it('NÃO trata "Entrada no CITi" como gestão quando o valor é uma data', () => {
    // Na planilha antiga a mesma coluna às vezes guardava data de ingresso.
    // Interpretar "01/03/2025" como gestão inventaria um ciclo inteiro.
    const csv = `Área,Subárea,Cargo,Nome Completo,Email do CITi,Entrada no CITi
Negócios,Comercial,Gerente de Contas,Marina Antiga,marina@teste.invalid,01/03/2025`;

    const { rows, missingColumns, usedLegacyGestaoColumn } = parseMembersCsv(csv);

    expect(usedLegacyGestaoColumn).toBe(false);
    expect(missingColumns).toContain('gestao');
    expect(rows[0].values.gestao).toBeUndefined();
  });

  it('a coluna nova vence a antiga quando as duas existem', () => {
    const csv = `Área,Subárea,Cargo,Nome Completo,Email do CITi,Entrada no CITi,Gestão de Entrada
Negócios,Comercial,Gerente de Contas,Marina Antiga,marina@teste.invalid,2024.1,2026.1`;

    const { rows, usedLegacyGestaoColumn } = parseMembersCsv(csv);

    expect(rows[0].values.gestao).toBe('2026.1');
    expect(usedLegacyGestaoColumn).toBe(false);
  });
});

describe('parseFlexibleDate', () => {
  it('aceita DD/MM/AAAA e AAAA-MM-DD', () => {
    expect(parseFlexibleDate('05/03/2006')).toBe('2006-03-05');
    expect(parseFlexibleDate('2006-03-05')).toBe('2006-03-05');
    expect(parseFlexibleDate('5-3-2006')).toBe('2006-03-05');
  });

  it('recusa data que não existe no calendário', () => {
    // `new Date` aceitaria e devolveria 3 de março — uma data de nascimento
    // errada que ninguém mais perceberia.
    expect(parseFlexibleDate('31/02/2006')).toBeNull();
    expect(parseFlexibleDate('2006-13-01')).toBeNull();
  });

  it('devolve null para vazio ou texto livre', () => {
    expect(parseFlexibleDate('')).toBeNull();
    expect(parseFlexibleDate('março de 2006')).toBeNull();
    expect(parseFlexibleDate(undefined)).toBeNull();
  });
});

describe('isGestaoName', () => {
  it('reconhece só o formato do CITi', () => {
    expect(isGestaoName('2026.1')).toBe(true);
    expect(isGestaoName('2026.2')).toBe(true);
    expect(isGestaoName('2026.3')).toBe(false);
    expect(isGestaoName('2026')).toBe(false);
    expect(isGestaoName('01/03/2025')).toBe(false);
  });
});

describe('columnLabel', () => {
  it('devolve o nome oficial da coluna, para a mensagem de erro ser acionável', () => {
    expect(columnLabel('email')).toBe('Email do CITi');
    expect(columnLabel('gestao')).toBe('Gestão de Entrada');
  });
});
