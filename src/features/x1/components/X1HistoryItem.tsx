import { useState } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui';
import type { ID, Member, X1 } from '@/data';
import { cn } from '@/lib/cn';
import { formatDate, relativeDays } from '@/lib/format';
import { memberNameById } from '@/features/members/model/membersList';
import { splitFollowUps } from '../schemas/x1Schema';
import { X1StatusBadge } from './X1StatusBadge';

/**
 * Um X1 no histórico.
 *
 * Fechado mostra o que serve para escanear: data, quem conduziu, situação e o
 * começo do resumo. Aberto mostra a conversa inteira.
 *
 * POR QUE NÃO MOSTRAR TUDO SEMPRE: um X1 completo tem resumo, pontos, três
 * listas de habilidades, encaminhamentos, valores e comentários. Seis desses
 * abertos ao mesmo tempo é uma parede de texto onde não se acha nada — e achar
 * é justamente o motivo desta tela existir.
 */

const DASH = '—';

/** Bloco de etiquetas (hard skills, soft skills, habilidades desejadas). */
function TagRow({ label, tags }: { label: string; tags?: string[] }) {
  if (!tags || tags.length === 0) return null;

  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        {label}
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <li
            key={tag}
            className="rounded-control border border-border bg-foreground/[0.04] px-2.5 py-1 text-xs font-semibold break-words text-foreground-secondary"
          >
            {tag}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TextBlock({ label, text }: { label: string; text?: string | null }) {
  if (!text) return null;

  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm break-words whitespace-pre-line text-foreground-secondary">
        {text}
      </p>
    </div>
  );
}

export function X1HistoryItem({
  x1,
  directory,
  defaultOpen = false,
}: {
  x1: X1;
  directory: Map<ID, Member>;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const date = x1.occurredAt ?? x1.scheduledFor;
  const conductor = memberNameById(directory, x1.conductedById);
  const followUps = splitFollowUps(x1.followUps);
  const ratedValues = x1.citiValues?.filter((entry) => entry.rating) ?? [];

  const hasDetail = Boolean(
    x1.summary ||
      x1.topics?.length ||
      followUps.length ||
      x1.hardSkills?.length ||
      x1.softSkills?.length ||
      x1.desiredSkills?.length ||
      ratedValues.length ||
      x1.comments ||
      x1.documentUrl,
  );

  return (
    <li className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={!hasDetail}
        aria-expanded={hasDetail ? open : undefined}
        className={cn(
          'flex w-full items-start gap-4 px-6 py-4 text-left transition-colors',
          hasDetail ? 'hover:bg-foreground/[0.03]' : 'cursor-default',
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">{formatDate(date)}</span>
            <span className="text-xs text-muted-foreground">{relativeDays(date)}</span>
            <X1StatusBadge status={x1.status} />
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            Conduzido por {conductor ?? DASH}
          </p>

          {x1.summary && (
            <p
              className={cn(
                'mt-2 text-sm break-words text-foreground-secondary',
                !open && 'line-clamp-2',
              )}
            >
              {x1.summary}
            </p>
          )}

          {!x1.summary && x1.status === 'realizado' && (
            <p className="mt-2 text-sm text-muted-foreground italic">
              Registrado sem resumo.
            </p>
          )}
        </div>

        {hasDetail && (
          <ChevronDown
            size={16}
            aria-hidden
            className={cn(
              'mt-1 shrink-0 text-muted-foreground transition-transform duration-150',
              open && 'rotate-180',
            )}
          />
        )}
      </button>

      {open && hasDetail && (
        <div className="flex flex-col gap-5 border-t border-border bg-foreground/[0.015] px-6 py-5">
          {x1.topics && x1.topics.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                Pontos discutidos
              </p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {x1.topics.map((topic, index) => (
                  <li
                    key={`${topic}-${index}`}
                    className="flex gap-2 text-sm break-words text-foreground-secondary"
                  >
                    <span className="text-muted-foreground" aria-hidden>
                      ·
                    </span>
                    {topic}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {followUps.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                Encaminhamentos
              </p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {followUps.map((item, index) => (
                  <li
                    key={`${item}-${index}`}
                    className="flex gap-2 text-sm break-words text-foreground-secondary"
                  >
                    <span className="text-primary" aria-hidden>
                      →
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <TagRow label="Hard skills" tags={x1.hardSkills} />
            <TagRow label="Soft skills" tags={x1.softSkills} />
            <TagRow label="Quer desenvolver" tags={x1.desiredSkills} />
          </div>

          {ratedValues.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                Valores do CITi
              </p>
              {/* Percepção registrada daquela conversa. Sem média, sem total:
                  não é score, e a interface não pode sugerir que seja. */}
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {ratedValues.map((entry) => (
                  <li key={entry.value} className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{entry.value}</Badge>
                    <span className="text-xs text-muted-foreground">
                      apareceu {entry.rating}/5 nesta conversa
                    </span>
                    {entry.note && (
                      <span className="text-xs break-words text-foreground-secondary">
                        — {entry.note}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <TextBlock label="Comentários" text={x1.comments} />

          {x1.documentUrl && (
            <a
              href={x1.documentUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:text-primary-hover"
            >
              <ExternalLink size={13} aria-hidden />
              Abrir documento da conversa
              <span className="sr-only">(abre em nova aba)</span>
            </a>
          )}
        </div>
      )}
    </li>
  );
}
