import { describe, expect, it } from 'vitest';
import {
  addDaysISO,
  addMonthsISO,
  currentCycleAfterRoster,
  isCycleExpired,
  planRosterContinuation,
} from './currentRoster';

/**
 * Testes da regra da BASE ATUAL.
 *
 * Nenhum depende do dia de hoje: a data de referência é sempre explícita. E
 * nenhum lê 12 ou 6 de uma constante daqui — os meses chegam por parâmetro,
 * como chegam do cadastro do cargo, porque é exatamente isso que a regra
 * promete: quem decide é `positions.continuation_months`.
 *
 * O espelho desta regra no banco é `citi_continue_roster_cycles` (migration
 * 0015), testado em `supabase/tests/0005_current_roster.sql`.
 */

/** Entrada em 2025.1: ciclo de 01/01/2025 a 31/12/2025. */
const CICLO_2025_1 = { startedOn: '2025-01-01', expectedEndOn: '2025-12-31' };

/** Entrada em 2026.2: ciclo de 01/07/2026 a 30/06/2027. */
const CICLO_2026_2 = { startedOn: '2026-07-01', expectedEndOn: '2027-06-30' };

const DIRETORIA = 12;
const DEMAIS = 6;

// ═══════════════════════════════════════════════════════════════════════════
describe('quando o ciclo ainda está vigente', () => {
  it('não acrescenta ciclo nenhum', () => {
    expect(planRosterContinuation(CICLO_2026_2, DEMAIS, '2026-09-17')).toBeNull();
  });

  it('considera o ciclo vigente durante TODO o último dia', () => {
    // 30/06/2027 é o fim previsto: nesse dia a pessoa ainda está dentro dele.
    expect(planRosterContinuation(CICLO_2026_2, DEMAIS, '2027-06-30')).toBeNull();
    // Só no dia seguinte é que venceu.
    expect(planRosterContinuation(CICLO_2026_2, DEMAIS, '2027-07-01')).not.toBeNull();
  });

  it('o ciclo vigente continua sendo o inicial', () => {
    expect(currentCycleAfterRoster(CICLO_2026_2, null)).toEqual(CICLO_2026_2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('quando o ciclo já venceu', () => {
  it('diretoria recebe blocos de 12 meses', () => {
    const continuacao = planRosterContinuation(CICLO_2025_1, DIRETORIA, '2027-06-01');

    expect(continuacao?.cyclesAdded).toBe(2);
    expect(continuacao?.monthsPerBlock).toEqual([12, 12]);
    expect(continuacao?.blocks).toEqual([
      { startedOn: '2026-01-01', expectedEndOn: '2026-12-31', months: 12 },
      { startedOn: '2027-01-01', expectedEndOn: '2027-12-31', months: 12 },
    ]);
    expect(continuacao?.originalEndOn).toBe('2025-12-31');
    expect(continuacao?.finalEndOn).toBe('2027-12-31');
  });

  it('cargo não diretivo recebe blocos de 6 meses', () => {
    // Mesma entrada, mesma data de referência: o que muda é só o cargo.
    const continuacao = planRosterContinuation(CICLO_2025_1, DEMAIS, '2027-06-01');

    expect(continuacao?.cyclesAdded).toBe(3);
    expect(continuacao?.monthsPerBlock).toEqual([6, 6, 6]);
    expect(continuacao?.finalEndOn).toBe('2027-06-30');
  });

  it('ciclo antigo vira vários blocos contíguos até a data de referência', () => {
    const continuacao = planRosterContinuation(CICLO_2025_1, DEMAIS, '2029-03-01');

    expect(continuacao?.cyclesAdded).toBe(7);
    expect(continuacao?.finalEndOn).toBe('2029-06-30');

    // CONTÍGUOS: cada bloco começa no dia seguinte ao fim do anterior. Um dia
    // de buraco seria um dia em que a pessoa não estava no CITi — e ela estava.
    let fimAnterior = continuacao!.originalEndOn;
    for (const bloco of continuacao!.blocks) {
      expect(bloco.startedOn).toBe(addDaysISO(fimAnterior, 1));
      fimAnterior = bloco.expectedEndOn;
    }
  });

  it('para no primeiro bloco que alcança a data de referência', () => {
    // Não vai além: a base atual reconstrói até hoje, não até o fim dos tempos.
    const continuacao = planRosterContinuation(CICLO_2025_1, DEMAIS, '2026-01-01');

    expect(continuacao?.cyclesAdded).toBe(1);
    expect(continuacao?.finalEndOn).toBe('2026-06-30');
  });

  it('o ciclo vigente passa a ser o último bloco', () => {
    const continuacao = planRosterContinuation(CICLO_2025_1, DEMAIS, '2026-09-17');

    expect(currentCycleAfterRoster(CICLO_2025_1, continuacao)).toEqual({
      startedOn: '2026-07-01',
      expectedEndOn: '2026-12-31',
    });
  });

  it('recusa um cargo sem meses de continuação em vez de girar sem parar', () => {
    expect(() => planRosterContinuation(CICLO_2025_1, 0, '2026-09-17')).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('aritmética de datas', () => {
  it('soma meses como o Postgres: não transborda para o mês seguinte', () => {
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsISO('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsISO('2026-01-01', 6)).toBe('2026-07-01');
    expect(addMonthsISO('2026-07-01', 12)).toBe('2027-07-01');
  });

  it('atravessa a virada do ano', () => {
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysISO('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('só considera vencido depois do último dia', () => {
    expect(isCycleExpired('2026-12-31', '2026-12-31')).toBe(false);
    expect(isCycleExpired('2026-12-31', '2027-01-01')).toBe(true);
  });
});
