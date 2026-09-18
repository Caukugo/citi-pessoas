import { describe, expect, it, vi } from 'vitest';
import { buildImportPlan, detectImageType, type ImportPhoto } from '@/data/import/importPlan';
import { parseMembersCsv } from '@/data/import/membersImport';
import { MOCK_ORG_CATALOG } from '@/data/mock/orgFixtures';
import type {
  Gestao,
  MemberImportContinuation,
  MemberImportInput,
  MemberImportResult,
  MemberIntakeReviewReason,
} from '@/data';
import { externalIdFor, runImport, type ImportGateway } from './runImport';

/**
 * Testes da EXECUÇÃO da importação.
 *
 * O gateway é falso de propósito: aqui se testa o comportamento do orquestrador
 * — idempotência, isolamento de falha, foto que não sobe — sem banco e sem rede.
 */

const HOJE = '2026-09-17';

/**
 * A data do SERVIDOR. Igual à da prévia aqui, mas separada de propósito: é o
 * banco quem decide a data de referência, e o relatório mostra a dele.
 */
const SERVIDOR_HOJE = '2026-09-17';

const GESTOES: Gestao[] = [
  { id: 'g-2025-1', name: '2025.1', startDate: '2025-01-01', endDate: '2025-06-30', status: 'finalizada' },
  { id: 'g-2026-2', name: '2026.2', startDate: '2026-07-01', endDate: '2026-12-31', status: 'ativa' },
];

const CABECALHO =
  'Área,Subárea,Cargo,Nome Completo,Email do CITi,CPF,Celular,Curso,' +
  'Departamento Acadêmico,Data de Nascimento,Gestão de Entrada,Foto Arquivo';

const CSV = `${CABECALHO}
Gente e Gestão,Gente e Gestão,Analista de Gente e Gestão,Ana Piloto,ana.piloto@teste.invalid,529.982.247-25,,,,,2026.2,ana.jpg
Soluções,Dados,Analista de Dados,Bruno Piloto,bruno.piloto@teste.invalid,111.444.777-35,,,,,2025.1,bruno.jpg`;

function jpegFake(name: string): ImportPhoto {
  const bytes = new Uint8Array(64);
  bytes.set([0xff, 0xd8, 0xff], 0);
  return { name, path: name, bytes, contentType: detectImageType(bytes), size: bytes.length };
}

function planFrom(csv: string, existingEmails: Record<string, string> = {}) {
  return buildImportPlan(parseMembersCsv(csv), {
    catalog: MOCK_ORG_CATALOG,
    gestoes: GESTOES,
    existingEmails,
    photos: [jpegFake('ana.jpg'), jpegFake('bruno.jpg')],
    referenceDate: HOJE,
  });
}

/**
 * Gateway em memória que imita as três garantias do banco: chave única por
 * envio, e-mail único, e foto gravada por membro.
 */
