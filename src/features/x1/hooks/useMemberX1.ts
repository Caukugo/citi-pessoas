import { useMemo } from 'react';
import {
  lastCompletedX1,
  memberX1StatusFrom,
  nextRecommendedX1Date,
  nextScheduledX1,
  useSettings,
  useX1sByMember,
  x1PeriodicityFor,
  type ID,
  type ISODate,
  type MemberX1Status,
  type X1,
} from '@/data';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Tudo que o Perfil precisa saber sobre o X1 de uma pessoa, derivado de UMA
 * fonte: o histórico dela.
 *
 * ⚠️ É aqui que mora a garantia mais importante desta feature. Resumo,
 * histórico, timeline, "último X1", "próximo recomendado" e situação saem todos
 * do mesmo `x1s`. Nenhum deles é guardado em lugar nenhum, e por isso nenhum
 * deles pode discordar dos outros depois que alguém registra uma conversa.
 *
 * Se algum dia aparecer um `member.lastX1Date` no modelo, esta garantia acaba.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface MemberX1Overview {
  /** Histórico completo, do mais recente para o mais antigo. */
  x1s: X1[];
  /** Só os realizados — os que contam para o acompanhamento. */
  completed: X1[];
  /** Último X1 realizado, ou `null` se a pessoa nunca teve nenhum. */
  lastX1: X1 | null;
  /** Próximo X1 já marcado, se houver. */
  scheduled: X1 | null;
  /** Data recomendada para o próximo. `null` quando o próximo é o primeiro. */
  nextRecommendedDate: ISODate | null;
  /** Periodicidade que vale para esta pessoa (padrão ou exceção dela). */
  periodicityDays: number;
  /** Tem exceção de periodicidade configurada? Muda o texto na tela. */
  hasPeriodicityException: boolean;
  status: MemberX1Status;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useMemberX1(memberId: ID | undefined): MemberX1Overview {
  const x1Query = useX1sByMember(memberId);
  const settingsQuery = useSettings();

  const derived = useMemo(() => {
    const x1s = x1Query.data ?? [];
    const settings = settingsQuery.data;

    const periodicityDays = settings && memberId ? x1PeriodicityFor(memberId, settings) : 30;
    const lastX1 = lastCompletedX1(x1s);

    return {
      x1s,
      completed: x1s.filter((x1) => x1.status === 'realizado'),
      lastX1,
      scheduled: nextScheduledX1(x1s),
      nextRecommendedDate: nextRecommendedX1Date(x1s, periodicityDays),
      periodicityDays,
      hasPeriodicityException: Boolean(
        settings && memberId && settings.x1PeriodicityByMember[memberId] !== undefined,
      ),
      status: memberX1StatusFrom(lastX1, periodicityDays),
    };
  }, [x1Query.data, settingsQuery.data, memberId]);

  return {
    ...derived,
    isLoading: x1Query.isLoading || settingsQuery.isLoading,
    isError: x1Query.isError || settingsQuery.isError,
    refetch: () => {
      void x1Query.refetch();
      void settingsQuery.refetch();
    },
  };
}
