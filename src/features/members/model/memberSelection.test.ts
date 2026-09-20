import { describe, expect, it } from 'vitest';
import {
  headerCheckboxState,
  pruneSelection,
  toggleSelectAll,
  toggleSelection,
} from './memberSelection';

describe('memberSelection', () => {
  it('alterna um id: adiciona quando ausente, remove quando presente', () => {
    let selection = toggleSelection(new Set(), 'a');
    expect([...selection]).toEqual(['a']);

    selection = toggleSelection(selection, 'a');
    expect(selection.size).toBe(0);
  });

  it('toggleSelectAll seleciona todo o recorte visível quando nem tudo está selecionado', () => {
    const selection = toggleSelectAll(new Set(['a']), ['a', 'b', 'c']);
    expect([...selection].sort()).toEqual(['a', 'b', 'c']);
  });

  it('toggleSelectAll limpa quando o recorte inteiro já está selecionado', () => {
    const selection = toggleSelectAll(new Set(['a', 'b', 'c']), ['a', 'b', 'c']);
    expect(selection.size).toBe(0);
  });

  it('toggleSelectAll com recorte vazio não seleciona nada', () => {
    const selection = toggleSelectAll(new Set(), []);
    expect(selection.size).toBe(0);
  });

  it('pruneSelection remove ids que saíram do recorte (filtro mudou)', () => {
    const selection = pruneSelection(new Set(['a', 'b', 'c']), ['a', 'c']);
    expect([...selection].sort()).toEqual(['a', 'c']);
  });

  it('pruneSelection nunca inclui um id que não estava no recorte, mesmo que ele exista em outro lugar', () => {
    const selection = pruneSelection(new Set(['a']), ['a', 'z']);
    // 'z' não estava selecionado antes — prune nunca ADICIONA, só remove.
    expect([...selection]).toEqual(['a']);
  });

  it('headerCheckboxState: nenhum selecionado', () => {
    expect(headerCheckboxState(new Set(), ['a', 'b'])).toBe('none');
  });

  it('headerCheckboxState: alguns do recorte selecionados = indeterminado', () => {
    expect(headerCheckboxState(new Set(['a']), ['a', 'b'])).toBe('some');
  });

  it('headerCheckboxState: todo o recorte selecionado', () => {
    expect(headerCheckboxState(new Set(['a', 'b']), ['a', 'b'])).toBe('all');
  });

  it('headerCheckboxState ignora seleção de ids fora do recorte atual', () => {
    // Selecionado só 'z', que não está no recorte visível — não conta como "some".
    expect(headerCheckboxState(new Set(['z']), ['a', 'b'])).toBe('none');
  });

  it('headerCheckboxState com recorte vazio é sempre "none"', () => {
    expect(headerCheckboxState(new Set(['a']), [])).toBe('none');
  });
});