function fakeGateway(
  options: {
    failFor?: string;
    failPhotoFor?: string;
    /** CPF que o serviço recusa guardar, para exercitar a compensação. */
    failCpfFor?: string;
    /** O que o BANCO decidiu emendar para cada e-mail. */
    continuationFor?: (email: string) => MemberImportContinuation | null;
  } = {},
) {
  const submissions = new Map<string, { memberId: string }>();
  const membersByEmail = new Map<string, string>();
  const photos: { memberId: string; fileName: string }[] = [];
  const failures: { externalId: string; error: string }[] = [];
  /** `{ [memberId]: cpf }` — o que o serviço guardaria. */
  const cpfs = new Map<string, string>();
  /** Espelha `member_intake_submissions.review_reasons`. */
  const reviews = new Map<string, MemberIntakeReviewReason[]>();
  let nextId = 1;

  const gateway: ImportGateway = {
    async importMember(input: MemberImportInput): Promise<MemberImportResult> {
      if (options.failFor === input.email) {
        // Transação do banco desfeita: nada é gravado por esta linha.
        throw new Error('Falha simulada ao gravar o membro.');
      }

      const seen = submissions.get(input.externalId);
      if (seen) {
        return { outcome: 'ja_importado', memberId: seen.memberId, status: 'ativo' };
      }

      const existing = membersByEmail.get(input.email);
      if (existing) {
        submissions.set(input.externalId, { memberId: existing });
        return { outcome: 'ja_existia', memberId: existing, status: 'ativo' };
      }

      const memberId = `mbr-${nextId++}`;
      membersByEmail.set(input.email, memberId);
      submissions.set(input.externalId, { memberId });

      // Como o banco: quem está na base atual entra ATIVO, e o servidor devolve
      // a data de referência que ELE usou — não a que a prévia sugeriu.
      return {
        outcome: 'criado',
        memberId,
        status: 'ativo',
        referenceDate: SERVIDOR_HOJE,
        continuation: options.continuationFor?.(input.email) ?? null,
      };
    },

    async setCpf(memberId: string, cpf: string) {
      // Espelha o serviço: valida, detecta duplicidade e guarda — sem cifrar,
      // porque chave de cifra não existe em teste de orquestração.
      const dono = [...cpfs.entries()].find(([outro, valor]) => outro !== memberId && valor === cpf);
      if (dono) return { outcome: 'duplicado' as const, conflictMemberId: dono[0] };

      if (options.failCpfFor === cpf) throw new Error('Falha simulada ao guardar o CPF.');

      cpfs.set(memberId, cpf);
      return { outcome: 'criado' as const, last4: cpf.slice(-4) };
    },

    async recordFailure(externalId, _payload, error) {
      failures.push({ externalId, error });
    },

    async flagReview(externalId, reasons) {
      // Como no banco: motivos substituem os anteriores, e lista vazia
      // significaria "nada pendente".
      reviews.set(externalId, reasons);
    },

    async uploadPhoto(memberId, photo) {
      if (options.failPhotoFor === photo.fileName) {
        throw new Error('Falha simulada ao enviar a foto.');
      }
      photos.push({ memberId, fileName: photo.fileName });
      return `${memberId}/${photo.fileName}`;
    },
  };

  return { gateway, submissions, membersByEmail, photos, failures, reviews, cpfs };
}

