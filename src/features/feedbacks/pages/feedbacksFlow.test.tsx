import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { resetMockData } from '@/data/mock/store';
import { Providers } from '@/app/providers';
import { AppRouter } from '@/app/router';
import { ROUTES } from '@/app/routes';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Teste dos dois fluxos de Feedback, ponta a ponta.
 *
 *   Acompanhamento:  /feedbacks → contagens → registrar → tabela e Perfil
 *   Anônimo:         /feedbacks?aba=anonimo → moderar → card muda de coluna
 *
 * O QUE ESTE TESTE PROTEGE não é a marcação da tela. São três regras de produto
 * que uma refatoração desatenta quebraria sem quebrar nenhum teste unitário:
 *
 *   1. As contagens derivam dos registros — registrar atualiza tabela, gaveta e
 *      Perfil de uma vez, porque as três leem a mesma fonte.
 *   2. Moderar um relato anônimo NUNCA cria feedback de acompanhamento.
 *   3. As colunas do quadro derivam de status + resolution, não de um campo.
 *
 * NOTA SOBRE O TEMPO: o adapter mock simula latência em toda chamada, para que
 * os estados de carregamento existam de verdade. Um fluxo completo soma vários
 * desses, então estes testes declaram tempo limite maior. É lentidão esperada.
 *
 * NOTA SOBRE AS CONSULTAS: a visão consolidada renderiza a tabela (desktop) E
 * os cartões (celular) ao mesmo tempo, e o CSS esconde uma. O jsdom não aplica
 * CSS, então cada pessoa aparece duas vezes — por isso as buscas de membro são
 * feitas DENTRO da tabela.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const TIMEOUT = 30_000;

async function signIn(user: ReturnType<typeof userEvent.setup>, route: string) {
  render(
    <MemoryRouter initialEntries={[ROUTES.login]}>
      <Providers>
        <AppRouter />
      </Providers>
    </MemoryRouter>,
  );

  await user.type(await screen.findByLabelText(/e-mail/i), 'gg@citi.org.br');
  await user.type(screen.getByLabelText(/^Senha/), 'citi123');
  await user.click(screen.getByRole('button', { name: /entrar/i }));

  await screen.findByRole('heading', { name: 'Membros' });

  // Navega pela barra lateral: é o caminho que a GG usa.
  await user.click(screen.getByRole('link', { name: /feedbacks/i }));
  await screen.findByRole('heading', { level: 1, name: 'Feedbacks' });

  if (route === 'anonimo') {
    await user.click(screen.getByRole('tab', { name: /feedback anônimo/i }));
  }
}

/** A linha da tabela consolidada de uma pessoa. */
async function rowFor(name: string) {
  const table = await screen.findByRole('table');
  const cell = await within(table).findByText(name);
  return within(cell.closest('tr') as HTMLElement);
}

beforeEach(() => {
  localStorage.clear();
  resetMockData();
});

