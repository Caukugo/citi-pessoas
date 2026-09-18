import { Link } from 'react-router-dom';
import { Upload } from 'lucide-react';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Surface,
  useToast,
} from '@/components/ui';
import { ROUTES } from '@/app/routes';
import { useAuth } from '@/features/auth/useAuth';
import { FilePickers } from '../components/FilePickers';
import { ImportPreview } from '../components/ImportPreview';
import { ImportResult } from '../components/ImportResult';
import { useMembersImport } from '../hooks/useMembersImport';

/**
 * EPIC 7 — IMPORTAÇÃO DA BASE "CITi Pessoas".
 *
 * O fluxo tem duas etapas separadas de propósito: PRÉVIA e CONFIRMAÇÃO.
 * Escolher os arquivos não grava nada; a prévia mostra exatamente o que vai
 * acontecer, inclusive o que está errado, e só então existe um botão.
 *
 * O botão fica desabilitado enquanto houver erro bloqueante. Importar "só as
 * linhas boas" deixaria planilha e banco em estados diferentes, e ninguém
 * saberia quais pessoas faltam.
 *
 * ⚠️ A planilha real nunca entra no repositório — o `.gitignore` bloqueia
 * `.csv` e `.xlsx`. O arquivo de exemplo em `docs/examples/` é fictício.
 */
export function ImportPage() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const {
    phase,
    csvFile,
    zipFile,
    plan,
    report,
    error,
    progress,
    catalogLoading,
    catalogError,
    retryCatalog,
    selectCsv,
    selectZip,
    confirm,
    reset,
  } = useMembersImport();

  const importando = phase === 'importando';
  const lendo = phase === 'lendo';
  const podeConfirmar = Boolean(plan && !plan.hasBlockingErrors && plan.summary.validRows > 0);

  async function handleConfirm() {
    await confirm();
    showToast({ tone: 'success', message: 'Importação concluída. Confira o relatório abaixo.' });
  }

  return (
    <>
      <PageHeader
        eyebrow="Administração"
        title="Importação"
        subtitle="Carga da base CITi Pessoas por planilha, com prévia obrigatória antes de gravar."
        actions={
          phase === 'concluido' ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={reset}>
                Nova importação
              </Button>
              <Link
                to={ROUTES.members}
                className="inline-flex h-9 items-center justify-center rounded-control border border-primary/40 bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                Ver membros
              </Link>
            </div>
          ) : (
            <Button
              variant="primary"
              icon={<Upload size={15} />}
              disabled={!podeConfirmar || importando}
              loading={importando}
              onClick={() => void handleConfirm()}
            >
              {importando
                ? `Importando ${progress.done}/${progress.total}…`
                : 'Confirmar importação'}
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-6">
        {/* A plataforma é interna e a RPC do banco recusa quem não é da GG.
            Dizer isso aqui evita a pessoa montar a prévia inteira para só
            então descobrir que não tem permissão. */}
        {!user && (
          <Surface className="border-warn/30 bg-warn/5 p-5" role="alert">
            <p className="text-sm font-semibold text-warn">Sessão necessária</p>
            <p className="mt-1 text-xs text-foreground-secondary">
              A importação grava dados de pessoas e exige uma conta autorizada da GG. Entre na
              plataforma antes de continuar.
            </p>
          </Surface>
        )}

        {catalogError ? (
          <ErrorState
            title="Não foi possível carregar áreas, subáreas e cargos"
            description="Sem o cadastro organizacional não dá para validar a planilha."
            onRetry={retryCatalog}
          />
        ) : catalogLoading ? (
          <LoadingState label="Carregando o cadastro organizacional…" />
        ) : (
          <>
            <FilePickers
              csvFile={csvFile}
              zipFile={zipFile}
              disabled={importando}
              onSelectCsv={selectCsv}
              onSelectZip={selectZip}
            />

            {error && (
              <Surface className="border-bad/30 bg-bad/5 p-5" role="alert">
                <p className="text-sm font-semibold text-bad">Não foi possível ler os arquivos</p>
                <p className="mt-1 text-xs text-foreground-secondary">{error}</p>
              </Surface>
            )}

            {lendo && <LoadingState label="Lendo a planilha e conferindo o cadastro…" />}

            {phase === 'previa' && plan && <ImportPreview plan={plan} />}

            {phase === 'importando' && plan && (
              <>
                <LoadingState
                  label={`Importando ${progress.done} de ${progress.total} — não feche esta aba.`}
                />
                <ImportPreview plan={plan} />
              </>
            )}

            {phase === 'concluido' && report && <ImportResult report={report} />}

            {phase === 'idle' && !error && (
              <EmptyState
                title="Escolha a planilha para começar"
                description="A prévia aparece assim que o arquivo for lido. Nada é gravado antes de você confirmar."
              />
            )}
          </>
        )}
      </div>
    </>
  );
}
