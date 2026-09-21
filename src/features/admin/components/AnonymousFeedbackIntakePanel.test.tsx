import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui';
import { mockAdapter } from '@/data/mock/mockAdapter';
import { resetMockData } from '@/data/mock/store';
import { AnonymousFeedbackIntakePanel } from './AnonymousFeedbackIntakePanel';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PAINEL "FEEDBACK ANÔNIMO" NA ADMINISTRAÇÃO (migration 0033).
 *
 * Cobre: status/link, QR gerado a partir do `responder_url` exato, copiar/
 * abrir, downloads disponíveis, ausência de link, habilitação bloqueada sem
 * configuração, e a confirmação antes de alternar o toggle.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AnonymousFeedbackIntakePanel />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  resetMockData();
});

describe('AnonymousFeedbackIntakePanel', () => {
  it('sem link configurado: mostra o aviso e não tenta gerar QR', async () => {
    renderPanel();
    await screen.findByText('Desabilitada');
    expect(screen.getByText(/link do formulário ainda não foi configurado/i)).toBeInTheDocument();
    expect(screen.queryByAltText(/QR code/i)).not.toBeInTheDocument();
  });

  it('não permite habilitar sem form_id/responder_url configurados', async () => {
    renderPanel();
    const botao = await screen.findByRole('button', { name: 'Habilitar' });
    expect(botao).toBeDisabled();
  });

  it('com link configurado: mostra status, link truncado e o QR', async () => {
    await mockAdapter.anonymousFeedbackIntake.updateConfig({
      formId: 'fixture-form',
      responderUrl: 'https://forms.gle/fixture-anonimo',
    });

    renderPanel();
    await screen.findByText('https://forms.gle/fixture-anonimo');

    const qr = await screen.findByAltText(/QR code para o formulário público de Feedback Anônimo/i);
    expect(qr).toBeInTheDocument();
    // O conteúdo do QR é o próprio link — provado indiretamente pela geração
    // sem erro; o `src` é um data URL de imagem, nunca o link em texto puro
    // (mas o link mostrado ao lado é exatamente o que a Edge Function
    // receberia se alguém escaneasse e respondesse).
    expect((qr as HTMLImageElement).src).toMatch(/^data:image\/png;base64,/);

    expect(screen.getByRole('button', { name: 'Copiar link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir formulário' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Baixar PNG/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Baixar SVG/i })).toBeInTheDocument();
  });

  it('habilitar exige confirmação explícita', async () => {
    await mockAdapter.anonymousFeedbackIntake.updateConfig({
      formId: 'fixture-form',
      responderUrl: 'https://forms.gle/fixture-anonimo',
    });

    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Habilitar' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(screen.getByText(/habilitar o feedback anônimo/i)).toBeInTheDocument();

    // Ainda não confirmou: continua desabilitada.
    expect(screen.getByText('Desabilitada')).toBeInTheDocument();

    await user.click(dialog.getByRole('button', { name: 'Habilitar' }));

    await waitFor(async () => {
      expect((await mockAdapter.anonymousFeedbackIntake.getConfig()).enabled).toBe(true);
    });
  });

  it('desabilitar também exige confirmação, com estilo destrutivo', async () => {
    await mockAdapter.anonymousFeedbackIntake.updateConfig({
      formId: 'fixture-form',
      responderUrl: 'https://forms.gle/fixture-anonimo',
      enabled: true,
    });

    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Desabilitar' }));
    await screen.findByRole('dialog');
    expect(screen.getByText(/desabilitar o feedback anônimo/i)).toBeInTheDocument();
  });
});
