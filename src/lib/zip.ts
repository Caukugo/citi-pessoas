/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Leitor mínimo de arquivos .zip.
 *
 * POR QUE ESCREVER ISTO EM VEZ DE USAR UMA BIBLIOTECA: `package.json` é
 * compartilhado entre cinco pessoas trabalhando em branches paralelas, e o
 * CLAUDE.md pede combinar antes de adicionar dependência. O que a importação
 * precisa de um ZIP é pequeno e estável desde 1989: ler o índice e extrair os
 * arquivos. Descompactar usa o `DecompressionStream` do próprio navegador.
 *
 * O que suporta: método 0 (armazenado) e 8 (deflate) — os dois que um ZIP de
 * fotos usa. O que NÃO suporta, avisando em vez de devolver lixo: ZIP64,
 * arquivos protegidos por senha e outros métodos de compressão.
 *
 * Referência do formato: APPNOTE.TXT da PKWARE, seções 4.3.6 a 4.3.16.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Um arquivo de dentro do ZIP. */
export interface ZipEntry {
  /** Caminho como está gravado no ZIP, ex.: `fotos/ana.jpg`. */
  path: string;
  /** Só o nome do arquivo, sem as pastas: `ana.jpg`. */
  name: string;
  bytes: Uint8Array;
}

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

const SIGNATURE_EOCD = 0x06054b50;
const SIGNATURE_CENTRAL = 0x02014b50;
const SIGNATURE_LOCAL = 0x04034b50;

/** Valor que o ZIP usa para dizer "este número não coube aqui" (ZIP64). */
const ZIP64_SENTINEL = 0xffffffff;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

/**
 * Localiza o "End of Central Directory", que fica no FIM do arquivo e é o
 * único ponto de entrada confiável: o ZIP é lido de trás para frente porque um
 * arquivo pode ter sido concatenado a outra coisa.
 *
 * O comentário final pode ter até 65535 bytes, então a busca não precisa ir
 * além disso.
 */
function findEndOfCentralDirectory(view: DataView): number {
  const maxComment = 0xffff;
  const minRecord = 22;
  const start = Math.max(0, view.byteLength - maxComment - minRecord);

  for (let offset = view.byteLength - minRecord; offset >= start; offset--) {
    if (view.getUint32(offset, true) === SIGNATURE_EOCD) return offset;
  }

  throw new ZipError('Arquivo .zip inválido ou corrompido: índice final não encontrado.');
}

async function inflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new ZipError(
      'Este navegador não sabe descompactar .zip. Atualize o navegador ou envie as fotos em um .zip sem compressão.',
    );
  }

  // Um ReadableStream montado na mão, em vez de `new Blob([...]).stream()`:
  // o Blob do jsdom não implementa `.stream()`, e depender disso deixaria o
  // caminho de descompressão sem teste automatizado nenhum.
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });

  const reader = source.pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }

  const out = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out;
}

/**
 * Lê um .zip e devolve os arquivos que ele contém.
 *
 * Pastas são ignoradas (entradas que terminam em `/`), assim como os metadados
 * que o macOS insere (`__MACOSX/`, `._arquivo`) — senão um ZIP feito no Finder
 * apareceria com o dobro de fotos, metade delas ilegíveis.
 */
export async function readZip(buffer: ArrayBuffer): Promise<ZipEntry[]> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const eocd = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(eocd + 10, true);
  const centralOffset = view.getUint32(eocd + 16, true);

  if (centralOffset === ZIP64_SENTINEL || entryCount === 0xffff) {
    throw new ZipError('Arquivos .zip no formato ZIP64 não são suportados.');
  }

  const utf8 = new TextDecoder('utf-8');
  const entries: ZipEntry[] = [];
  let cursor = centralOffset;

  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(cursor, true) !== SIGNATURE_CENTRAL) {
      throw new ZipError('Arquivo .zip inválido ou corrompido: índice inconsistente.');
    }

    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);

    const path = utf8.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;

    // Bit 0 do flag geral = conteúdo criptografado.
    if ((flags & 0x1) !== 0) {
      throw new ZipError(`O arquivo "${path}" está protegido por senha.`);
    }

    const isFolder = path.endsWith('/');
    const isMacMetadata = path.startsWith('__MACOSX/') || path.split('/').pop()?.startsWith('._');
    if (isFolder || isMacMetadata) continue;

    if (compressedSize === ZIP64_SENTINEL || localOffset === ZIP64_SENTINEL) {
      throw new ZipError('Arquivos .zip no formato ZIP64 não são suportados.');
    }

    // O cabeçalho local repete nome e extras com tamanhos próprios — precisa
    // ser lido, porque não há garantia de que sejam iguais aos do índice.
    if (view.getUint32(localOffset, true) !== SIGNATURE_LOCAL) {
      throw new ZipError(`Arquivo .zip inválido: cabeçalho de "${path}" não confere.`);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(dataStart, dataStart + compressedSize);

    let content: Uint8Array;
    if (method === METHOD_STORED) {
      content = raw;
    } else if (method === METHOD_DEFLATE) {
      content = await inflateRaw(raw);
    } else {
      throw new ZipError(
        `O arquivo "${path}" usa um método de compressão não suportado (${method}). ` +
          'Recompacte o .zip com compressão normal.',
      );
    }

    entries.push({
      path,
      name: path.split('/').pop() ?? path,
      // Cópia: `subarray` aponta para o buffer inteiro do ZIP, que ficaria
      // preso na memória enquanto qualquer foto existisse.
      bytes: new Uint8Array(content),
    });
  }

  return entries;
}
