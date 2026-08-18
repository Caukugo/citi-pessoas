import {
  ClipboardList,
  MessageSquare,
  Settings,
  ShieldCheck,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { ROUTES } from './routes';

/**
 * Itens da barra lateral.
 *
 * Já contém tudo que a Fase 1 prevê, então NINGUÉM precisa editar este arquivo
 * ao começar uma feature — o link para a sua tela já existe.
 */
export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Quem é responsável pela área — aparece na documentação, não na tela. */
  owner: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: ROUTES.members, label: 'Membros', icon: Users, owner: 'Gabi' },
  { to: ROUTES.x1, label: 'X1', icon: ClipboardList, owner: 'Bia' },
  { to: ROUTES.feedbacks, label: 'Feedbacks', icon: MessageSquare, owner: 'Clara' },
  { to: ROUTES.moderation, label: 'Moderação', icon: ShieldCheck, owner: 'Clara' },
  { to: ROUTES.import, label: 'Importação', icon: Upload, owner: 'Sofia' },
  { to: ROUTES.admin, label: 'Administração', icon: Settings, owner: 'Bia / Cauan' },
];
