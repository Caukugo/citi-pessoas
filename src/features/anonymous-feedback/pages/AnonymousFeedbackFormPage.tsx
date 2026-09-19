import { Logo, Surface } from '@/components/ui';
import { FeatureStub } from '@/app/components/FeatureStub';

/**
 * ANON-001 — FORMULÁRIO EXTERNO DE FEEDBACK ANÔNIMO · Feature Owner: Clara
 *
 * ⚠️ Esta é a ÚNICA tela pública da plataforma além do login. Ela não exige
 * conta e não deve exigir. Quem envia permanece anônimo:
 *
 * • NÃO peça nome, e-mail, matrícula ou qualquer identificação.
 * • NÃO registre IP nem qualquer rastro de origem.
 * • Depois de enviar, mostre só uma confirmação — sem link para a área interna.
 */
export function AnonymousFeedbackFormPage() {
  return (
    <>
      {/* A escultura que antes vinha do PublicLayout. Mesmo asset, mesmas
          medidas: esta tela não mudou de aparência. */}
      <img
        src="/bg-blob.webp"
        alt=""
        aria-hidden
        draggable={false}
        className="decor-blob top-[-22%] right-[-12%] w-[min(760px,62%)] opacity-90"
      />

      <Surface className="relative mx-auto max-w-[360px] p-8">
        <div className="mb-6 text-center">
          <Logo height={22} className="mx-auto" />
          <h1 className="mt-[22px] text-[20px] tracking-[-0.02em] text-foreground">
            Feedback anônimo
          </h1>
          <p className="mt-[7px] text-[12px] text-muted-foreground">
            Este envio é anônimo. Nenhuma informação sobre quem escreveu é registrada.
          </p>
        </div>

        <FeatureStub
          issue="ANON-001"
          owner="Clara"
          goal="Formulário externo de feedback anônimo"
          steps={[
            'Montar o formulário: sobre quem é (membro, subárea, diretoria ou CITi) e o texto.',
            'Quando o alvo for um membro, oferecer a seleção; nos outros casos usar targetLabel.',
            'Enviar com useSubmitAnonymousFeedback().',
            'Depois do envio, mostrar uma tela de confirmação, nada mais.',
          ]}
          files={[
            'src/features/anonymous-feedback/pages/AnonymousFeedbackFormPage.tsx  ← esta tela',
          ]}
          dataHooks={['useSubmitAnonymousFeedback()', 'ANONYMOUS_TARGET_LABEL']}
          doNotTouch={['src/data/', 'src/app/']}
          docs={['docs/PROJECT_CONTEXT.md']}
        />
      </Surface>
    </>
  );
}
