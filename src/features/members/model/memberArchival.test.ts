import { describe, expect, it } from 'vitest';
import type { Gestao } from '@/data';
import { computeMemberArchivalEligibility } from './memberArchival';

/**
 * Espelha, em TypeScript, os mesmos cenários provados em
 * `supabase/tests/0018_retencao_e_arquivamento_membros.sql` contra
 * `citi_member_archival_eligibility`. As duas implementações precisam
 * concordar — é o que garante paridade mock/Supabase.
 */

const GESTAO_G1: Gestao = { id: 'g1', name: '2020.1', startDate: '2020-01-01', endDate: '2020-06-30', status: 'finalizada' };
const GESTAO_G2: Gestao = { id: 'g2', name: '2020.2', startDate: '2020-07-01', endDate: '2020-12-31', status: 'finalizada' };

describe('computeMemberArchivalEligibility', () => {
  it('desligado: NÃO elegível antes do fim previsto do ciclo interrompido', () => {
    const r = computeMemberArchivalEligibility({
      status: 'desligado',
      cycleEndType: 'desligamento',
      cycleExpectedEndOn: '2020-12-31',
      gestoes: [GESTAO_G1, GESTAO_G2],
      referenceDate: '2020-12-01',
    });
    expect(r.elegivel).toBe(false);
    expect(r.motivoBloqueio).toBe('ciclo_interrompido_ainda_nao_expirou');
  });

  it('desligado: elegível depois do fim previsto do ciclo interrompido', () => {
    const r = computeMemberArchivalEligibility({
      status: 'desligado',
      cycleEndType: 'desligamento',
      cycleExpectedEndOn: '2020-12-31',
      gestoes: [GESTAO_G1, GESTAO_G2],
      referenceDate: '2021-01-01',
    });
    expect(r).toEqual({ elegivel: true, criterio: 'desligamento_antecipado_ciclo_expirado', motivoBloqueio: null });
  });

  it('conclusão normal: permanece visível durante a gestão seguinte', () => {
    const r = computeMemberArchivalEligibility({
      status: 'inativo',
      cycleEndType: 'conclusao_natural',
      cycleExpectedEndOn: '2020-06-30', // cai dentro de G1; G2 é a "seguinte"
      gestoes: [GESTAO_G1, GESTAO_G2],
      referenceDate: '2020-09-01', // dentro de G2
    });
    expect(r.elegivel).toBe(false);
    expect(r.motivoBloqueio).toBe('aguardando_fim_da_gestao_seguinte');
  });

  it('conclusão normal: elegível depois do fim da gestão seguinte', () => {
    const r = computeMemberArchivalEligibility({
      status: 'inativo',
      cycleEndType: 'conclusao_natural',
      cycleExpectedEndOn: '2020-06-30',
      gestoes: [GESTAO_G1, GESTAO_G2],
      referenceDate: '2021-01-01', // depois do fim de G2 (2020-12-31)
    });
    expect(r).toEqual({ elegivel: true, criterio: 'conclusao_normal_pos_gestao_seguinte', motivoBloqueio: null });
  });

  it('conclusão normal sem gestão seguinte cadastrada: fallback de 12 meses ainda não vencido', () => {
    const r = computeMemberArchivalEligibility({
      status: 'inativo',
      cycleEndType: 'conclusao_natural',
      cycleExpectedEndOn: '2020-12-31', // não tem gestão depois de G2
      gestoes: [GESTAO_G1, GESTAO_G2],
      referenceDate: '2021-06-01',
    });
    expect(r.elegivel).toBe(false);
    expect(r.motivoBloqueio).toBe('aguardando_fallback_12_meses');
  });

  it('conclusão normal sem gestão seguinte cadastrada: elegível após o fallback de 12 meses', () => {
    const r = computeMemberArchivalEligibility({
      status: 'inativo',
      cycleEndType: 'conclusao_natural',
      cycleExpectedEndOn: '2020-12-31',
      gestoes: [GESTAO_G1, GESTAO_G2],
      referenceDate: '2022-01-02',
    });
    expect(r).toEqual({ elegivel: true, criterio: 'conclusao_normal_fallback_12_meses', motivoBloqueio: null });
  });

  it('já arquivado nunca é elegível de novo', () => {
    const r = computeMemberArchivalEligibility({
      status: 'arquivado',
      cycleEndType: 'desligamento',
      cycleExpectedEndOn: '2019-06-30',
      gestoes: [],
      referenceDate: '2030-01-01',
    });
    expect(r.elegivel).toBe(false);
    expect(r.motivoBloqueio).toBe('ja_arquivado');
  });

  it('ativo nunca é elegível', () => {
    const r = computeMemberArchivalEligibility({
      status: 'ativo',
      cycleEndType: null,
      cycleExpectedEndOn: null,
      gestoes: [],
      referenceDate: '2030-01-01',
    });
    expect(r.elegivel).toBe(false);
    expect(r.motivoBloqueio).toBe('status_nao_elegivel:ativo');
  });

  it('sem ciclo encerrado coerente: bloqueia para revisão manual em vez de inventar', () => {
    const r = computeMemberArchivalEligibility({
      status: 'desligado',
      cycleEndType: null,
      cycleExpectedEndOn: null,
      gestoes: [],
      referenceDate: '2030-01-01',
    });
    expect(r.elegivel).toBe(false);
    expect(r.motivoBloqueio).toBe('sem_ciclo_encerrado_coerente');
  });
});
