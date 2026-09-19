import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/dom';

/**
 * Preparação global dos testes.
 *
 * Rodar: `npm test` (uma vez) ou `npm run test:watch` (fica observando).
 */

/**
 * Quanto tempo `findBy*` e `waitFor` esperam antes de desistir.
 *
 * O padrão da biblioteca é 1s, e não dá: o adapter mock simula latência de rede
 * em TODA chamada, de propósito, para que os estados de carregamento existam de
 * verdade. Um login soma quatro dessas esperas, e com os arquivos de teste
 * rodando em paralelo numa máquina ocupada o mesmo teste passava sozinho e
 * falhava no conjunto — flutuação de máquina disfarçada de bug de código.
 *
 * Cinco segundos não deixam nenhum teste mais lento: só adiam a desistência.
 */
configure({ asyncUtilTimeout: 5_000 });
