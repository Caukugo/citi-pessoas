import type { ISODate } from '@/data';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Dia local num fuso nomeado, sem biblioteca de fuso.
 *
 * POR QUE ISTO EXISTE: um compromisso das 22h em Recife não pode aparecer no
 * dia seguinte só porque o navegador está em outro fuso. E um agendamento
 * legado "sem horário" precisa começar às 00:00 e terminar às 23:59:59 DAQUELE
 * dia, no fuso em que foi combinado — senão ele vira "aguardando registro" à
 * meia-noite e um minuto.
 *
 * `date-fns` v4 resolve fuso nomeado com `@date-fns/tz`, que NÃO está
 * instalado — e `CLAUDE.md` §7 diz para não acrescentar dependência sem
 * combinar. `Intl.DateTimeFormat` já faz o trabalho, está no runtime e não
 * custa nada.
 *
 * Se outra feature precisar disto, promova para `src/lib/` e avise o Cauan.
 * Enquanto for só a agenda, mora aqui.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Quanto o fuso está à frente do UTC, em milissegundos, naquele instante. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');

  // `hour12: false` devolve 24 para a meia-noite em alguns runtimes.
  const hour = get('hour') % 24;

  const wallClockAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour,
    get('minute'),
    get('second'),
  );

  // Os `parts` não têm milissegundo: tira-os do instante antes de comparar.
  return wallClockAsUtc - (instant.getTime() - instant.getMilliseconds());
}

/** O dia local (`yyyy-MM-dd`) em que este instante cai, naquele fuso. */
export function dayInZone(instant: Date, timeZone: string): ISODate {
  // `en-CA` formata como `yyyy-MM-dd`, que é exatamente o formato do projeto.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** A hora local (`HH:mm`) deste instante, naquele fuso. */
export function timeInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).format(instant);
}

/**
 * O instante em que um horário de parede começa, naquele fuso.
 *
 * Duas passadas: a primeira estima o deslocamento, a segunda o confere com a
 * data já corrigida. É o que evita errar por uma hora na virada de horário de
 * verão — Recife não tem, mas o fuso é configurável e a função não deve
 * depender disso.
 */
export function zonedTimeToInstant(
  day: ISODate,
  timeOfDay: string,
  timeZone: string,
): Date {
  const [year, month, date] = day.slice(0, 10).split('-').map(Number);
  const [hour = 0, minute = 0, second = 0] = timeOfDay.split(':').map(Number);

  const asIfUtc = Date.UTC(year, month - 1, date, hour, minute, second);

  let instant = asIfUtc - zoneOffsetMs(new Date(asIfUtc), timeZone);
  instant = asIfUtc - zoneOffsetMs(new Date(instant), timeZone);

  return new Date(instant);
}

/** 00:00:00 do dia, naquele fuso. */
export function zonedDayStart(day: ISODate, timeZone: string): Date {
  return zonedTimeToInstant(day, '00:00:00', timeZone);
}

/**
 * 23:59:59 do dia, naquele fuso.
 *
 * É o FIM efetivo de um compromisso "horário a definir": ele ocupa o dia
 * inteiro, e só depois que o dia acaba faz sentido cobrar o registro.
 */
export function zonedDayEnd(day: ISODate, timeZone: string): Date {
  return zonedTimeToInstant(day, '23:59:59', timeZone);
}
