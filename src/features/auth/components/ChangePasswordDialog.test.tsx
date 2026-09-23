import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/ui';
import { mockAdapter } from '@/data/mock/mockAdapter';
import { resetMockData } from '@/data/mock/store';
import { AuthProvider } from '../AuthProvider';
import { useAuth } from '../useAuth';
import { ChangePasswordDialog } from './ChangePasswordDialog';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ALTERAR SENHA — o diálogo, isolado.
 *
 * Renderizado sobre o `AuthProvider` de verdade (modo mock) em vez de simular
 * `useAuth()`: assim o teste prova o fluxo real — `changePassword` e
 * `signOut` são os mesmos que a tela usaria em produção, só trocando de
 * adapter. `mockAdapter.auth.signIn` roda ANTES do render para a sessão já
 * existir quando o `AuthProvider` monta (é o que ele lê no efeito inicial).
 *
 * ⚠️ NENHUM teste aqui verifica a senha DIGITADA lendo o valor do input
 * (isso é conteúdo de campo de senha, não asserção de produto) — só o
 * COMPORTAMENTO: qual erro aparece, se o formulário fecha, se a sessão
 * encerra. E um teste dedicado prova que a senha nunca aparece em log.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Só para expor `signOut`/`user` e provar, depois do sucesso, que a sessão
  // realmente encerrou — sem isso o teste só saberia que `onClose` foi chamado.
  const { user } = useAuth();
  return (
    <>
      <p data-testid="sessao">{user ? 'logado' : 'deslogado'}</p>
      <ChangePasswordDialog open={open} onClose={onClose} />
    </>
  );
}

function renderDialog(open = true) {
  const onClose = vi.fn();
  const utils = render(
    <AuthProvider>
      <ToastProvider>
        <Harness open={open} onClose={onClose} />
      </ToastProvider>
    </AuthProvider>,
  );
  return { onClose, ...utils };
}

/**
 * `fireEvent.change`, não `user.type`: o `Modal` tem `initialFocusRef` (foca
 * "Cancelar" via `requestAnimationFrame` ao abrir) e digitar caractere por
 * caractere em MÚLTIPLOS campos em sequência corre com esse foco — o mesmo
 * problema já visto em `DeleteAnonymousFeedbackDialog`. `fireEvent.change`
 * define o valor de uma vez, sem depender de foco nenhum.
 */
function preencher({ atual, nova, confirmar }: { atual: string; nova: string; confirmar: string }) {
  // Regex ancorada no início: o rótulo tem um `*` de campo obrigatório
  // (marcado `aria-hidden`, mas ainda parte do `textContent` que o
  // `getByLabelText` lê) — e "Nova senha" precisa não casar com "Confirmar
  // nova senha".
  fireEvent.change(screen.getByLabelText(/^senha atual/i), { target: { value: atual } });
  fireEvent.change(screen.getByLabelText(/^nova senha/i), { target: { value: nova } });
  fireEvent.change(screen.getByLabelText(/^confirmar nova senha/i), { target: { value: confirmar } });
}