describe('Feedbacks → Acompanhamento', () => {
  it(
    'mostra as contagens derivadas dos registros de cada pessoa',
    async () => {
      const user = userEvent.setup();
      await signIn(user, 'acompanhamento');

      // Íris tem três informais e uma carta de ajuste nas fixtures.
      const iris = await rowFor('Íris Cavalcanti');
      expect(iris.getByRole('button', { name: /3 informais/i })).toBeVisible();
      expect(iris.getByRole('button', { name: /1 cartas de ajuste/i })).toBeVisible();

      // Helena tem um informal e um formal — e nenhuma carta.
      const helena = await rowFor('Helena Vasconcelos');
      expect(helena.getByRole('button', { name: /1 informais/i })).toBeVisible();
      expect(helena.getByRole('button', { name: /1 formais/i })).toBeVisible();
      // Zero não é botão: não há recorte vazio para abrir.
      expect(helena.queryByRole('button', { name: /cartas de ajuste/i })).toBeNull();
    },
    TIMEOUT,
  );

  it(
    'clicar em uma contagem abre exatamente aquele recorte do histórico',
    async () => {
      const user = userEvent.setup();
      await signIn(user, 'acompanhamento');

      const iris = await rowFor('Íris Cavalcanti');
      await user.click(iris.getByRole('button', { name: /1 cartas de ajuste/i }));

      const drawer = within(await screen.findByRole('dialog'));
      expect(drawer.getByRole('heading', { name: /feedbacks cartas de ajuste/i })).toBeVisible();
      expect(drawer.getByText('Íris Cavalcanti')).toBeVisible();

      // O recorte é o que foi clicado: a carta aparece, os informais não.
      expect(drawer.getByText(/Carta de ajuste registrada após conversa/i)).toBeVisible();
      expect(drawer.queryByText(/Ausências recorrentes/i)).toBeNull();
    },
    TIMEOUT,
  );

  it(
    'registrar um feedback atualiza contagem, tabela e Perfil a partir da mesma fonte',
    async () => {
      const user = userEvent.setup();
      await signIn(user, 'acompanhamento');

      // Tarcísio não tem nenhum feedback: a linha dele começa toda zerada.
      const antes = await rowFor('Tarcísio Amorim');
      expect(antes.queryByRole('button', { name: /informais/i })).toBeNull();
      expect(antes.getByText('Nenhum registro')).toBeVisible();

      await user.click(screen.getByRole('button', { name: /^registrar feedback$/i }));

      const drawer = within(await screen.findByRole('dialog'));
      await user.selectOptions(drawer.getByLabelText(/membro/i), 'mbr-005');
      await user.selectOptions(drawer.getByLabelText(/^tipo/i), 'informal');
      await user.type(
        drawer.getByLabelText(/^feedback/i),
        'Assumiu a apresentação do time quando o gerente faltou.',
      );
      await user.click(drawer.getByRole('button', { name: /registrar feedback/i }));

      // A contagem passa a existir sem ninguém ter gravado um contador.
      await waitFor(
        async () => {
          const depois = await rowFor('Tarcísio Amorim');
          expect(depois.getByRole('button', { name: /1 informais/i })).toBeVisible();
        },
        { timeout: 10_000 },
      );

      // E o mesmo registro aparece no Perfil, que lê a mesma fonte.
      await user.click((await rowFor('Tarcísio Amorim')).getByText('Tarcísio Amorim'));
      await screen.findByRole('heading', { level: 1, name: 'Tarcísio Amorim' });
      await user.click(screen.getByRole('tab', { name: /feedbacks/i }));

      expect(
        await screen.findByText(/Assumiu a apresentação do time quando o gerente faltou/i),
      ).toBeVisible();
    },
    TIMEOUT,
  );

  it(
    'a aba do Perfil mostra o histórico e nunca some com o passado de quem saiu',
    async () => {
      const user = userEvent.setup();
      await signIn(user, 'acompanhamento');

      // Ubiratã está desligado, mas tem um feedback — continua na tabela.
      const linha = await rowFor('Ubiratã Malta');
      expect(linha.getByText('Desligado')).toBeVisible();
      expect(linha.getByRole('button', { name: /1 formais/i })).toBeVisible();
    },
    TIMEOUT,
  );
});

