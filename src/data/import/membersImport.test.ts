import { describe, expect, it } from 'vitest';
import { parseArea, parseFlexibleDate, previewMembersCsv } from './membersImport';

/**
 * Testes da fundação de importação.
 *
 * O ponto principal: um arquivo com problemas deve gerar um RELATÓRIO, e não
 * uma importação pela metade nem uma exceção no meio do caminho.
 */

const CSV_OK = `Nome,E-mail,Cargo,Subárea,Data de entrada,Curso,Período
Helena Vasconcelos,helena.vasconcelos@citi.org.br,Desenvolvedora Frontend,Desenvolvimento,01/03/2025,Ciência da Computação,5
Solange Peixoto,solange.peixoto@citi.org.br,Analista de Dados,Dados,2025-03-01,Estatística,4`;

describe('previewMembersCsv', () => {
  it('lê um arquivo válido e devolve os membros prontos para importar', () => {
    const preview = previewMembersCsv(CSV_OK);

    expect(preview.issues).toHaveLength(0);
    expect(preview.valid).toHaveLength(2);
    expect(preview.valid[0].fullName).toBe('Helena Vasconcelos');
    expect(preview.valid[0].area).toBe('Desenvolvimento');
    // Data em formato brasileiro vira ISO.
    expect(preview.valid[0].joinedAt).toBe('2025-03-01');
    // Data já em ISO passa direto.
    expect(preview.valid[1].joinedAt).toBe('2025-03-01');
    expect(preview.valid[0].semester).toBe(5);
    expect(preview.valid[0].status).toBe('ativo');
  });

  it('reporta linhas inválidas sem descartar as válidas', () => {
    const csv = `Nome,E-mail,Cargo,Subárea,Data de entrada
Helena Vasconcelos,helena.vasconcelos@citi.org.br,Dev,Desenvolvimento,01/03/2025
Sem Email,,Dev,Desenvolvimento,01/03/2025`;

    const preview = previewMembersCsv(csv);

    expect(preview.valid).toHaveLength(1);
    expect(preview.issues.length).toBeGreaterThan(0);
    expect(preview.issues[0].line).toBe(3);
    expect(preview.issues[0].field).toBe('email');
  });

  it('detecta e-mail repetido dentro do próprio arquivo', () => {
    const csv = `Nome,E-mail,Cargo,Subárea,Data de entrada
Helena Vasconcelos,helena@citi.org.br,Dev,Desenvolvimento,01/03/2025
Helena Duplicada,HELENA@citi.org.br,Dev,Desenvolvimento,01/03/2025`;

    const preview = previewMembersCsv(csv);

    expect(preview.valid).toHaveLength(1);
    expect(preview.duplicatesInFile).toHaveLength(1);
  });

  it('avisa quando a subárea não é reconhecida em vez de inventar uma', () => {
    const csv = `Nome,E-mail,Cargo,Subárea,Data de entrada
Helena Vasconcelos,helena@citi.org.br,Dev,Setor Inexistente,01/03/2025`;

    const preview = previewMembersCsv(csv);

    expect(preview.valid).toHaveLength(0);
    expect(preview.issues[0].field).toBe('area');
  });

  it('lista as colunas que não foram reconhecidas', () => {
    const csv = `Nome,E-mail,Cargo,Subárea,Data de entrada,Coluna Estranha
Helena Vasconcelos,helena@citi.org.br,Dev,Desenvolvimento,01/03/2025,valor`;

    expect(previewMembersCsv(csv).unknownColumns).toContain('Coluna Estranha');
  });
});

describe('parseFlexibleDate', () => {
  it('aceita DD/MM/AAAA', () => {
    expect(parseFlexibleDate('05/03/2026')).toBe('2026-03-05');
  });

  it('aceita AAAA-MM-DD', () => {
    expect(parseFlexibleDate('2026-03-05')).toBe('2026-03-05');
  });

  it('devolve null para valor vazio ou inválido', () => {
    expect(parseFlexibleDate('')).toBeNull();
    expect(parseFlexibleDate('março de 2026')).toBeNull();
  });
});

describe('parseArea', () => {
  it('reconhece a subárea escrita por extenso', () => {
    expect(parseArea('Desenvolvimento')).toBe('Desenvolvimento');
  });

  it('reconhece apelidos internos e variações sem acento', () => {
    expect(parseArea('GG')).toBe('Gente e Gestão');
    expect(parseArea('gente e gestao')).toBe('Gente e Gestão');
    expect(parseArea('dev')).toBe('Desenvolvimento');
  });

  it('devolve null para valor desconhecido', () => {
    expect(parseArea('Setor X')).toBeNull();
  });
});
