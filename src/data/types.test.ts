import { describe, expect, it } from 'vitest';
import {
  cargoOptionsForSubarea,
  DIRETORIA_CARGOS,
  getMemberArea,
  isDiretoriaCargo,
  memberSubareaLabel,
} from './types';

/**
 * Testes do modelo Diretoria × Área × Subárea (ADR-018).
 *
 * A regra de produto que este arquivo protege: Diretoria dirige uma ÁREA
 * inteira e não integra nenhuma subárea. Se um destes quebrar, a plataforma
 * volta a tratar Diretoria como se fosse mais uma opção de subárea — o erro
 * que a própria ADR-018 corrigiu.
 */

describe('cargoOptionsForSubarea', () => {
  it('não oferece mais nenhum cargo de Diretoria como opção de subárea', () => {
    for (const cargo of DIRETORIA_CARGOS) {
      expect(cargoOptionsForSubarea('Gente e Gestão')).not.toContain(cargo);
      expect(cargoOptionsForSubarea('Desenvolvimento')).not.toContain(cargo);
    }
  });
});

describe('isDiretoriaCargo', () => {
  it('reconhece os quatro cargos de Diretoria', () => {
    for (const cargo of DIRETORIA_CARGOS) {
      expect(isDiretoriaCargo(cargo)).toBe(true);
    }
  });

  it('não reconhece um cargo comum como Diretoria', () => {
    expect(isDiretoriaCargo('Pessoa Desenvolvedora')).toBe(false);
  });
});

describe('getMemberArea', () => {
  it('deriva a área a partir da subárea, para quem integra uma subárea', () => {
    expect(getMemberArea({ subarea: 'Desenvolvimento', diretoriaArea: null })).toBe('Soluções');
  });

  it('usa `diretoriaArea` direto para quem é da Diretoria (sem subárea)', () => {
    expect(getMemberArea({ subarea: null, diretoriaArea: 'Negócios' })).toBe('Negócios');
  });

  it('devolve null quando não há nem subárea nem área de Diretoria', () => {
    expect(getMemberArea({ subarea: null, diretoriaArea: null })).toBeNull();
  });
});

describe('memberSubareaLabel', () => {
  it('mostra a subárea, para quem integra uma', () => {
    expect(memberSubareaLabel({ subarea: 'Marketing', diretoriaArea: null })).toBe('Marketing');
  });

  it('mostra "Diretoria (Área)" para quem não tem subárea', () => {
    expect(memberSubareaLabel({ subarea: null, diretoriaArea: 'Institucional' })).toBe(
      'Diretoria (Institucional)',
    );
  });

  it('mostra um traço quando não há nem subárea nem área de Diretoria', () => {
    expect(memberSubareaLabel({ subarea: null, diretoriaArea: null })).toBe('—');
  });
});
