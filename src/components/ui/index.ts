/**
 * Design System do CITi — ponto único de importação.
 *
 *   import { Button, Panel, FormField, Input } from '@/components/ui';
 *
 * REGRAS:
 * 1. Nunca crie um botão/card/campo novo dentro de uma feature. Se falta algo
 *    aqui, fale com Cauan ou Gabi antes de duplicar.
 * 2. Todo componente aceita `className` para ajustes pontuais de layout.
 * 3. Cores vêm dos tokens em src/styles/theme.css — nunca escreva hex na feature.
 *
 * Catálogo visual navegável: rode `npm run dev` e acesse /design-system.
 * Documentação escrita: docs/DESIGN_SYSTEM.md
 */

export { Surface, Panel, PanelHeader, Card } from './surface';
export { Button, IconButton, Chip } from './button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './button';

export {
  FormField,
  Input,
  Textarea,
  Select,
  Checkbox,
  Radio,
  SearchInput,
  Toggle,
} from './form';
export type { FormFieldProps, SelectOption } from './form';

export { Modal, Drawer, ConfirmDialog } from './overlay';
export type { ModalProps, ModalSize } from './overlay';

export { Badge, Avatar, Tooltip, Meter } from './display';
export type { Tone, AvatarSize } from './display';

export { Skeleton, LoadingState, EmptyState, ErrorState } from './states';

export { TableWrapper, Table, THead, TBody, TR, TH, TD } from './table';

export { Tabs } from './tabs';
export type { TabItem } from './tabs';

export { PageHeader } from './page-header';
