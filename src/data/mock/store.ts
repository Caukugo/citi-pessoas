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
import {
  ANONYMOUS_FEEDBACKS,
  FEEDBACKS,
  GESTOES,
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
  /** Sessão do modo mock. No Supabase quem cuida disso é a própria lib. */
  currentUser: AuthUser | null;
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
    currentUser: null,
  };
}

let db: MockDatabase | null = null;

function load(): MockDatabase {
  if (db) return db;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      db = JSON.parse(raw) as MockDatabase;
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
