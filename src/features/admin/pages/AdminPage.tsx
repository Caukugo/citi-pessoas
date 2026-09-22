import { PageHeader } from '@/components/ui';
import { EntradaMembrosPanel } from '../components/EntradaMembrosPanel';
import { AnonymousFeedbackIntakePanel } from '../components/AnonymousFeedbackIntakePanel';
import { X1PeriodicityPanel } from '../components/X1PeriodicityPanel';
import { CitiValuesPanel } from '../components/CitiValuesPanel';

/**
 * EPIC 6 — ADMINISTRAÇÃO · Responsável: Bia (com apoio de Cauan)
 *
 * A Administração existe para que a plataforma não fique presa às regras de uma
 * única gestão: periodicidade de X1 (ADM-001), valores do CITi (ADM-004) e as
 * campanhas de entrada do Google Forms. Não transforme isto em um painel de
 * tudo — subáreas, cargos, papéis e notificações são fase seguinte.
 *
 * ⚠️ As duas configurações de regra mudam o futuro sem reescrever o passado, e
 * de jeitos diferentes: a periodicidade é regra VIVA (a situação de X1 é sempre
 * calculada pela regra de hoje) e os valores são SNAPSHOT (cada X1 guarda o
 * rótulo do dia). Ver ADR-023 antes de mexer em qualquer uma das duas.
 */
export function AdminPage() {
  return (
    <>
      <PageHeader
        title="Administração"
        subtitle="Configurações que o acompanhamento de X1 e a entrada de membros precisam."
      />

      <div className="flex flex-col gap-6">
        <X1PeriodicityPanel />

        <CitiValuesPanel />

        <EntradaMembrosPanel />

        <AnonymousFeedbackIntakePanel />
      </div>
    </>
  );
}
