/**
 * ─────────────────────────────────────────────────────────────────────────────
 * O identificador do evento no Google — escolhido por NÓS.
 *
 * ⚠️ ESTA É A DEFESA CENTRAL CONTRA CONVITE DUPLICADO, e ela é estrutural, não
 * uma checagem otimista: se o Google escolhesse o id, uma resposta perdida nos
 * deixaria sem saber se o evento existe, e a tentativa seguinte criaria um
 * segundo convite na caixa de entrada de alguém. Com um id derivado do
 * agendamento, reenviar dá 409 "já existe" — que é a resposta certa.
 *
 * O formato é do Google: caracteres de base32hex (`a`–`v` e `0`–`9`), entre 5 e
 * 1024 caracteres. Um UUID em hexadecimal já cabe nesse alfabeto, com uma
 * ressalva: `w`, `x`, `y` e `z` não existem em base32hex, mas hexadecimal só
 * usa `0`–`9` e `a`–`f`, então todo UUID passa.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** O alfabeto que o Google aceita em `Events.id`. */
const BASE32HEX = /^[a-v0-9]{5,1024}$/;

/**
 * O id de evento de um agendamento.
 *
 * Determinístico: o mesmo agendamento produz sempre o mesmo id, em qualquer
 * tentativa e em qualquer execução da função.
 *
 * O prefixo `citi` serve para reconhecer, na sincronização, o que é nosso — e
 * descartar o resto da agenda pessoal sem nem olhar o conteúdo.
 */
export function eventIdFor(appointmentId: string): string {
  const limpo = appointmentId.toLowerCase().replace(/[^a-v0-9]/g, '');
  const id = `citi${limpo}`;

  // Um UUID limpo dá 32 caracteres; com o prefixo, 36. O piso de 5 só seria
  // atingido com um id degenerado, e aí é melhor falhar alto do que mandar ao
  // Google um id que ele recusa com uma mensagem obscura.
  if (!BASE32HEX.test(id)) {
    throw new Error('Identificador de agendamento incompatível com o formato do Google.');
  }

  return id;
}

/**
 * `true` quando este id de evento foi criado por esta plataforma.
 *
 * ⚠️ É a primeira das TRÊS travas que impedem a sincronização de importar a
 * agenda pessoal de alguém. As outras duas são: existir linha em
 * `x1_appointment_events` e o `citi_ambiente` bater. Nenhuma delas olha o
 * título do evento — classificar por título importaria o almoço de sexta que
 * alguém chamou de "X1".
 */
export function isCitiEventId(eventId: string | null | undefined): boolean {
  return typeof eventId === 'string' && eventId.startsWith('citi') && BASE32HEX.test(eventId);
}

/**
 * O id do pedido de conferência (Meet).
 *
 * O Google usa isto para deduplicar a CRIAÇÃO da conferência: repetir o mesmo
 * `requestId` no mesmo evento não gera uma segunda sala.
 */
export function conferenceRequestIdFor(appointmentId: string): string {
  return `citi-meet-${appointmentId}`;
}
