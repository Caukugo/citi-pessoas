import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { resetMockData } from '@/data/mock/store';
import { mockAdapter } from '@/data/mock/mockAdapter';
import { DataError } from '@/data/errors';
import { Providers } from '@/app/providers';
import { AppRouter } from '@/app/router';
import { ROUTES } from '@/app/routes';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EDITAR E EXCLUIR um feedback, pela aba do Perfil (FB-005).
 *
 * O QUE ESTE TESTE PROTEGE são regras de produto, não marcação:
 *
 *   1. Excluir PEDE CONFIRMAÇÃO. O clique na lista abre o diálogo e mais nada:
 *      nenhuma requisição sai antes de alguém confirmar. Escape e "Cancelar"
 *      voltam sem tocar em dado nenhum.
 *   2. A exclusão atinge SÓ o registro escolhido. Os outros da mesma pessoa —
 *      inclusive os do mesmo tipo — continuam inteiros.
 *   3. Editar CORRIGE o registro; não cria um segundo. O total não sobe.
 *   4. Contagens e recorte por tipo derivam do histórico: excluir e editar
 *      atualizam os chips sem ninguém gravar contador.
 *
 * Íris Cavalcanti é a pessoa usada porque é a única das fixtures com vários
 * registros do MESMO tipo — três informais e uma carta. É o caso em que apagar
 * "o feedback errado" é fácil, e por isso é o caso que precisa de teste.
 *
 * NOTA SOBRE O TEMPO: o adapter mock simula latência em toda chamada; um fluxo
 * que navega, abre gaveta e grava soma vários desses. A lentidão é esperada.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const TIMEOUT = 30_000;

/** Entra, vai até o Perfil da Íris e abre a aba de Feedbacks. */
async function abrirFeedbacksDoPerfil(user: ReturnType<typeof userEvent.setup>) {
  render(
    <MemoryRouter initialEntries={[ROUTES.login]}>
      <Providers>
        <AppRouter />
      </Providers>
    </MemoryRouter>,
  );

  await user.type(await screen.findByLabelText(/usuário/i), 'gg@citi.org.br{Enter}');
  await user.type(await screen.findByLabelText(/senha/i), 'citi123{Enter}');

  await screen.findByRole('heading', { name: 'Membros' });
  await user.click(screen.getByRole('link', { name: /feedbacks/i }));
  await screen.findByRole('heading', { level: 1, name: 'Feedbacks' });

  const table = within(await screen.findByRole('table'));
  await user.click(await table.findByText('Íris Cavalcanti'));
  await screen.findByRole('heading', { level: 1, name: 'Íris Cavalcanti' });
  await user.click(screen.getByRole('tab', { name: /feedbacks/i }));
}

/** O `<li>` do histórico que contém este texto. */
async function registroCom(trecho: RegExp) {
  const texto = await screen.findByText(trecho);
  return within(texto.closest('li') as HTMLElement);
}

beforeEach(() => {
  localStorage.clear();
  resetMockData();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Perfil → Feedbacks → Excluir', () => {
  it(
    'o clique em Excluir apenas abre a confirmação, e Escape volta sem apagar',
    async () => {
      const user = userEvent.setup();
      await abrirFeedbacksDoPerfil(user);

      const registro = await registroCom(/Ausências recorrentes nas cerimônias/i);
      await user.click(registro.getByRole('button', { name: /^excluir feedback/i }));

      // Primeiro clique: diálogo aberto, registro intacto.
      const dialog = within(await screen.findByRole('dialog'));
      expect(dialog.getByRole('heading', { name: 'Excluir feedback?' })).toBeVisible();
      expect(dialog.getByText(/deseja excluir este feedback de/i)).toBeVisible();
      // O resumo identifica O QUE some: tipo, data e um trecho do conteúdo.
      expect(dialog.getByText('Informal')).toBeVisible();
      expect(dialog.getByText(/Ausências recorrentes nas cerimônias/i)).toBeVisible();

      // O foco começa na saída segura, não no botão que apaga.
      await waitFor(() =>
        expect(dialog.getByRole('button', { name: 'Cancelar' })).toHaveFocus(),
      );

      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

      // Nada foi excluído: o registro continua no histórico.
      expect(await screen.findByText(/Ausências recorrentes nas cerimônias/i)).toBeVisible();
      expect(screen.getByRole('button', { name: /^todos 4$/i })).toBeVisible();
    },
    TIMEOUT,
  );

  it(
    'Cancelar fecha sem excluir; confirmar apaga só o registro escolhido',
    async () => {
      const user = userEvent.setup();
      await abrirFeedbacksDoPerfil(user);

      const registro = await registroCom(/Ausências recorrentes nas cerimônias/i);
      await user.click(registro.getByRole('button', { name: /^excluir feedback/i }));

      let dialog = within(await screen.findByRole('dialog'));
      await user.click(dialog.getByRole('button', { name: 'Cancelar' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(await screen.findByText(/Ausências recorrentes nas cerimônias/i)).toBeVisible();

      // Agora sim, a confirmação explícita.
      await user.click(
        (await registroCom(/Ausências recorrentes nas cerimônias/i)).getByRole('button', {
          name: /^excluir feedback/i,
        }),
      );
      dialog = within(await screen.findByRole('dialog'));
      await user.click(dialog.getByRole('button', { name: 'Excluir feedback' }));

      await waitFor(
        () => expect(screen.queryByText(/Ausências recorrentes nas cerimônias/i)).toBeNull(),
        { timeout: 10_000 },
      );

      // Os outros registros da mesma pessoa continuam — inclusive os do MESMO
      // tipo, que é onde um "excluir todos do tipo" passaria despercebido.
      expect(screen.getByText(/Retomou a presença nas dailies/i)).toBeVisible();
      expect(screen.getByText(/Combinado que avisaria a squad/i)).toBeVisible();
      expect(screen.getByText(/Carta de ajuste registrada após conversa/i)).toBeVisible();

      // E as contagens acompanham, sem ninguém gravar contador.
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /^todos 3$/i })).toBeVisible(),
      );
      expect(screen.getByRole('button', { name: /^informais 2$/i })).toBeVisible();
    },
    TIMEOUT,
  );

  it(
    'falha na exclusão preserva o registro, mostra o erro e deixa tentar de novo',
    async () => {
      const user = userEvent.setup();
      // A recusa que a RLS produz no Postgres quando quem clicou não é GG.
      const recusa = vi
        .spyOn(mockAdapter.feedbacks, 'remove')
        .mockRejectedValue(new DataError('unauthorized', 'Você não pode excluir este feedback.'));

      await abrirFeedbacksDoPerfil(user);

      const registro = await registroCom(/Ausências recorrentes nas cerimônias/i);
      await user.click(registro.getByRole('button', { name: /^excluir feedback/i }));

      const dialog = within(await screen.findByRole('dialog'));
      await user.click(dialog.getByRole('button', { name: 'Excluir feedback' }));

      // O diálogo continua aberto, com o motivo — fechar aqui deixaria a
      // dúvida de o que aconteceu com o registro.
      expect(await dialog.findByRole('alert')).toHaveTextContent(
        'Você não pode excluir este feedback.',
      );
      expect(screen.getByRole('dialog')).toBeVisible();

      // O registro continua no histórico, e as contagens não se mexeram.
      // (o mesmo texto aparece duas vezes agora: na lista e no resumo do
      // diálogo, que continua aberto — por isso a busca olha o `<li>`.)
      const aindaNaLista = screen
        .getAllByText(/Ausências recorrentes nas cerimônias/i)
        .some((node) => node.closest('li') !== null);
      expect(aindaNaLista).toBe(true);
      expect(screen.getByRole('button', { name: /^todos 4$/i })).toBeVisible();

      // E dá para tentar de novo: o botão volta a valer.
      await user.click(dialog.getByRole('button', { name: 'Excluir feedback' }));
      await waitFor(() => expect(recusa).toHaveBeenCalledTimes(2));
    },
    TIMEOUT,
  );
});

