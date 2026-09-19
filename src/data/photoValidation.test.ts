import { describe, expect, it } from 'vitest';
import { ACCEPTED_PHOTO_TYPES, detectImageType, MAX_PHOTO_BYTES, safeFileName } from './photoValidation';

/**
 * Regra pura de foto, compartilhada entre a importação CSV (`importPlan.ts`,
 * que reexporta daqui), a tela de correção cadastral e a Edge Function
 * `google-forms-intake`. Um teste só, para as três nunca divergirem.
 */

describe('detectImageType', () => {
  it('reconhece JPEG pelos bytes mágicos', () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
  });

  it('reconhece PNG pelos bytes mágicos', () => {
    expect(
      detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe('image/png');
  });

  it('reconhece WebP pelo contêiner RIFF', () => {
    const webp = new Uint8Array(16);
    webp.set([0x52, 0x49, 0x46, 0x46], 0); // 'RIFF'
    webp.set([0x57, 0x45, 0x42, 0x50], 8); // 'WEBP'
    expect(detectImageType(webp)).toBe('image/webp');
  });

  it('um .jpg renomeado que na verdade é outro formato não passa', () => {
    // PDF, por exemplo — extensão não importa, só o conteúdo.
    expect(detectImageType(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull();
  });

  it('bytes vazios não são imagem nenhuma', () => {
    expect(detectImageType(new Uint8Array([]))).toBeNull();
  });
});

describe('ACCEPTED_PHOTO_TYPES / MAX_PHOTO_BYTES', () => {
  it('aceita só JPEG, PNG e WebP', () => {
    expect(ACCEPTED_PHOTO_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });

  it('o limite é 5 MB, o mesmo do bucket member-photos (migration 0010)', () => {
    expect(MAX_PHOTO_BYTES).toBe(5 * 1024 * 1024);
  });
});

describe('safeFileName', () => {
  it('remove acento e espaço', () => {
    expect(safeFileName('Foto de Perfil.jpg')).toBe('foto-de-perfil.jpg');
  });

  it('nunca devolve vazio', () => {
    expect(safeFileName('!!!')).toBe('foto');
  });
});
