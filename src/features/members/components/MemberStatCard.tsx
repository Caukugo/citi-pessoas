import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight } from 'lucide-react';
import { Surface } from '@/components/ui';
import { cn } from '@/lib/cn';

/**
 * Cartão de métrica da faixa de panorama.
 *
 * OS TRÊS SÃO O MESMO CONTROLE. Juntos eles formam um seletor único do recorte
 * por situação de X1: "todo mundo", "atrasados", "primeiros pendentes".
 * Exatamente um está sempre selecionado — por isso o cartão de total também é
 * clicável e nasce aceso. Antes ele era leitura com um botãozinho de limpar na
 * quina, o que fazia o grupo parecer três coisas diferentes em vez de três
 * estados da mesma.
 *
 * A GEOMETRIA vem de `Rectangle 129.svg` e `Ellipse 49.svg`, não de
 * `border-radius`: a quina superior direita tem um entalhe CÔNCAVO de raio
 * ~20,4px recortado em volta de um disco de 37px, com ~1,9px de folga. O corte
 * é de verdade — quem aparece no vazio é o fundo real da tela. Quem executa é
 * `.notch-card` (src/styles/theme.css); aqui só se declara a peça, e o estado
 * selecionado troca apenas a COR dela.
 *
 * O disco é IRMÃO da lâmina, nunca filho: máscara de CSS atinge os
 * descendentes, e dentro dele o disco seria recortado junto. É também por isso
 * que ele precisa acompanhar a cor do cartão explicitamente — para os dois
 * lerem como uma peça só, separados apenas pela folga do entalhe.
 */

export type StatTone = 'ok' | 'warn' | 'bad';

/** Halo do ícone a 18% + glifo cheio, no estado normal. */
const TONE: Record<StatTone, string> = {
  ok: 'bg-ok/[0.18] text-ok',
  warn: 'bg-warn/[0.18] text-warn',
  bad: 'bg-bad/[0.18] text-bad',
};

/**
 * Disco de 37px encaixado no entalhe.
 *
 * `top`/`right` saem do path: o centro do recorte está a 20,867px do topo e
 * 20,367px da direita, e o disco tem raio 18,5 — daí os ~2px de folga.
 */
const SATELLITE =
  'pointer-events-none absolute top-[2px] right-[2px] flex h-[37px] w-[37px] items-center justify-center rounded-full transition-colors';

export function MemberStatCard({
  icon: Icon,
  value,
  label,
  tone,
  pressed,
  disabled,
  onToggle,
}: {
  icon: LucideIcon;
  value: number;
  label: string;
  tone: StatTone;
  pressed: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    // `group` no invólucro, e não no botão: o disco é IRMÃO do botão (a Surface
    // tem overflow-hidden), então só daqui ele enxerga o hover.
    <div className="group relative h-[98px]">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={pressed}
        className="block w-full rounded-[28px] text-left disabled:cursor-default"
      >
        {/* `rounded-[28px]` junto da classe: o raio de `.notch-card` é regra de
            componente e o `rounded-surface` da Surface é utilitário, que
            venceria a cascata. */}
        <Surface
          className={cn(
            'notch-card rounded-[28px] transition-colors',
            // Selecionado usa `--accent-strong`, a mesma base da aba ativa e do
            // chip ativo: é o único laranja do sistema que sustenta texto
            // branco. Um tom diferente aqui criaria um segundo "selecionado".
            pressed && 'bg-accent-strong',
            !pressed && !disabled && 'group-hover:bg-surface-card-hover',
            disabled && 'opacity-70',
          )}
        >
          <div className="flex h-[98px] items-center gap-[14px] pr-[16px] pl-[22px]">
            <span
              className={cn(
                'flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full transition-colors',
                pressed && 'bg-accent-foreground/20 text-accent-foreground',
                !pressed && disabled && 'bg-foreground/[0.06] text-muted-foreground',
                !pressed && !disabled && TONE[tone],
              )}
            >
              <Icon size={19} strokeWidth={2} aria-hidden />
            </span>

            <span className="min-w-0">
              <span
                className={cn(
                  'block font-[family-name:var(--font-display)] text-[22px] leading-none font-semibold',
                  pressed && 'text-accent-foreground',
                  !pressed && disabled && 'text-muted-foreground',
                  !pressed && !disabled && 'text-foreground',
                )}
              >
                {value}
              </span>
              {/* O rótulo NÃO trunca e não quebra: `pr` reserva a faixa do
                  entalhe e o texto tem espaço de sobra a 12px. */}
              <span
                className={cn(
                  'mt-[5px] block pr-[26px] text-[12px] leading-tight transition-colors',
                  pressed ? 'text-accent-foreground/85' : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            </span>
          </div>
        </Surface>

        <span className="sr-only">
          {pressed ? 'recorte ativo' : 'clique para ver só este recorte'}
        </span>
      </button>

      {/* O disco compartilha a cor do cartão: aceso, é o mesmo laranja, e a
          folga do entalhe é quem separa os dois; apagado, é o mesmo branco
          translúcido das outras superfícies do sistema. */}
      <span
        className={cn(
          SATELLITE,
          pressed && 'bg-accent-strong text-accent-foreground',
          !pressed && 'bg-surface-satellite text-foreground/70',
          !pressed && !disabled && 'group-hover:text-foreground',
          disabled && 'opacity-45',
        )}
      >
        <ArrowUpRight size={15} aria-hidden />
      </span>
    </div>
  );
}
