import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Panel, Surface } from '@/components/ui';

/**
 * Placeholder de uma feature ainda não implementada.
 *
 * Serve como briefing na própria tela: quem é dono, qual issue começar, quais
 * arquivos mexer e o que NÃO tocar. Ao implementar a feature, apague este
 * componente da sua página — ele não deve sobrar em nada finalizado.
 */
export interface FeatureStubProps {
  issue: string;
  owner: string;
  goal: string;
  /** Passos sugeridos, na ordem. */
  steps: string[];
  /** Caminhos que esta feature normalmente altera. */
  files: string[];
  /** Áreas que esta feature NÃO deve tocar. */
  doNotTouch?: string[];
  /** Hooks de dados já prontos para usar. */
  dataHooks?: string[];
  /** Documentos relevantes. */
  docs?: string[];
}

export function FeatureStub({
  issue,
  owner,
  goal,
  steps,
  files,
  doNotTouch = [],
  dataHooks = [],
  docs = [],
}: FeatureStubProps) {
  return (
    <Surface className="border-dashed">
      <div className="flex items-start gap-4 border-b border-border px-6 py-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-primary/30 bg-primary/10 text-primary">
          <Compass size={18} aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
            {issue} · a implementar
          </p>
          <h2 className="mt-1 text-foreground">{goal}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Responsável: <strong className="text-foreground-secondary">{owner}</strong>. Esta tela é
            um espaço reservado — a implementação é sua.
          </p>
        </div>
      </div>

      <div className="grid gap-6 p-6 md:grid-cols-2">
        <Section title="Por onde começar">
          <ol className="flex list-inside list-decimal flex-col gap-1.5 text-sm text-foreground-secondary">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Section>

        <Section title="Arquivos desta feature">
          <CodeList items={files} />
        </Section>

        {dataHooks.length > 0 && (
          <Section title="Dados já prontos">
            <CodeList items={dataHooks} />
            <p className="mt-2 text-xs text-muted-foreground">
              Importe de <code className="text-primary">@/data</code>. Não escreva SQL nem
              <code className="text-primary"> fetch</code> na tela.
            </p>
          </Section>
        )}

        {doNotTouch.length > 0 && (
          <Section title="Não altere sem combinar">
            <CodeList items={doNotTouch} tone="bad" />
          </Section>
        )}
      </div>

      {docs.length > 0 && (
        <div className="border-t border-border px-6 py-4">
          <p className="text-xs text-muted-foreground">
            Leia antes:{' '}
            {docs.map((doc, index) => (
              <span key={doc}>
                {index > 0 && ' · '}
                <code className="text-foreground-secondary">{doc}</code>
              </span>
            ))}
          </p>
        </div>
      )}

      <div className="border-t border-border px-6 py-4">
        <p className="text-xs text-muted-foreground">
          Primeira vez usando Claude Code aqui? Comece por{' '}
          <code className="text-primary">docs/AI_DEVELOPMENT_GUIDE.md</code>. Precisa ver os
          componentes disponíveis?{' '}
          <Link to="/design-system" className="text-primary hover:underline">
            Abrir o Design System
          </Link>
          .
        </p>
      </div>
    </Surface>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </div>
  );
}

function CodeList({ items, tone = 'neutral' }: { items: string[]; tone?: 'neutral' | 'bad' }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item}>
          <code className={tone === 'bad' ? 'text-xs text-bad' : 'text-xs text-foreground-secondary'}>
            {item}
          </code>
        </li>
      ))}
    </ul>
  );
}

/** Painel curto para avisos dentro de telas já parcialmente implementadas. */
export function StubNote({ children }: { children: React.ReactNode }) {
  return (
    <Panel title="Ainda não implementado" className="border-dashed">
      <p className="text-sm text-muted-foreground">{children}</p>
    </Panel>
  );
}
