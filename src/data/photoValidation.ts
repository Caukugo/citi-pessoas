/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FOTO — limite e tipo real, sem depender de extensão. Regra PURA, sem import.
 *
 * ⚠️ ESTE ARQUIVO É COMPARTILHADO COM O SERVIDOR. A Edge Function
 * `google-forms-intake` o importa por caminho relativo
 * (`../../../src/data/photoValidation.ts`), do mesmo jeito que `member-cpf`
 * importa `cpf.ts` — é o que evita reimplementar a detecção de bytes mágicos
 * numa segunda linguagem/arquivo e as duas versões divergirem.
 *
 * Por isso: NENHUM import aqui. Sem `@/`, sem React, sem Deno, sem Node.
 *
 * Historicamente esta regra vivia dentro de `data/import/importPlan.ts`, que
 * arrasta `cycleBounds`, `positionLabels` e `currentRoster` — inviável de
 * importar numa Edge Function sem import map. `importPlan.ts` reexporta
 * daqui; nenhuma chamada existente muda.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Limite do bucket `member-photos`, definido na migration 0010. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * Descobre o tipo da imagem pelo CONTEÚDO, não pela extensão.
 *
 * Um arquivo `.jpg` que na verdade é um HEIC do iPhone renomeado passaria pela
 * checagem de extensão e seria recusado lá no bucket, depois de o membro já ter
 * sido criado. Melhor descobrir aqui.
 */
export function detectImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && PNG.every((byte, i) => bytes[i] === byte)) {
    return 'image/png';
  }

  // WebP é um contêiner RIFF: 'RIFF' ....(tamanho).... 'WEBP'
  if (bytes.length >= 12) {
    const ascii = (start: number, end: number) =>
      String.fromCharCode(...Array.from(bytes.subarray(start, end)));
    if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  }

  return null;
}

/**
 * Deixa o nome do arquivo seguro para virar chave no Storage.
 *
 * Acento e espaço funcionam na maioria dos casos, mas viram escape na URL
 * assinada e tornam impossível conferir um caminho a olho no painel.
 *
 * Compartilhada entre `supabaseAdapter.ts` (upload pela tela) e a Edge
 * Function `google-forms-intake` (upload pela integração) — mesma regra, um
 * lugar só.
 */
export function safeFileName(name: string): string {
  const normalized = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return normalized || 'foto';
}