beforeEach(async () => {
  localStorage.clear();
  resetMockData();
  await mockAdapter.auth.signIn('gg@citi.org.br', 'citi123');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChangePasswordDialog', () => {
  it('renderiza os três campos para usuário autenticado', async () => {
    renderDialog();

    expect(await screen.findByRole('dialog', { name: 'Alterar senha' })).toBeVisible();
    expect(screen.getByLabelText(/^senha atual/i)).toBeVisible();
    expect(screen.getByLabelText(/^nova senha/i)).toBeVisible();
    expect(screen.getByLabelText(/^confirmar nova senha/i)).toBeVisible();
  });

  it('⚠️ atributos de preenchimento automático corretos nos três campos', async () => {
    renderDialog();
    await screen.findByRole('dialog', { name: 'Alterar senha' });

    expect(screen.getByLabelText(/^senha atual/i)).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByLabelText(/^nova senha/i)).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText(/^confirmar nova senha/i)).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
  });

  it('mostrar/ocultar senha alterna o tipo do campo', async () => {
    const user = userEvent.setup();
    renderDialog();

    const campo = screen.getByLabelText(/^senha atual/i) as HTMLInputElement;
    expect(campo).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: /mostrar senha atual/i }));
    expect(campo).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: /ocultar senha atual/i }));
    expect(campo).toHaveAttribute('type', 'password');
  });

  it('campos vazios são recusados sem chamar o adapter', async () => {
    const user = userEvent.setup();
    const changePasswordSpy = vi.spyOn(mockAdapter.auth, 'changePassword');
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Alterar senha' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Preencha todos os campos.');
    expect(changePasswordSpy).not.toHaveBeenCalled();
  });

  it('⚠️ nova senha com menos de 12 caracteres é recusada', async () => {
    const user = userEvent.setup();
    const changePasswordSpy = vi.spyOn(mockAdapter.auth, 'changePassword');
    renderDialog();

    preencher({ atual: 'citi123', nova: 'curta12345', confirmar: 'curta12345' });
    await user.click(screen.getByRole('button', { name: 'Alterar senha' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/pelo menos 12 caracteres/i);
    expect(changePasswordSpy).not.toHaveBeenCalled();
  });

  it('confirmação divergente é recusada', async () => {
    const user = userEvent.setup();
    const changePasswordSpy = vi.spyOn(mockAdapter.auth, 'changePassword');
    renderDialog();

    preencher({
      atual: 'citi123',
      nova: 'senha-nova-valida-123',
      confirmar: 'senha-nova-diferente-456',
    });
    await user.click(screen.getByRole('button', { name: 'Alterar senha' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/confirmação não é igual/i);
    expect(changePasswordSpy).not.toHaveBeenCalled();
  });

  it('⚠️ nova senha igual à atual é recusada sem ida ao adapter', async () => {
    const user = userEvent.setup();
    const changePasswordSpy = vi.spyOn(mockAdapter.auth, 'changePassword');
    renderDialog();

    preencher({
      atual: 'senha-repetida-123456',
      nova: 'senha-repetida-123456',
      confirmar: 'senha-repetida-123456',
    });
    await user.click(screen.getByRole('button', { name: 'Alterar senha' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/diferente da atual/i);
    // A checagem client-side (comparando os dois campos digitados) já barra —
    // nem precisa perguntar ao servidor qual é a senha "atual" de verdade.
    expect(changePasswordSpy).not.toHaveBeenCalled();
  });

  it('senha atual incorreta: mantém o formulário aberto, com o erro, sem deslogar', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    preencher({
      atual: 'senha-errada',
      nova: 'senha-nova-valida-123',
      confirmar: 'senha-nova-valida-123',
    });
    await user.click(screen.getByRole('button', { name: 'Alterar senha' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/senha atual incorreta/i);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('sessao')).toHaveTextContent('logado');
  });

  it('falha no updateUser: mostra o erro e não desloga', async () => {
    const user = userEvent.setup();
    vi.spyOn(mockAdapter.auth, 'changePassword').mockRejectedValue(
      new Error('Não foi possível alterar a senha. Tente novamente.'),
    );
    const { onClose } = renderDialog();

    preencher({
      atual: 'citi123',
      nova: 'senha-nova-valida-123',
      confirmar: 'senha-nova-valida-123',
    });
    await user.click(screen.getByRole('button', { name: 'Alterar senha' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível alterar a senha/i);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('sessao')).toHaveTextContent('logado');
  });

  it(
    '⚠️ loading desabilita o botão e uma segunda confirmação não chama o adapter de novo',
    async () => {
      const user = userEvent.setup();
      let liberar!: () => void;
      const changePasswordSpy = vi
        .spyOn(mockAdapter.auth, 'changePassword')
        .mockImplementation(() => new Promise((resolve) => (liberar = resolve)));

      renderDialog();
      preencher({
        atual: 'citi123',
        nova: 'senha-nova-valida-123',
        confirmar: 'senha-nova-valida-123',
      });

      const confirmar = screen.getByRole('button', { name: 'Alterar senha' });
      await user.click(confirmar);

      await waitFor(() => expect(confirmar).toBeDisabled());
      // Segundo clique enquanto ainda está em voo — mesmo que o botão não
      // estivesse desabilitado, a guarda em `submit()` ignora a reentrada.
      await user.click(confirmar);
      await user.click(confirmar);

      liberar();
      await waitFor(() => expect(changePasswordSpy).toHaveBeenCalledTimes(1));
    },
    10_000,
  );

  it(
    '⚠️ sucesso: limpa os campos, fecha o diálogo, avisa por toast e ENCERRA a sessão',
    async () => {
      const user = userEvent.setup();
      const { onClose } = renderDialog();

      preencher({
        atual: 'citi123',
        nova: 'senha-nova-valida-123',
        confirmar: 'senha-nova-valida-123',
      });
      await user.click(screen.getByRole('button', { name: 'Alterar senha' }));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(await screen.findByText('Senha alterada')).toBeVisible();
      expect(screen.getByText(/entre novamente com sua nova senha/i)).toBeVisible();

      // A sessão foi encerrada de verdade — não é só o diálogo fechando.
      await waitFor(() => expect(screen.getByTestId('sessao')).toHaveTextContent('deslogado'));
    },
    10_000,
  );

  it(
    '⚠️ senha trocada com sucesso, mas o logout falha depois: NUNCA diz que a senha não mudou',
    async () => {
      const user = userEvent.setup();
      // `changePassword` sucede de verdade (mock real); só o `signOut` falha —
      // é exatamente o cenário "updateUser concluiu, o logout falhou depois".
      vi.spyOn(mockAdapter.auth, 'signOut').mockRejectedValue(new Error('falha de rede'));
      const { onClose } = renderDialog();

      preencher({
        atual: 'citi123',
        nova: 'senha-nova-valida-123',
        confirmar: 'senha-nova-valida-123',
      });
      await user.click(screen.getByRole('button', { name: 'Alterar senha' }));

      // O diálogo fecha e o toast confirma a troca — em NENHUM lugar aparece
      // "erro" ou "não foi possível alterar a senha".
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(await screen.findByText('Senha alterada')).toBeVisible();
      expect(
        screen.getByText(/não foi possível encerrar sua sessão automaticamente/i),
      ).toBeVisible();
      expect(screen.queryByText(/não foi possível alterar a senha/i)).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    },
    10_000,
  );

  it('cancelar fecha sem chamar o adapter e sem deslogar', async () => {
    const user = userEvent.setup();
    const changePasswordSpy = vi.spyOn(mockAdapter.auth, 'changePassword');
    const { onClose } = renderDialog();

    preencher({
      atual: 'citi123',
      nova: 'senha-nova-valida-123',
      confirmar: 'senha-nova-valida-123',
    });
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onClose).toHaveBeenCalled();
    expect(changePasswordSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('sessao')).toHaveTextContent('logado');
  });

  it(
    '⚠️ a senha nunca aparece em log (console) nem em mensagem de erro exibida',
    async () => {
      const user = userEvent.setup();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      renderDialog();

      const senhaSecreta = 'senha-atual-que-nao-pode-vazar-999';
      preencher({
        atual: senhaSecreta,
        nova: 'senha-nova-valida-123',
        confirmar: 'senha-nova-valida-123',
      });
      await user.click(screen.getByRole('button', { name: 'Alterar senha' }));

      const alerta = await screen.findByRole('alert');
      expect(alerta.textContent ?? '').not.toContain(senhaSecreta);

      const chamadasLog = [...errorSpy.mock.calls, ...warnSpy.mock.calls, ...logSpy.mock.calls]
        .flat()
        .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)));
      expect(chamadasLog.some((texto) => texto.includes(senhaSecreta))).toBe(false);

      // E o documento inteiro não tem a senha exposta fora do valor do campo
      // (que é do tipo password — nunca renderizado como texto puro em outro
      // lugar da tela).
      const foraDoCampo = document.body.textContent ?? '';
      expect(foraDoCampo).not.toContain(senhaSecreta);
    },
    10_000,
  );
});
