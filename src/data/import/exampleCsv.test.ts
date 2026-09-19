import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readZip } from '@/lib/zip';
import { MOCK_ORG_CATALOG } from '../mock/orgFixtures';
import type { Gestao } from '../types';
import { buildImportPlan, detectImageType, type ImportPhoto } from './importPlan';
import { parseMembersCsv } from './membersImport';

/**
 * O ARQUIVO DE EXEMPLO PRECISA CONTINUAR VÁLIDO.
 *
 * `docs/examples/importacao-piloto.csv` é o que a pessoa vai selecionar na tela
 * para testar a importação. Se alguém editar a planilha e quebrar uma coluna,
 * o erro apareceria só na hora de usar — e pareceria bug da tela.
 *
 * Este teste lê os arquivos de verdade e exige que o plano saia limpo.
 */

const RAIZ = resolve(__dirname, '../../..');
const CSV = resolve(RAIZ, 'docs/examples/importacao-piloto.csv');
const ZIP = resolve(RAIZ, 'docs/examples/importacao-piloto-fotos.zip');

/** As mesmas gestões que a migration 0005 cadastra. */
const GESTOES: Gestao[] = [
  { id: 'g-2025-1', name: '2025.1', startDate: '2025-01-01', endDate: '2025-06-30', status: 'finalizada', googleFormsEligible: false },
  { id: 'g-2025-2', name: '2025.2', startDate: '2025-07-01', endDate: '2025-12-31', status: 'finalizada', googleFormsEligible: false },
  { id: 'g-2026-1', name: '2026.1', startDate: '2026-01-01', endDate: '2026-06-30', status: 'finalizada', googleFormsEligible: false },
  { id: 'g-2026-2', name: '2026.2', startDate: '2026-07-01', endDate: '2026-12-31', status: 'ativa', googleFormsEligible: false },
];

async function lerFotos(): Promise<ImportPhoto[]> {
  const bytes = readFileSync(ZIP);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

  return (await readZip(buffer)).map((entry) => ({
    name: entry.name,
    path: entry.path,
    bytes: entry.bytes,
    contentType: detectImageType(entry.bytes),
    size: entry.bytes.length,
  }));
}

