import { describe, expect, it } from 'vitest';
import { DATA_SOURCE, IS_MOCK } from './env';

/**
 * A SUÍTE RODA SEMPRE EM MOCK.
 *
 * Quem está mexendo na importação deixa `VITE_DATA_SOURCE=supabase` no
 * `.env.local` para usar o banco de teste no navegador. Sem travar isso, os
 * testes de tela tentavam autenticar no Supabase de verdade e quinze deles
 * falhavam por ambiente, não por código — e a pessoa ia procurar o bug no
 * lugar errado.
 *
 * Duas coisas garantem o mock, e este teste protege as duas: `.env.test`
 * (carregado depois do `.env.local`, porque o Vitest roda em `mode=test`) e
 * `test.env` no `vite.config.ts`. Nenhum prefixo no terminal é necessário.
 */
describe('ambiente de teste', () => {
  it('usa dados fictícios mesmo com .env.local apontando para o Supabase', () => {
    expect(DATA_SOURCE).toBe('mock');
    expect(IS_MOCK).toBe(true);
  });
});
