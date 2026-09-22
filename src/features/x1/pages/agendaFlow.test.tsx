import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { resetMockData } from '@/data/mock/store';
import { Providers } from '@/app/providers';
import { AppRouter } from '@/app/router';
import { ROUTES } from '@/app/routes';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Teste do fluxo da Agenda de X1, ponta a ponta, sobre o adapter mock.
 *
 * O que este arquivo protege NÃO é a marcação da tela. São as garantias que a
 * agenda inteira existe para sustentar:
 *
 *   • agendar NÃO tira ninguém do bloco de pendências;
 *   • registrar a conversa tira;
 *   • o recorte vive na URL e sobrevive a uma recarga;
 *   • o compromisso de outra pessoa de GG não é editável por aqui.
 *
 * NOTA SOBRE O TEMPO: o adapter mock simula latência em toda chamada, de
 * propósito, para que os estados de carregamento existam de verdade. Fluxos
 * completos somam vários desses, então declaram tempo limite maior que o
 * padrão de 5s do Vitest. É lentidão esperada, não teste instável.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const TIMEOUT = 30_000;

async function signIn(user: ReturnType<typeof userEvent.setup>, entry = ROUTES.login) {
  render(
    <MemoryRouter initialEntries={[entry === ROUTES.login ? ROUTES.login : ROUTES.login]}>
      <Providers>
        <AppRouter />
      </Providers>
    </MemoryRouter>,
  );

  await user.type(await screen.findByLabelText(/usuário/i), 'gg@citi.org.br{Enter}');
  await user.type(await screen.findByLabelText(/senha/i), 'citi123{Enter}');
  await screen.findByRole('heading', { name: 'Membros' });
}

/** Login e navegação até a agenda pelo menu lateral. */
async function openAgenda(user: ReturnType<typeof userEvent.setup>) {
  await signIn(user);

  // A barra lateral aparece duas vezes no jsdom (desktop + gaveta do celular),
  // porque o CSS que esconde uma delas não é aplicado. Basta a primeira.
  const [x1Link] = await screen.findAllByRole('link', { name: 'X1' });
  await user.click(x1Link);

  await screen.findByRole('heading', { level: 1, name: 'Agenda de X1' });
}

