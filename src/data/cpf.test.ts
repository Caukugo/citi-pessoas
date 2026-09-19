import { describe, expect, it } from 'vitest';
import { checkCpf, cpfLast4, formatCpf, isValidCpf, normalizeCpf } from './cpf';

/**
 * Regras de CPF.
 *
 * ⚠️ TODOS os CPFs aqui são FICTÍCIOS — gerados só para fechar os dígitos
 * verificadores. Nenhum dado real de ninguém entra em teste (CLAUDE.md §13).
 *
 * Este é o mesmo módulo que a Edge Function usa para validar de novo no
 * servidor. Se ele passar a discordar de si mesmo, é aqui que aparece.
 */

/** Fictícios, com dígitos verificadores corretos. */
const VALIDOS = ['52998224725', '11144477735', '01234567890'];

describe('normalização', () => {
  it('tira pontuação', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
    expect(normalizeCpf(' 529 982 247 25 ')).toBe('52998224725');
  });

  it('devolve o zero à esquerda que o Excel comeu', () => {
    // É o caso mais comum de "CPF inválido" que na verdade é planilha
    // exportada como número: dez dígitos em vez de onze.
    expect(normalizeCpf('1234567890')).toBe('01234567890');
  });

  it('vazio é null, não string vazia', () => {
    expect(normalizeCpf('')).toBeNull();
    expect(normalizeCpf(null)).toBeNull();
    expect(normalizeCpf('abc')).toBeNull();
  });
});

describe('validação', () => {
  it.each(VALIDOS)('aceita o CPF fictício %s', (cpf) => {
    expect(isValidCpf(cpf)).toBe(true);
    expect(checkCpf(cpf).problem).toBeNull();
  });

  it('aceita CPF válido que começa com zero', () => {
    expect(isValidCpf('012.345.678-90')).toBe(true);
  });

  it('recusa dígito verificador errado', () => {
    expect(checkCpf('52998224724')).toMatchObject({
      valid: false,
      problem: 'digito_verificador',
    });
  });

  it('recusa sequência repetida, mesmo fechando a conta', () => {
    // 111.111.111-11 passa no cálculo dos verificadores e não é um CPF.
    // Por isso a checagem de sequência vem ANTES.
    for (const sequencia of ['11111111111', '00000000000', '99999999999']) {
      expect(checkCpf(sequencia)).toMatchObject({
        valid: false,
        problem: 'sequencia_repetida',
      });
    }
  });

  it('recusa tamanho errado', () => {
    expect(checkCpf('123').problem).toBe('tamanho');
    expect(checkCpf('123456789012').problem).toBe('tamanho');
  });

  it('recusa vazio', () => {
    expect(checkCpf('').problem).toBe('vazio');
    expect(checkCpf(undefined).problem).toBe('vazio');
  });
});

describe('exibição', () => {
  it('formata com pontuação', () => {
    expect(formatCpf('52998224725')).toBe('529.982.247-25');
    expect(formatCpf('01234567890')).toBe('012.345.678-90');
  });

  it('devolve o que veio quando não dá para formatar', () => {
    expect(formatCpf('123')).toBe('123');
    expect(formatCpf(null)).toBe('');
  });

  it('últimos quatro dígitos', () => {
    expect(cpfLast4('529.982.247-25')).toBe('4725');
    expect(cpfLast4('123')).toBeNull();
  });
});
