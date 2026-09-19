import { readZip } from '@/lib/zip';
import { detectImageType, type ImportPhoto } from './importPlan';

/**
 * Lê o .zip de fotos e identifica cada arquivo.
 *
 * O tipo vem dos BYTES, não da extensão: um `.jpg` que na verdade é um HEIC
 * renomeado passaria por qualquer checagem de nome e só seria recusado lá no
 * bucket, depois de o membro já existir.
 *
 * Nada é validado aqui além disso — decidir se a foto serve é do `importPlan`,
 * que conhece o limite de tamanho e os formatos aceitos.
 */
export async function readPhotosFromZip(file: File): Promise<ImportPhoto[]> {
  const entries = await readZip(await file.arrayBuffer());

  return entries.map((entry) => ({
    name: entry.name,
    path: entry.path,
    bytes: entry.bytes,
    contentType: detectImageType(entry.bytes),
    size: entry.bytes.length,
  }));
}
