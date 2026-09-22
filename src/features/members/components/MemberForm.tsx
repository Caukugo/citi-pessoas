import { useEffect, useMemo } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Badge, Button, FormField, FormSection, Input, Select } from '@/components/ui';
import { AREA_WIDE_SUBAREA_LABEL, type Member, type OrgCatalog } from '@/data';
import type { MemberFormValues } from '../schemas/memberSchema';

/**
 * Campos do cadastro de membro.
 *
 * Fica separado da gaveta que o abre para poder ser reaproveitado na edição do
 * membro sem duplicar campo nem validação. Quem monta o formulário decide o
 * rodapé, o título e o que fazer ao salvar; aqui só vivem os campos.
 *
 * ⚠️ LOTAÇÃO E CARGO (MEM-006): mesma regra e mesma cascata de
 * `EditMemberDrawer.tsx` — Área → Subárea → Cargo, com "Área inteira" como
 * rótulo fixo (nunca um select vazio) quando o cargo escolhido cobre a área
 * toda. Nada aqui decide o que é gravado: quem resolve é
 * `resolveMemberPosition()`, chamada em `toMemberCreateInput()`.
 */
export function MemberForm({
  form,
  ggPeople,
  defaultPeriodicityDays,
  catalog,
  catalogLoading,
  catalogError,
  onRetryCatalog,
}: {
  form: UseFormReturn<MemberFormValues>;
  ggPeople: Member[];
  /** Periodicidade padrão da plataforma — mostrada como referência no campo. */
  defaultPeriodicityDays: number;
  catalog: OrgCatalog | null | undefined;
  catalogLoading: boolean;
  catalogError: boolean;
  onRetryCatalog: () => void;
}) {
  const {
    register,
    formState: { errors },
  } = form;

  const hasGgPeople = ggPeople.length > 0;

  const areaId = form.watch('areaId');
  const subareaId = form.watch('subareaId');
  const positionId = form.watch('positionId');

  const areas = useMemo(() => (catalog?.areas ?? []).filter((area) => area.isActive), [catalog]);

  /** Subáreas da área escolhida — a lista muda junto, nunca antes. */
  const subareas = useMemo(
    () => (catalog?.subareas ?? []).filter((sub) => sub.isActive && sub.areaId === areaId),
    [catalog, areaId],
  );

  /**
   * Cargos que cabem aqui: os da subárea escolhida MAIS os de área inteira.
   * Sem subárea escolhida, só os de área inteira — é o que evita oferecer
   * "Analista de Dados" para quem ainda não disse em que time entra.
   */
  const positions = useMemo(
    () =>
      (catalog?.positions ?? []).filter(
        (position) =>
          position.isActive &&
          position.areaId === areaId &&
          (position.subareaId === null ||
            position.subareaId === undefined ||
            position.subareaId === subareaId),
      ),
    [catalog, areaId, subareaId],
  );

  const selectedPosition = catalog?.positions.find((item) => item.id === positionId) ?? null;
  const isAreaWide = Boolean(selectedPosition && !selectedPosition.subareaId);

  const catalogReady = Boolean(catalog) && !catalogLoading;

  // Trocar de área invalida subárea e cargo: manter o cargo antigo deixaria a
  // pessoa com um cargo que não existe na área nova. Mesmo efeito de
  // EditMemberDrawer.tsx.
  useEffect(() => {
    if (!catalog || !areaId) return;
    const subareaCabe = catalog.subareas.some(
      (sub) => sub.id === subareaId && sub.areaId === areaId,
    );
    if (subareaId && !subareaCabe) form.setValue('subareaId', '');

    const cargoCabe = catalog.positions.some(
      (position) => position.id === positionId && position.areaId === areaId,
    );
    if (positionId && !cargoCabe) form.setValue('positionId', '');
  }, [catalog, areaId, subareaId, positionId, form]);

  return (
    <div className="flex flex-col gap-7">
      <FormSection title="Informações básicas">
        <FormField label="Nome completo" error={errors.fullName?.message} required>
          {(field) => (
            <Input
              {...field}
              {...register('fullName')}
              placeholder="Ana Beatriz Nogueira"
              autoComplete="off"
            />
          )}
        </FormField>

        <FormField
          label="Data de entrada"
          hint="Quando a pessoa começou no CITi. É a partir daqui que contamos o tempo de casa."
          error={errors.joinedAt?.message}
          required
        >
          {(field) => <Input {...field} {...register('joinedAt')} type="date" />}
        </FormField>
      </FormSection>

      {/* ── Lotação e cargo ──
          Mesma seção e mesma cascata de EditMemberDrawer.tsx. */}
      <FormSection
        title="Lotação e cargo"
        description="De onde a pessoa é e o que ela faz: sempre pelo catálogo, nunca texto livre."
      >
        {catalogError ? (
          <p role="alert" className="text-sm text-bad">
            Não foi possível carregar cargos e áreas.{' '}
            <Button type="button" size="sm" onClick={onRetryCatalog}>
              Tentar de novo
            </Button>
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Área" error={errors.areaId?.message} required>
                {(field) => (
                  <Select
                    {...field}
                    {...register('areaId')}
                    disabled={!catalogReady}
                    placeholder={catalogLoading ? 'Carregando…' : 'Escolha a área'}
                    options={areas.map((area) => ({ value: area.id, label: area.name }))}
                  />
                )}
              </FormField>

              <FormField
                label="Subárea"
                hint={
                  isAreaWide
                    ? 'Este cargo atua sobre a área toda: a pessoa fica sem subárea.'
                    : undefined
                }
                error={errors.subareaId?.message}
                required={!isAreaWide}
              >
                {(field) =>
                  isAreaWide ? (
                    <div className="flex h-10 items-center">
                      <Badge tone="info">{AREA_WIDE_SUBAREA_LABEL}</Badge>
                    </div>
                  ) : (
                    <Select
                      {...field}
                      {...register('subareaId')}
                      disabled={!catalogReady || !areaId}
                      placeholder={!areaId ? 'Escolha a área primeiro' : 'Escolha a subárea'}
                      options={subareas.map((sub) => ({ value: sub.id, label: sub.name }))}
                    />
                  )
                }
              </FormField>
            </div>

            <FormField label="Cargo" error={errors.positionId?.message} required>
              {(field) => (
                <Select
                  {...field}
                  {...register('positionId')}
                  disabled={!catalogReady || !areaId}
                  placeholder={
                    catalogLoading ? 'Carregando…' : !areaId ? 'Escolha a área primeiro' : 'Escolha o cargo'
                  }
                  options={positions.map((position) => ({
                    value: position.id,
                    label: position.subareaId
                      ? position.name
                      : `${position.name} · ${AREA_WIDE_SUBAREA_LABEL}`,
                  }))}
                />
              )}
            </FormField>
          </>
        )}
      </FormSection>

      <FormSection
        title="Acompanhamento"
        description="Quem cuida desta pessoa e de quanto em quanto tempo vocês conversam."
      >
        <FormField
          label="GG responsável"
          hint={
            hasGgPeople
              ? undefined
              : 'Ainda não há ninguém de Gente e Gestão cadastrado. Pode deixar em branco agora e definir depois, no perfil.'
          }
          error={errors.ggResponsibleId?.message}
          required={hasGgPeople}
        >
          {(field) => (
            <Select
              {...field}
              {...register('ggResponsibleId')}
              disabled={!hasGgPeople}
              placeholder={
                hasGgPeople
                  ? 'Escolha uma pessoa de Gente e Gestão'
                  : 'Nenhuma pessoa de GG cadastrada'
              }
              options={ggPeople.map((person) => ({ value: person.id, label: person.fullName }))}
            />
          )}
        </FormField>

        <FormField
          label="Periodicidade de X1"
          hint={`Em dias. Deixe em branco para usar o padrão da plataforma (${defaultPeriodicityDays} dias).`}
          error={errors.x1PeriodicityDays?.message}
        >
          {(field) => (
            <Input
              {...field}
              {...register('x1PeriodicityDays')}
              inputMode="numeric"
              placeholder={String(defaultPeriodicityDays)}
            />
          )}
        </FormField>
      </FormSection>

      <FormSection
        title="Acadêmico"
        description="Tudo opcional. O que não souber agora, deixe em branco."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Departamento" error={errors.department?.message}>
            {(field) => <Input {...field} {...register('department')} placeholder="CIn" />}
          </FormField>

          <FormField label="Período / semestre" error={errors.semester?.message}>
            {(field) => (
              <Input {...field} {...register('semester')} inputMode="numeric" placeholder="5" />
            )}
          </FormField>
        </div>

        <FormField label="Curso" error={errors.course?.message}>
          {(field) => (
            <Input {...field} {...register('course')} placeholder="Ciência da Computação" />
          )}
        </FormField>
      </FormSection>

      <FormSection title="Contato">
        <FormField
          label="E-mail institucional"
          hint="É por ele que a plataforma identifica a pessoa e evita cadastro duplicado."
          error={errors.email?.message}
          required
        >
          {(field) => (
            <Input
              {...field}
              {...register('email')}
              type="email"
              placeholder="nome.sobrenome@citi.org.br"
            />
          )}
        </FormField>

        <FormField label="Telefone" error={errors.phone?.message}>
          {(field) => (
            <Input {...field} {...register('phone')} type="tel" placeholder="(81) 90000-0000" />
          )}
        </FormField>
      </FormSection>
    </div>
  );
}