describe('Perfil → Feedbacks → Editar', () => {
  it(
    'corrige o registro no lugar, sem criar um segundo',
    async () => {
      const user = userEvent.setup();
      await abrirFeedbacksDoPerfil(user);

      const registro = await registroCom(/Ausências recorrentes nas cerimônias/i);
      await user.click(registro.getByRole('button', { name: /^editar feedback/i }));

      const drawer = within(await screen.findByRole('dialog'));
      expect(drawer.getByRole('heading', { name: 'Editar feedback' })).toBeVisible();

      // Os campos chegam preenchidos com o que está gravado, e o membro fica
      // preso: editar corrige o registro, não o transfere de pessoa.
      expect(drawer.getByLabelText(/^tipo/i)).toHaveValue('informal');
      expect(drawer.getByText('Íris Cavalcanti')).toBeVisible();
      const conteudo = drawer.getByLabelText(/^feedback/i);
      expect(conteudo).toHaveValue(
        'Ausências recorrentes nas cerimônias da squad nas últimas três semanas.',
      );

      await user.clear(conteudo);
      await user.type(
        conteudo,
        'Ausências nas cerimônias da squad nas últimas duas semanas, já comunicadas.',
      );
      await user.click(drawer.getByRole('button', { name: /salvar alterações/i }));

      await waitFor(
        async () =>
          expect(
            await screen.findByText(/já comunicadas/i),
          ).toBeVisible(),
        { timeout: 10_000 },
      );

      // O texto antigo some porque é O MESMO registro, corrigido…
      expect(screen.queryByText(/nas últimas três semanas/i)).toBeNull();
      // …e o total não sobe: editar não cria feedback novo.
      expect(screen.getByRole('button', { name: /^todos 4$/i })).toBeVisible();
    },
    TIMEOUT,
  );

  it(
    'Cancelar descarta a alteração e o registro continua como estava',
    async () => {
      const user = userEvent.setup();
      await abrirFeedbacksDoPerfil(user);

      const registro = await registroCom(/Retomou a presença nas dailies/i);
      await user.click(registro.getByRole('button', { name: /^editar feedback/i }));

      let drawer = within(await screen.findByRole('dialog'));
      await user.clear(drawer.getByLabelText(/^feedback/i));
      await user.type(drawer.getByLabelText(/^feedback/i), 'Rascunho que não deve ser salvo.');
      await user.click(drawer.getByRole('button', { name: 'Cancelar' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(screen.queryByText(/Rascunho que não deve ser salvo/i)).toBeNull();
      expect(await screen.findByText(/Retomou a presença nas dailies/i)).toBeVisible();

      // Reabrir mostra o que está GRAVADO, não o rascunho abandonado.
      await user.click(
        (await registroCom(/Retomou a presença nas dailies/i)).getByRole('button', {
          name: /^editar feedback/i,
        }),
      );
      drawer = within(await screen.findByRole('dialog'));
      expect(drawer.getByLabelText(/^feedback/i)).toHaveValue(
        'Retomou a presença nas dailies desde a conversa e avisou com antecedência a única falta do período.',
      );
    },
    TIMEOUT,
  );
});
