import type {
  AnonymousFeedback,
  AuthUser,
  Feedback,
  Gestao,
  Member,
  MemberEvent,
  Settings,
  X1,
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
    role: row.role,
    area: row.area,
    squad: row.squad,
    managerId: row.manager_id,
    ggResponsibleId: row.gg_responsible_id,
    course: row.course,
    semester: row.semester,
    university: row.university,
    department: row.department,
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
  if (input.role !== undefined) row.role = input.role;
  if (input.area !== undefined) row.area = input.area;
  if (input.squad !== undefined) row.squad = input.squad;
  if (input.managerId !== undefined) row.manager_id = input.managerId;
  if (input.ggResponsibleId !== undefined) row.gg_responsible_id = input.ggResponsibleId;
  if (input.course !== undefined) row.course = input.course;
  if (input.semester !== undefined) row.semester = input.semester;
  if (input.university !== undefined) row.university = input.university;
  if (input.department !== undefined) row.department = input.department;
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

export function fromProfileRow(row: Row): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    memberId: row.member_id,
  };
}