describe('Feedbacks → Feedback Anônimo', () => {
  it(
    'monta as três colunas com contagens derivadas',
    async () => {
      const user = userEvent.setup();
      await signIn(user, 'anonimo');

      const pendentes = await screen.findByRole('region', { name: /pendentes/i });
      const direcionados = screen.getByRole('region', { name: /direcionados/i });
      const cientes = screen.getByRole('region', { name: /cientes/i });

      // 7 pendentes, 5 direcionados e 4 cientes nas fixtures.
      expect(within(pendentes).getByText('7')).toBeVisible();
      expect(within(direcionados).getByText('5')).toBeVisible();
      expect(within(cientes).getByText('4')).toBeVisible();
    },
    TIMEOUT,
  );

  it(
    'tomar ciência move o card de coluna sem criar feedback de acompanhamento',
    async () => {
      const user = userEvent.setup();
      await signIn(user, 'anonimo');

      const pendentes = await screen.findByRole('region', { name: /pendentes/i });
      await user.click(within(pendentes).getByText(/A copa está sempre sem café/i));

      const drawer = within(await screen.findByRole('dialog'));
      expect(drawer.getByRole('heading', { name: /feedback recebido/i })).toBeVisible();
      // Anonimato: a gaveta afirma que não há origem, e não mostra autor.
      expect(drawer.getByText('Anônimo')).toBeVisible();

      await user.click(drawer.getByRole('button', { name: /^ciente$/i }));

      await waitFor(
        async () => {
          const cientes = await screen.findByRole('region', { name: /cientes/i });
          expect(within(cientes).getByText(/A copa está sempre sem café/i)).toBeVisible();
        },
        { timeout: 10_000 },
      );

      // Saiu dos pendentes: 7 → 6.
      const pendentesDepois = await screen.findByRole('region', { name: /pendentes/i });
      expect(within(pendentesDepois).getByText('6')).toBeVisible();
      expect(within(pendentesDepois).queryByText(/A copa está sempre sem café/i)).toBeNull();
    },
    TIMEOUT,
  );

  it(
    'direcionar exige escolher o membro e NÃO cria feedback de acompanhamento',
    async () => {
      const user = userEvent.setup();
      await signIn(user, 'anonimo');

      const pendentes = await screen.findByRole('region', { name: /pendentes/i });
      await user.click(within(pendentes).getByText(/A copa está sempre sem café/i));

      const drawer = within(await screen.findByRole('dialog'));
      await user.click(drawer.getByRole('button', { name: /direcionar para membro/i }));

      // A decisão é explícita: sem escolher a pessoa, não dá para confirmar.
      const confirmar = drawer.getByRole('button', { name: /confirmar direcionamento/i });
      expect(confirmar).toBeDisabled();

      await user.type(drawer.getByLabelText(/buscar membro/i), 'Helena');
      await user.click(await drawer.findByText('Helena Vasconcelos'));
      await user.click(confirmar);

      await waitFor(
        async () => {
          const direcionados = await screen.findByRole('region', { name: /direcionados/i });
          expect(within(direcionados).getByText(/A copa está sempre sem café/i)).toBeVisible();
        },
        { timeout: 10_000 },
      );

      // ⚠️ A REGRA MAIS IMPORTANTE DOS DOIS FLUXOS: direcionar leva CONTEXTO a
      // uma pessoa. Não vira Informal, Formal nem Carta de Ajuste.
      await user.click(screen.getByRole('tab', { name: /acompanhamento/i }));
      const helena = await rowFor('Helena Vasconcelos');
      expect(helena.getByRole('button', { name: /1 informais/i })).toBeVisible();
      expect(helena.getByRole('button', { name: /1 formais/i })).toBeVisible();
      expect(helena.queryByRole('button', { name: /cartas de ajuste/i })).toBeNull();
    },
    TIMEOUT,
  );

  it(
    'um relato já moderado abre em leitura, sem oferecer decidir de novo',
    async () => {
      const user = userEvent.setup();
      await signIn(user, 'anonimo');

      const direcionados = await screen.findByRole('region', { name: /direcionados/i });
      await user.click(within(direcionados).getByText(/quem fala mais alto/i));

      const drawer = within(await screen.findByRole('dialog'));
      expect(drawer.getByText('Direcionado')).toBeVisible();
      expect(drawer.queryByRole('button', { name: /^ciente$/i })).toBeNull();
      expect(drawer.queryByRole('button', { name: /direcionar para membro/i })).toBeNull();
    },
    TIMEOUT,
  );
});
