/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CIFRA AUTENTICADA E HMAC — só servidor.
 *
 * ⚠️ ESTE ARQUIVO NUNCA É IMPORTADO PELO FRONTEND. Ele vive em
 * `supabase/functions/` e não em `src/` justamente por isso: o que está em
 * `src/` vai para o bundle do navegador, e chave de cifra no navegador não é
 * chave, é enfeite.
 *
 * Usa só Web Crypto (`crypto.subtle`), que existe no Deno da Edge Function e no
 * Node 20 — é o que permite testar isto de verdade na suíte do projeto, em vez
 * de confiar que "deve funcionar em produção".
 *
 * DUAS CHAVES, SEPARADAS, e a separação não é burocracia:
 *
 *   CPF_ENCRYPTION_KEY  cifra e decifra (AES-256-GCM)
 *   CPF_HASH_KEY        calcula o HMAC de duplicidade
 *
 * Com uma chave só, quem obtivesse o material de hash (que precisa ser
 * comparável, portanto determinístico) teria também a chave que decifra tudo.
 *
 * POR QUE AES-GCM E NÃO AES-CBC: GCM é cifra AUTENTICADA — ele detecta se o
 * texto cifrado foi alterado. Com CBC, um byte trocado no banco vira lixo
 * decifrado sem ninguém perceber.
 *
 * POR QUE HMAC E NÃO SHA-256 PURO: existem ~1,7 bilhão de CPFs válidos. Uma
 * tabela de SHA-256 de todos eles se constrói num notebook em horas. Com HMAC
 * e chave separada, quem tem só o banco não monta essa tabela.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Nonce do GCM: 12 bytes é o tamanho recomendado e o que o padrão espera. */
export const GCM_IV_BYTES = 12;

/** Material cifrado, pronto para o banco. Nada aqui é legível. */
export interface SealedValue {
  /** Texto cifrado + tag de autenticação, em base64. */
  ciphertext: string;
  /** Nonce, em base64. Novo a cada gravação. */
  iv: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * A chave crua, a partir do segredo do ambiente.
 *
 * Aceita base64 (32 bytes = AES-256) ou hexadecimal. Recusa qualquer coisa que
 * não dê exatamente 32 bytes — uma chave curta "funcionaria" e daria uma falsa
 * sensação de cifra forte.
 */
export function decodeKeyMaterial(secret: string): Uint8Array {
  const trimmed = secret.trim();
  if (!trimmed) throw new Error('Segredo de chave vazio.');

  const bytes = /^[0-9a-fA-F]{64}$/.test(trimmed)
    ? Uint8Array.from(trimmed.match(/.{2}/g)!.map((pair) => parseInt(pair, 16)))
    : fromBase64(trimmed);

  if (bytes.length !== 32) {
    throw new Error(
      `Chave precisa ter 32 bytes (AES-256); o segredo informado tem ${bytes.length}.`,
    );
  }

  return bytes;
}

async function importAesKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    decodeKeyMaterial(secret) as unknown as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    decodeKeyMaterial(secret) as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/**
 * Cifra um valor. O IV é sorteado a cada chamada — reaproveitar IV com a mesma
 * chave quebra a garantia do GCM, e é o erro clássico de quem "otimiza" isso.
 */
export async function seal(plaintext: string, secret: string): Promise<SealedValue> {
  const key = await importAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));

  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as ArrayBuffer },
    key,
    new TextEncoder().encode(plaintext) as unknown as ArrayBuffer,
  );

  // O Web Crypto devolve texto cifrado + tag juntos. Guardamos assim, e é por
  // isso que o banco não tem coluna separada de tag.
  return { ciphertext: toBase64(new Uint8Array(sealed)), iv: toBase64(iv) };
}

/**
 * Decifra. Se o texto cifrado ou o IV tiverem sido alterados, o GCM falha —
 * e falhar é o comportamento certo: melhor erro do que devolver lixo como se
 * fosse o CPF de alguém.
 */
export async function open(sealed: SealedValue, secret: string): Promise<string> {
  const key = await importAesKey(secret);

  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(sealed.iv) as unknown as ArrayBuffer },
    key,
    fromBase64(sealed.ciphertext) as unknown as ArrayBuffer,
  );

  return new TextDecoder().decode(plain);
}

/**
 * HMAC-SHA-256 em base64. Determinístico de propósito: é o que permite o índice
 * único do banco dizer "este CPF já é de outra pessoa" sem decifrar nada.
 */
export async function fingerprint(value: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret);
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value) as unknown as ArrayBuffer,
  );

  return toBase64(new Uint8Array(mac));
}

/**
 * HMAC-SHA-256 em hexadecimal — mesmo primitivo de `fingerprint()`, só muda a
 * codificação de saída. Existe para a assinatura do webhook do Google Forms
 * (`google-forms-intake`): o Apps Script gera a assinatura com
 * `Utilities.computeHmacSha256Signature`, que é mais simples de converter para
 * hex do lado de lá do que para base64. Não tem nenhuma relação com CPF — usa
 * `GOOGLE_FORMS_WEBHOOK_SECRET`, nunca `CPF_HASH_KEY`.
 *
 * Aceita a chave como texto simples (o segredo do webhook não precisa ter
 * exatamente 32 bytes como as chaves de CPF — é comparado por HMAC, não usado
 * para cifrar).
 */
export async function hmacHex(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret) as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value) as unknown as ArrayBuffer,
  );

  return Array.from(new Uint8Array(mac))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compara duas strings em tempo constante — usada para conferir a assinatura
 * do webhook sem vazar, pelo tempo de resposta, quantos caracteres iniciais
 * batem. `===` vaza isso; este loop não.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
