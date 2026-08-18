import { PageHeader } from '@/components/ui';
import { FeatureStub } from '@/app/components/FeatureStub';

/**
 * EPIC 7 — IMPORTAÇÃO DA BASE "CITi Pessoas" · Feature Owner: Sofia
 *
 * A fundação de leitura/validação já existe em
 * `src/data/import/membersImport.ts`. O que falta é a tela e o mapeamento
 * real das colunas.
 *
 * ⚠️ A planilha real NÃO estava disponível quando esta base foi montada.
 * O primeiro passo é abrir a planilha e corrigir `COLUMN_ALIASES` —
 * não suponha que o palpite atual está certo.
 *
 * ⚠️ Dados reais de membros nunca entram no repositório. O `.gitignore` já
 * bloqueia `.csv` e `.xlsx` por isso.
 */
export function ImportPage() {
  return (
    <>
      <PageHeader
        title="Importação"
        subtitle="Carga inicial da base CITi Pessoas, com validação antes de gravar."
      />

      <FeatureStub
        issue="IMPORT-001"
        owner="Sofia"
        goal="Importar a base CITi Pessoas"
        steps={[
          'Abrir a planilha real e conferir os nomes de coluna (IMPORT-001).',
          'Corrigir COLUMN_ALIASES em src/data/import/membersImport.ts (IMPORT-002).',
          'Tela: escolher o arquivo, ler com previewMembersCsv() e mostrar o relatório (IMPORT-003).',
          'Mostrar TODOS os problemas antes de importar — linha, campo e motivo (IMPORT-006).',
          'Confirmar a importação com createMembers(); duplicados são reportados, não gravados (IMPORT-004, IMPORT-005).',
        ]}
        files={[
          'src/features/import/pages/ImportPage.tsx  ← esta tela',
          'src/data/import/membersImport.ts  ← leitura e validação (já existe)',
        ]}
        dataHooks={[
          'previewMembersCsv(conteudoDoArquivo)  → { valid, issues, duplicatesInFile }',
          'createMembers(inputs)  → { created, skipped }',
        ]}
        doNotTouch={['src/app/', 'src/components/ui/']}
        docs={['docs/DATA_MODEL.md', 'docs/ARCHITECTURE.md']}
      />
    </>
  );
}