// ═══════════════════════════════════════════════════════════════════════════
describe('importação bem-sucedida', () => {
  it('cria os membros e envia as fotos', async () => {
    const { gateway, photos } = fakeGateway();

    const report = await runImport(planFrom(CSV), gateway, { referenceDate: HOJE });

    expect(report.created).toBe(2);
    expect(report.failed).toBe(0);
    expect(report.photosUploaded).toBe(2);
    expect(report.needsReview).toBe(false);
    expect(photos).toHaveLength(2);
    expect(report.rows.map((row) => row.email)).toEqual([
      'ana.piloto@teste.invalid',
      'bruno.piloto@teste.invalid',
    ]);
  });

  it('a chave do envio vem do e-mail, não da posição na planilha', async () => {
    // Reordenar o arquivo não pode fazer as mesmas pessoas parecerem novas.
    expect(externalIdFor('Ana.Piloto@Teste.Invalid')).toBe('csv:ana.piloto@teste.invalid');
    expect(externalIdFor(' ana.piloto@teste.invalid ')).toBe('csv:ana.piloto@teste.invalid');
  });

  it('avisa o progresso linha a linha', async () => {
    const { gateway } = fakeGateway();
    const onProgress = vi.fn();

    await runImport(planFrom(CSV), gateway, { onProgress });

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(2, 2);
  });

  it('não envia linhas inválidas ao banco', async () => {
    const csv = `${CABECALHO}
Soluções,Setor Fantasma,Analista de Dados,Ruim,ruim@teste.invalid,012.345.678-90,,,,,2026.2,`;
    const { gateway } = fakeGateway();
    const spy = vi.spyOn(gateway, 'importMember');

    const report = await runImport(planFrom(csv), gateway);

    expect(spy).not.toHaveBeenCalled();
    expect(report.rows).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('base atual: o relatório mostra o que o BANCO decidiu', () => {
  /** Bruno entrou em 2025.1: dois blocos de 6 meses até 17/09/2026. */
  const CONTINUACAO_DO_BRUNO: MemberImportContinuation = {
    originalEndOn: '2025-12-31',
    finalEndOn: '2026-12-31',
    cyclesAdded: 2,
    monthsPerBlock: [6, 6],
  };

  function gatewayComContinuacao() {
    return fakeGateway({
      continuationFor: (email) =>
        email === 'bruno.piloto@teste.invalid' ? CONTINUACAO_DO_BRUNO : null,
    });
  }

  it('conta as continuações e guarda a data de referência do servidor', async () => {
    const { gateway } = gatewayComContinuacao();

    const report = await runImport(planFrom(CSV), gateway, { referenceDate: HOJE });

    expect(report.created).toBe(2);
    expect(report.inferredContinuations).toBe(1);
    expect(report.inferredCycles).toBe(2);
    expect(report.serverReferenceDate).toBe(SERVIDOR_HOJE);
    // Ninguém entra inativo, nem quem veio da gestão mais antiga.
    expect(report.rows.every((row) => row.status === 'ativo')).toBe(true);
  });

  it('a linha guarda a continuação do banco, não a previsão da prévia', async () => {
    const { gateway } = gatewayComContinuacao();

    const report = await runImport(planFrom(CSV), gateway, { referenceDate: HOJE });

    const [ana, bruno] = report.rows;
    expect(ana.continuation).toBeNull();
    expect(bruno.continuation).toEqual(CONTINUACAO_DO_BRUNO);
  });

  it('reimportar não emenda de novo: "já importado" não traz continuação', async () => {
    const { gateway } = gatewayComContinuacao();
    const plan = planFrom(CSV);

    await runImport(plan, gateway, { referenceDate: HOJE });
    const segunda = await runImport(plan, gateway, { referenceDate: HOJE });

    expect(segunda.rows.every((row) => row.outcome === 'ja_importado')).toBe(true);
    expect(segunda.inferredContinuations).toBe(0);
    expect(segunda.inferredCycles).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('CPF na confirmação', () => {
  it('o CPF vai pelo SERVIÇO, e não no que é gravado como membro', async () => {
    const { gateway, cpfs } = fakeGateway();
    const spy = vi.spyOn(gateway, 'importMember');

    const report = await runImport(planFrom(CSV), gateway, { referenceDate: HOJE });

    expect(report.cpfsStored).toBe(2);
    expect(report.rows.every((row) => row.cpfStored)).toBe(true);
    expect([...cpfs.values()]).toHaveLength(2);

    // ⚠️ A garantia central: o que foi mandado ao RPC de importação não tem
    // CPF em lugar nenhum — nem em campo próprio, nem no payload.
    for (const chamada of spy.mock.calls) {
      const enviado = JSON.stringify(chamada[0]);
      expect(enviado).not.toContain('52998224725');
      expect(enviado).not.toContain('529.982.247-25');
      expect(Object.keys(chamada[0])).not.toContain('cpf');
    }
  });

  it('CPF que o serviço recusa deixa pendência, sem desfazer o membro', async () => {
    const { gateway, reviews } = fakeGateway({ failCpfFor: '52998224725' });

    const report = await runImport(planFrom(CSV), gateway, { referenceDate: HOJE });

    // A pessoa entrou: o CPF é um passo à parte, como a foto.
    expect(report.created).toBe(2);
    expect(report.cpfsFailed).toBe(1);

    const comFalha = report.rows.find((row) => row.cpfError);
    expect(comFalha?.memberId).toBeTruthy();
    expect(comFalha?.reviews.map((r) => r.reason)).toContain('cpf_store_failed');
    // A pendência guardada não leva o número.
    expect(comFalha?.reviews.find((r) => r.reason === 'cpf_store_failed')?.received).toBeNull();
    expect(reviews.get('csv:ana.piloto@teste.invalid')).toContain('cpf_store_failed');
  });

  it('reimportar NÃO sobrescreve CPF já gravado', async () => {
    const { gateway, cpfs } = fakeGateway();
    const plan = planFrom(CSV);

    await runImport(plan, gateway, { referenceDate: HOJE });
    const antes = new Map(cpfs);

    const spy = vi.spyOn(gateway, 'setCpf');
    const segunda = await runImport(plan, gateway, { referenceDate: HOJE });

    // Todas as linhas voltam "já importado", e o serviço de CPF não é chamado:
    // se alguém corrigiu o número pelo perfil, uma reimportação com a planilha
    // velha desfaria a correção em silêncio.
    expect(segunda.rows.every((row) => row.outcome === 'ja_importado')).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    expect(segunda.cpfsStored).toBe(0);
    expect(cpfs).toEqual(antes);
  });

  it('CPF ausente entra como pendência, e a pessoa entra', async () => {
    const csv = `${CABECALHO}
Gente e Gestão,Gente e Gestão,Analista de Gente e Gestão,Sem Cpf,sem.cpf@teste.invalid,,,,,,2026.2,`;
    const { gateway, reviews } = fakeGateway();

    const report = await runImport(planFrom(csv), gateway, { referenceDate: HOJE });

    expect(report.created).toBe(1);
    expect(report.cpfsStored).toBe(0);
    expect(reviews.get('csv:sem.cpf@teste.invalid')).toEqual(['cpf_missing']);
  });

  it('CPF guardado resolve a pendência que a prévia previu', async () => {
    // A prévia marcou `invalid_cpf`? Então o CPF não é válido e nem é enviado.
    // Este caso é o oposto: CPF válido, guardado, e nenhuma pendência de CPF
    // sobra na submissão.
    const { gateway, reviews } = fakeGateway();

    await runImport(planFrom(CSV), gateway, { referenceDate: HOJE });

    for (const motivos of reviews.values()) {
      expect(motivos).not.toContain('cpf_missing');
      expect(motivos).not.toContain('invalid_cpf');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('data de nascimento inválida', () => {
  // 31/02 não existe: o calendário é conferido de verdade, senão `new Date`
  // devolveria 3 de março e ninguém veria a data errada.
  const CSV_DATA_RUIM = `${CABECALHO}
Gente e Gestão,Gente e Gestão,Analista de Gente e Gestão,Ana Piloto,ana.piloto@teste.invalid,087.965.432-56,,,,31/02/2006,2026.2,ana.jpg
Soluções,Dados,Analista de Dados,Bruno Piloto,bruno.piloto@teste.invalid,529.982.247-25,,,,,2025.1,bruno.jpg`;

  it('não bloqueia: a pessoa entra, com a data em branco', async () => {
    const { gateway } = fakeGateway();
    const spy = vi.spyOn(gateway, 'importMember');

    const report = await runImport(planFrom(CSV_DATA_RUIM), gateway, { referenceDate: HOJE });

    expect(report.created).toBe(2);
    expect(report.failed).toBe(0);
    expect(spy.mock.calls[0][0].birthDate).toBeNull();
  });

  it('o valor original da planilha segue no payload da submissão', async () => {
    // É a única cópia fiel do que a planilha trouxe — é dela que a correção
    // sai depois. Perder isso obrigaria a pedir o arquivo de novo.
    const { gateway } = fakeGateway();
    const spy = vi.spyOn(gateway, 'importMember');

    await runImport(planFrom(CSV_DATA_RUIM), gateway, { referenceDate: HOJE });

    expect(spy.mock.calls[0][0].payload['Data de Nascimento']).toBe('31/02/2006');
  });

  it('marca a submissão para revisão, com o motivo', async () => {
    const { gateway, reviews } = fakeGateway();

    const report = await runImport(planFrom(CSV_DATA_RUIM), gateway, { referenceDate: HOJE });

    expect(reviews.get('csv:ana.piloto@teste.invalid')).toEqual(['invalid_birth_date']);
    expect(report.needsReviewCount).toBe(1);
    expect(report.needsReview).toBe(true);
  });

  it('o relatório diz quem precisa de correção e o que foi recebido', async () => {
    const { gateway } = fakeGateway();

    const report = await runImport(planFrom(CSV_DATA_RUIM), gateway, { referenceDate: HOJE });

    expect(report.rows[0].reviews).toEqual([
      { reason: 'invalid_birth_date', received: '31/02/2006' },
    ]);
  });

  it('campo VAZIO não é pendência', async () => {
    // Ninguém precisa corrigir o que a planilha nunca prometeu.
    const { gateway, reviews } = fakeGateway();

    const report = await runImport(planFrom(CSV_DATA_RUIM), gateway, { referenceDate: HOJE });

    expect(report.rows[1].reviews).toEqual([]);
    expect(reviews.has('csv:bruno.piloto@teste.invalid')).toBe(false);
  });

  it('planilha sem data nenhuma não gera revisão', async () => {
    const { gateway, reviews } = fakeGateway();

    const report = await runImport(planFrom(CSV), gateway, { referenceDate: HOJE });

    expect(report.needsReview).toBe(false);
    expect(reviews.size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('foto pendente vira revisão', () => {
  const CSV_SEM_FOTO_NO_ZIP = `${CABECALHO}
Gente e Gestão,Gente e Gestão,Analista de Gente e Gestão,Ana Piloto,ana.piloto@teste.invalid,111.444.777-35,,,,,2026.2,nao-esta-no-zip.jpg`;

  it('foto informada que não está no .zip marca revisão', async () => {
    const { gateway, reviews } = fakeGateway();

    const report = await runImport(planFrom(CSV_SEM_FOTO_NO_ZIP), gateway, {
      referenceDate: HOJE,
    });

    expect(report.created).toBe(1);
    expect(reviews.get('csv:ana.piloto@teste.invalid')).toEqual(['photo_missing']);
    expect(report.rows[0].reviews[0].received).toBe('nao-esta-no-zip.jpg');
  });

  it('upload que falha marca revisão, sem desfazer o membro', async () => {
    const { gateway, reviews } = fakeGateway({ failPhotoFor: 'ana.jpg' });

    const report = await runImport(planFrom(CSV), gateway, { referenceDate: HOJE });

    expect(report.created).toBe(2);
    expect(reviews.get('csv:ana.piloto@teste.invalid')).toEqual(['photo_upload_failed']);
    expect(report.rows[1].reviews).toEqual([]);
  });

  it('coluna de foto vazia não gera revisão', async () => {
    const csv = `${CABECALHO}
Gente e Gestão,Gente e Gestão,Analista de Gente e Gestão,Ana Piloto,ana.piloto@teste.invalid,012.345.678-90,,,,,2026.2,`;
    const { gateway, reviews } = fakeGateway();

    const report = await runImport(planFrom(csv), gateway, { referenceDate: HOJE });

    expect(report.needsReview).toBe(false);
    expect(reviews.size).toBe(0);
  });

  it('linha que falhou não marca revisão — ela não entrou', async () => {
    const { gateway, reviews } = fakeGateway({ failFor: 'ana.piloto@teste.invalid' });

    const report = await runImport(planFrom(CSV), gateway, { referenceDate: HOJE });

    expect(report.rows[0].outcome).toBe('falhou');
    expect(report.rows[0].reviews).toEqual([]);
    expect(reviews.size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('importação repetida', () => {
  it('reenviar o mesmo CSV não cria ninguém e não duplica nada', async () => {
    const shared = fakeGateway();

    const primeira = await runImport(planFrom(CSV), shared.gateway, { referenceDate: HOJE });
    expect(primeira.created).toBe(2);

    const segunda = await runImport(planFrom(CSV), shared.gateway, { referenceDate: HOJE });

    expect(segunda.created).toBe(0);
    expect(segunda.alreadyImported).toBe(2);
    expect(segunda.failed).toBe(0);
    // Continua tendo exatamente dois membros e dois envios registrados.
    expect(shared.membersByEmail.size).toBe(2);
    expect(shared.submissions.size).toBe(2);
    // E os ids devolvidos são os mesmos da primeira vez.
    expect(segunda.rows.map((r) => r.memberId)).toEqual(primeira.rows.map((r) => r.memberId));
  });

  it('reimportar não regrava a revisão de um envio já importado', async () => {
    // A pendência pode já ter sido resolvida por uma pessoa. Reimportar a mesma
    // planilha — que continua com a data ruim — não pode marcar de novo o que
    // alguém acabou de corrigir.
    const csv = `${CABECALHO}
Gente e Gestão,Gente e Gestão,Analista de Gente e Gestão,Ana Piloto,ana.piloto@teste.invalid,087.965.432-56,,,,31/02/2006,2026.2,ana.jpg`;
    const shared = fakeGateway();

    await runImport(planFrom(csv), shared.gateway, { referenceDate: HOJE });
    expect(shared.reviews.get('csv:ana.piloto@teste.invalid')).toEqual(['invalid_birth_date']);

    // Alguém resolveu a pendência pelo perfil.
    shared.reviews.delete('csv:ana.piloto@teste.invalid');

    const segunda = await runImport(planFrom(csv), shared.gateway, { referenceDate: HOJE });

    expect(segunda.alreadyImported).toBe(1);
    expect(shared.reviews.has('csv:ana.piloto@teste.invalid')).toBe(false);
  });

  it('e-mail já cadastrado por outro caminho vira "já existia", sem sobrescrever', async () => {
    const { gateway, membersByEmail } = fakeGateway();
    membersByEmail.set('ana.piloto@teste.invalid', 'mbr-anterior');

    const report = await runImport(
      planFrom(CSV, { 'ana.piloto@teste.invalid': 'mbr-anterior' }),
      gateway,
    );

    expect(report.alreadyExisted).toBe(1);
    expect(report.created).toBe(1);
    expect(report.rows[0].memberId).toBe('mbr-anterior');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('falha no meio da operação', () => {
  it('uma linha que falha não impede as outras, e é registrada', async () => {
    const { gateway, failures, membersByEmail } = fakeGateway({
      failFor: 'ana.piloto@teste.invalid',
    });

    const report = await runImport(planFrom(CSV), gateway, { referenceDate: HOJE });

    expect(report.failed).toBe(1);
    expect(report.created).toBe(1);
    expect(report.rows[0].outcome).toBe('falhou');
    expect(report.rows[0].errorMessage).toContain('Falha simulada');
    expect(report.rows[0].memberId).toBeNull();
    // A segunda linha entrou normalmente.
    expect(report.rows[1].outcome).toBe('criado');
    expect(membersByEmail.has('bruno.piloto@teste.invalid')).toBe(true);
    // A falha deixou rastro para diagnóstico.
    expect(failures).toHaveLength(1);
    expect(failures[0].externalId).toBe('csv:ana.piloto@teste.invalid');
  });

  it('a linha que falhou não sobe foto', async () => {
    const { gateway, photos } = fakeGateway({ failFor: 'ana.piloto@teste.invalid' });

    await runImport(planFrom(CSV), gateway);

    expect(photos.map((p) => p.fileName)).toEqual(['bruno.jpg']);
  });

  it('membro criado com foto que não sobe vira REVISÃO, não erro', async () => {
    // Storage não participa da transação do Postgres: desfazer o membro por
    // causa da foto seria pior do que sinalizar.
    const { gateway } = fakeGateway({ failPhotoFor: 'ana.jpg' });

    const report = await runImport(planFrom(CSV), gateway, { referenceDate: HOJE });

    expect(report.created).toBe(2);
    expect(report.failed).toBe(0);
    expect(report.photosFailed).toBe(1);
    expect(report.needsReview).toBe(true);
    expect(report.rows[0].photoUploaded).toBe(false);
    expect(report.rows[0].photoError).toContain('Falha simulada');
  });

  it('retomar depois de uma falha importa só quem faltava', async () => {
    const shared = fakeGateway({ failFor: 'ana.piloto@teste.invalid' });
    const primeira = await runImport(planFrom(CSV), shared.gateway);
    expect(primeira.failed).toBe(1);

    // Segunda tentativa, agora sem a falha simulada — mesmo estado acumulado.
    const retomada = fakeGateway();
    retomada.membersByEmail.set('bruno.piloto@teste.invalid', 'mbr-1');
    retomada.submissions.set('csv:bruno.piloto@teste.invalid', { memberId: 'mbr-1' });

    const segunda = await runImport(planFrom(CSV), retomada.gateway);

    expect(segunda.created).toBe(1);
    expect(segunda.alreadyImported).toBe(1);
    expect(segunda.failed).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('cargo de área inteira', () => {
  const CSV_AREA_INTEIRA = `${CABECALHO}
Negócios,,Diretoria de Negócios,Dir Negocios,dir.negocios@teste.invalid,529.982.247-25,,,,,2026.2,`;

  it('manda subárea NULA ao banco, e uma pessoa só', async () => {
    const { gateway, membersByEmail } = fakeGateway();
    const spy = vi.spyOn(gateway, 'importMember');

    const report = await runImport(planFrom(CSV_AREA_INTEIRA), gateway, { referenceDate: HOJE });

    expect(report.created).toBe(1);
    expect(report.failed).toBe(0);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].subareaId).toBeNull();
    // Uma linha da planilha é um membro — não um por subárea coberta.
    expect(membersByEmail.size).toBe(1);
  });

  it('descarta a subárea informada antes de mandar ao banco', async () => {
    // A planilha pode trazer "Diretoria de Soluções" em Produto. O que vai
    // para o banco é subárea NULA: o vínculo com uma subárea só não existe.
    const csv = `${CABECALHO}
Soluções,Produto,Diretoria de Soluções,Dir Produto,dir.produto@teste.invalid,111.444.777-35,,,,,2026.2,`;
    const { gateway } = fakeGateway();
    const spy = vi.spyOn(gateway, 'importMember');
    const flag = vi.spyOn(gateway, 'flagReview');

    const report = await runImport(planFrom(csv), gateway, { referenceDate: HOJE });

    expect(report.created).toBe(1);
    expect(spy.mock.calls[0][0].subareaId).toBeNull();
    // O valor original segue no payload, fiel à planilha.
    expect(spy.mock.calls[0][0].payload['Subárea']).toBe('Produto');
    // Aviso informativo NÃO marca revisão pendente.
    expect(flag).not.toHaveBeenCalled();
    expect(report.needsReview).toBe(false);
    expect(report.needsReviewCount).toBe(0);
    expect(report.rows[0].reviews).toEqual([]);
  });

  it('reimportar não duplica a pessoa', async () => {
    const { gateway, membersByEmail } = fakeGateway();

    const primeira = await runImport(planFrom(CSV_AREA_INTEIRA), gateway, { referenceDate: HOJE });
    const segunda = await runImport(planFrom(CSV_AREA_INTEIRA), gateway, { referenceDate: HOJE });

    expect(primeira.created).toBe(1);
    expect(segunda.created).toBe(0);
    expect(segunda.alreadyImported).toBe(1);
    expect(segunda.rows[0].memberId).toBe(primeira.rows[0].memberId);
    expect(membersByEmail.size).toBe(1);
  });
});
