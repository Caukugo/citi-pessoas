import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  ConfirmDialog,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Panel,
  useToast,
} from '@/components/ui';
import { messageFor, useSettings, useUpdateSettings } from '@/data';
import {
  x1PeriodicitySchema,
  type X1PeriodicityFormValues,
} from '../schemas/x1PeriodicitySchema';

/**
 * ADM-001 — periodicidade padrão do X1.
 *
 * ⚠️ O QUE ESTA TELA MUDA, E O QUE ELA NÃO MUDA.
 *
 * Muda a regra que vale DAQUI PARA A FRENTE para quem segue o padrão. Como a
 * situação de X1 é sempre calculada e nunca gravada (ARCHITECTURE §4.1), a
 * mudança vale imediatamente para todo mundo — inclusive relendo o passado:
 * quem tinha 31 dias sem conversa deixa de aparecer como atrasado se o padrão
 * virar 45. Isso é proposital: "atrasado" é um estado de hoje, não um registro
 * histórico. Nenhum X1 gravado é tocado.
 *
 * NÃO mexe em quem tem periodicidade própria. `x1PeriodicityFor()` resolve
 * `exceção ?? padrão`, então a exceção continua ganhando — e o painel diz isso
 * antes de salvar, porque "mudei a regra geral" e "mudei a regra de todo mundo"
 * são coisas diferentes e a segunda apagaria decisões individuais.
 */
export function X1PeriodicityPanel() {
  const { showToast } = useToast();
  const settings = useSettings();
  const updateSettings = useUpdateSettings();

  const [confirmando, setConfirmando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const form = useForm<X1PeriodicityFormValues>({
    resolver: zodResolver(x1PeriodicitySchema),
    defaultValues: { defaultX1PeriodicityDays: '' },
  });

  const atual = settings.data?.defaultX1PeriodicityDays;

  // O campo só conhece o valor gravado depois que a configuração chega.
  useEffect(() => {
    if (atual !== undefined) {
      form.reset({ defaultX1PeriodicityDays: String(atual) });
    }
  }, [atual, form]);

  if (settings.isLoading) {
    return (
      <Panel title="Periodicidade de X1">
        <LoadingState label="Carregando configuração…" />
      </Panel>
    );
  }

  if (settings.isError || !settings.data) {
    return (
      <Panel title="Periodicidade de X1">
        <ErrorState
          title="Não foi possível carregar a configuração"
          description="Pode ter sido uma falha momentânea de conexão."
          onRetry={() => void settings.refetch()}
        />
      </Panel>
    );
  }

  const excecoes = Object.keys(settings.data.x1PeriodicityByMember).length;

  const confirmar = async () => {
    if (confirmando === null) return;
    setErro(null);
    try {
      await updateSettings.mutateAsync({ defaultX1PeriodicityDays: confirmando });
      showToast({
        message: `Periodicidade padrão agora é de ${confirmando} dias.`,
        description: 'A situação de acompanhamento de cada pessoa já foi recalculada.',
        tone: 'success',
      });
      setConfirmando(null);
    } catch (cause) {
      // Erro fica na tela, não em toast: é o tipo de falha que exige decidir o
      // que fazer, e um toast some antes de a pessoa terminar de ler.
      setErro(messageFor(cause));
    }
  };

  return (
    <Panel
      title="Periodicidade de X1"
      subtitle="De quantos em quantos dias cada pessoa deve ter uma conversa individual."
    >
      <form
        onSubmit={form.handleSubmit((values) =>
          setConfirmando(Number(values.defaultX1PeriodicityDays)),
        )}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <FormField
              label="Periodicidade padrão"
              hint="Em dias. O CITi usa 30 — um X1 por mês."
              error={form.formState.errors.defaultX1PeriodicityDays?.message}
              required
            >
              {(field) => (
                <Input
                  {...field}
                  {...form.register('defaultX1PeriodicityDays')}
                  inputMode="numeric"
                  placeholder="30"
                />
              )}
            </FormField>
          </div>

          <Button type="submit" className="shrink-0" disabled={updateSettings.isPending}>
            Salvar
          </Button>
        </div>

        {excecoes > 0 && (
          <p className="text-xs text-muted-foreground">
            {excecoes === 1
              ? '1 pessoa tem periodicidade própria e não é afetada por esta mudança.'
              : `${excecoes} pessoas têm periodicidade própria e não são afetadas por esta mudança.`}
          </p>
        )}

        {erro && (
          <p role="alert" className="text-sm text-bad">
            {erro}
          </p>
        )}
      </form>

      <ConfirmDialog
        open={confirmando !== null}
        onClose={() => setConfirmando(null)}
        onConfirm={() => void confirmar()}
        title={`Mudar a periodicidade padrão para ${confirmando} dias?`}
        description={
          `A partir de agora o atraso de X1 passa a ser contado a cada ${confirmando} dias para ` +
          (excecoes > 0
            ? `todo mundo que segue o padrão. As ${excecoes} exceções individuais continuam como estão. `
            : 'todos os membros. ') +
          'Nenhum X1 já registrado é alterado.'
        }
        confirmLabel="Mudar periodicidade"
        loading={updateSettings.isPending}
      />
    </Panel>
  );
}
