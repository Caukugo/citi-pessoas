import type {
  AnonymousFeedback,
  AnonymousFeedbackIntakeConfig,
  AuthUser,
  Feedback,
  Gestao,
  GoogleFormsIntakeConfig,
  IntakeCampaign,
  Member,
  MemberEvent,
  MemberImportContinuation,
  MemberRecordCorrection,
  OrgArea,
  OrgPosition,
  OrgSubarea,
  Settings,
  X1,
  X1Appointment,
  X1AppointmentEventLink,
  GoogleCalendarConfig,
} from '../types';

/**
 * Tradução entre o banco (snake_case) e o domínio da aplicação (camelCase).
 *
 * Toda leitura do Supabase passa por um `from*` e toda escrita por um `to*`.
 * Assim o resto da aplicação nunca precisa saber como as colunas se chamam.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- linhas cruas do banco */
type Row = Record<string, any>;

export function fromMemberRow(row: Row): Member {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    personalEmail: row.personal_email,
    phone: row.phone,
    photoUrl: row.photo_url,
    photoPath: row.photo_path,
    role: row.role,
    area: row.area,
    squad: row.squad,
    areaId: row.area_id,
    subareaId: row.subarea_id,
    positionId: row.position_id,
    managerId: row.manager_id,
    ggResponsibleId: row.gg_responsible_id,
    course: row.course,
    semester: row.semester,
    university: row.university,
    department: row.department,
    campus: row.campus,
    status: row.status,
    joinedAt: row.joined_at,
    exitedAt: row.exited_at,
    birthDate: row.birth_date,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toMemberRow(input: Partial<Member>): Row {
  const row: Row = {};
  if (input.fullName !== undefined) row.full_name = input.fullName;
  if (input.email !== undefined) row.email = input.email;
  if (input.personalEmail !== undefined) row.personal_email = input.personalEmail;
  if (input.phone !== undefined) row.phone = input.phone;
  if (input.photoUrl !== undefined) row.photo_url = input.photoUrl;
  if (input.photoPath !== undefined) row.photo_path = input.photoPath;
  if (input.role !== undefined) row.role = input.role;
  if (input.area !== undefined) row.area = input.area;
  if (input.squad !== undefined) row.squad = input.squad;
  if (input.areaId !== undefined) row.area_id = input.areaId;
  if (input.subareaId !== undefined) row.subarea_id = input.subareaId;
  if (input.positionId !== undefined) row.position_id = input.positionId;
  if (input.managerId !== undefined) row.manager_id = input.managerId;
  if (input.ggResponsibleId !== undefined) row.gg_responsible_id = input.ggResponsibleId;
  if (input.course !== undefined) row.course = input.course;
  if (input.semester !== undefined) row.semester = input.semester;
  if (input.university !== undefined) row.university = input.university;
  if (input.department !== undefined) row.department = input.department;
  if (input.campus !== undefined) row.campus = input.campus;
  if (input.status !== undefined) row.status = input.status;
  if (input.joinedAt !== undefined) row.joined_at = input.joinedAt;
  if (input.exitedAt !== undefined) row.exited_at = input.exitedAt;
  if (input.birthDate !== undefined) row.birth_date = input.birthDate;
  if (input.notes !== undefined) row.notes = input.notes;
  return row;
}

export function fromX1Row(row: Row): X1 {
  return {
    id: row.id,
    memberId: row.member_id,
    conductedById: row.conducted_by_id,
    scheduledFor: row.scheduled_for,
    occurredAt: row.occurred_at,
    status: row.status,
    summary: row.summary,
    topics: row.topics ?? [],
    followUps: row.follow_ups,
    documentUrl: row.document_url,
    hardSkills: row.hard_skills ?? [],
    softSkills: row.soft_skills ?? [],
    desiredSkills: row.desired_skills ?? [],
    citiValues: row.citi_values ?? [],
    comments: row.comments,
    gestaoId: row.gestao_id,
    createdById: row.created_by_id,
    updatedById: row.updated_by_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toX1Row(input: Partial<X1>): Row {
  const row: Row = {};
  if (input.memberId !== undefined) row.member_id = input.memberId;
  if (input.conductedById !== undefined) row.conducted_by_id = input.conductedById;
  if (input.scheduledFor !== undefined) row.scheduled_for = input.scheduledFor;
  if (input.occurredAt !== undefined) row.occurred_at = input.occurredAt;
  if (input.status !== undefined) row.status = input.status;
  if (input.summary !== undefined) row.summary = input.summary;
  if (input.topics !== undefined) row.topics = input.topics;
  if (input.followUps !== undefined) row.follow_ups = input.followUps;
  if (input.documentUrl !== undefined) row.document_url = input.documentUrl;
  if (input.hardSkills !== undefined) row.hard_skills = input.hardSkills;
  if (input.softSkills !== undefined) row.soft_skills = input.softSkills;
  if (input.desiredSkills !== undefined) row.desired_skills = input.desiredSkills;
  if (input.citiValues !== undefined) row.citi_values = input.citiValues;
  if (input.comments !== undefined) row.comments = input.comments;
  if (input.gestaoId !== undefined) row.gestao_id = input.gestaoId;
  if (input.createdById !== undefined) row.created_by_id = input.createdById;
  if (input.updatedById !== undefined) row.updated_by_id = input.updatedById;
  return row;
}

export function fromFeedbackRow(row: Row): Feedback {
  return {
    id: row.id,
    memberId: row.member_id,
    type: row.type,
    content: row.content,
    givenAt: row.given_at,
    registeredById: row.registered_by_id,
    notes: row.notes,
    gestaoId: row.gestao_id,
    createdById: row.created_by_id,
    updatedById: row.updated_by_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toFeedbackRow(input: Partial<Feedback>): Row {
  const row: Row = {};
  if (input.memberId !== undefined) row.member_id = input.memberId;
  if (input.type !== undefined) row.type = input.type;
  if (input.content !== undefined) row.content = input.content;
  if (input.givenAt !== undefined) row.given_at = input.givenAt;
  if (input.registeredById !== undefined) row.registered_by_id = input.registeredById;
  if (input.notes !== undefined) row.notes = input.notes;
  if (input.gestaoId !== undefined) row.gestao_id = input.gestaoId;
  if (input.createdById !== undefined) row.created_by_id = input.createdById;
  if (input.updatedById !== undefined) row.updated_by_id = input.updatedById;
  return row;
}

export function fromAnonymousFeedbackRow(row: Row): AnonymousFeedback {
  return {
    id: row.id,
    content: row.content,
    targetType: row.target_type,
    targetMemberId: row.target_member_id,
    targetLabel: row.target_label,
    submittedAt: row.submitted_at,
    status: row.status,
    resolution: row.resolution,
    directedMemberId: row.directed_member_id,
    moderatedById: row.moderated_by_id,
    moderatedAt: row.moderated_at,
    moderationNote: row.moderation_note,
    archivedAt: row.archived_at,
    archivedByProfileId: row.archived_by_profile_id,
    archiveReason: row.archive_reason,
  };
}

export function fromMemberEventRow(row: Row): MemberEvent {
  return {
    id: row.id,
    memberId: row.member_id,
    type: row.type,
    occurredAt: row.occurred_at,
    title: row.title,
    description: row.description,
    sourceId: row.source_id,
    createdAt: row.created_at,
  };
}

export function fromSettingsRow(row: Row): Settings {
  return {
    defaultX1PeriodicityDays: row.default_x1_periodicity_days,
    x1PeriodicityByMember: row.x1_periodicity_by_member ?? {},
    citiValues: row.citi_values ?? [],
    currentGestaoId: row.current_gestao_id,
    updatedAt: row.updated_at,
  };
}

export function fromGestaoRow(row: Row): Gestao {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
  };
}

export function fromGoogleFormsIntakeConfigRow(row: Row): GoogleFormsIntakeConfig {
  return {
    enabled: row.enabled,
    formId: row.form_id,
    responderUrl: row.responder_url,
    updatedAt: row.updated_at,
  };
}

export function fromAnonymousFeedbackIntakeConfigRow(row: Row): AnonymousFeedbackIntakeConfig {
  return {
    enabled: row.enabled,
    formId: row.form_id,
    responderUrl: row.responder_url,
    updatedAt: row.updated_at,
  };
}

export function fromIntakeCampaignRow(row: Row): IntakeCampaign {
  return {
    id: row.id,
    gestaoId: row.gestao_id,
    entryDate: row.entry_date,
    responseDeadlineAt: row.response_deadline_at,
    status: row.status,
    activatedAt: row.activated_at,
    activatedById: row.activated_by_id,
    closedAt: row.closed_at,
    closedById: row.closed_by_id,
  };
}

export function fromProfileRow(row: Row): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    memberId: row.member_id,
  };
}

// ─── Estrutura organizacional ────────────────────────────────────────────────

export function fromOrgAreaRow(row: Row): OrgArea {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

export function fromOrgSubareaRow(row: Row): OrgSubarea {
  return {
    id: row.id,
    areaId: row.area_id,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    entryPositionId: row.entry_position_id,
  };
}

export function fromOrgPositionRow(row: Row, aliases: string[] = []): OrgPosition {
  return {
    id: row.id,
    areaId: row.area_id,
    subareaId: row.subarea_id,
    name: row.name,
    abbreviation: row.abbreviation ?? null,
    // Os apelidos vêm de `position_aliases`, numa consulta própria: eles são
    // linhas de outra tabela, e não uma coluna do cargo.
    aliases,
    level: row.level,
    isDirectorship: row.is_directorship,
    continuationMonths: row.continuation_months,
    isActive: row.is_active,
  };
}

/**
 * Resumo da continuação da BASE ATUAL, como `citi_import_member` devolve.
 *
 * O banco sempre manda o objeto, inclusive quando nada foi emendado
 * (`cycles_added` = 0). Aqui isso vira `null`: para quem lê o relatório, "não
 * houve continuação" e "houve uma continuação de zero ciclos" são a mesma
 * coisa, e um `null` evita a segunda frase.
 */
export function fromImportContinuationJson(value: unknown): MemberImportContinuation | null {
  if (!value || typeof value !== 'object') return null;

  const raw = value as Row;
  const cyclesAdded = Number(raw.cycles_added ?? 0);
  if (!cyclesAdded) return null;

  return {
    originalEndOn: raw.original_end_on,
    finalEndOn: raw.final_end_on,
    cyclesAdded,
    monthsPerBlock: Array.isArray(raw.block_months) ? raw.block_months.map(Number) : [],
  };
}

/**
 * Correção cadastral → o JSONB que `citi_correct_member_record` espera.
 *
 * ⚠️ SÓ AS CHAVES PRESENTES entram. `undefined` é "não mexe" e some daqui;
 * `null` é "limpa o campo" e precisa chegar ao banco. Um `toMemberRow`
 * genérico não serviria: ele não distingue as duas coisas, e é assim que uma
 * correção de telefone apaga o e-mail pessoal de alguém.
 */
export function toCorrectionPayload(changes: MemberRecordCorrection): Row {
  const DE_PARA: Record<keyof MemberRecordCorrection, string> = {
    fullName: 'full_name',
    email: 'email',
    personalEmail: 'personal_email',
    phone: 'phone',
    birthDate: 'birth_date',
    course: 'course',
    department: 'department',
    semester: 'semester',
    university: 'university',
    areaId: 'area_id',
    subareaId: 'subarea_id',
    positionId: 'position_id',
  };

  const payload: Row = {};
  for (const [key, column] of Object.entries(DE_PARA) as [
    keyof MemberRecordCorrection,
    string,
  ][]) {
    if (key in changes && changes[key] !== undefined) payload[column] = changes[key];
  }
  return payload;
}

// ─── Agenda de X1 ─────────────────────────────────────────────────────────────

/**
 * O vínculo com o evento no Google, lido das colunas `event_*` da view
 * `x1_agenda` — que já faz o `left join` com `deleted_at is null`.
 */
export function fromAppointmentEventRow(row: Row): X1AppointmentEventLink | null {
  // Sem `event_id` não há evento vivo no Google: o `left join` da view veio
  // vazio. Isso é o normal para o legado e para quem nunca enviou convite.
  if (!row.event_event_id) return null;

  return {
    calendarId: row.event_calendar_id,
    eventId: row.event_event_id,
    etag: row.event_etag,
    htmlLink: row.event_html_link,
    hangoutLink: row.event_hangout_link,
    meetStatus: row.event_meet_status ?? 'sem_meet',
    invitedEmail: row.event_invited_email,
    lastSyncedAt: row.event_ultima_sync_em,
  };
}

export function fromX1AppointmentRow(row: Row): X1Appointment {
  return {
    id: row.id,
    memberId: row.member_id,
    organizerProfileId: row.organizer_profile_id,
    conductedById: row.conducted_by_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    scheduledDate: row.scheduled_date,
    durationMinutes: row.duration_minutes,
    timeZone: row.time_zone,
    mode: row.mode,
    location: row.location,
    wantsMeet: row.wants_meet ?? false,
    status: row.status,
    inviteResponse: row.invite_response ?? 'pendente',
    inviteResponseAt: row.invite_response_at,
    syncStatus: row.sync_status ?? null,
    title: row.title,
    sharedAgenda: row.shared_agenda,
    internalNotes: row.internal_notes,
    cancellationReason: row.cancellation_reason,
    cancelledAt: row.cancelled_at,
    cancelledByProfileId: row.cancelled_by_profile_id,
    x1Id: row.x1_id,
    origin: row.origin,
    originX1Id: row.origin_x1_id,
    gestaoId: row.gestao_id,
    versao: row.versao ?? 0,
    createdByProfileId: row.created_by_profile_id,
    updatedByProfileId: row.updated_by_profile_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    event: fromAppointmentEventRow(row),
  };
}

/**
 * Escrita do agendamento.
 *
 * ⚠️ NÃO existe caminho aqui para `sync_status`, `x1_id`, `origin`,
 * `invite_response` nem `versao`, e a ausência é deliberada: são campos do
 * SERVIÇO. Um trigger no banco recusa o cliente que tentar escrevê-los
 * (migration 0034), e este mapper é a primeira das duas travas — a intenção
 * não chega nem a virar requisição.
 *
 * `organizer_profile_id` também não está aqui: ele vem da SESSÃO, via
 * `default auth.uid()` na inserção do adapter. Aceitá-lo do cliente deixaria
 * alguém emitir convite com o token de outra pessoa.
 */
export function toX1AppointmentRow(input: Partial<X1Appointment>): Row {
  const row: Row = {};
  if (input.memberId !== undefined) row.member_id = input.memberId;
  if (input.conductedById !== undefined) row.conducted_by_id = input.conductedById;
  if (input.startsAt !== undefined) row.starts_at = input.startsAt;
  if (input.endsAt !== undefined) row.ends_at = input.endsAt;
  if (input.scheduledDate !== undefined) row.scheduled_date = input.scheduledDate;
  if (input.durationMinutes !== undefined) row.duration_minutes = input.durationMinutes;
  if (input.timeZone !== undefined) row.time_zone = input.timeZone;
  if (input.mode !== undefined) row.mode = input.mode;
  if (input.location !== undefined) row.location = input.location;
  if (input.wantsMeet !== undefined) row.wants_meet = input.wantsMeet;
  if (input.status !== undefined) row.status = input.status;
  if (input.title !== undefined) row.title = input.title;
  if (input.sharedAgenda !== undefined) row.shared_agenda = input.sharedAgenda;
  if (input.internalNotes !== undefined) row.internal_notes = input.internalNotes;
  if (input.cancellationReason !== undefined) row.cancellation_reason = input.cancellationReason;
  if (input.cancelledAt !== undefined) row.cancelled_at = input.cancelledAt;
  if (input.cancelledByProfileId !== undefined) {
    row.cancelled_by_profile_id = input.cancelledByProfileId;
  }
  if (input.gestaoId !== undefined) row.gestao_id = input.gestaoId;
  if (input.updatedByProfileId !== undefined) {
    row.updated_by_profile_id = input.updatedByProfileId;
  }
  return row;
}

/** Configuração da integração. ⚠️ Nunca carrega segredo: eles não estão no banco. */
export function fromGoogleCalendarConfigRow(row: Row): GoogleCalendarConfig {
  return {
    enabled: row.enabled ?? false,
    eventTitleTemplate: row.event_title_template,
    defaultDurationMinutes: row.default_duration_minutes,
    defaultTimeZone: row.default_time_zone,
    updatedAt: row.updated_at,
  };
}

export function toGoogleCalendarConfigRow(input: Partial<GoogleCalendarConfig>): Row {
  const row: Row = {};
  if (input.enabled !== undefined) row.enabled = input.enabled;
  if (input.eventTitleTemplate !== undefined) {
    row.event_title_template = input.eventTitleTemplate;
  }
  if (input.defaultDurationMinutes !== undefined) {
    row.default_duration_minutes = input.defaultDurationMinutes;
  }
  if (input.defaultTimeZone !== undefined) row.default_time_zone = input.defaultTimeZone;
  return row;
}
