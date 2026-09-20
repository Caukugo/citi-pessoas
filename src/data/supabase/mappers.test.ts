import { describe, expect, it } from 'vitest';
import { MEMBER_STATUS_LABEL } from '../types';
import { fromMemberRow } from './mappers';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `arquivado` NÃO tem mais ação nem filtro na interface (a opção "Arquivados"
 * foi removida de `MembersToolbar.tsx`/`useMembersFilters.ts`), mas o valor
 * continua existindo no banco e no tipo — histórico é preservado, nunca
 * apagado (CLAUDE.md §4/§13). Isto prova que a camada de dados ainda lê um
 * registro legado com esse status sem quebrar, mesmo sem nenhum caminho de
 * ESCRITA para ele na tela.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function minimalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mbr-legado',
    full_name: 'Fixture Legado Arquivado',
    email: 'fixture.legado.arquivado@teste.invalid',
    personal_email: null,
    phone: null,
    photo_url: null,
    photo_path: null,
    role: 'Analista',
    area: 'Gente e Gestão',
    squad: null,
    area_id: null,
    subarea_id: null,
    position_id: null,
    manager_id: null,
    gg_responsible_id: null,
    course: null,
    semester: null,
    university: null,
    department: null,
    campus: null,
    status: 'arquivado',
    joined_at: '2020-01-01',
    exited_at: null,
    birth_date: null,
    notes: null,
    created_at: '2020-01-01T00:00:00.000Z',
    updated_at: '2020-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('fromMemberRow — leitura de status legado (arquivado)', () => {
  it('mapeia uma linha com status arquivado sem lançar erro', () => {
    expect(() => fromMemberRow(minimalRow())).not.toThrow();
  });

  it('preserva o status arquivado no objeto de domínio, sem convertê-lo', () => {
    const member = fromMemberRow(minimalRow());
    expect(member.status).toBe('arquivado');
  });

  it('MEMBER_STATUS_LABEL ainda sabe rotular arquivado, para quem precisar exibir histórico', () => {
    expect(MEMBER_STATUS_LABEL.arquivado).toBe('Arquivado');
  });

  it('os três status ativos na interface continuam distintos entre si e de arquivado', () => {
    const rotulos = [
      MEMBER_STATUS_LABEL.ativo,
      MEMBER_STATUS_LABEL.inativo,
      MEMBER_STATUS_LABEL.desligado,
      MEMBER_STATUS_LABEL.arquivado,
    ];
    expect(new Set(rotulos).size).toBe(4);
  });
});
