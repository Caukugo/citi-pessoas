import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserPlus } from 'lucide-react';
import { Button, Drawer, useToast } from '@/components/ui';
import {
  messageFor,
  useCreateMember,
  useSetMemberX1Periodicity,
  useSettings,
  type Member,
} from '@/data';
import { ROUTES } from '@/app/routes';
import {
  emptyMemberForm,
  makeMemberFormSchema,
  toMemberCreateInput,
  toX1PeriodicityException,
  type MemberFormValues,
} from '../schemas/memberSchema';
import { MemberForm } from './MemberForm';

/**
 * Cadastro de um membro novo.
 *
 * POR QUE GAVETA E NÃO JANELA: são doze campos em quatro seções. Uma janela
 * centralizada com isso vira uma coluna estreita e alta em tela de notebook, e
 * a listagem some por trás do escurecimento. A gaveta desliza da direita,
 * mantém a lista visível e tem rodapé fixo — dá para salvar sem rolar de volta.
 *
 * Fluxo: formulário → validação (zod) → `MemberCreateInput` → camada de dados
 * → cache invalidado → listagem atualizada. A tela não sabe se atrás disso tem
 * mock ou Postgres.
 */
export function CreateMemberDrawer({
  open,
  onClose,
  ggPeople,
}: {
  open: boolean;
  onClose: () => void;
  ggPeople: Member[];
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { data: settings } = useSettings();
  const createMember = useCreateMember();
  const setPeriodicity = useSetMemberX1Periodicity();
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Base sem ninguém de GG cadastrado: o campo deixa de ser obrigatório, senão
  // o primeiro membro da plataforma nunca poderia ser criado.
  const schema = useMemo(
    () => makeMemberFormSchema({ requireGgResponsible: ggPeople.length > 0 }),
    [ggPeople.length],
  );

  const form = useForm<MemberFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyMemberForm(),
  });

  // Cada abertura começa limpa. Sem isto, cancelar um cadastro deixa os dados
  // da pessoa anterior esperando na gaveta.
  useEffect(() => {
    if (open) {
      form.reset(emptyMemberForm());
      setSubmitError(null);
    }
  }, [open, form]);

  const onSubmit = async (values: MemberFormValues) => {
    setSubmitError(null);
    try {
      const member = await createMember.mutateAsync(toMemberCreateInput(values));

      // Periodicidade é configuração, não atributo do membro — por isso é uma
      // segunda escrita, e só quando a pessoa foge do padrão.
      const exception = toX1PeriodicityException(values);
      if (exception !== null) {
        await setPeriodicity.mutateAsync({ memberId: member.id, days: exception });
      }

      onClose();
      showToast({
        message: `${member.fullName} foi cadastrada`,
        // A situação inicial é sempre "primeiro X1 pendente": ninguém nasce
        // atrasado. Dizer isso aqui evita a leitura de que algo já está errado.
        description: 'Primeiro X1 pendente — ainda não houve nenhuma conversa registrada.',
        tone: 'success',
        action: {
          label: 'Abrir perfil',
          onClick: () => navigate(ROUTES.memberProfile(member.id)),
        },
      });
    } catch (error) {
      // Erro NÃO fecha a gaveta: o que foi digitado continua ali.
      setSubmitError(messageFor(error));
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="lg"
      title="Novo membro"
      subtitle="Só o essencial agora. O resto do cadastro pode ser completado depois, no perfil."
      footer={
        <>
          <Button onClick={onClose} disabled={form.formState.isSubmitting}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon={<UserPlus size={15} />}
            loading={form.formState.isSubmitting}
            onClick={form.handleSubmit(onSubmit)}
          >
            Cadastrar membro
          </Button>
        </>
      }
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <MemberForm
          form={form}
          ggPeople={ggPeople}
          defaultPeriodicityDays={settings?.defaultX1PeriodicityDays ?? 30}
        />

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
