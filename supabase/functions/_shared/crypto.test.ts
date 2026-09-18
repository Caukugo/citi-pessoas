import { describe, expect, it } from 'vitest';
import { decodeKeyMaterial, fingerprint, open, seal } from './crypto.ts';

/**
 * Cifra autenticada e HMAC.
 *
 * Rodam na suíte normal do projeto porque `crypto.subtle` existe no Node 20 e
 * no Deno da Edge Function — o mesmo código, testado aqui, é o que roda lá.
 *
 * ⚠️ As chaves abaixo são de TESTE, escritas à mão para serem obviamente
 * descartáveis. As chaves de verdade vivem só nos segredos da função, e não
 * existem em nenhum arquivo do repositório.
 */

/** 32 bytes ('a'…), base64. Chave de teste, não de verdade. */
const CHAVE_CIFRA = btoa('chave-de-teste-para-cifra-32byte');
/** Outra, diferente: a separação é o ponto do desenho. */
const CHAVE_HASH = btoa('chave-de-teste-para-o-hmac-32byt');

const CPF_FICTICIO = '52998224725';

describe('chave', () => {
  it('aceita base64 e hex de 32 bytes', () => {
    expect(decodeKeyMaterial(CHAVE_CIFRA)).toHaveLength(32);
    expect(decodeKeyMaterial('a'.repeat(64))).toHaveLength(32);
  });

  it('recusa chave de tamanho errado — AES-256 exige 32 bytes', () => {
    // Chave curta "funcionaria" e daria falsa sensação de cifra forte.
    expect(() => decodeKeyMaterial(btoa('curta'))).toThrow(/32 bytes/);
    expect(() => decodeKeyMaterial('')).toThrow();
  });
});

describe('cifra autenticada (AES-256-GCM)', () => {
  it('cifra e decifra de volta', async () => {
    const sealed = await seal(CPF_FICTICIO, CHAVE_CIFRA);
    expect(await open(sealed, CHAVE_CIFRA)).toBe(CPF_FICTICIO);
  });

  it('o texto cifrado não contém o valor original', async () => {
    const sealed = await seal(CPF_FICTICIO, CHAVE_CIFRA);

    // Nem em base64, nem nos bytes decodificados.
    expect(sealed.ciphertext).not.toContain(CPF_FICTICIO);
    expect(atob(sealed.ciphertext)).not.toContain(CPF_FICTICIO);
    expect(sealed.iv).not.toContain(CPF_FICTICIO);
  });

  it('o mesmo valor cifrado duas vezes dá resultados diferentes', async () => {
    const a = await seal(CPF_FICTICIO, CHAVE_CIFRA);
    const b = await seal(CPF_FICTICIO, CHAVE_CIFRA);

    // IV novo a cada gravação: sem isso, dois membros com o mesmo CPF teriam
    // o mesmo texto cifrado, e quem olhasse o banco saberia disso.
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('texto cifrado alterado FALHA em vez de devolver lixo', async () => {
    const sealed = await seal(CPF_FICTICIO, CHAVE_CIFRA);
    const bytes = Uint8Array.from(atob(sealed.ciphertext), (c) => c.charCodeAt(0));
    bytes[0] ^= 0xff;
    const alterado = { ...sealed, ciphertext: btoa(String.fromCharCode(...bytes)) };

    // É para isto que serve cifra AUTENTICADA: um byte trocado no banco não
    // pode virar um CPF diferente sem ninguém notar.
    await expect(open(alterado, CHAVE_CIFRA)).rejects.toThrow();
  });

  it('chave errada não decifra', async () => {
    const sealed = await seal(CPF_FICTICIO, CHAVE_CIFRA);
    await expect(open(sealed, CHAVE_HASH)).rejects.toThrow();
  });
});

describe('HMAC de duplicidade', () => {
  it('é determinístico — é o que permite o índice único', async () => {
    const a = await fingerprint(CPF_FICTICIO, CHAVE_HASH);
    const b = await fingerprint(CPF_FICTICIO, CHAVE_HASH);

    expect(a).toBe(b);
  });

  it('CPFs diferentes dão hashes diferentes', async () => {
    const a = await fingerprint(CPF_FICTICIO, CHAVE_HASH);
    const b = await fingerprint('11144477735', CHAVE_HASH);

    expect(a).not.toBe(b);
  });

  it('não contém o valor e tem 32 bytes', async () => {
    const hash = await fingerprint(CPF_FICTICIO, CHAVE_HASH);

    expect(hash).not.toContain(CPF_FICTICIO);
    expect(atob(hash)).toHaveLength(32);
  });

  it('chave diferente dá hash diferente para o MESMO CPF', async () => {
    // É isto que impede quem tem só o banco de montar a tabela de todos os
    // CPFs válidos: sem a chave de hash, o valor não é reproduzível.
    const comChaveA = await fingerprint(CPF_FICTICIO, CHAVE_HASH);
    const comChaveB = await fingerprint(CPF_FICTICIO, CHAVE_CIFRA);

    expect(comChaveA).not.toBe(comChaveB);
  });
});
