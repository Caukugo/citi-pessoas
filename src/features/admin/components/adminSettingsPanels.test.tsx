import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui';
import { mockAdapter } from '@/data/mock/mockAdapter';
import { resetMockData } from '@/data/mock/store';
import { X1PeriodicityPanel } from './X1PeriodicityPanel';
import { CitiValuesPanel } from './CitiValuesPanel';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CONFIGURAÇÕES DE REGRA NA ADMINISTRAÇÃO (ADM-001 e ADM-004).
 *
 * O que está sendo protegido aqui são as duas promessas que a ADR-023 faz —
 * as mesmas que alguém quebraria sem perceber ao "simplificar" um destes
 * painéis:
 *
 *   1. Mudar a periodicidade geral NÃO apaga exceção individual de ninguém.
 *   2. Aposentar um valor do CITi NÃO apaga nada: ele sai de circulação e
 *      continua na lista, legível.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function renderPanel(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  resetMockData();
});

describe('X1PeriodicityPanel (ADM-001)', () => {
  it('mostra a periodicidade gravada e avisa quem está fora do padrão', async () => {
    renderPanel(<X1PeriodicityPanel />);

    expect(await screen.findByDisplayValue('30')).toBeInTheDocument();
    // A fixture tem uma exceção (Edmundo, 60 dias).
    expect(await screen.findByText(/1 pessoa tem periodicidade própria/i)).toBeInTheDocument();
  });

  it('recusa número fora da faixa sem chegar a gravar', async () => {
    const user = userEvent.setup();
    renderPanel(<X1PeriodicityPanel />);

    const campo = await screen.findByDisplayValue('30');
    await user.clear(campo);
    await user.type(campo, '0');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText(/entre 7 e 365/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect((await mockAdapter.settings.get()).defaultX1PeriodicityDays).toBe(30);
  });

  it('salvar exige confirmação e PRESERVA a exceção por membro', async () => {
    const user = userEvent.setup();
    renderPanel(<X1PeriodicityPanel />);

    const campo = await screen.findByDisplayValue('30');
    await user.clear(campo);
    await user.type(campo, '45');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    const dialog = within(await screen.findByRole('dialog'));
    // O diálogo precisa dizer o que NÃO muda — é a diferença entre "mudei a
    // regra geral" e "mudei a regra de todo mundo".
    expect(screen.getByText(/exceções individuais continuam como estão/i)).toBeInTheDocument();

    await user.click(dialog.getByRole('button', { name: 'Mudar periodicidade' }));

    await waitFor(async () => {
      const settings = await mockAdapter.settings.get();
      expect(settings.defaultX1PeriodicityDays).toBe(45);
      // A REGRA: a exceção sobreviveu intacta.
      expect(settings.x1PeriodicityByMember).toEqual({ 'mbr-009': 60 });
    });
  });
});

describe('CitiValuesPanel (ADM-004)', () => {
  it('lista os quatro valores do CITi, sem seção de aposentados', async () => {
    renderPanel(<CitiValuesPanel />);

    expect(await screen.findByText('Eu sou o CITi')).toBeInTheDocument();
    expect(screen.getByText('Obcecados por entregar')).toBeInTheDocument();
    // Nada foi aposentado ainda: a seção nem aparece.
    expect(screen.queryByText('Fora de circulação')).not.toBeInTheDocument();
  });

  it('banco sem a migration: avisa qual é, em vez de só falhar ao salvar', async () => {
    // Foi exatamente o que aconteceu em produção: coluna ausente, lista vazia,
    // X1 sem seção de valores e um erro de PostgREST que não diz o que fazer.
    await mockAdapter.settings.update({ citiValues: [] });

    renderPanel(<CitiValuesPanel />);

    expect(await screen.findByText(/falta aplicar a migration/i)).toBeInTheDocument();
    expect(screen.getByText(/0038_valores_citi_configuraveis\.sql/)).toBeInTheDocument();
  });

  it('não oferece renomear — a lista só aceita acrescentar e aposentar', async () => {
    renderPanel(<CitiValuesPanel />);

    await screen.findByText('Eu sou o CITi');
    expect(screen.queryByRole('button', { name: /renomear/i })).not.toBeInTheDocument();
  });

  it('acrescenta um valor novo ao fim da lista', async () => {
    const user = userEvent.setup();
    renderPanel(<CitiValuesPanel />);

    await user.type(await screen.findByLabelText(/nome do novo valor/i), 'Protagonismo');
    await user.click(screen.getByRole('button', { name: /adicionar valor/i }));

    await waitFor(async () => {
      const { citiValues } = await mockAdapter.settings.get();
      expect(citiValues.at(-1)).toMatchObject({ label: 'Protagonismo', retiredAt: null });
    });
  });

  it('recusa nome repetido, sem gravar', async () => {
    const user = userEvent.setup();
    renderPanel(<CitiValuesPanel />);

    await user.type(await screen.findByLabelText(/nome do novo valor/i), 'eu sou o citi');
    await user.click(screen.getByRole('button', { name: /adicionar valor/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/já existe um valor com esse nome/i);
    expect((await mockAdapter.settings.get()).citiValues).toHaveLength(4);
  });

  it('recusa nome repetido de um valor JÁ APOSENTADO', async () => {
    // Reaproveitar o nome partiria o histórico em dois valores homônimos: o de
    // antes e o de agora, sem como distinguir num X1 antigo.
    const { citiValues } = await mockAdapter.settings.get();
    await mockAdapter.settings.update({
      citiValues: citiValues.map((v, i) =>
        i === 0 ? { ...v, retiredAt: '2026-08-01T00:00:00.000Z' } : v,
      ),
    });

    const user = userEvent.setup();
    renderPanel(<CitiValuesPanel />);

    await screen.findByText('Fora de circulação');
    await user.type(screen.getByLabelText(/nome do novo valor/i), 'Eu sou o CITi');
    await user.click(screen.getByRole('button', { name: /adicionar valor/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/já existe um valor com esse nome/i);
    expect((await mockAdapter.settings.get()).citiValues).toHaveLength(4);
  });

  it('aposentar tira de circulação mas NÃO remove da lista', async () => {
    const user = userEvent.setup();
    renderPanel(<CitiValuesPanel />);

    await screen.findByText('Eu sou o CITi');
    await user.click(screen.getAllByRole('button', { name: 'Aposentar' })[0]);

    const dialog = within(await screen.findByRole('dialog'));
    expect(screen.getByText(/nada é apagado/i)).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Aposentar' }));

    await waitFor(async () => {
      const { citiValues } = await mockAdapter.settings.get();
      // A REGRA: continua na lista, só que fora de circulação.
      expect(citiValues).toHaveLength(4);
      expect(citiValues.find((v) => v.label === 'Eu sou o CITi')?.retiredAt).toBeTruthy();
    });
  });

  it('reativar devolve o valor ao formulário de X1', async () => {
    const { citiValues } = await mockAdapter.settings.get();
    await mockAdapter.settings.update({
      citiValues: citiValues.map((v) =>
        v.label === 'Obcecados por vencer' ? { ...v, retiredAt: '2026-08-01T00:00:00.000Z' } : v,
      ),
    });

    const user = userEvent.setup();
    renderPanel(<CitiValuesPanel />);

    await screen.findByText('Fora de circulação');
    await user.click(screen.getByRole('button', { name: /reativar/i }));

    await waitFor(async () => {
      const atual = await mockAdapter.settings.get();
      expect(atual.citiValues.find((v) => v.label === 'Obcecados por vencer')?.retiredAt).toBeNull();
    });
  });
});
