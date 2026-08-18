import { Navigate, Route, Routes } from 'react-router-dom';
import { IS_DEV } from '@/lib/env';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { MembersPage } from '@/features/members/pages/MembersPage';
import { MemberProfilePage } from '@/features/members/pages/MemberProfilePage';
import { X1Page } from '@/features/x1/pages/X1Page';
import { FeedbacksPage } from '@/features/feedbacks/pages/FeedbacksPage';
import { ModerationPage } from '@/features/anonymous-feedback/pages/ModerationPage';
import { AnonymousFeedbackFormPage } from '@/features/anonymous-feedback/pages/AnonymousFeedbackFormPage';
import { AdminPage } from '@/features/admin/pages/AdminPage';
import { ImportPage } from '@/features/import/pages/ImportPage';
import { DesignSystemPage } from '@/features/design-system/pages/DesignSystemPage';
import { AppLayout } from './layouts/AppLayout';
import { PublicLayout } from './layouts/PublicLayout';
import { NotFoundPage } from './pages/NotFoundPage';
import { ROUTES } from './routes';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ROTEADOR DA APLICAÇÃO.
 *
 * TODAS as rotas da Fase 1 já estão registradas. Ao desenvolver uma feature
 * você NÃO precisa editar este arquivo — a sua página já está ligada. Isso
 * evita que cinco branches mexam na mesma linha e briguem no merge.
 *
 * Só mexa aqui se a sua issue pedir uma rota que ainda não existe — e, nesse
 * caso, avise o Cauan.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function AppRouter() {
  return (
    <Routes>
      {/* ── Público: sem login ────────────────────────────────────────────── */}
      <Route element={<PublicLayout />}>
        <Route path={ROUTES.login} element={<LoginPage />} />
        <Route path={ROUTES.anonymousFeedbackForm} element={<AnonymousFeedbackFormPage />} />
      </Route>

      {/* ── Interno: exige login ──────────────────────────────────────────── */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          {/* O Dashboard está fora do escopo da Fase 1: a home é Membros. */}
          <Route path={ROUTES.home} element={<Navigate to={ROUTES.members} replace />} />

          {/* EPIC 1 e 2 — Gabi */}
          <Route path={ROUTES.members} element={<MembersPage />} />
          <Route path={ROUTES.memberProfilePattern} element={<MemberProfilePage />} />

          {/* EPIC 3 — Bia */}
          <Route path={ROUTES.x1} element={<X1Page />} />

          {/* EPIC 4 — Clara */}
          <Route path={ROUTES.feedbacks} element={<FeedbacksPage />} />

          {/* EPIC 5 — Clara */}
          <Route path={ROUTES.moderation} element={<ModerationPage />} />

          {/* EPIC 6 — Bia / Cauan */}
          <Route path={ROUTES.admin} element={<AdminPage />} />

          {/* EPIC 7 — Sofia */}
          <Route path={ROUTES.import} element={<ImportPage />} />

          {/* Catálogo do design system — só em desenvolvimento. */}
          {IS_DEV && <Route path={ROUTES.designSystem} element={<DesignSystemPage />} />}

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
