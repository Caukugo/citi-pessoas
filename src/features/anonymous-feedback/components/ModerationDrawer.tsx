import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCheck, CornerDownRight, X } from 'lucide-react';
import {
  Badge,
  Button,
  Drawer,
  FormField,
  SearchInput,
  Textarea,
  useToast,
} from '@/components/ui';
import {
  ANONYMOUS_RESOLUTION_LABEL,
  ANONYMOUS_TARGET_LABEL,
  messageFor,
  useModerateAnonymousFeedback,
  type AnonymousFeedback,
  type AnonymousFeedbackResolution,
  type ID,
  type Member,
} from '@/data';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, relativeDays } from '@/lib/format';
import { ROUTES } from '@/app/routes';
import { useAuth } from '@/features/auth/useAuth';
import { matchesSearch, memberNameById } from '@/features/members/model/membersList';

/**
 * Leitura e moderação de um relato anônimo.
 *
 * ⚠️ AS TRÊS REGRAS QUE ESTA GAVETA PROTEGE:
 *
 * 1. **A decisão é humana e explícita.** Não existe caminho automático para
 *    fora da fila. As duas ações do rodapé são as únicas saídas, e direcionar
 *    exige escolher a pessoa em um passo separado.
 * 2. **Nada vira Feedback de acompanhamento.** Direcionar registra que o
 *    CONTEXTO foi levado a alguém. Não cria Informal, Formal nem Carta de
 *    Ajuste — e não deve passar a criar. Se pedirem isso, é mudança de produto.
 * 3. **Nunca mostra quem enviou.** Não há o que mostrar: o modelo não guarda
 *    autor, e-mail nem IP.
 *
 * Os verbos são "Ciente" e "Direcionar para membro", não "Aprovar"/"Rejeitar":
 * não existe publicação a aprovar. A pergunta real da GG ao ler é "isto precisa
 * chegar a alguém, ou eu só preciso saber?".
 */

