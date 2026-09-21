import { describe, expect, it } from 'vitest';
import {
  CHAVES_DO_PAYLOAD,
  emailValido,
  montarPayloadEvento,
  renderizarTitulo,
  type AgendamentoParaEvento,
} from './payload.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A lista branca do que vai ao Google, testada no SERVIDOR.
 *
 * ⚠️ O teste mais importante deste arquivo é o último: ele afirma que o payload
 * tem EXATAMENTE as chaves previstas. É isso que faz uma coluna nova em
 * `x1_appointments` quebrar a suíte em vez de vazar em silêncio para dentro de
 * um convite.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const BASE: AgendamentoParaEvento = {
  id: 'aaaaaaaabbbbccccddddeeeeffff0011',
  starts_at: '2026-09-25T17:00:00.000Z',
  ends_at: '2026-09-25T18:00:00.000Z',
  time_zone: 'America/Recife',
  mode: 'online',
  location: null,
  wants_meet: true,
  shared_agenda: null,
};

const CONVIDADO = { nome: 'Anselmo Ferraz', email: 'anselmo@citi.org.br' };
const TITULO = { template: 'X1 · {membro}' };

describe('payload do evento do Google', () => {
  it('leva título, horário, fuso e o convidado institucional', () => {
    const payload = montarPayloadEvento(BASE, CONVIDADO, TITULO);

    expect(payload?.summary).toBe('X1 · Anselmo Ferraz');
    expect(payload?.start).toEqual({
      dateTime: '2026-09-25T17:00:00.000Z',
      timeZone: 'America/Recife',
    });
    expect(payload?.attendees).toEqual([{ email: 'anselmo@citi.org.br' }]);
  });

  it('a pauta compartilhada vira a descrição; sem pauta, não há descrição', () => {
    const comPauta = montarPayloadEvento(
      { ...BASE, shared_agenda: '  Retrospectiva do trimestre  ' },
      CONVIDADO,
      TITULO,
    );
    expect(comPauta?.description).toBe('Retrospectiva do trimestre');

    const semPauta = montarPayloadEvento({ ...BASE, shared_agenda: '   ' }, CONVIDADO, TITULO);
    // ⚠️ Não é `''`: uma descrição vazia apagaria a que estiver no evento.
    expect(semPauta).not.toHaveProperty('description');
  });

  it('presencial leva o local; online não leva local e pede Meet', () => {
    const presencial = montarPayloadEvento(
      { ...BASE, mode: 'presencial', location: 'Sala 3 — CIn', wants_meet: false },
      CONVIDADO,
      TITULO,
    );
    expect(presencial?.location).toBe('Sala 3 — CIn');
    expect(presencial).not.toHaveProperty('conferenceRequestId');

    const online = montarPayloadEvento(BASE, CONVIDADO, TITULO);
    expect(online).not.toHaveProperty('location');
    // Determinístico: repetir o pedido não gera uma segunda sala.
    expect(online?.conferenceRequestId).toBe(`citi-meet-${BASE.id}`);
  });

  it('online sem pedido de Meet não pede conferência', () => {
    const payload = montarPayloadEvento({ ...BASE, wants_meet: false }, CONVIDADO, TITULO);
    expect(payload).not.toHaveProperty('conferenceRequestId');
  });

  it('⚠️ sem instante não há convite — é o legado "horário a definir"', () => {
    const payload = montarPayloadEvento(
      { ...BASE, starts_at: null, ends_at: null },
      CONVIDADO,
      TITULO,
    );
    expect(payload).toBeNull();
  });

  it('o título usa a gestão quando ela existe, e não deixa rabo quando não', () => {
    expect(
      renderizarTitulo('X1 · {membro} · {gestao}', { membro: 'Ana', gestao: '2026.2' }),
    ).toBe('X1 · Ana · 2026.2');

    // Sem gestão, o separador solto some.
    expect(renderizarTitulo('X1 · {membro} · {gestao}', { membro: 'Ana', gestao: null })).toBe(
      'X1 · Ana',
    );
  });

  it('e-mail sem arroba, vazio ou nulo não passa', () => {
    expect(emailValido('anselmo@citi.org.br')).toBe(true);
    expect(emailValido('sem-arroba')).toBe(false);
    expect(emailValido('')).toBe(false);
    expect(emailValido(null)).toBe(false);
    expect(emailValido('duas@arrobas@citi.org.br')).toBe(false);
  });

  it('⚠️ O TESTE QUE IMPORTA: o payload tem exatamente as chaves da lista branca', () => {
    // Uma linha com TODOS os campos sensíveis preenchidos, inclusive os que
    // nem fazem parte do tipo — é assim que uma coluna nova entraria.
    const contaminada = {
      ...BASE,
      mode: 'presencial' as const,
      location: 'Sala 3 — CIn',
      shared_agenda: 'Retrospectiva',
      internal_notes: 'ELA-ESTA-EM-PROCESSO-DE-DESLIGAMENTO',
      cancellation_reason: 'MOTIVO-QUE-NAO-PODE-SAIR',
      summary_da_conversa: 'RESUMO-INTERNO',
      citi_values: ['NOTA-DE-VALORES'],
    } as unknown as AgendamentoParaEvento;

    const payload = montarPayloadEvento(contaminada, CONVIDADO, TITULO);
    expect(payload).not.toBeNull();

    // Exatamente estas chaves, e nenhuma outra.
    for (const chave of Object.keys(payload!)) {
      expect(CHAVES_DO_PAYLOAD).toContain(chave);
    }

    // E, serializado, nada do que é interno aparece em lugar nenhum.
    const serializado = JSON.stringify(payload);
    expect(serializado).not.toContain('DESLIGAMENTO');
    expect(serializado).not.toContain('MOTIVO-QUE-NAO-PODE-SAIR');
    expect(serializado).not.toContain('RESUMO-INTERNO');
    expect(serializado).not.toContain('NOTA-DE-VALORES');
    expect(serializado).not.toContain('internal_notes');
  });
});
