import { describe, expect, it } from 'vitest';
import {
  activeOnes,
  addCitiValue,
  canRetire,
  reactivateCitiValue,
  retireCitiValue,
  retiredOnes,
  validateLabel,
} from './citiValues';
import type { CitiValueSetting } from '@/data';

const LISTA: CitiValueSetting[] = [
  { id: 'v-1', label: 'Eu sou o CITi', retiredAt: null },
  { id: 'v-2', label: 'Obcecados por aprender', retiredAt: null },
  { id: 'v-3', label: 'Ousadia', retiredAt: '2026-08-01T00:00:00.000Z' },
];

describe('lista de valores do CITi', () => {
  it('separa quem está em circulação de quem foi aposentado', () => {
    expect(activeOnes(LISTA).map((v) => v.id)).toEqual(['v-1', 'v-2']);
    expect(retiredOnes(LISTA).map((v) => v.id)).toEqual(['v-3']);
  });

  it('acrescenta no fim e gera id próprio, sem tocar no resto', () => {
    const next = addCitiValue(LISTA, '  Protagonismo  ', () => 'v-4');

    expect(next).toHaveLength(4);
    expect(next[3]).toEqual({ id: 'v-4', label: 'Protagonismo', retiredAt: null });
    expect(next.slice(0, 3)).toEqual(LISTA);
  });
});

describe('nome repetido', () => {
  it('recusa nome vazio ou só espaço', () => {
    expect(validateLabel(LISTA, '')).toBe('vazio');
    expect(validateLabel(LISTA, '   ')).toBe('vazio');
  });

  it('recusa o mesmo nome ignorando caixa, acento e espaço', () => {
    expect(validateLabel(LISTA, 'eu sou o citi')).toBe('duplicado');
    expect(validateLabel(LISTA, '  EU SOU O CITI ')).toBe('duplicado');
  });

  it('recusa também o nome de um valor JÁ APOSENTADO', () => {
    // Reaproveitar o nome criaria dois valores distintos chamados "Ousadia" —
    // o do passado e o novo — e ninguém conseguiria dizer, lendo um X1 antigo,
    // de qual dos dois se tratava.
    expect(validateLabel(LISTA, 'ousadia')).toBe('duplicado');
  });

  it('aceita nome novo', () => {
    expect(validateLabel(LISTA, 'Protagonismo')).toBeNull();
  });
});

describe('aposentar e reativar', () => {
  it('aposentar marca a data e NÃO remove da lista', () => {
    const next = retireCitiValue(LISTA, 'v-1', '2026-09-22T12:00:00.000Z');

    expect(next).toHaveLength(3);
    expect(next[0].retiredAt).toBe('2026-09-22T12:00:00.000Z');
  });

  it('reativar devolve o valor à circulação', () => {
    const next = reactivateCitiValue(LISTA, 'v-3');

    expect(next[2].retiredAt).toBeNull();
    expect(activeOnes(next)).toHaveLength(3);
  });

  it('recusa aposentar o último valor em uso', () => {
    // Sem nenhum valor ativo a seção "Valores do CITi" do X1 ficaria vazia, e
    // ninguém pede isso de propósito clicando em "aposentar".
    const soUm: CitiValueSetting[] = [
      { id: 'v-1', label: 'Eu sou o CITi', retiredAt: null },
      { id: 'v-3', label: 'Ousadia', retiredAt: '2026-08-01T00:00:00.000Z' },
    ];

    expect(canRetire(soUm, 'v-1')).toBe('ultimo_ativo');
  });

  it('permite aposentar quando ainda sobra outro ativo', () => {
    expect(canRetire(LISTA, 'v-1')).toBeNull();
  });

  it('não reclama de aposentar quem já está aposentado', () => {
    expect(canRetire(LISTA, 'v-3')).toBeNull();
  });

  it('avisa quando o valor sumiu da lista por baixo dos panos', () => {
    expect(canRetire(LISTA, 'v-inexistente')).toBe('nao_encontrado');
  });
});
