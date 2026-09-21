import { useMemo, useState } from 'react';
import { UserCog } from 'lucide-react';
import { Badge, Button, Panel, Select, useToast } from '@/components/ui';
import {
  messageFor,
  orgIdBySlug,
  useMembers,
  useOrgCatalog,
  useUpdateMember,
  type Member,
} from '@/data';
import { GG_AREA_SLUG, isValidGgCandidate } from '../model/membersList';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * RESPONSÁVEL DE GENTE E GESTÃO.
 *
 * A importação entra com este campo NULO de propósito: quem acompanha cada
 * pessoa é decisão humana, tomada depois de olhar para o time. Por isso
 * "Alocação pendente" não é erro nem dado faltando — é uma decisão que ainda
 * não foi tomada, e a tela diz isso com todas as letras.
 *
 * QUEM PODE SER ESCOLHIDO: membro ATIVO da área de Gente e Gestão. Não é a
 * conta de login: `GG Teste` é um `profile` de autenticação sem membro
 * correspondente, e acompanhar uma pessoa é papel de gente que está na
 * empresa, não de uma credencial.
 *
 * Inativo e desligado ficam de fora da lista — atribuir alguém que saiu criaria
 * um acompanhamento que ninguém faz.
 *
 * ⚠️ A atribuição EM LOTE (alocar meia área de uma vez) é passo seguinte: a
 * camada de dados já aceita, porque `useUpdateMember` é por membro e o serviço
 * não guarda estado de tela. Aqui é o caminho individual, pelo perfil.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function GgResponsibleField({ member }: { member: Member }) {
  const { showToast } = useToast();
  const { data: catalog } = useOrgCatalog();
  const updateMember = useUpdateMember();
  const [error, setError] = useState<string | null>(null);

  const ggAreaId = orgIdBySlug(catalog?.areas, GG_AREA_SLUG);
  const { data: ggMembers, isLoading } = useMembers(
    ggAreaId ? { areaId: ggAreaId, status: 'ativo' } : undefined,
  );

  /** A própria pessoa não se acompanha. Mesma regra de `isValidGgCandidate`,
   *  reaproveitada pela atribuição em lote — uma definição só. */
  const options = useMemo(
    () =>
      (ggMembers ?? [])
        .filter((person) => isValidGgCandidate(person, ggAreaId, member.id))
        .map((person) => ({ value: person.id, label: `${person.fullName} · ${person.role}` })),
    [ggMembers, ggAreaId, member.id],
  );

  const current = (ggMembers ?? []).find((person) => person.id === member.ggResponsibleId) ?? null;

  const change = async (value: string) => {
    setError(null);
    const next = value || null;
    if (next === (member.ggResponsibleId ?? null)) return;

    try {
      // O evento de histórico (com o responsável anterior e o novo) é escrito
      // pelo banco, no trigger da 0007 — não por esta tela. Confiar na tela
      // para lembrar de registrar é como o passado some.
      await updateMember.mutateAsync({ id: member.id, input: { ggResponsibleId: next } });

      showToast({
        message: next
          ? `Responsável de GG definido para ${member.fullName}`
          : `Responsável de GG removido de ${member.fullName}`,
        tone: 'success',
      });
    } catch (cause) {
      setError(messageFor(cause));
    }
  };

  return (
    <Panel
      title="Responsável de Gente e Gestão"
      subtitle="Quem acompanha esta pessoa no dia a dia."
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <UserCog size={16} className="text-muted-foreground" aria-hidden />
          {current ? (
            <span className="text-sm font-semibold text-foreground">{current.fullName}</span>
          ) : (
            <Badge tone="warn">Alocação pendente</Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Responsável de Gente e Gestão"
            className="min-w-[260px]"
            disabled={isLoading || updateMember.isPending || options.length === 0}
            value={member.ggResponsibleId ?? ''}
            onChange={(event) => void change(event.target.value)}
            placeholder={
              options.length === 0
                ? 'Nenhum membro ativo de Gente e Gestão'
                : 'Escolher responsável'
            }
            options={options}
          />

          {member.ggResponsibleId && (
            <Button
              type="button"
              disabled={updateMember.isPending}
              onClick={() => void change('')}
            >
              Remover
            </Button>
          )}
        </div>

        {options.length === 0 && !isLoading && (
          <p className="text-xs text-muted-foreground">
            A lista sai dos membros ativos da área de Gente e Gestão. Enquanto não houver ninguém
            cadastrado, a alocação continua pendente.
          </p>
        )}

        {error && (
          <p role="alert" className="text-xs text-bad">
            {error}
          </p>
        )}
      </div>
    </Panel>
  );
}
