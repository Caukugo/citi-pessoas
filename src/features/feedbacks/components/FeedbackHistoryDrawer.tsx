import { Plus, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, Drawer, EmptyState } from '@/components/ui';
import type { Feedback, FeedbackType, ID, Member } from '@/data';
import { ROUTES } from '@/app/routes';
import { FEEDBACK_TYPE_PLURAL, selectMemberFeedbacks } from '../model/feedbacksOverview';
import { FeedbackHistoryItem } from './FeedbackHistoryItem';

/**
 * Histórico de uma pessoa, recortado por tipo.
 *
 * Abre ao clicar em uma contagem da tabela. O recorte é exatamente o que foi
 * clicado: clicar em "3" na coluna de Informais mostra os três informais, não
 * o histórico inteiro com os outros misturados. Manter a promessa do clique é
 * o que faz a contagem valer como atalho.
 */
export function FeedbackHistoryDrawer({
  open,
  onClose,
  member,
  type,
  feedbacks,
  directory,
  onRegister,
}: {
  open: boolean;
  onClose: () => void;
  member: Member | null;
  /** `undefined` mostra o histórico completo da pessoa. */
  type?: FeedbackType;
  feedbacks: Feedback[];
  directory: Map<ID, Member>;
  onRegister: () => void;
}) {
  const navigate = useNavigate();
  const items = selectMemberFeedbacks(feedbacks, type);
  const title = type ? `Feedbacks ${FEEDBACK_TYPE_PLURAL[type]}` : 'Histórico de feedbacks';

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="lg"
      title={title}
      subtitle={member?.fullName}
      footer={
        <>
          <Button onClick={onClose}>Fechar</Button>
          {member && (
            // Ir ao Perfil é a saída natural daqui: o histórico responde
            // "o quê", e o Perfil responde "quem é esta pessoa".
            <Button
              icon={<UserRound size={15} />}
              onClick={() => navigate(ROUTES.memberProfile(member.id))}
            >
              Abrir perfil
            </Button>
          )}
        </>
      }
    >
      {items.length === 0 ? (
        <EmptyState
          title="Nenhum feedback registrado"
          description={
            type
              ? `${member?.fullName ?? 'Esta pessoa'} não tem nenhum registro deste tipo.`
              : 'Os feedbacks de acompanhamento desta pessoa aparecerão aqui.'
          }
          action={
            <Button variant="primary" icon={<Plus size={15} />} onClick={onRegister}>
              Registrar feedback
            </Button>
          }
        />
      ) : (
        <ol className="-m-6 flex flex-col">
          {items.map((feedback) => (
            <FeedbackHistoryItem key={feedback.id} feedback={feedback} directory={directory} />
          ))}
        </ol>
      )}
    </Drawer>
  );
}
