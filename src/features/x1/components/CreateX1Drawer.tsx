import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ClipboardCheck } from 'lucide-react';
import { Button, Drawer, useToast } from '@/components/ui';
import { messageFor, useCreateX1, useCurrentGestao, type ID, type Member } from '@/data';
import { useAuth } from '@/features/auth/useAuth';
import { emptyX1Form, toX1CreateInput, x1FormSchema, type X1FormValues } from '../schemas/x1Schema';
import { X1Form } from './X1Form';

/**
 * Registro de um X1 que aconteceu.
 *
 * POR QUE GAVETA GRANDE: são seis seções e cerca de quinze campos, preenchidos
 * com as anotações da conversa abertas ao lado. Uma janela centralizada com
 * isso obriga a rolar dentro de uma coluna estreita; a gaveta larga mantém o
 * perfil da pessoa visível atrás — que é o contexto do que está sendo escrito.
 *
 * REGRA DE PRODUTO: registrar cria um X1 NOVO, sempre. Isto nunca sobrescreve
 * uma conversa anterior — editar um X1 antigo serve para corrigir o registro
 * daquele dia, e é outro fluxo (X1-005).
 */
export function CreateX1Drawer({
  open,
  onClose,
  memberId,
  memberName,
  conductors,
  isFirstX1,
}: {
  open: boolean;
  onClose: () => void;
  memberId: ID;
  memberName: string;
  conductors: Member[];
  /** Muda o texto: o primeiro X1 de alguém é um marco, não mais um registro. */
  isFirstX1: boolean;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data: gestao } = useCurrentGestao();
  const createX1 = useCreateX1();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<X1FormValues>({
    resolver: zodResolver(x1FormSchema),
    defaultValues: emptyX1Form(user?.memberId),
  });

  useEffect(() => {
    if (open) {
      form.reset(emptyX1Form(user?.memberId));
      setSubmitError(null);
    }
  }, [open, form, user?.memberId]);

  const onSubmit = async (values: X1FormValues) => {
    setSubmitError(null);
    try {
      await createX1.mutateAsync(
        toX1CreateInput(values, {
          memberId,
          gestaoId: gestao?.id ?? null,
          authorId: user?.memberId ?? null,
        }),
      );

      onClose();
      showToast({
        message: isFirstX1 ? `Primeiro X1 de ${memberName} registrado` : 'X1 registrado',
        description: 'Histórico, atividade e situação de acompanhamento já foram atualizados.',
        tone: 'success',
      });
    } catch (error) {
      // Erro não fecha a gaveta: perder um formulário deste tamanho significa
      // reescrever a conversa inteira de memória.
      setSubmitError(messageFor(error));
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="xl"
      title={isFirstX1 ? 'Registrar primeiro X1' : 'Registrar X1'}
      subtitle={`Conversa com ${memberName}. Cada registro é uma conversa — o histórico anterior continua intacto.`}
      footer={
        <>
          <Button onClick={onClose} disabled={form.formState.isSubmitting}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon={<ClipboardCheck size={15} />}
            loading={form.formState.isSubmitting}
            onClick={form.handleSubmit(onSubmit)}
          >
            Registrar X1
          </Button>
        </>
      }
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <X1Form form={form} conductors={conductors} />

        {submitError && (
          <p
            role="alert"
            className="mt-6 rounded-control border border-bad/30 bg-bad/10 p-3 text-sm text-bad"
          >
            {submitError}
          </p>
        )}
      </form>
    </Drawer>
  );
}
