import { useWatch, type UseFormReturn } from 'react-hook-form';
import { FormField, FormSection, Input, Select } from '@/components/ui';
import {
  AREAS,
  AREA_STRUCTURE,
  cargoOptionsForSubarea,
  CARGOS_DIRETORIA,
  getAreaForSubarea,
  type Area,
  type Member,
  type Subarea,
} from '@/data';
import type { MemberFormValues } from '../schemas/memberSchema';

/**
 * Campos do cadastro de membro.
 *
 * Fica separado da gaveta que o abre para poder ser reaproveitado na edição do
 * membro (MEM/PERFIL futuros) sem duplicar campo nem validação. Quem monta o
 * formulário decide o rodapé, o título e o que fazer ao salvar; aqui só vivem
 * os campos.
 *
 * Nenhuma opção é escrita à mão: subárea vem de `SUBAREAS`/`AREA_STRUCTURE`, e
 * GG responsável vem dos membros de Gente e Gestão. Quando a Administração
 * passar a manter essas listas, este arquivo não muda.
 *
 * ÁREA → SUBÁREA (ADR-015/ADR-016): a área NÃO é um campo do formulário — só a
 * subárea é salva no membro. O select de Área aqui é puramente de navegação:
 * escolher uma área filtra as opções de Subárea para só as dela, e trocar de
 * área realoca a subárea para a primeira opção válida daquela área. A área
 * exibida é sempre DERIVADA da subárea atual (`getAreaForSubarea`), nunca um
 * estado à parte — assim os dois campos nunca podem ficar inconsistentes.
 *
 * CARGO (ADR-017): pela mesma razão, cargo também não é texto livre — as
 * opções vêm de `cargoOptionsForSubarea(subarea)` e mudam conforme a subárea
 * (e, por tabela, conforme a área). Trocar Área ou Subárea realoca o Cargo
 * para a primeira opção válida sempre que o cargo atual deixa de existir na
 * nova subárea — mesmo padrão de realocação já usado entre Área e Subárea.
 *
 * DIRETORIA (ADR-018): é um caminho SEPARADO, não uma subárea a mais. Quem é
 * da Diretoria não integra nenhuma subárea — dirige uma área inteira. Por
 * isso o campo "Tipo de posição" alterna toda a segunda metade deste bloco:
 * no caminho "Subárea" o formulário funciona como descrito acima; no
 * caminho "Diretoria" some a Subárea, o select de Área passa a escrever
 * direto em `diretoriaArea` (em vez de só navegar `subarea`), e o Cargo fica
 * travado no cargo de Diretoria daquela área (`CARGOS_DIRETORIA`) — não é
 * mais uma escolha livre.
 */