/** A data de daqui a N dias, no mesmo formato das fixtures (`yyyy-MM-dd`). */
function addDays(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Clica no dia do calendário correspondente à data informada. */
async function selectDay(user: ReturnType<typeof userEvent.setup>, day: string) {
  const grid = await screen.findByRole('grid', { name: /calendário de x1/i });
  const [ano, mes, dia] = day.split('-').map(Number);

  const alvo = within(grid)
    .getAllByRole('gridcell')
    .find((celula) => {
      const rotulo = celula.getAttribute('aria-label') ?? '';
      // O rótulo é "23 de setembro de 2026, N X1 marcados".
      return rotulo.startsWith(`${dia} de `) && rotulo.includes(String(ano));
    });

  if (!alvo) throw new Error(`Dia ${day} não está visível na grade (mês ${mes}).`);
  await user.click(alvo);
}

beforeEach(() => {
  localStorage.clear();
  resetMockData();

  /*
    ⚠️ O RELÓGIO É CONGELADO às 08:00 de hoje, e isso não é zelo excessivo.

    As fixtures põem dois X1 hoje, às 14:00 e às 16:00. Sem congelar, a suíte
    passava de manhã e falhava depois das 16:45 — quando os dois compromissos
    já terminaram e ninguém mais tem "próximo X1". Um teste que depende da hora
    em que roda é pior do que nenhum: ele ensina o time a ignorar o vermelho.

    `shouldAdvanceTime` mantém os `setTimeout` funcionando, que é o que a
    latência simulada do adapter mock usa.
  */
  const hoje08h = new Date();
  hoje08h.setHours(8, 0, 0, 0);
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(hoje08h);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Agenda de X1', () => {
  it(
    'abre com o dia de hoje e mostra os compromissos do dia',
    async () => {
      const user = userEvent.setup();
      await openAgenda(user);

      // As fixtures põem dois X1 hoje: Bernadete às 14h e Edmundo às 16h.
      //
      // A consulta é pelo botão de detalhes, e não pelo nome: o nome aparece
      // DE PROPÓSITO em dois lugares — na lista do dia e nas pendências —
      // porque ter compromisso marcado não tira ninguém da fila de atraso.
      expect(
        await screen.findByRole('button', { name: /abrir detalhes do x1 com bernadete/i }),
      ).toBeVisible();
      expect(
        await screen.findByRole('button', { name: /abrir detalhes do x1 com edmundo/i }),
      ).toBeVisible();
    },
    TIMEOUT,
  );

  it(
    'o calendário marca hoje e a seleção de dia é anunciada para leitores de tela',
    async () => {
      const user = userEvent.setup();
      await openAgenda(user);

      const grid = within(await screen.findByRole('grid', { name: /calendário de x1/i }));
      const hoje = grid.getByRole('gridcell', { current: 'date' });

      // Um dia com compromisso precisa DIZER quantos tem — o pontinho colorido
      // sozinho não serve para quem não enxerga a cor.
      expect(hoje).toHaveAttribute('aria-label', expect.stringMatching(/X1 marcado/));
      expect(hoje).toHaveAttribute('aria-pressed', 'true');
    },
    TIMEOUT,
  );

  it(
    '⚠️ o legado sem horário diz "horário a definir" — não inventa uma hora',
    async () => {
      const user = userEvent.setup();
      await openAgenda(user);

      // `apt-legado-x1-003` veio do X1 antigo do Tarcísio: tem data daqui a 4
      // dias e NENHUMA hora. A migration 0026 faz o mesmo com os registros
      // reais, e a tela precisa dizer isso em vez de mostrar "00:00".
      await selectDay(user, addDays(4));

      const cartao = await screen.findByRole('button', {
        name: /abrir detalhes do x1 com tarcísio/i,
      });

      expect(within(cartao).getByText('Horário a definir')).toBeVisible();
      // E NENHUM horário de parede aparece — nem "00:00".
      expect(cartao.textContent).not.toMatch(/\d{2}:\d{2}/);
    },
    TIMEOUT,
  );

  it(
    '⚠️ agendar NÃO tira ninguém das pendências — só registrar a conversa tira',
    async () => {
      const user = userEvent.setup();
      await openAgenda(user);

      // Edmundo está atrasado nas fixtures e JÁ tem compromisso marcado para
      // hoje. Se ter agendamento "resolvesse" a pendência, ele não estaria
      // nesta tabela — e a plataforma estaria dizendo que marcar reunião é a
      // mesma coisa que conversar.
      const tabela = within(await screen.findByRole('table'));
      const linha = tabela.getByRole('row', { name: /Edmundo Vilanova/i });

      expect(within(linha).getByText(/X1 atrasado/i)).toBeVisible();
      // E a coluna mostra o agendamento, deixando claro que uma coisa não
      // resolve a outra.
      expect(within(linha).getByText(/\d{2}\/\d{2}\/\d{4}/)).toBeVisible();
    },
    TIMEOUT,
  );

  it(
    '⚠️ "Meus x1" mostra o que EU organizo; "Toda GG" mostra o resto também',
    async () => {
      const user = userEvent.setup();
      await openAgenda(user);

      // `apt-003` é organizado pelo Otávio (outro GG), daqui a 2 dias.
      await selectDay(user, addDays(2));

      // Em "Meus x1" ele não está: quem organiza é outra pessoa.
      expect(
        screen.queryByRole('button', { name: /abrir detalhes do x1 com íris/i }),
      ).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Toda GG' }));

      // Em "Toda GG" ele aparece — e diz de quem é.
      const cartao = await screen.findByRole('button', {
        name: /abrir detalhes do x1 com íris/i,
      });
      expect(cartao).toBeVisible();
      expect(cartao.textContent).toMatch(/X1 com/);
    },
    TIMEOUT,
  );

  it(
    '⚠️ o filtro de organizador fica desabilitado dentro de "Meus x1"',
    async () => {
      const user = userEvent.setup();
      await openAgenda(user);

      // Combinar "Meus x1" com "organizador = outra pessoa" produziria um
      // recorte vazio sem motivo aparente. A tela impede em vez de explicar
      // depois.
      const select = await screen.findByLabelText(/filtrar por organizador/i);
      expect(select).toBeDisabled();

      await user.click(screen.getByRole('button', { name: 'Toda GG' }));
      await waitFor(() => expect(select).not.toBeDisabled());
    },
    TIMEOUT,
  );

  it(
    'abre os detalhes de um compromisso e mostra organizador e GG responsável separados',
    async () => {
      const user = userEvent.setup();
      await openAgenda(user);

      await user.click(
        await screen.findByRole('button', { name: /abrir detalhes do x1 com bernadete/i }),
      );

      const dialog = within(await screen.findByRole('dialog'));
      expect(dialog.getByText('Organiza o convite')).toBeVisible();
      // Papéis distintos, ditos com todas as letras.
      expect(dialog.getByText('GG responsável pelo membro')).toBeVisible();
    },
    TIMEOUT,
  );

  it(
    'agendar pelo Perfil abre a gaveta com o membro já escolhido',
    async () => {
      const user = userEvent.setup();
      await signIn(user);

      // Perfil da Helena → "Agendar X1" → cai na agenda com ela preenchida.
      const tabela = within(await screen.findByRole('table'));
      await user.click(await tabela.findByText('Helena Vasconcelos'));
      await screen.findByRole('heading', { level: 1, name: 'Helena Vasconcelos' });

      await user.click(screen.getByRole('button', { name: 'Agendar X1' }));

      const gaveta = within(await screen.findByRole('dialog'));
      const membro = await gaveta.findByLabelText(/membro/i);
      await waitFor(() => expect(membro).toHaveValue('Helena Vasconcelos'));
    },
    TIMEOUT,
  );

  it(
    '⚠️ a anotação interna aparece marcada como interna, e nunca como pauta',
    async () => {
      const user = userEvent.setup();
      await openAgenda(user);

      await user.click(
        await screen.findByRole('button', { name: /abrir detalhes do x1 com bernadete/i }),
      );

      const dialog = within(await screen.findByRole('dialog'));
      expect(dialog.getByText('Anotação interna')).toBeVisible();
      expect(
        dialog.getByText(/Não foi enviada ao Google nem ao membro/i),
      ).toBeVisible();
    },
    TIMEOUT,
  );
});
