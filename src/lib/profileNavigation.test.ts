import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/app/routes';
import { memberProfileLinkFrom, resolveProfileBackLink } from './profileNavigation';

describe('memberProfileLinkFrom', () => {
  it('marca a origem feedbacks e preserva a query de retorno', () => {
    const link = memberProfileLinkFrom('mbr-1', 'feedbacks', 'busca=iris&tipo=formal');
    expect(link).toBe('/membros/mbr-1?origem=feedbacks&retorno=busca%3Diris%26tipo%3Dformal');
  });

  it('sem query de retorno, só marca a origem', () => {
    const link = memberProfileLinkFrom('mbr-1', 'feedbacks');
    expect(link).toBe('/membros/mbr-1?origem=feedbacks');
  });

  it('origem membros também é aceita explicitamente', () => {
    const link = memberProfileLinkFrom('mbr-1', 'membros');
    expect(link).toBe('/membros/mbr-1?origem=membros');
  });
});

describe('resolveProfileBackLink', () => {
  it('origem feedbacks volta para Feedbacks preservando o retorno', () => {
    expect(resolveProfileBackLink('feedbacks', 'busca=iris&tipo=formal')).toEqual({
      to: `${ROUTES.feedbacks}?busca=iris&tipo=formal`,
      label: 'Voltar para Feedbacks',
    });
  });

  it('origem feedbacks sem retorno volta para Feedbacks sem query', () => {
    expect(resolveProfileBackLink('feedbacks', null)).toEqual({
      to: ROUTES.feedbacks,
      label: 'Voltar para Feedbacks',
    });
  });

  it('origem membros ignora um retorno eventual — Membros não usa esse recurso', () => {
    expect(resolveProfileBackLink('membros', 'busca=iris')).toEqual({
      to: ROUTES.members,
      label: 'Voltar para Membros',
    });
  });

  it('⚠️ acesso direto por URL (sem origem) cai no fallback Membros', () => {
    expect(resolveProfileBackLink(null, null)).toEqual({
      to: ROUTES.members,
      label: 'Voltar para Membros',
    });
  });

  it('⚠️ origem desconhecida/inválida cai no fallback seguro, nunca é usada como caminho', () => {
    expect(resolveProfileBackLink('qualquer-coisa', null)).toEqual({
      to: ROUTES.members,
      label: 'Voltar para Membros',
    });
  });

  it('⚠️ retorno não pode virar caminho — vira só query da origem já fixada', () => {
    // Mesmo um `retorno` que pareça um caminho nunca troca o `to`: ele é sempre
    // "ROUTES.feedbacks + ? + retorno", nunca o `retorno` sozinho.
    const resultado = resolveProfileBackLink('feedbacks', '../../evil.example');
    expect(resultado.to).toBe(`${ROUTES.feedbacks}?../../evil.example`);
    expect(resultado.to.startsWith(ROUTES.feedbacks)).toBe(true);
  });
});
