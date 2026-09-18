import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  findExistingEmails,
  flagImportReview,
  importMember,
  messageFor,
  queryKeys,
  recordImportFailure,
  setMemberCpf,
  uploadMemberPhoto,
  useGestoes,
  useOrgCatalog,
} from '@/data';
import { buildImportPlan, type ImportPhoto, type ImportPlan } from '@/data/import/importPlan';
import { parseMembersCsv } from '@/data/import/membersImport';
import { readPhotosFromZip } from '@/data/import/photosFromZip';
import { runImport, type ImportGateway, type ImportReport } from '../model/runImport';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Estado da tela de importação.
 *
 * Em que pé o fluxo está:
 *
 *   idle        nenhum arquivo escolhido ainda
 *   lendo       lendo CSV e ZIP, consultando o banco para montar a prévia
 *   previa      a prévia está na tela; nada foi gravado
 *   importando  gravando, linha a linha
 *   concluido   relatório final na tela
 *
 * A prévia é remontada a cada troca de arquivo. Ela NUNCA grava nada — é toda
 * a diferença entre "conferir antes" e "descobrir depois".
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ImportPhase = 'idle' | 'lendo' | 'previa' | 'importando' | 'concluido';

export interface ImportProgress {
  done: number;
  total: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function useMembersImport() {
  const queryClient = useQueryClient();
  const catalogQuery = useOrgCatalog();
  const gestoesQuery = useGestoes();

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [photos, setPhotos] = useState<ImportPhoto[]>([]);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [phase, setPhase] = useState<ImportPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress>({ done: 0, total: 0 });

  const catalog = catalogQuery.data;
  const gestoes = gestoesQuery.data;

  /**
   * Remonta a prévia com os arquivos informados.
   *
   * Recebe os arquivos por parâmetro, e não do estado, porque `setState` é
   * assíncrono: ler do estado logo após escolher o arquivo usaria o anterior.
   */
  const rebuild = useCallback(
    async (csv: File | null, zip: File | null) => {
      setReport(null);
      setError(null);

      if (!csv) {
        setPlan(null);
        setPhase('idle');
        return;
      }

      if (!catalog || !gestoes) return;

      setPhase('lendo');
      try {
        const parsed = parseMembersCsv(await csv.text());

        const foundPhotos = zip ? await readPhotosFromZip(zip) : [];
        setPhotos(foundPhotos);

        // Descobre quem já está cadastrado ANTES de mostrar a prévia: é o que
        // permite dizer "3 novos, 2 já existem" em vez de descobrir na hora de
        // gravar.
        const emails = parsed.rows.map((row) => row.values.email).filter((e): e is string => !!e);
        const existingEmails = emails.length > 0 ? await findExistingEmails(emails) : {};

        setPlan(
          buildImportPlan(parsed, {
            catalog,
            gestoes,
            existingEmails,
            photos: foundPhotos,
            referenceDate: today(),
          }),
        );
        setPhase('previa');
      } catch (cause) {
        setError(messageFor(cause));
        setPlan(null);
        setPhase('idle');
      }
    },
    [catalog, gestoes],
  );

  const selectCsv = useCallback(
    (file: File | null) => {
      setCsvFile(file);
      void rebuild(file, zipFile);
    },
    [rebuild, zipFile],
  );

  const selectZip = useCallback(
    (file: File | null) => {
      setZipFile(file);
      if (!file) setPhotos([]);
      void rebuild(csvFile, file);
    },
    [rebuild, csvFile],
  );

  const confirm = useCallback(async () => {
    if (!plan || plan.hasBlockingErrors) return;

    setPhase('importando');
    setError(null);
    setProgress({ done: 0, total: plan.rows.filter((row) => row.importable).length });

    const gateway: ImportGateway = {
      importMember,
      // O CPF vai pelo SERVIÇO que cifra, identificado como importação na
      // trilha de auditoria. Ele não passa pelo RPC de importação.
      setCpf: (memberId, cpf) => setMemberCpf(memberId, cpf, 'importacao'),
      recordFailure: recordImportFailure,
      flagReview: flagImportReview,
      uploadPhoto: uploadMemberPhoto,
    };

    try {
      const result = await runImport(plan, gateway, {
        referenceDate: today(),
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setReport(result);
      setPhase('concluido');

      // A listagem de membros mudou: sem isto, quem for conferir vê a tela
      // antiga em cache e acha que a importação não funcionou.
      await queryClient.invalidateQueries({ queryKey: queryKeys.members.all });
    } catch (cause) {
      // `runImport` já isola falha por linha; chegar aqui é falha do fluxo
      // inteiro (rede caiu, sessão expirou).
      setError(messageFor(cause));
      setPhase('previa');
    }
  }, [plan, queryClient]);

  const reset = useCallback(() => {
    setCsvFile(null);
    setZipFile(null);
    setPhotos([]);
    setPlan(null);
    setReport(null);
    setError(null);
    setProgress({ done: 0, total: 0 });
    setPhase('idle');
  }, []);

  return {
    phase,
    csvFile,
    zipFile,
    photos,
    plan,
    report,
    error,
    progress,
    catalogLoading: catalogQuery.isLoading || gestoesQuery.isLoading,
    catalogError: catalogQuery.isError || gestoesQuery.isError,
    retryCatalog: () => {
      void catalogQuery.refetch();
      void gestoesQuery.refetch();
    },
    selectCsv,
    selectZip,
    confirm,
    reset,
  };
}
