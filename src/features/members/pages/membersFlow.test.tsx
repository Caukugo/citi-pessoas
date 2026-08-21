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
 * Teste do fluxo principal da Fase 1, ponta a ponta:
 *
 *   Membros → busca → Perfil → aba X1 → registrar X1 → histórico atualizado
 *
 * O que este teste protege NÃO é a marcação da tela: é a garantia estrutural de
 * que situação, último X1 e histórico derivam todos da mesma fonte. Se alguém
 * introduzir um campo derivado gravado no banco, é aqui que vai aparecer —
 * o histórico atualiza e a situação não.
 * NOTA SOBRE O TEMPO: o adapter mock simula latência de rede em toda chamada,
 * de propósito, para que os estados de carregamento existam de verdade. Um
 * fluxo completo (login → perfil → gravar → recarregar) soma vários desses,
 * então os testes de fluxo declaram um tempo limite maior que o padrão de 5s
 * do Vitest. Isso é lentidão esperada, não um teste instável.
 *
 * NOTA SOBRE AS CONSULTAS: a listagem renderiza a tabela (desktop) E os
 * cartões (celular) ao mesmo tempo, e o CSS esconde uma das duas. O jsdom não
 * aplica CSS, então cada pessoa aparece duas vezes no DOM daqui — por isso
 * todas as buscas de membro são feitas DENTRO da tabela.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Faz login e para na listagem de membros. */
async function signIn(user: ReturnType<typeof userEvent.setup>) {
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
}

/** A tabela da listagem — evita casar com a versão em cartões. */
async function membersTable() {
  return within(await screen.findByRole('table'));
}

/** Abre o perfil de alguém clicando na linha da tabela. */
async function openProfile(user: ReturnType<typeof userEvent.setup>, name: string) {
  const table = await membersTable();
  await user.click(await table.findByText(name));
  await screen.findByRole('heading', { level: 1, name });
}

beforeEach(() => {
  localStorage.clear();
  resetMockData();
});

describe('fluxo Membros → Perfil → X1', () => {
  it('lista os membros e mostra a situação de X1 de cada um', async () => {
    const user = userEvent.setup();
    await signIn(user);

    const table = await membersTable();

    // Helena tem X1 recente; Tarcísio entrou agora e nunca teve nenhum.
    expect(await table.findByText('Helena Vasconcelos')).toBeVisible();

    const tarcisio = (await table.findByText('Tarcísio Amorim')).closest('tr');
    // REGRA DE PRODUTO: quem acabou de entrar não nasce atrasado.
    expect(within(tarcisio as HTMLElement).getByText('Primeiro X1 pendente')).toBeVisible();
    expect(within(tarcisio as HTMLElement).queryByText('X1 atrasado')).toBeNull();
  }, 15_000);

  it('busca encontra ignorando acento e maiúscula', async () => {
    const user = userEvent.setup();
    await signIn(user);
    const table = await membersTable();
    await table.findByText('Helena Vasconcelos');

    await user.type(screen.getByLabelText(/buscar membro/i), 'iris');

    // "iris" precisa encontrar "Íris".
    expect(await screen.findAllByText('Íris Cavalcanti')).not.toHaveLength(0);
    // `queryAllByText`: cada pessoa aparece na tabela e no cartão, e
    // `queryByText` estouraria com "found multiple" em vez de dizer o que
    // realmente interessa — que Helena saiu do resultado.
    await waitFor(() => expect(screen.queryAllByText('Helena Vasconcelos')).toHaveLength(0));
  }, 15_000);

  it('abre o perfil pela listagem e mostra os dados cadastrais', async () => {
    const user = userEvent.setup();
    await signIn(user);

    await openProfile(user, 'Helena Vasconcelos');

    expect(screen.getByText('Informações cadastrais')).toBeVisible();
  }, 15_000);

  it('quem nunca teve X1 vê o estado de primeiro X1, não uma tela de erro', async () => {
    const user = userEvent.setup();
    await signIn(user);

    await openProfile(user, 'Tarcísio Amorim');

    await user.click(screen.getByRole('tab', { name: /^X1/ }));

    expect(await screen.findByText(/nenhum x1 registrado ainda/i)).toBeVisible();
    // O texto precisa explicar que isso é normal, não um problema. Aparece no
    // selo do cabeçalho e na explicação do estado vazio.
    expect(screen.getAllByText(/primeiro x1 pendente/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /registrar primeiro x1/i }).length).toBe(2);

    // Tarcísio tem um X1 AGENDADO e nenhum realizado: o estado prioritário
    // continua sendo o primeiro X1 pendente, com o agendamento como contexto.
    expect(screen.getByText(/já existe um x1 agendado/i)).toBeVisible();
  }, 15_000);

  it('registrar um X1 atualiza histórico e situação a partir da mesma fonte', async () => {
    const user = userEvent.setup();
    await signIn(user);

    await openProfile(user, 'Tarcísio Amorim');

    // Situação antes: ninguém conversou com ele ainda.
    expect(screen.getAllByText(/primeiro x1 pendente/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /registrar primeiro x1/i }));

    const drawer = await screen.findByRole('dialog', { name: /registrar primeiro x1/i });

    await user.selectOptions(
      within(drawer).getByLabelText(/quem conduziu/i),
      'mbr-001',
    );
    // `paste` em vez de `type`: digitar 40 caracteres um a um é o passo mais
    // lento do teste e não é o que está sendo verificado aqui.
    await user.click(within(drawer).getByLabelText(/^Resumo/));
    await user.paste('Primeira conversa. Boa adaptação ao squad.');
    await user.click(within(drawer).getByRole('button', { name: /^Registrar X1$/ }));

    // A gaveta fecha e o aviso de sucesso aparece.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // O histórico passou a existir…
    expect(
      await screen.findByText('Primeira conversa. Boa adaptação ao squad.'),
    ).toBeVisible();

    // …e a situação derivou junto, sem ninguém gravar "em dia" em lugar nenhum.
    await waitFor(() => expect(screen.getAllByText(/em dia/i).length).toBeGreaterThan(0));
    expect(screen.queryByText(/nenhum x1 registrado ainda/i)).toBeNull();
  }, 30_000);

  it('id inexistente mostra "membro não encontrado", não tela quebrada', async () => {
    const user = userEvent.setup();

    // Entra direto por um link antigo: a rota protegida manda para o login e
    // devolve para o endereço pedido depois de autenticar.
    render(
      <MemoryRouter initialEntries={[ROUTES.memberProfile('mbr-nao-existe')]}>
        <Providers>
          <AppRouter />
        </Providers>
      </MemoryRouter>,
    );

    await user.type(await screen.findByLabelText(/e-mail/i), 'gg@citi.org.br');
    await user.type(screen.getByLabelText(/^Senha/), 'citi123');
    await user.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByText(/este membro não existe/i)).toBeVisible();
    // Lembrete da regra: membro nunca é apagado, então some da lista por
    // arquivamento — e o texto precisa dizer isso.
    expect(screen.getByText(/arquivad/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /voltar para membros/i })).toBeVisible();
  }, 15_000);
});