export function MemberForm({
  form,
  ggPeople,
  defaultPeriodicityDays,
}: {
  form: UseFormReturn<MemberFormValues>;
  ggPeople: Member[];
  /** Periodicidade padrão da plataforma — mostrada como referência no campo. */
  defaultPeriodicityDays: number;
}) {
  const {
    register,
    formState: { errors },
  } = form;

  const hasGgPeople = ggPeople.length > 0;

  const positionType = useWatch({ control: form.control, name: 'positionType' });
  const isDiretoria = positionType === 'diretoria';

  const subareaValue = useWatch({ control: form.control, name: 'subarea' }) as Subarea;
  const areaValue = getAreaForSubarea(subareaValue);
  const subareaOptions = AREA_STRUCTURE[areaValue];
  const cargoOptions = cargoOptionsForSubarea(subareaValue);

  const diretoriaAreaValue = useWatch({ control: form.control, name: 'diretoriaArea' }) as
    | Area
    | '';
  const roleValue = useWatch({ control: form.control, name: 'role' });

  /** Realoca o cargo para a primeira opção válida, se o atual deixou de existir nesta subárea. */
  function resetCargoIfInvalid(subarea: Subarea) {
    const options = cargoOptionsForSubarea(subarea);
    if (!options.includes(form.getValues('role'))) {
      form.setValue('role', options[0], { shouldValidate: true, shouldDirty: true });
    }
  }

  /** Trocar de área realoca a subárea, se a atual não pertencer mais a ela — e, em cadeia, o cargo. */
  function handleAreaChange(nextArea: Area) {
    const options = AREA_STRUCTURE[nextArea];
    const nextSubarea = options.includes(subareaValue) ? subareaValue : options[0];
    if (nextSubarea !== subareaValue) {
      form.setValue('subarea', nextSubarea, { shouldValidate: true, shouldDirty: true });
    }
    resetCargoIfInvalid(nextSubarea);
  }

  /**
   * Trocar de área no caminho de Diretoria trava o cargo direto — não há
   * cargo à escolha aqui, é sempre o de Diretoria daquela área (ADR-018).
   */
  function handleDiretoriaAreaChange(nextArea: Area) {
    form.setValue('diretoriaArea', nextArea, { shouldValidate: true, shouldDirty: true });
    form.setValue('role', CARGOS_DIRETORIA[nextArea], { shouldValidate: true, shouldDirty: true });
  }

  /**
   * Alternar entre "Subárea" e "Diretoria" já deixa os campos do caminho
   * escolhido num estado válido, em vez de esperar o próximo `onChange` de
   * cada um: entrar em Diretoria escolhe uma área e trava o cargo dela;
   * voltar para Subárea reconfere se o cargo atual ainda cabe na subárea.
   */
  function handlePositionTypeChange(nextType: 'subarea' | 'diretoria') {
    form.setValue('positionType', nextType, { shouldValidate: true, shouldDirty: true });
    if (nextType === 'diretoria') {
      const area = diretoriaAreaValue || areaValue;
      handleDiretoriaAreaChange(area);
    } else {
      resetCargoIfInvalid(subareaValue);
    }
  }

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

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="CPF" error={errors.cpf?.message}>
            {(field) => (
              <Input {...field} {...register('cpf')} inputMode="numeric" placeholder="000.000.000-00" />
            )}
          </FormField>

          <FormField
            label="Tipo de posição"
            error={errors.positionType?.message}
            required
          >
            {(field) => (
              <Select
                {...field}
                value={positionType}
                onChange={(e) => handlePositionTypeChange(e.target.value as 'subarea' | 'diretoria')}
                options={[
                  { value: 'subarea', label: 'Membro' },
                  { value: 'diretoria', label: 'Diretor(a)' },
                ]}
              />
            )}
          </FormField>
        </div>

        {isDiretoria ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Área" error={errors.diretoriaArea?.message} required>
              {(field) => (
                <Select
                  {...field}
                  value={diretoriaAreaValue}
                  onChange={(e) => handleDiretoriaAreaChange(e.target.value as Area)}
                  options={AREAS.map((area) => ({ value: area, label: area }))}
                />
              )}
            </FormField>

            <FormField
              label="Cargo"
              error={errors.role?.message}
              required
            >
              {(field) => (
                <Select
                  {...field}
                  value={roleValue}
                  onChange={() => {}}
                  disabled
                  options={
                    diretoriaAreaValue
                      ? [{ value: CARGOS_DIRETORIA[diretoriaAreaValue], label: CARGOS_DIRETORIA[diretoriaAreaValue] }]
                      : []
                  }
                />
              )}
            </FormField>
          </div>
        ) : (
          <>
            {/* Área primeiro, para orientar a escolha — mas só a Subárea é salva.
                Cargo vem por último de propósito: as opções dependem da subárea
                escolhida acima, então só faz sentido perguntar depois dela. */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Área" required>
                {(field) => (
                  <Select
                    {...field}
                    value={areaValue}
                    onChange={(e) => handleAreaChange(e.target.value as Area)}
                    options={AREAS.map((area) => ({ value: area, label: area }))}
                  />
                )}
              </FormField>

              <FormField label="Subárea" error={errors.subarea?.message} required>
                {(field) => (
                  <Select
                    {...field}
                    {...register('subarea', {
                      onChange: (e) => resetCargoIfInvalid(e.target.value as Subarea),
                    })}
                    options={subareaOptions.map((subarea) => ({ value: subarea, label: subarea }))}
                  />
                )}
              </FormField>
            </div>

            <FormField
              label="Cargo"
              hint="As opções mudam conforme a subárea escolhida acima."
              error={errors.role?.message}
              required
            >
              {(field) => (
                <Select
                  {...field}
                  {...register('role')}
                  options={cargoOptions.map((cargo) => ({ value: cargo, label: cargo }))}
                />
              )}
            </FormField>
          </>
        )}

        <FormField
          label="Data de entrada"
          hint="Quando a pessoa começou no CITi. É a partir daqui que contamos o tempo de casa."
          error={errors.joinedAt?.message}
          required
        >
          {(field) => <Input {...field} {...register('joinedAt')} type="date" />}
        </FormField>
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
                hasGgPeople ? 'Escolha uma pessoa de Gente e Gestão' : 'Nenhuma pessoa de GG cadastrada'
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

      <FormSection title="Acadêmico" description="Tudo opcional — o que não souber agora, deixe em branco.">
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

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="LinkedIn" error={errors.linkedinUrl?.message}>
            {(field) => (
              <Input
                {...field}
                {...register('linkedinUrl')}
                type="url"
                placeholder="https://www.linkedin.com/in/nome-sobrenome"
              />
            )}
          </FormField>

          <FormField label="Telefone" error={errors.phone?.message}>
            {(field) => (
              <Input {...field} {...register('phone')} type="tel" placeholder="(81) 90000-0000" />
            )}
          </FormField>
        </div>
      </FormSection>
    </div>
  );
}
