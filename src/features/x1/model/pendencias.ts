import type { ID, Member, MemberX1Status, Settings, X1, X1Appointment } from '@/data';
import { memberX1StatusFrom, x1PeriodicityFor } from '@/data';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quem precisa de acompanhamento.
 *
 * ⚠️ A REGRA CENTRAL, de novo, porque é onde ela é mais fácil de quebrar: a
 * situação vem da ÚLTIMA CONVERSA REALIZADA e da periodicidade configurada.
 * Ter compromisso marcado não tira ninguém desta lista.
 *
 * Alguém vai querer "limpar" a lista escondendo quem já tem X1 agendado. Isso
 * transformaria "precisa de acompanhamento" em "precisa que alguém marque uma
 * reunião" — e a pendência que existe para proteger a pessoa viraria uma
 * caixinha marcada. O agendamento aparece na coluna ao lado justamente para
 * mostrar que uma coisa não resolve a outra.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface X1PendingItem {
  member: Member;
  status: MemberX1Status;
  /** O próximo compromisso, se houver. Não muda a situação — só informa. */
  nextAppointment: X1Appointment | null;
}

export interface BuildPendingOptions {
  members: Member[];
  /** Último X1 REALIZADO de cada membro (uma consulta só). */
  lastCompletedByMember: Record<ID, X1>;
  /** Próximo compromisso de cada membro (uma consulta só). */
  nextByMember: Record<ID, X1Appointment>;
  settings: Settings;
  /**
   * Quando informado, só entram os membros desta carteira de GG.
   *
   * ⚠️ É a CARTEIRA (`member.ggResponsibleId`), não o organizador dos
   * compromissos. São recortes diferentes e a tela precisa dizer qual usou.
   */
  ggResponsibleId?: ID | null;
  now?: Date;
}

export function buildPendingFollowUps({
  members,
  lastCompletedByMember,
  nextByMember,
  settings,
  ggResponsibleId,
  now = new Date(),
}: BuildPendingOptions): X1PendingItem[] {
  return members
    .filter((member) => member.status === 'ativo')
    .filter((member) => !ggResponsibleId || member.ggResponsibleId === ggResponsibleId)
    .map((member) => ({
      member,
      status: memberX1StatusFrom(
        lastCompletedByMember[member.id],
        x1PeriodicityFor(member.id, settings),
        now,
      ),
      nextAppointment: nextByMember[member.id] ?? null,
    }))
    .filter((item) => item.status !== 'em_dia')
    .sort(byUrgency);
}

/**
 * Atrasado antes de primeiro pendente, e sem agendamento antes de com.
 *
 * Quem está atrasado há tempo e sem nada marcado é quem corre mais risco de
 * continuar esquecido — é a primeira linha porque é a que precisa de ação.
 */
function byUrgency(a: X1PendingItem, b: X1PendingItem): number {
  const peso: Record<MemberX1Status, number> = {
    atrasado: 0,
    primeiro_pendente: 1,
    em_dia: 2,
  };

  if (peso[a.status] !== peso[b.status]) return peso[a.status] - peso[b.status];

  const semAgendamento = (item: X1PendingItem) => (item.nextAppointment ? 1 : 0);
  if (semAgendamento(a) !== semAgendamento(b)) return semAgendamento(a) - semAgendamento(b);

  return a.member.fullName.localeCompare(b.member.fullName, 'pt-BR');
}
