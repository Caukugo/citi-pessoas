import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseAdapter } from './supabaseAdapter';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `supabaseAdapter.auth` — a única implementação que fala com o Supabase de
 * verdade, testada com um cliente FALSO (nunca uma rede real, nunca um
 * projeto real).
 *
 * `vi.hoisted` é necessário aqui: `vi.mock('./client', ...)` é hasteado para
 * ANTES dos imports pelo Vitest, e a fábrica do mock só roda quando
 * `supabaseAdapter.ts` importa `./client` — se `authMock` fosse um `const`
 * comum, a fábrica correria antes dele existir.
 *
 * ⚠️ Nenhum teste aqui verifica CONTEÚDO de senha em lugar nenhum além do
 * argumento que O PRÓPRIO teste está afirmando — é exatamente o comportamento
 * que protege `changePassword`: a senha nunca vaza para uma mensagem de erro.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const authMock = vi.hoisted(() => ({
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('./client', () => ({
  supabase: () => ({ auth: authMock }),
}));

const EMAIL = 'gg@citi.org.br';

beforeEach(() => {
  authMock.getUser.mockReset();
  authMock.signInWithPassword.mockReset();
  authMock.updateUser.mockReset();
  authMock.signOut.mockReset();
});

describe('supabaseAdapter.auth.signOut', () => {
  it('⚠️ chama o Supabase com scope explícito "global"', async () => {
    authMock.signOut.mockResolvedValue({ error: null });

    await supabaseAdapter.auth.signOut();

    expect(authMock.signOut).toHaveBeenCalledWith({ scope: 'global' });
    expect(authMock.signOut).toHaveBeenCalledTimes(1);
  });
});

describe('supabaseAdapter.auth.changePassword', () => {
  it('reautentica com o e-mail da SESSÃO antes de trocar — nunca um parâmetro', async () => {
    authMock.getUser.mockResolvedValue({ data: { user: { email: EMAIL } }, error: null });
    authMock.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    authMock.updateUser.mockResolvedValue({ data: {}, error: null });

    await supabaseAdapter.auth.changePassword('senha-atual-123456', 'senha-nova-1234567890');

    expect(authMock.signInWithPassword).toHaveBeenCalledWith({
      email: EMAIL,
      password: 'senha-atual-123456',
    });
    expect(authMock.updateUser).toHaveBeenCalledWith({ password: 'senha-nova-1234567890' });
  });

  it('sem sessão (sem e-mail): recusa antes de qualquer chamada envolvendo senha', async () => {
    authMock.getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(supabaseAdapter.auth.changePassword('x', 'y')).rejects.toThrow(/sessão expirada/i);
    expect(authMock.signInWithPassword).not.toHaveBeenCalled();
    expect(authMock.updateUser).not.toHaveBeenCalled();
  });

  it('senha atual incorreta (reautenticação falha): nunca chama updateUser', async () => {
    authMock.getUser.mockResolvedValue({ data: { user: { email: EMAIL } }, error: null });
    authMock.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: 'Invalid login credentials', code: 'invalid_credentials' },
    });

    await expect(
      supabaseAdapter.auth.changePassword('senha-errada', 'senha-nova-1234567890'),
    ).rejects.toThrow(/incorreta/i);
    expect(authMock.updateUser).not.toHaveBeenCalled();
  });

  it('updateUser recusa same_password com mensagem própria, não técnica', async () => {
    authMock.getUser.mockResolvedValue({ data: { user: { email: EMAIL } }, error: null });
    authMock.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    authMock.updateUser.mockResolvedValue({
      data: {},
      error: { message: 'New password should be different from the old password.', code: 'same_password' },
    });

    await expect(
      supabaseAdapter.auth.changePassword('senha-atual-123456', 'senha-atual-123456'),
    ).rejects.toThrow(/diferente da atual/i);
  });

  it('updateUser recusa weak_password com mensagem própria, não técnica', async () => {
    authMock.getUser.mockResolvedValue({ data: { user: { email: EMAIL } }, error: null });
    authMock.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    authMock.updateUser.mockResolvedValue({
      data: {},
      error: { message: 'Password should be at least 6 characters.', code: 'weak_password' },
    });

    await expect(supabaseAdapter.auth.changePassword('senha-atual-123456', '123')).rejects.toThrow(
      /fraca/i,
    );
  });

  it('⚠️ nenhuma senha aparece na mensagem de erro lançada', async () => {
    authMock.getUser.mockResolvedValue({ data: { user: { email: EMAIL } }, error: null });
    authMock.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: 'Invalid login credentials', code: 'invalid_credentials' },
    });

    const senhaSecreta = 'segredo-que-nao-pode-vazar-777';
    await expect(
      supabaseAdapter.auth.changePassword(senhaSecreta, 'senha-nova-1234567890'),
    ).rejects.toSatisfy((cause: unknown) => {
      const message = cause instanceof Error ? cause.message : String(cause);
      return !message.includes(senhaSecreta);
    });
  });
});
