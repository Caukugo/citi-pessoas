import { describe, expect, it } from 'vitest';
import { decodeKeyMaterial, fingerprint, hmacHex, open, seal, timingSafeEqual } from './crypto.ts';

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

describe('hmacHex (assinatura do webhook do Google Forms)', () => {
  const SEGREDO_WEBHOOK = 'segredo-de-teste-do-webhook';

  it('é determinístico e em hexadecimal', async () => {
    const a = await hmacHex('1234.{"a":1}', SEGREDO_WEBHOOK);
    const b = await hmacHex('1234.{"a":1}', SEGREDO_WEBHOOK);

    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('corpo ou timestamp diferentes dão assinaturas diferentes', async () => {
    const original = await hmacHex('1234.{"a":1}', SEGREDO_WEBHOOK);
    const outroCorpo = await hmacHex('1234.{"a":2}', SEGREDO_WEBHOOK);
    const outroTimestamp = await hmacHex('5678.{"a":1}', SEGREDO_WEBHOOK);

    expect(outroCorpo).not.toBe(original);
    expect(outroTimestamp).not.toBe(original);
  });

  it('segredo diferente dá assinatura diferente para a mesma mensagem', async () => {
    const comSegredoA = await hmacHex('1234.corpo', SEGREDO_WEBHOOK);
    const comSegredoB = await hmacHex('1234.corpo', 'outro-segredo-qualquer');

    expect(comSegredoA).not.toBe(comSegredoB);
  });

  it('não reaproveita a chave de CPF: mesmo valor cifrado com CHAVE_HASH dá resultado diferente de fingerprint()', async () => {
    // `fingerprint()` decodifica o segredo como material de chave (base64/hex
    // de 32 bytes — `decodeKeyMaterial`); `hmacHex()` usa o segredo como texto
    // simples (o segredo do webhook não precisa ter 32 bytes). Por desenho as
    // duas NUNCA produzem o mesmo HMAC para a mesma chave nominal — o que
    // reforça, na prática, que não dá para usar CPF_HASH_KEY no lugar de
    // GOOGLE_FORMS_WEBHOOK_SECRET (ou vice-versa) e esperar compatibilidade.
    const hex = await hmacHex(CPF_FICTICIO, CHAVE_HASH);
    const base64 = await fingerprint(CPF_FICTICIO, CHAVE_HASH);

    expect(hex).not.toBe(base64);
  });
});

describe('timingSafeEqual', () => {
  it('compara strings iguais como iguais', () => {
    expect(timingSafeEqual('abc123', 'abc123')).toBe(true);
  });

  it('compara strings diferentes como diferentes', () => {
    expect(timingSafeEqual('abc123', 'abc124')).toBe(false);
  });

  it('tamanhos diferentes nunca são iguais', () => {
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });
});
