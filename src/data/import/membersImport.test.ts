import { describe, expect, it } from 'vitest';
import {
  parseCargo,
  parseDiretoriaCargo,
  parseSubarea,
  parseFlexibleDate,
  previewMembersCsv,
} from './membersImport';

/**
 * Testes da fundação de importação.
 *
 * O ponto principal: um arquivo com problemas deve gerar um RELATÓRIO, e não
 * uma importação pela metade nem uma exceção no meio do caminho.
 */

const CSV_OK = `Nome,E-mail,Cargo,Subárea,Data de entrada,Curso,Período
Helena Vasconcelos,helena.vasconcelos@citi.org.br,Pessoa Desenvolvedora,Desenvolvimento,01/03/2025,Ciência da Computação,5
Solange Peixoto,solange.peixoto@citi.org.br,Analista de Dados,Dados,2025-03-01,Estatística,4`;

describe('previewMembersCsv', () => {
  it('lê um arquivo válido e devolve os membros prontos para importar', () => {
    const preview = previewMembersCsv(CSV_OK);

    expect(preview.issues).toHaveLength(0);
    expect(preview.valid).toHaveLength(2);
    expect(preview.valid[0].fullName).toBe('Helena Vasconcelos');
    expect(preview.valid[0].subarea).toBe('Desenvolvimento');
    // Data em formato brasileiro vira ISO.
    expect(preview.valid[0].joinedAt).toBe('2025-03-01');
    // Data já em ISO passa direto.
    expect(preview.valid[1].joinedAt).toBe('2025-03-01');
    expect(preview.valid[0].semester).toBe(5);
    expect(preview.valid[0].status).toBe('ativo');
  });

  it('reporta linhas inválidas sem descartar as válidas', () => {
    const csv = `Nome,E-mail,Cargo,Subárea,Data de entrada
Helena Vasconcelos,helena.vasconcelos@citi.org.br,Pessoa Desenvolvedora,Desenvolvimento,01/03/2025
Sem Email,,Pessoa Desenvolvedora,Desenvolvimento,01/03/2025`;

    const preview = previewMembersCsv(csv);

    expect(preview.valid).toHaveLength(1);
    expect(preview.issues.length).toBeGreaterThan(0);
    expect(preview.issues[0].line).toBe(3);
    expect(preview.issues[0].field).toBe('email');
  });

  it('detecta e-mail repetido dentro do próprio arquivo', () => {
    const csv = `Nome,E-mail,Cargo,Subárea,Data de entrada
Helena Vasconcelos,helena@citi.org.br,Pessoa Desenvolvedora,Desenvolvimento,01/03/2025
Helena Duplicada,HELENA@citi.org.br,Pessoa Desenvolvedora,Desenvolvimento,01/03/2025`;

    const preview = previewMembersCsv(csv);

    expect(preview.valid).toHaveLength(1);
    expect(preview.duplicatesInFile).toHaveLength(1);
  });

  it('avisa quando a subárea não é reconhecida em vez de inventar uma', () => {
    const csv = `Nome,E-mail,Cargo,Subárea,Data de entrada
Helena Vasconcelos,helena@citi.org.br,Dev,Setor Inexistente,01/03/2025`;

    const preview = previewMembersCsv(csv);

    expect(preview.valid).toHaveLength(0);
    expect(preview.issues[0].field).toBe('subarea');
  });

  it('lista as colunas que não foram reconhecidas', () => {
    const csv = `Nome,E-mail,Cargo,Subárea,Data de entrada,Coluna Estranha
Helena Vasconcelos,helena@citi.org.br,Pessoa Desenvolvedora,Desenvolvimento,01/03/2025,valor`;

    expect(previewMembersCsv(csv).unknownColumns).toContain('Coluna Estranha');
  });

  it('avisa quando o cargo não é válido para a subárea da linha (ADR-017)', () => {
    // "Líder de Dados" existe — só não em Marketing.
    const csv = `Nome,E-mail,Cargo,Subárea,Data de entrada
Helena Vasconcelos,helena@citi.org.br,Líder de Dados,Marketing,01/03/2025`;

    const preview = previewMembersCsv(csv);

    expect(preview.valid).toHaveLength(0);
    expect(preview.issues[0].field).toBe('role');
  });

  it('aceita uma linha de Diretoria sem subárea preenchida (ADR-018)', () => {
    const csv = `Nome,E-mail,Cargo,Subárea,Data de entrada
Heloísa Bittencourt,heloisa@citi.org.br,Diretor(a) de Operações (COO),,15/01/2023`;

    const preview = previewMembersCsv(csv);

    expect(preview.issues).toHaveLength(0);
    expect(preview.valid).toHaveLength(1);
    expect(preview.valid[0].subarea).toBeNull();
    expect(preview.valid[0].diretoriaArea).toBe('Gente e Gestão');
    expect(preview.valid[0].role).toBe('Diretor(a) de Operações (COO)');
  });

  it('avisa quando falta subárea e o cargo não é de Diretoria', () => {
    const csv = `Nome,E-mail,Cargo,Subárea,Data de entrada
Helena Vasconcelos,helena@citi.org.br,Pessoa Desenvolvedora,,01/03/2025`;

    const preview = previewMembersCsv(csv);

    expect(preview.valid).toHaveLength(0);
    expect(preview.issues[0].field).toBe('subarea');
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

describe('parseSubarea', () => {
  it('reconhece a subárea escrita por extenso', () => {
    expect(parseSubarea('Desenvolvimento')).toBe('Desenvolvimento');
  });

  it('reconhece apelidos internos e variações sem acento', () => {
    expect(parseSubarea('GG')).toBe('Gente e Gestão');
    expect(parseSubarea('gente e gestao')).toBe('Gente e Gestão');
    expect(parseSubarea('dev')).toBe('Desenvolvimento');
  });

  it('reconhece a grafia antiga "Dados" como a subárea renomeada (ADR-014)', () => {
    expect(parseSubarea('Dados')).toBe('Inteligência de Dados');
    expect(parseSubarea('Inteligência de Dados')).toBe('Inteligência de Dados');
  });

  it('reconhece a subárea nova "Inovação"', () => {
    expect(parseSubarea('Inovação')).toBe('Inovação');
    expect(parseSubarea('inovacao')).toBe('Inovação');
  });

  it('não inventa mapeamento para "Gestão", removida por não ter subárea real (ADR-014)', () => {
    expect(parseSubarea('Gestão')).toBeNull();
  });

  it('devolve null para valor desconhecido', () => {
    expect(parseSubarea('Setor X')).toBeNull();
  });
});

describe('parseCargo', () => {
  it('reconhece um cargo escrito por extenso, ignorando acento e caixa', () => {
    expect(parseCargo('Pessoa Desenvolvedora', 'Desenvolvimento')).toBe('Pessoa Desenvolvedora');
    expect(parseCargo('lider de desenvolvimento', 'Desenvolvimento')).toBe('Líder de Desenvolvimento');
  });

  it('o mesmo texto de cargo é válido em uma subárea e inválido em outra (ADR-017)', () => {
    expect(parseCargo('Líder de Dados', 'Inteligência de Dados')).toBe('Líder de Dados');
    expect(parseCargo('Líder de Dados', 'Marketing')).toBeNull();
  });

  it('devolve null para valor vazio ou desconhecido', () => {
    expect(parseCargo(undefined, 'Desenvolvimento')).toBeNull();
    expect(parseCargo('Cargo Inventado', 'Desenvolvimento')).toBeNull();
  });
});

describe('parseDiretoriaCargo', () => {
  it('reconhece um cargo de Diretoria e devolve a área correspondente (ADR-018)', () => {
    expect(parseDiretoriaCargo('Diretor(a) de Operações (COO)')).toEqual({
      area: 'Gente e Gestão',
      cargo: 'Diretor(a) de Operações (COO)',
    });
    expect(parseDiretoriaCargo('diretor(a) de solucoes (cto)')).toEqual({
      area: 'Soluções',
      cargo: 'Diretor(a) de Soluções (CTO)',
    });
  });

  it('devolve null para cargo que não é de Diretoria', () => {
    expect(parseDiretoriaCargo('Pessoa Desenvolvedora')).toBeNull();
    expect(parseDiretoriaCargo(undefined)).toBeNull();
  });
});
