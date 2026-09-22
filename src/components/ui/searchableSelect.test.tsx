import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchableSelect, type SearchableSelectOption } from './form';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Combobox de busca — o controle genérico que substitui rolar uma lista longa.
 *
 * Testado aqui como PEÇA do design system (sem React Hook Form, sem membro de
 * verdade): o contrato é `value`/`onChange` de string, igual a qualquer campo
 * controlado. A integração com o formulário de Feedback tem teste próprio em
 * `feedbacksFlow.test.tsx`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const OPTIONS: SearchableSelectOption[] = [
  { value: 'mbr-1', label: 'Ana Beatriz Souza', description: 'Gerente · Negócios' },
  { value: 'mbr-2', label: 'Íris Cavalcanti', description: 'Membro · Soluções' },
  { value: 'mbr-3', label: 'Tarcísio Amorim', description: 'Membro · Desenvolvimento' },
  { value: 'mbr-4', label: 'Ana Clara Ferreira', description: 'Membro · Marketing' },
];

/** Wrapper controlado — o componente é sempre `value`/`onChange`, nunca `defaultValue`. */
function Controlled({
  options = OPTIONS,
  onChange,
  ...rest
}: Partial<React.ComponentProps<typeof SearchableSelect>>) {
  const [value, setValue] = useState(rest.value ?? '');
  return (
    <SearchableSelect
      {...rest}
      value={value}
      options={options}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

describe('SearchableSelect', () => {
  it('mostra a lista inteira ao focar, sem digitar nada', async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    await user.click(screen.getByRole('combobox'));

    const listbox = screen.getByRole('listbox');
    expect(listbox.querySelectorAll('[role="option"]')).toHaveLength(OPTIONS.length);
  });

  it('filtra conforme digita (busca parcial)', async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), 'tarc');

    const listbox = screen.getByRole('listbox');
    expect(listbox.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(screen.getByRole('option', { name: /tarcísio amorim/i })).toBeVisible();
  });

  it('⚠️ ignora maiúsculas/minúsculas', async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), 'TARCÍSIO');

    expect(screen.getByRole('option', { name: /tarcísio amorim/i })).toBeVisible();
  });

  it('⚠️ ignora acento — "iris" acha "Íris"', async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), 'iris');

    expect(screen.getByRole('option', { name: /íris cavalcanti/i })).toBeVisible();
  });

  it('⚠️ ignora espaços excedentes na busca', async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), 'ana   beatriz');

    expect(screen.getByRole('option', { name: /ana beatriz souza/i })).toBeVisible();
  });

  it('zero resultados mostra "Nenhum membro encontrado"', async () => {
    const user = userEvent.setup();
    render(<Controlled emptyMessage="Nenhum membro encontrado" />);

    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), 'zzz-ninguem-com-este-nome');

    expect(screen.getByText('Nenhum membro encontrado')).toBeVisible();
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('nomes iguais mostram cargo/área para diferenciar, sem dado privado', async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), 'ana');

    expect(screen.getByText('Gerente · Negócios')).toBeVisible();
    expect(screen.getByText('Membro · Marketing')).toBeVisible();
  });

  it('seleção por mouse fecha a lista e preenche o valor', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: /tarcísio amorim/i }));

    expect(onChange).toHaveBeenCalledWith('mbr-3');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('combobox')).toHaveValue('Tarcísio Amorim');
  });

  it('⚠️ teclado: setas movem, Enter seleciona', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    // Ana Beatriz (0) → Íris (1) → Tarcísio (2): duas setas a partir do topo.
    expect(onChange).toHaveBeenCalledWith('mbr-3');
  });

  it('⚠️ Escape fecha sem escolher nada', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('⚠️ Tab (foco saindo do campo) fecha a lista, valor anterior preservado', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Controlled value="mbr-2" />
        <button type="button">Próximo campo</button>
      </>,
    );

    const input = screen.getByRole('combobox');
    expect(input).toHaveValue('Íris Cavalcanti');

    await user.click(input);
    expect(screen.getByRole('listbox')).toBeVisible();

    // Sai do campo para um elemento FORA do contêiner — é o que o `onBlur`
    // do contêiner precisa distinguir de "foco foi para uma opção da lista".
    fireEvent.blur(input, { relatedTarget: screen.getByRole('button', { name: 'Próximo campo' }) });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input).toHaveValue('Íris Cavalcanti');
  });

  it('botão de limpar volta o valor para vazio', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled value="mbr-2" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /limpar seleção/i }));

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('estado de carregamento desabilita a busca', () => {
    render(<Controlled isLoading loadingMessage="Carregando membros…" />);

    const input = screen.getByRole('combobox');
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('placeholder', 'Carregando membros…');
  });

  it('estado de erro aparece na lista em vez das opções', async () => {
    const user = userEvent.setup();
    render(<Controlled errorMessage="Não foi possível carregar os membros" />);

    await user.click(screen.getByRole('combobox'));

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar os membros');
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('nome acessível: o campo tem role combobox e listbox associado', async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    const input = screen.getByRole('combobox');
    await user.click(input);

    const listboxId = input.getAttribute('aria-controls');
    expect(listboxId).toBeTruthy();
    expect(document.getElementById(listboxId as string)).toHaveAttribute('role', 'listbox');
  });
});
