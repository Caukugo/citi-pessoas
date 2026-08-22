import { PageHeader } from '@/components/ui';
import { AnonymousFeedbackBoard } from '../components/AnonymousFeedbackBoard';

/**
 * EPIC 5 — MODERAÇÃO DE FEEDBACK ANÔNIMO · Feature Owner: Clara
 *
 * ⚠️ REGRAS QUE NÃO PODEM SER QUEBRADAS:
 * 1. É um fluxo INDEPENDENTE. O feedback anônimo NÃO vira Feedback Informal,
 *    Formal nem Carta de Ajuste — nem automaticamente, nem por um botão.
 * 2. Permanece anônimo. Não existe autor, e-mail ou IP guardado, e não se deve
 *    criar nenhum campo desse tipo.
 * 3. A decisão é humana: tomar ciência ou direcionar é ação de uma pessoa.
 *
 * Esta página e a aba "Feedback Anônimo" de /feedbacks mostram o MESMO quadro,
 * pelo mesmo componente. Não é duplicação: a barra lateral leva direto ao
 * trabalho mais repetido do dia, e /feedbacks reúne os dois fluxos para quem
 * chega pela visão geral. As duas leem a mesma fonte e nunca podem divergir.
 */
export function ModerationPage() {
  return (
    <>
      <PageHeader
        title="Moderação"
        subtitle="Feedbacks recebidos pelo formulário externo, aguardando a análise de GG."
      />

      <AnonymousFeedbackBoard />
    </>
  );
}
