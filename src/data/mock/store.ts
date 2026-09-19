import type {
  AnonymousFeedback,
  AuthUser,
  Feedback,
  Gestao,
  GoogleFormsIntakeConfig,
  ID,
  IntakeCampaign,
  Member,
  MemberEvent,
  MemberIntakeReviewReason,
  MemberIntakeSource,
  Settings,
  X1,
} from '../types';
import { resetMockPrivateData } from './privateStore';
import {
  ANONYMOUS_FEEDBACKS,
  FEEDBACKS,
  GESTOES,
  GOOGLE_FORMS_INTAKE_CONFIG,
  MEMBERS,
  MEMBER_EVENTS,
  SETTINGS,
  X1S,
} from './fixtures';

/**
 * Banco de mentira guardado no navegador.
 *
 * O que você criar/editar no modo mock continua lá depois de recarregar a
 * página, o que deixa o desenvolvimento parecido com o real. Para começar do
 * zero, use `resetMockData()` (há um botão para isso na interface, no rodapé
 * da barra lateral, quando o modo mock está ativo).
 */

const STORAGE_KEY = 'citi-pessoas:mock-db:v1';

export interface MockDatabase {
  members: Member[];
  x1s: X1[];
  feedbacks: Feedback[];
  anonymousFeedbacks: AnonymousFeedback[];
  memberEvents: MemberEvent[];
  gestoes: Gestao[];
  settings: Settings;
  /**
   * Controle das importações por planilha, para o modo mock também ser
   * idempotente: reenviar o mesmo CSV não cria ninguém de novo.
   */
  intakeSubmissions: MockIntakeSubmission[];
  /** Configuração PERMANENTE do formulário do Google Forms (migration 0026). */
  googleFormsIntakeConfig: GoogleFormsIntakeConfig;
  /** Histórico de campanhas de entrada — no máximo uma com status `ativa`. */
  intakeCampaigns: IntakeCampaign[];
  /** Sessão do modo mock. No Supabase quem cuida disso é a própria lib. */
  currentUser: AuthUser | null;
}

/** Espelho enxuto de `member_intake_submissions`. */
export interface MockIntakeSubmission {
  id: string;
  source: MemberIntakeSource;
  externalId: string;
  status: 'pending' | 'processed' | 'needs_review' | 'failed';
  memberId: string | null;
  payload: Record<string, string>;
  errorMessage: string | null;
  /**
   * Códigos do que ainda precisa de correção humana. Vazio = nada pendente.
   * Espelha a restrição do banco (migration 0013): ter motivo é estar em
   * `needs_review`, e não ter motivo é não estar.
   */
  reviewReasons: MemberIntakeReviewReason[];
  /**
   * Snapshot imutável da campanha que produziu esta entrada (só
   * `google_forms` — migration 0026). `null` para `csv`/`manual`, e também
   * para uma resposta do Forms que ainda não foi processada nem falhou por
   * falta de campanha ativa.
   */
  campaignId: ID | null;
  gestaoId: ID | null;
  entryDate: string | null;
}

function seed(): MockDatabase {
  return {
    // Cópias: sem isso, editar no app mutaria as fixtures importadas.
    members: structuredClone(MEMBERS),
    x1s: structuredClone(X1S),
    feedbacks: structuredClone(FEEDBACKS),
    anonymousFeedbacks: structuredClone(ANONYMOUS_FEEDBACKS),
    memberEvents: structuredClone(MEMBER_EVENTS),
    gestoes: structuredClone(GESTOES),
    settings: structuredClone(SETTINGS),
    intakeSubmissions: [],
    googleFormsIntakeConfig: structuredClone(GOOGLE_FORMS_INTAKE_CONFIG),
    intakeCampaigns: [],
    currentUser: null,
  };
}

let db: MockDatabase | null = null;

function load(): MockDatabase {
  if (db) return db;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      // Espalhado sobre o seed de propósito: quando o modelo ganha uma coleção
      // nova, quem já tinha dados salvos recebe a coleção vazia em vez de um
      // `undefined` que quebra a primeira tela que iterar sobre ela.
      db = { ...seed(), ...(JSON.parse(raw) as Partial<MockDatabase>) } as MockDatabase;
      return db;
    }
  } catch {
    // localStorage indisponível ou JSON corrompido: recomeça do seed.
  }

  db = seed();
  persist();
  return db;
}

function persist() {
  if (!db) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Sem localStorage (aba anônima, quota cheia): segue só em memória.
  }
}

/** Acesso ao banco de mentira. */
export function mockDb(): MockDatabase {
  return load();
}

/** Salva o estado atual. Chame depois de qualquer escrita. */
export function commit() {
  persist();
}

/** Apaga tudo e volta aos dados de exemplo originais. */
export function resetMockData() {
  db = seed();
  // O que é de sessão (CPF, bytes de foto, trilha) zera junto: sem isto, os
  // membros recém-semeados voltariam carregando o CPF de antes do reset.
  resetMockPrivateData();
  persist();
}

/** Id sequencial legível, no estilo `x1-a3f9c2`. */
export function mockId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Simula latência de rede para que estados de loading apareçam de verdade. */
export function delay(ms = 180): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function nowISO(): string {
  return new Date().toISOString();
}
