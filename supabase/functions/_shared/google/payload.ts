import type { EventoPayload } from './calendar.ts';
import { conferenceRequestIdFor } from './eventId.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE VAI PARA O GOOGLE — montado no SERVIDOR, a partir da linha do banco.
 *
 * ⚠️ POR QUE ISTO EXISTE DE NOVO, se `src/features/x1/model/googlePayload.ts`
 * já faz o mesmo: porque aquele arquivo nunca fala com o Google. Ele monta a
 * prévia que a tela mostra. Quem de fato chama a API é esta função, e uma
 * regra de produto que só vale no navegador não vale — bastaria um PATCH fora
 * da tela para contorná-la.
 *
 * Os dois são deliberadamente parecidos e deliberadamente separados: rodam em
 * runtimes diferentes (Deno e o browser), leem formatos diferentes (linha
 * `snake_case` do Postgres e modelo de domínio) e protegem a mesma regra em
 * dois lugares onde ela pode ser quebrada. O teste de cada um afirma a MESMA
 * coisa: as chaves são exatamente estas e nenhuma outra.
 *
 * LISTA BRANCA, e a direção importa: o payload é construído campo a campo a
 * partir de valores nomeados um a um. O desenho contrário — montar o objeto
 * inteiro e depois apagar o que é sensível — falha em silêncio no dia em que
 * alguém acrescenta uma coluna `notas_do_gg`.
 *
 * NUNCA entram: `internal_notes`, `cancellation_reason`, resumo da conversa,
 * avaliação dos valores do CITi e comentários de GG. O convite leva título,
 * participantes, horário, local ou Meet, e a pauta explicitamente
 * compartilhada.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Os campos da linha que esta função pode ler.
 *
 * ⚠️ O tipo é restrito de propósito. Passar `x1_appointments%rowtype` inteiro
 * aqui daria ao autor da próxima mudança acesso a `internal_notes` a um ponto
 * de distância — e a lista branca deixaria de ser uma barreira para virar uma
 * convenção.
 */
export interface AgendamentoParaEvento {
  id: string;
  starts_at: string | null;
  ends_at: string | null;
  time_zone: string;
  mode: 'online' | 'presencial';
  location: string | null;
  wants_meet: boolean;
  shared_agenda: string | null;
}

export interface ConvidadoDoEvento {
  /** Nome do membro — entra só no TÍTULO, e só via `{membro}`. */
  nome: string;
  /** ⚠️ O e-mail INSTITUCIONAL. `personal_email` não substitui em silêncio. */
  email: string;
}

/** Um e-mail plausível o bastante para não gastar uma chamada ao Google. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailValido(email: string | null | undefined): boolean {
  return typeof email === 'string' && EMAIL.test(email.trim());
}

/**
 * Monta o título a partir do template configurável.
 *
 * Só dois marcadores, os dois seguros: `{membro}` e `{gestao}`. A constraint
 * `google_calendar_config_titulo_sem_placeholder_desconhecido` já recusa
 * qualquer outro no banco; aqui a substituição simplesmente ignora o que não
 * conhece, em vez de interpretar.
 *
 * Sem gestão, o separador vai junto: "X1 · Ana · " com um rabo solto é pior do
 * que "X1 · Ana".
 */
export function renderizarTitulo(
  template: string,
  valores: { membro: string; gestao?: string | null },
): string {
  const bruto = template
    .replaceAll('{membro}', valores.membro)
    .replaceAll('{gestao}', valores.gestao ?? '');

  return bruto.replace(/\s*[·—–-]\s*$/u, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * O payload do evento, ou `null` quando o compromisso não pode virar convite.
 *
 * `null` é o caso do legado "horário a definir": sem instante não há evento.
 * A constraint `x1_agendamento_sem_horario_nao_sincroniza` garante o mesmo no
 * banco — esta é a segunda das duas travas, e ela existe para que um erro de
 * código aqui não vire um convite às 00:00 na caixa de entrada de alguém.
 */
export function montarPayloadEvento(
  agendamento: AgendamentoParaEvento,
  convidado: ConvidadoDoEvento,
  titulo: { template: string; gestao?: string | null },
): EventoPayload | null {
  if (!agendamento.starts_at || !agendamento.ends_at) return null;

  const payload: EventoPayload = {
    summary: renderizarTitulo(titulo.template, {
      membro: convidado.nome,
      gestao: titulo.gestao,
    }),
    start: { dateTime: agendamento.starts_at, timeZone: agendamento.time_zone },
    end: { dateTime: agendamento.ends_at, timeZone: agendamento.time_zone },
    attendees: [{ email: convidado.email }],
  };

  const pauta = agendamento.shared_agenda?.trim();
  if (pauta) payload.description = pauta;

  if (agendamento.mode === 'presencial') {
    const local = agendamento.location?.trim();
    if (local) payload.location = local;
  }

  // O `requestId` é derivado do agendamento: repetir o mesmo pedido no mesmo
  // evento não cria uma segunda sala.
  if (agendamento.mode === 'online' && agendamento.wants_meet) {
    payload.conferenceRequestId = conferenceRequestIdFor(agendamento.id);
  }

  return payload;
}

/**
 * As chaves que o payload pode ter.
 *
 * Existe para o teste afirmar "exatamente estas e nenhuma outra" sem repetir a
 * lista à mão — é o que transforma a lista branca em algo que falha na suíte
 * quando alguém acrescenta um campo.
 */
export const CHAVES_DO_PAYLOAD = [
  'summary',
  'description',
  'start',
  'end',
  'attendees',
  'location',
  'conferenceRequestId',
] as const satisfies ReadonlyArray<keyof EventoPayload>;
