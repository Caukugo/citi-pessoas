import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

/**
 * Preparação global dos testes.
 *
 * Rodar: `npm test` (uma vez) ou `npm run test:watch` (fica observando).
 */

/**
 * O adapter mock simula latência de rede de propósito (`delay()` em
 * `src/data/mock/store.ts`), para que os estados de carregamento existam de
 * verdade nos testes — e um fluxo completo (login → renderizar → buscar
 * dados) soma vários desses. O padrão do testing-library para `findBy*` e
 * `waitFor` é 1000ms, curto demais para essa soma em uma máquina sob carga —
 * quando isso acontece, o teste falha por timeout, não porque algo quebrou.
 * Subir esse padrão evita esse falso negativo sem esconder uma demora real:
 * 5s ainda falha bem rápido se o elemento nunca aparecer de verdade.
 */
configure({ asyncUtilTimeout: 5000 });
