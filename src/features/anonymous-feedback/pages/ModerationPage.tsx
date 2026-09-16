import { PageDecor, PageHeader } from '@/components/ui';
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
      {/* /moderacao renderiza o MESMO quadro da aba "Feedback Anônimo". Com a
          barra de filtros já na linguagem nova, deixar só o cabeçalho para
          trás faria a tela parecer meio migrada. São as mesmas três linhas de
          Membros e Feedbacks — não é um redesenho desta página. */}
      <PageDecor />

      <PageHeader
        title="Moderação"
        titleClassName="text-[26px] leading-[1.18] tracking-[-0.02em] pb-[1px]"
        subtitle={
          <span className="text-[13px]">
            Feedbacks recebidos pelo formulário externo, aguardando a análise de GG.
          </span>
        }
      />

      <AnonymousFeedbackBoard />
    </>
  );
}
