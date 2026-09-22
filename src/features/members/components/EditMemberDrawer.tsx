import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save, Upload } from 'lucide-react';
import {
  Badge,
  Button,
  Drawer,
  FormField,
  FormSection,
  Input,
  Select,
  useToast,
} from '@/components/ui';
import {
  AREA_WIDE_SUBAREA_LABEL,
  messageFor,
  uploadMemberPhoto,
  useCorrectMemberRecord,
  useMemberReviewReasons,
  useOrgCatalog,
  useResolveMemberReview,
  type Member,
  type MemberIntakeReviewReason,
} from '@/data';
import { ACCEPTED_PHOTO_TYPES, detectImageType, MAX_PHOTO_BYTES } from '@/data/import/importPlan';
import {
  isEmptyCorrection,
  makeMemberCorrectionSchema,
  memberCorrectionDefaults,
  toMemberRecordCorrection,
  type MemberCorrectionValues,
} from '../schemas/memberCorrectionSchema';
import { MemberAvatar } from './MemberAvatar';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EDITAR CADASTRO (PERFIL-006).
 *
 * A importação entra com o que a planilha trouxe; esta gaveta é o único lugar
 * onde o que veio errado se conserta. Sem ela, "corrigir uma data de
 * nascimento" significa abrir o SQL Editor — e por isso PERFIL-006 é
 * pré-requisito da carga das 70 pessoas.
 *
 * ISTO É CORREÇÃO, NÃO MOVIMENTAÇÃO. Trocar o cargo aqui quer dizer "estava
 * cadastrado errado", não "a pessoa foi promovida". A promoção de verdade tem
 * data de vigência e é outra história — o banco separa as duas marcando o
 * evento como `correcao_cadastral` (ver migration 0016).
 *
 * A FOTO É UM PASSO À PARTE, de propósito: ela vai para o Storage, que não
 * participa da transação do Postgres. Ela é enviada ANTES dos campos, porque
 * uma falha de upload não pode desfazer a correção de um telefone — e porque
 * assim a pendência `photo_*` da importação é resolvida no mesmo salvamento.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Pendências que uma foto nova resolve de uma vez. */
const PHOTO_REVIEWS: MemberIntakeReviewReason[] = [
  'photo_missing',
  'invalid_photo_type',
  'photo_too_large',
  'photo_upload_failed',
];

const REVIEW_LABEL: Record<MemberIntakeReviewReason, string> = {
  invalid_birth_date: 'Data de nascimento não entendida na importação',
  photo_missing: 'Foto não estava no .zip',
  invalid_photo_type: 'Foto em formato não aceito',
  photo_too_large: 'Foto acima de 5 MB',
  photo_upload_failed: 'A foto não chegou ao Storage',
  cpf_missing: 'CPF não informado na importação',
  invalid_cpf: 'CPF da planilha não confere',
  cpf_store_failed: 'O CPF não chegou ao serviço que o guarda',
  cpf_duplicado: 'Este CPF já pertence a outro membro',
};