/** Bloco rotulado do corpo da gaveta. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        {label}
      </p>
      <div className="mt-1.5 text-sm text-foreground-secondary">{children}</div>
    </div>
  );
}

export function ModerationDrawer({
  feedback,
  members,
  directory,
  onClose,
}: {
  /** `null` fecha a gaveta. */
  feedback: AnonymousFeedback | null;
  /** Quem pode receber um direcionamento. */
  members: Member[];
  directory: Map<ID, Member>;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const moderate = useModerateAnonymousFeedback();

  // O último relato aberto continua desenhado enquanto a gaveta desliza para
  // fora. Sem isso o conteúdo sumiria antes do painel, e o fechamento pareceria
  // um erro em vez de uma saída.
  const lastShown = useRef<AnonymousFeedback | null>(null);
  if (feedback) lastShown.current = feedback;
  const shown = feedback ?? lastShown.current;

  const [note, setNote] = useState('');
  const [choosingMember, setChoosingMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<ID | ''>('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const searchRef = useRef<HTMLDivElement>(null);

  // Abrir um relato diferente começa do zero: nota e escolha de membro são do
  // relato que está aberto, não da sessão de moderação.
  //
  // Fechar NÃO limpa nada, de propósito: os campos continuariam visíveis por
  // 200ms enquanto a gaveta desliza para fora, e vê-los esvaziando parece um
  // apagamento acidental. O próximo relato aberto reinicia tudo.
  useEffect(() => {
    if (!feedback) return;
    setNote(feedback.moderationNote ?? '');
    setChoosingMember(false);
    setMemberSearch('');
    setSelectedMemberId('');
    setSubmitError(null);
  }, [feedback]);

  // Ao abrir o passo de escolher membro, o foco vai para a busca: é o que a
  // pessoa precisa fazer em seguida, e mover o foco é o próprio feedback de
  // que o passo mudou — sem precisar animar nada.
  useEffect(() => {
    if (!choosingMember) return;
    searchRef.current?.querySelector('input')?.focus();
  }, [choosingMember]);

  const matches = useMemo(() => {
    if (!memberSearch.trim()) return members.slice(0, 8);
    return members.filter((member) => matchesSearch(member, memberSearch)).slice(0, 8);
  }, [members, memberSearch]);

  // Nada foi aberto ainda: não há nem gaveta nem animação de saída a fazer.
  if (!shown) return null;

  const isPending = shown.status === 'pendente';
  const targetLabel =
    shown.targetType === 'membro'
      ? (memberNameById(directory, shown.targetMemberId) ?? 'Membro não indicado')
      : (shown.targetLabel ?? ANONYMOUS_TARGET_LABEL[shown.targetType]);

  const directedTo = memberNameById(directory, shown.directedMemberId);
  const moderatedBy = memberNameById(directory, shown.moderatedById);

  const submit = async (resolution: AnonymousFeedbackResolution) => {
    setSubmitError(null);
    try {
      await moderate.mutateAsync({
        id: shown.id,
        decision: {
          resolution,
          directedMemberId: resolution === 'direcionado' ? selectedMemberId || null : null,
          moderatedById: user?.memberId ?? null,
          moderationNote: note.trim() || null,
        },
      });

      onClose();
      showToast({
        message:
          resolution === 'ciente'
            ? 'Registrado como ciente'
            : `Direcionado para ${memberNameById(directory, selectedMemberId) ?? 'o membro'}`,
        description:
          resolution === 'ciente'
            ? 'O relato saiu da fila de pendentes.'
            : 'O contexto foi registrado. Nenhum feedback de acompanhamento foi criado.',
        tone: 'success',
      });
    } catch (error) {
      // Erro fica na tela e não fecha a gaveta: a decisão não aconteceu, e
      // quem estava moderando precisa saber disso sem perder o lugar.
      setSubmitError(messageFor(error));
    }
  };

  return (
    <Drawer
      open={feedback !== null}
      onClose={onClose}
      size="lg"
      title="Feedback recebido"
      subtitle={`Recebido em ${formatDateTime(shown.submittedAt)} · ${relativeDays(shown.submittedAt)}`}
      footer={
        isPending ? (
          choosingMember ? (
            <>
              <Button onClick={() => setChoosingMember(false)} disabled={moderate.isPending}>
                Voltar
              </Button>
              <Button
                variant="primary"
                icon={<CornerDownRight size={15} />}
                disabled={!selectedMemberId}
                loading={moderate.isPending}
                onClick={() => void submit('direcionado')}
              >
                Confirmar direcionamento
              </Button>
            </>
          ) : (
            <>
              <Button
                icon={<CheckCheck size={15} />}
                loading={moderate.isPending}
                onClick={() => void submit('ciente')}
              >
                Ciente
              </Button>
              <Button
                variant="primary"
                icon={<CornerDownRight size={15} />}
                disabled={moderate.isPending}
                onClick={() => setChoosingMember(true)}
              >
                Direcionar para membro
              </Button>
            </>
          )
        ) : (
          <Button onClick={onClose}>Fechar</Button>
        )
      }
    >
      <div className="flex flex-col gap-6">
        <Field label="Origem">
          {/* Não existe "identificado" neste fluxo: o modelo não guarda autor.
              O que dá para dizer com honestidade é sobre o que o relato fala. */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">Anônimo</Badge>
            <span className="text-xs text-muted-foreground">
              Nenhuma informação sobre quem enviou é registrada.
            </span>
          </div>
        </Field>

        <Field label="Sobre">
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-words">{targetLabel}</span>
            {shown.targetType === 'membro' && shown.targetMemberId && (
              <Link
                to={ROUTES.memberProfile(shown.targetMemberId)}
                className="text-xs font-semibold text-primary transition-colors hover:text-primary-hover"
              >
                Ver perfil
              </Link>
            )}
            {shown.targetType !== 'membro' && (
              <Badge tone="neutral">{ANONYMOUS_TARGET_LABEL[shown.targetType]}</Badge>
            )}
          </div>
        </Field>

        <Field label="Feedback">
          {/* Espaço generoso: ler o relato inteiro é a razão desta gaveta
              existir, e quebrá-lo em cartões só atrapalharia. */}
          <p className="text-sm leading-relaxed break-words whitespace-pre-line text-foreground-secondary">
            {shown.content}
          </p>
        </Field>

        {isPending ? (
          <>
            {choosingMember && (
              <div
                ref={searchRef}
                className="rounded-control border border-border bg-foreground/[0.02] p-4"
              >
                <p className="text-sm font-semibold text-foreground">Selecione o membro</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  O contexto deste relato será registrado como direcionado a esta pessoa. Isso{' '}
                  <strong className="font-semibold text-foreground-secondary">não</strong> cria um
                  feedback de acompanhamento.
                </p>

                <SearchInput
                  value={memberSearch}
                  onChange={setMemberSearch}
                  label="Buscar membro"
                  placeholder="Buscar membro…"
                  className="mt-3"
                />

                {matches.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Ninguém corresponde a “{memberSearch}”.
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-1">
                    {matches.map((member) => {
                      const selected = selectedMemberId === member.id;
                      return (
                        <li key={member.id}>
                          <button
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setSelectedMemberId(selected ? '' : member.id)}
                            className={cn(
                              'flex w-full items-center justify-between gap-3 rounded-control border px-3 py-2 text-left transition-colors',
                              selected
                                ? 'border-primary/40 bg-primary/10'
                                : 'border-transparent hover:bg-foreground/[0.05]',
                            )}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-foreground">
                                {member.fullName}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {member.role} · {member.area}
                              </span>
                            </span>
                            {selected && (
                              <CheckCheck size={15} className="shrink-0 text-primary" aria-hidden />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            <FormField
              label="Observação interna de GG"
              hint="Opcional. Fica só para a GG — nunca é devolvida a quem enviou."
            >
              {(field) => (
                <Textarea
                  {...field}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  placeholder="O que foi feito com este relato…"
                />
              )}
            </FormField>
          </>
        ) : (
          <Field label="Decisão de GG">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={shown.resolution === 'direcionado' ? 'brand' : 'neutral'}>
                  {shown.resolution
                    ? ANONYMOUS_RESOLUTION_LABEL[shown.resolution]
                    : 'Moderado'}
                </Badge>
                {directedTo && shown.directedMemberId && (
                  <Link
                    to={ROUTES.memberProfile(shown.directedMemberId)}
                    className="text-sm font-semibold text-primary transition-colors hover:text-primary-hover"
                  >
                    {directedTo}
                  </Link>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Por {moderatedBy ?? '—'} em {formatDate(shown.moderatedAt)}
              </p>

              {shown.moderationNote ? (
                <p className="mt-1 border-l border-border pl-3 text-sm break-words whitespace-pre-line text-foreground-secondary">
                  {shown.moderationNote}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground italic">
                  Sem observação interna.
                </p>
              )}
            </div>
          </Field>
        )}

        {submitError && (
          <p
            role="alert"
            className="rounded-control flex items-start gap-2 border border-bad/30 bg-bad/10 p-3 text-sm text-bad"
          >
            <X size={15} className="mt-0.5 shrink-0" aria-hidden />
            {submitError}
          </p>
        )}
      </div>
    </Drawer>
  );
}
