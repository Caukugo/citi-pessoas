import { Logo, Surface } from '@/components/ui';

/**
 * ANTIGA ANON-001 — FORMULÁRIO EXTERNO DE FEEDBACK ANÔNIMO.
 *
 * Migration 0033: o canal de envio passou a ser o Google Form permanente
 * (link fixo, distribuído pela Administração e por QR code) → Edge Function
 * `anonymous-feedback-intake` → `anonymous_feedbacks`. Esta rota não sai do
 * ar (um link antigo não pode virar 404), mas não é mais o canal de envio: a
 * tabela não aceita mais INSERT direto de `anon`/`authenticated` (RLS +
 * revoke), então um formulário React aqui nunca teria como gravar nada.
 *
 * Por isso a tela não tenta mais coletar o feedback — só orienta a pessoa a
 * usar o link oficial, que a GG tem.
 */
export function AnonymousFeedbackFormPage() {
  return (
    <>
      <img
        src="/bg-blob.webp"
        alt=""
        aria-hidden
        draggable={false}
        className="decor-blob top-[-22%] right-[-12%] w-[min(760px,62%)] opacity-90"
      />

      <Surface className="relative mx-auto max-w-[360px] p-8">
        <div className="text-center">
          <Logo height={22} className="mx-auto" />
          <h1 className="mt-[22px] text-[20px] tracking-[-0.02em] text-foreground">
            Feedback anônimo
          </h1>
          <p className="mt-[10px] text-[13px] leading-relaxed text-muted-foreground">
            Este endereço não recebe mais envios diretamente. Peça à equipe de Gente e Gestão o
            link do formulário oficial.
          </p>
        </div>
      </Surface>
    </>
  );
}