export function EditMemberDrawer({
  open,
  onClose,
  member,
}: {
  open: boolean;
  onClose: () => void;
  member: Member;
}) {
  const { showToast } = useToast();
  const { data: catalog } = useOrgCatalog();
  const correct = useCorrectMemberRecord();
  const resolveReview = useResolveMemberReview();
  const { data: pendencias } = useMemberReviewReasons(member.id);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Cadastro antigo, anterior à estrutura organizacional, não tem cargo. Exigir
  // um impediria de corrigir o TELEFONE dessas pessoas — que é exatamente o
  // conserto que esta gaveta existe para fazer.
  const schema = useMemo(
    () => makeMemberCorrectionSchema({ requirePosition: Boolean(member.positionId) }),
    [member.positionId],
  );

  const form = useForm<MemberCorrectionValues>({
    resolver: zodResolver(schema),
    defaultValues: memberCorrectionDefaults(member),
  });

  // Cada abertura recomeça do que está gravado. Sem isto, cancelar uma edição
  // deixaria o rascunho esperando na gaveta como se fosse o cadastro real.
  useEffect(() => {
    if (open) {
      form.reset(memberCorrectionDefaults(member));
      setSubmitError(null);
      setPhotoFile(null);
      setPhotoError(null);
    }
  }, [open, member, form]);

  const areaId = form.watch('areaId');
  const subareaId = form.watch('subareaId');
  const positionId = form.watch('positionId');

  const areas = useMemo(
    () => (catalog?.areas ?? []).filter((area) => area.isActive),
    [catalog],
  );

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

  // Trocar de área invalida subárea e cargo: manter o cargo antigo deixaria a
  // pessoa com um cargo que não existe na área nova.
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

  /** Confere a foto ANTES de salvar: formato e tamanho, pelo conteúdo. */
  const selectPhoto = async (file: File | null) => {
    setPhotoError(null);
    if (!file) {
      setPhotoFile(null);
      return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError(`A foto tem ${(file.size / 1024 / 1024).toFixed(1)} MB e o limite é 5 MB.`);
      setPhotoFile(null);
      return;
    }

    // Pelo CONTEÚDO, não pela extensão: um HEIC renomeado para .jpg passaria
    // aqui e seria recusado lá no bucket, com a tela já dizendo "salvo".
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = detectImageType(bytes);
    if (!type || !ACCEPTED_PHOTO_TYPES.includes(type as (typeof ACCEPTED_PHOTO_TYPES)[number])) {
      setPhotoError('Formato não aceito. Use JPEG, PNG ou WebP.');
      setPhotoFile(null);
      return;
    }

    setPhotoFile(file);
  };

  const onSubmit = async (values: MemberCorrectionValues) => {
    setSubmitError(null);
    const changes = toMemberRecordCorrection(values, member, catalog);

    if (isEmptyCorrection(changes) && !photoFile) {
      setSubmitError('Nada foi alterado.');
      return;
    }

    try {
      // ── 1. Foto (Storage) ──
      if (photoFile) {
        const bytes = new Uint8Array(await photoFile.arrayBuffer());
        await uploadMemberPhoto(member.id, {
          fileName: photoFile.name,
          contentType: detectImageType(bytes) ?? photoFile.type,
          bytes,
        });
        // A foto chegou: as pendências que a importação abriu por causa dela
        // deixam de existir. As outras continuam.
        await resolveReview.mutateAsync({ memberId: member.id, reasons: PHOTO_REVIEWS });
      }

      // ── 2. Campos (Postgres, numa transação) ──
      if (!isEmptyCorrection(changes)) {
        await correct.mutateAsync({ id: member.id, changes });
      }

      onClose();
      showToast({
        message: `Cadastro de ${values.fullName} corrigido`,
        description: 'A correção ficou registrada no histórico, com o antes e o depois.',
        tone: 'success',
      });
    } catch (error) {
      // Erro NÃO fecha a gaveta: o que foi digitado continua ali.
      setSubmitError(messageFor(error));
    }
  };

  const pendentes = pendencias ?? [];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="lg"
      title="Editar cadastro"
      subtitle="Para corrigir o que veio errado da planilha. A mudança fica registrada no histórico."
      footer={
        <>
          <Button onClick={onClose} disabled={form.formState.isSubmitting}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon={<Save size={15} />}
            loading={form.formState.isSubmitting}
            onClick={form.handleSubmit(onSubmit)}
          >
            Salvar correção
          </Button>
        </>
      }
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-7">
        {/* ── O que a importação deixou pendente ──
            Fica no topo porque é a razão de a maioria das pessoas abrir esta
            gaveta. Some sozinho conforme cada pendência é resolvida. */}
        {pendentes.length > 0 && (
          <div className="rounded-control border border-warn/30 bg-warn/5 p-4">
            <p className="text-sm font-semibold text-warn">Pendências da importação</p>
            <ul className="mt-2 flex flex-col gap-1 text-xs text-foreground-secondary">
              {pendentes.map((reason) => (
                <li key={reason}>• {REVIEW_LABEL[reason]}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Corrigir o campo aqui resolve a pendência correspondente, e só ela.
            </p>
          </div>
        )}

        <FormSection title="Identificação">
          <FormField label="Nome completo" error={form.formState.errors.fullName?.message} required>
            {(field) => <Input {...field} {...form.register('fullName')} autoComplete="off" />}
          </FormField>

          <FormField
            label="E-mail institucional"
            hint="É por ele que a plataforma identifica a pessoa. Não pode repetir o de outro membro."
            error={form.formState.errors.email?.message}
            required
          >
            {(field) => <Input {...field} {...form.register('email')} type="email" />}
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="E-mail pessoal"
              error={form.formState.errors.personalEmail?.message}
            >
              {(field) => <Input {...field} {...form.register('personalEmail')} type="email" />}
            </FormField>

            <FormField label="Telefone" error={form.formState.errors.phone?.message}>
              {(field) => (
                <Input {...field} {...form.register('phone')} type="tel" placeholder="(81) 90000-0000" />
              )}
            </FormField>
          </div>

          <FormField
            label="Data de nascimento"
            hint="Vem em branco quando a planilha trouxe algo que não era data."
            error={form.formState.errors.birthDate?.message}
          >
            {(field) => <Input {...field} {...form.register('birthDate')} type="date" />}
          </FormField>
        </FormSection>

        <FormSection title="Acadêmico">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Curso" error={form.formState.errors.course?.message}>
              {(field) => <Input {...field} {...form.register('course')} />}
            </FormField>

            <FormField
              label="Departamento acadêmico"
              error={form.formState.errors.department?.message}
            >
              {(field) => <Input {...field} {...form.register('department')} placeholder="CIn" />}
            </FormField>
          </div>

          <FormField
            label="Período / semestre"
            error={form.formState.errors.semester?.message}
          >
            {(field) => <Input {...field} {...form.register('semester')} inputMode="numeric" />}
          </FormField>
        </FormSection>

        {/* ── Lotação e cargo ──
            Seção própria porque é a única parte que muda ONDE a pessoa está, e
            não apenas o que está escrito sobre ela. */}
        <FormSection
          title="Lotação e cargo"
          description="Corrige onde a pessoa está. Promoção e troca de time com data de vigência são outra história: aqui é conserto de cadastro."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Área" error={form.formState.errors.areaId?.message} required>
              {(field) => (
                <Select
                  {...field}
                  {...form.register('areaId')}
                  placeholder="Escolha a área"
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
              error={form.formState.errors.subareaId?.message}
            >
              {(field) =>
                isAreaWide ? (
                  <div className="flex h-10 items-center">
                    <Badge tone="info">{AREA_WIDE_SUBAREA_LABEL}</Badge>
                  </div>
                ) : (
                  <Select
                    {...field}
                    {...form.register('subareaId')}
                    disabled={!areaId}
                    placeholder={areaId ? 'Escolha a subárea' : 'Escolha a área primeiro'}
                    options={subareas.map((sub) => ({ value: sub.id, label: sub.name }))}
                  />
                )
              }
            </FormField>
          </div>

          <FormField label="Cargo" error={form.formState.errors.positionId?.message} required>
            {(field) => (
              <Select
                {...field}
                {...form.register('positionId')}
                disabled={!areaId}
                placeholder={areaId ? 'Escolha o cargo' : 'Escolha a área primeiro'}
                options={positions.map((position) => ({
                  value: position.id,
                  label: position.subareaId
                    ? position.name
                    : `${position.name} · ${AREA_WIDE_SUBAREA_LABEL}`,
                }))}
              />
            )}
          </FormField>
        </FormSection>

        <FormSection
          title="Foto institucional"
          description="JPEG, PNG ou WebP, até 5 MB. O arquivo vai para um bucket privado, e a exibição usa link temporário."
        >
          <div className="flex items-center gap-4">
            <MemberAvatar member={member} size="lg" />

            <div className="flex flex-col items-start gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => void selectPhoto(event.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                icon={<Upload size={15} />}
                onClick={() => fileInput.current?.click()}
              >
                {photoFile ? 'Trocar arquivo' : 'Escolher foto'}
              </Button>
              {photoFile && (
                <span className="text-xs text-foreground-secondary">
                  {photoFile.name} será enviada ao salvar.
                </span>
              )}
              {photoError && (
                <span role="alert" className="text-xs text-bad">
                  {photoError}
                </span>
              )}
            </div>
          </div>
        </FormSection>

        {submitError && (
          <p
            role="alert"
            className="rounded-control border border-bad/30 bg-bad/10 p-3 text-sm text-bad"
          >
            {submitError}
          </p>
        )}
      </form>
    </Drawer>
  );
}