describe('planilha e fotos de exemplo do piloto', () => {
  it('o .zip traz cinco PNGs legíveis', async () => {
    const photos = await lerFotos();

    expect(photos).toHaveLength(5);
    expect(photos.every((photo) => photo.contentType === 'image/png')).toBe(true);
    expect(photos.every((photo) => photo.size > 0)).toBe(true);
  });

  it('a planilha passa na validação sem nenhum erro bloqueante', async () => {
    const plan = buildImportPlan(parseMembersCsv(readFileSync(CSV, 'utf-8')), {
      catalog: MOCK_ORG_CATALOG,
      gestoes: GESTOES,
      existingEmails: {},
      photos: await lerFotos(),
      // Data fixa: o exemplo precisa valer independentemente do dia.
      referenceDate: '2026-09-17',
    });

    expect(plan.fileIssues).toEqual([]);
    expect(plan.unknownColumns).toEqual([]);
    expect(plan.hasBlockingErrors).toBe(false);
    expect(plan.summary.totalRows).toBe(5);
    expect(plan.summary.validRows).toBe(5);
    expect(plan.summary.photosFound).toBe(5);
    expect(plan.summary.photosMissing).toBe(0);
    expect(plan.unusedPhotos).toEqual([]);
  });

  it('cobre os casos que o piloto precisa demonstrar', async () => {
    const plan = buildImportPlan(parseMembersCsv(readFileSync(CSV, 'utf-8')), {
      catalog: MOCK_ORG_CATALOG,
      gestoes: GESTOES,
      existingEmails: {},
      photos: await lerFotos(),
      referenceDate: '2026-09-17',
    });

    // Os cinco entram ATIVOS: a planilha é a base atual do CITi.
    expect(plan.summary.willBeActive).toBe(5);
    expect(plan.rows.every((row) => row.computedStatus === 'ativo')).toBe(true);

    // Um deles veio da gestão 2025.1, com o ciclo inicial já vencido: é o caso
    // que demonstra a continuação inferida, sem inativar ninguém.
    expect(plan.summary.withInferredContinuation).toBe(1);

    const antigo = plan.rows.find((row) => row.rosterContinuation);
    expect(antigo?.gestao?.name).toBe('2025.1');
    // O ciclo INICIAL não se estica: ele continua terminando em 31/12/2025.
    expect(antigo?.cycle?.expectedEndOn).toBe('2025-12-31');
    // Analista de Marketing: 6 meses por bloco, dois blocos até 17/09/2026.
    expect(antigo?.rosterContinuation?.monthsPerBlock).toEqual([6, 6]);
    expect(antigo?.currentCycle).toEqual({
      startedOn: '2026-07-01',
      expectedEndOn: '2026-12-31',
    });

    // Um cargo de liderança, provando que o cargo vem da planilha e não do
    // cargo inicial da subárea.
    expect(plan.rows.some((row) => row.position?.name === 'Líder de Desenvolvimento')).toBe(true);

    // Um cargo de ÁREA inteira, entrando SEM subárea — que é como a planilha
    // deve ser preenchida para esse caso.
    const diretoria = plan.rows.find((row) => row.position?.name === 'Diretor(a) de Soluções');
    expect(diretoria?.position?.subareaId).toBeNull();
    expect(diretoria?.subarea).toBeNull();
    expect(diretoria?.areaWide).toBe(true);
    expect(diretoria?.area?.name).toBe('Soluções');
    // O único aviso dele é o CPF ausente — que é de propósito no exemplo:
    // a planilha do piloto precisa demonstrar esse caso.
    expect(diretoria?.issues.map((issue) => issue.severity)).toEqual(['warning']);
    expect(diretoria?.cpf).toBeNull();

    // Uma entrada por gestão .1, com ciclo de janeiro a dezembro.
    const gestaoUm = plan.rows.find((row) => row.gestao?.name === '2026.1');
    expect(gestaoUm?.cycle).toEqual({ startedOn: '2026-01-01', expectedEndOn: '2026-12-31' });

    // Nenhuma pessoa vem com responsável de GG: a alocação é decisão posterior.
    expect(plan.rows.every((row) => !row.existingMemberId)).toBe(true);
  });

  it('demonstra os três casos de CPF, sem bloquear ninguém', async () => {
    const plan = buildImportPlan(parseMembersCsv(readFileSync(CSV, 'utf-8')), {
      catalog: MOCK_ORG_CATALOG,
      gestoes: GESTOES,
      existingEmails: {},
      photos: await lerFotos(),
      referenceDate: '2026-09-17',
    });

    // Três com CPF válido, um sem CPF, um com CPF que não confere.
    expect(plan.summary.withCpf).toBe(3);
    expect(plan.summary.withoutCpf).toBe(2);

    const ausente = plan.rows.find((row) => row.cpfProblem === 'vazio');
    const invalido = plan.rows.find((row) => row.cpfProblem === 'sequencia_repetida');

    expect(ausente?.reviews.map((r) => r.reason)).toContain('cpf_missing');
    expect(invalido?.reviews.map((r) => r.reason)).toContain('invalid_cpf');

    // AVISO, não bloqueio: ninguém fica de fora por causa de CPF.
    expect(ausente?.importable).toBe(true);
    expect(invalido?.importable).toBe(true);
    expect(plan.hasBlockingErrors).toBe(false);
  });

  it('nenhum CPF do exemplo vaza para o payload da submissão', () => {
    const plan = parseMembersCsv(readFileSync(CSV, 'utf-8'));
    const payloads = JSON.stringify(plan.rows.map((row) => row.raw));

    for (const cpf of ['52998224725', '11144477735', '01234567890', '529.982.247-25']) {
      expect(payloads).not.toContain(cpf);
    }
  });

  it('todos os e-mails são obviamente fictícios', () => {
    const plan = parseMembersCsv(readFileSync(CSV, 'utf-8'));

    // `.invalid` é reservado pela RFC 2606 justamente para nunca existir.
    // Nenhum dado real de membro pode entrar no repositório.
    expect(plan.rows.every((row) => row.values.email?.endsWith('@teste.invalid'))).toBe(true);
  });
});
