import { describe, expect, it } from 'vitest';
import { readZip, ZipError } from './zip';

/**
 * Testes do leitor de .zip.
 *
 * Os arquivos de teste são montados byte a byte aqui mesmo — é o jeito de
 * testar um parser de formato binário sem depender de um arquivo committado
 * que ninguém consegue revisar num diff.
 */

const textEncoder = new TextEncoder();

interface FixtureEntry {
  path: string;
  data: Uint8Array;
  /** 0 = armazenado, 8 = deflate. */
  method?: number;
  /** Conteúdo já comprimido, quando `method` é 8. */
  compressed?: Uint8Array;
}

/**
 * Monta um .zip mínimo: cabeçalho local + dados, índice central e EOCD.
 *
 * O CRC vai zerado de propósito: o leitor não valida checksum, e um CRC de
 * mentira deixaria o teste medindo a aritmética do fixture em vez do parser.
 */
function buildZip(entries: FixtureEntry[]): ArrayBuffer {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = textEncoder.encode(entry.path);
    const method = entry.method ?? 0;
    const stored = method === 0 ? entry.data : (entry.compressed ?? entry.data);

    const local = new Uint8Array(30 + name.length + stored.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true); // versão mínima
    localView.setUint16(6, 0, true); // flags
    localView.setUint16(8, method, true);
    localView.setUint32(14, 0, true); // crc32 (não verificado)
    localView.setUint32(18, stored.length, true); // tamanho comprimido
    localView.setUint32(22, entry.data.length, true); // tamanho original
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true); // extra
    local.set(name, 30);
    local.set(stored, 30 + name.length);
    parts.push(local);

    const dir = new Uint8Array(46 + name.length);
    const dirView = new DataView(dir.buffer);
    dirView.setUint32(0, 0x02014b50, true);
    dirView.setUint16(10, method, true);
    dirView.setUint32(20, stored.length, true);
    dirView.setUint32(24, entry.data.length, true);
    dirView.setUint16(28, name.length, true);
    dirView.setUint32(42, offset, true);
    dir.set(name, 46);
    central.push(dir);

    offset += local.length;
  }

  const centralSize = central.reduce((total, part) => total + part.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true);

  const all = [...parts, ...central, eocd];
  const total = all.reduce((sum, part) => sum + part.length, 0);
  const buffer = new Uint8Array(total);
  let cursor = 0;
  for (const part of all) {
    buffer.set(part, cursor);
    cursor += part.length;
  }

  return buffer.buffer as ArrayBuffer;
}

/** Um JPEG de mentira: bastam os bytes mágicos. */
function jpegBytes(extra = 40): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(3 + extra);
  bytes.set([0xff, 0xd8, 0xff], 0);
  return bytes;
}

describe('readZip', () => {
  it('lê arquivos armazenados sem compressão', async () => {
    const zip = buildZip([
      { path: 'ana.jpg', data: jpegBytes() },
      { path: 'bruno.png', data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
    ]);

    const entries = await readZip(zip);

    expect(entries.map((e) => e.name)).toEqual(['ana.jpg', 'bruno.png']);
    expect(entries[0].bytes.slice(0, 3)).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
    expect(entries[1].bytes).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  });

  it('devolve o nome do arquivo separado do caminho', async () => {
    const zip = buildZip([{ path: 'fotos/2026/ana.jpg', data: jpegBytes() }]);

    const [entry] = await readZip(zip);

    expect(entry.path).toBe('fotos/2026/ana.jpg');
    expect(entry.name).toBe('ana.jpg');
  });

  it('ignora pastas e o lixo que o macOS coloca no zip', async () => {
    // Sem isto, um .zip feito no Finder apareceria com o dobro de fotos,
    // metade delas ilegíveis.
    const zip = buildZip([
      { path: 'fotos/', data: new Uint8Array(0) },
      { path: '__MACOSX/fotos/._ana.jpg', data: new Uint8Array([0, 0, 0, 0]) },
      { path: 'fotos/._ana.jpg', data: new Uint8Array([0, 0, 0, 0]) },
      { path: 'fotos/ana.jpg', data: jpegBytes() },
    ]);

    const entries = await readZip(zip);

    expect(entries.map((e) => e.name)).toEqual(['ana.jpg']);
  });

  it('não prende o buffer do zip inteiro em cada foto', async () => {
    const zip = buildZip([{ path: 'ana.jpg', data: jpegBytes(500) }]);

    const [entry] = await readZip(zip);

    // Se fosse um subarray, o byteLength do buffer seria o do .zip completo.
    expect(entry.bytes.buffer.byteLength).toBe(entry.bytes.length);
  });

  it('recusa arquivo que não é zip', async () => {
    const naoEhZip = textEncoder.encode('isto aqui é só um texto qualquer, bem longo');

    await expect(readZip(naoEhZip.buffer as ArrayBuffer)).rejects.toBeInstanceOf(ZipError);
  });

  it('recusa método de compressão não suportado, dizendo qual arquivo', async () => {
    const zip = buildZip([{ path: 'ana.jpg', data: jpegBytes(), method: 12 }]);

    await expect(readZip(zip)).rejects.toThrow(/ana\.jpg/);
  });

  it('lê um zip vazio sem quebrar', async () => {
    expect(await readZip(buildZip([]))).toEqual([]);
  });
});

describe('readZip — deflate', () => {
  const temCompressao = typeof CompressionStream !== 'undefined';

  it.skipIf(!temCompressao)('descompacta entradas em deflate', async () => {
    const original = jpegBytes(2000);
    const fonte = new ReadableStream<BufferSource>({
      start(controller) {
        controller.enqueue(original);
        controller.close();
      },
    });
    const leitor = fonte.pipeThrough(new CompressionStream('deflate-raw')).getReader();
    const pedacos: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      pedacos.push(value);
    }
    const comprimido = new Uint8Array(pedacos.reduce((n, p) => n + p.length, 0));
    let cursor = 0;
    for (const pedaco of pedacos) {
      comprimido.set(pedaco, cursor);
      cursor += pedaco.length;
    }

    const zip = buildZip([
      { path: 'ana.jpg', data: original, method: 8, compressed: comprimido },
    ]);

    const [entry] = await readZip(zip);

    expect(entry.bytes).toEqual(original);
  });
});
