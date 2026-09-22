import { beforeEach, describe, expect, it } from 'vitest';
import { mockAdapter, mockCpfAuditTrail } from './mockAdapter';
import { resetMockData } from './store';

/**
 * Testes da camada de dados em modo mock.
 *
 * Garantem que o adapter respeita as regras de produto — inclusive as que uma
 * IA poderia "otimizar" sem perceber que são regras.
 */

beforeEach(() => {
  resetMockData();
});

describe('members', () => {
  it('lista os membros em ordem alfabética', async () => {
    const members = await mockAdapter.members.list();
    const names = members.map((m) => m.fullName);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  });

  it('busca ignorando acento e caixa', async () => {
    const result = await mockAdapter.members.list({ search: 'iris cavalcanti' });
    expect(result.map((m) => m.fullName)).toContain('Íris Cavalcanti');
  });

  it('filtra por subárea pelo id, não pelo texto legado', async () => {
    const catalog = await mockAdapter.org.getCatalog();
    const dados = catalog.subareas.find((s) => s.slug === 'solucoes-dados')!;

    const result = await mockAdapter.members.list({ subareaId: dados.id });

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((m) => m.subareaId === dados.id)).toBe(true);
  });

  it('filtra por área trazendo todas as subáreas dela', async () => {
    const catalog = await mockAdapter.org.getCatalog();
    const solucoes = catalog.areas.find((a) => a.slug === 'solucoes')!;

    const result = await mockAdapter.members.list({ areaId: solucoes.id });
    const subareas = new Set(result.map((m) => m.subareaId));

    // Produto, Dados e Desenvolvimento são a mesma área: o recorte por área
    // não é o recorte por subárea.
    expect(subareas.size).toBeGreaterThan(1);
    expect(result.every((m) => m.areaId === solucoes.id)).toBe(true);
  });

  it('recusa e-mail duplicado ao criar', async () => {
    const existing = (await mockAdapter.members.list())[0];
    await expect(
      mockAdapter.members.create({
        fullName: 'Outra Pessoa',
        email: existing.email,
        role: 'Dev',
        area: 'Desenvolvimento',
        status: 'ativo',
        joinedAt: '2026-01-01',
      }),
    ).rejects.toThrow();
  });

  it('arquiva em vez de excluir — o registro continua existindo', async () => {
    const target = (await mockAdapter.members.list())[0];
    await mockAdapter.members.archive(target.id);

    const after = await mockAdapter.members.getById(target.id);
    expect(after).not.toBeNull();
    expect(after?.status).toBe('arquivado');
  });

  it('registra um evento de entrada ao criar um membro', async () => {
    const created = await mockAdapter.members.create({
      fullName: 'Pessoa Nova',
      email: 'pessoa.nova@citi.org.br',
      role: 'Dev',
      area: 'Desenvolvimento',
      status: 'ativo',
      joinedAt: '2026-08-01',
    });

    const events = await mockAdapter.members.listEvents(created.id);
    expect(events.some((e) => e.type === 'entrada')).toBe(true);
  });

  it('na importação em lote, pula duplicados e reporta em vez de falhar tudo', async () => {
    const existing = (await mockAdapter.members.list())[0];

    const result = await mockAdapter.members.createMany([
      {
        fullName: 'Importada Um',
        email: 'importada.um@citi.org.br',
        role: 'Dev',
        area: 'Dados',
        status: 'ativo',
        joinedAt: '2026-02-01',
      },
      {
        fullName: 'Repetida',
        email: existing.email,
        role: 'Dev',
        area: 'Dados',
        status: 'ativo',
        joinedAt: '2026-02-01',
      },
    ]);

    expect(result.created).toHaveLength(1);
    expect(result.skipped).toEqual([existing.email]);
  });
});

describe('feedbacks de acompanhamento', () => {
  it('editar corrige o registro sem criar um segundo', async () => {
    const antes = await mockAdapter.feedbacks.listAll();
    const alvo = antes[0];

    const corrigido = await mockAdapter.feedbacks.update(alvo.id, {
      content: 'Texto corrigido depois da conversa.',
      updatedById: 'mbr-002',
    });

    const depois = await mockAdapter.feedbacks.listAll();
    expect(depois.length).toBe(antes.length);
    expect(corrigido.id).toBe(alvo.id);
    expect(corrigido.content).toBe('Texto corrigido depois da conversa.');
    // Rastreabilidade: quem editou fica ao lado de quem registrou, não no lugar.
    expect(corrigido.updatedById).toBe('mbr-002');
    expect(corrigido.registeredById).toBe(alvo.registeredById);
    expect(corrigido.createdById).toBe(alvo.createdById);
    expect(corrigido.createdAt).toBe(alvo.createdAt);

    // E a correção sobrevive a recarregar a página: o mock grava no
    // localStorage a cada escrita, como o Postgres grava no disco.
    expect(localStorage.getItem('citi-pessoas:mock-db:v1')).toContain(
      'Texto corrigido depois da conversa.',
    );
  });

  it('excluir apaga SÓ o registro pedido', async () => {
    const antes = await mockAdapter.feedbacks.listAll();
    const alvo = antes.find((f) => f.memberId === 'mbr-006')!;
    const irmaos = antes.filter((f) => f.memberId === 'mbr-006' && f.id !== alvo.id);

    await mockAdapter.feedbacks.remove(alvo.id);

    const depois = await mockAdapter.feedbacks.listAll();
    expect(depois.length).toBe(antes.length - 1);
    expect(await mockAdapter.feedbacks.getById(alvo.id)).toBeNull();
    // Os outros registros da MESMA pessoa continuam inteiros.
    const restantes = await mockAdapter.feedbacks.listByMember('mbr-006');
    expect(restantes.map((f) => f.id).sort()).toEqual(irmaos.map((f) => f.id).sort());

    // A exclusão também é gravada: recarregar não traz o registro de volta.
    expect(localStorage.getItem('citi-pessoas:mock-db:v1')).not.toContain(alvo.content);
  });

  it('excluir leva junto o eco na atividade recente do membro', async () => {
    const criado = await mockAdapter.feedbacks.create({
      memberId: 'mbr-003',
      type: 'informal',
      content: 'Registro que será desfeito.',
      givenAt: '2026-06-01',
      registeredById: 'mbr-001',
      notes: null,
      gestaoId: null,
      createdById: 'mbr-001',
      updatedById: null,
    });

    const comEvento = await mockAdapter.members.listEvents('mbr-003');
    expect(comEvento.some((e) => e.sourceId === criado.id)).toBe(true);

    await mockAdapter.feedbacks.remove(criado.id);

    // A Timeline não pode anunciar um registro que ninguém mais consegue abrir.
    const semEvento = await mockAdapter.members.listEvents('mbr-003');
    expect(semEvento.some((e) => e.sourceId === criado.id)).toBe(false);
    // E o histórico de verdade do membro continua lá.
    expect(semEvento.length).toBeGreaterThan(0);
  });

  it('excluir duas vezes recusa a segunda em vez de fingir que apagou', async () => {
    const alvo = (await mockAdapter.feedbacks.listAll())[0];
    await mockAdapter.feedbacks.remove(alvo.id);

    await expect(mockAdapter.feedbacks.remove(alvo.id)).rejects.toThrow(/não encontrado/i);
  });
});

describe('feedback anônimo', () => {
  it('não guarda nenhum dado de quem enviou', async () => {
    // Migration 0033 removeu `submit()`: a única porta de escrita agora é a
    // Edge Function `anonymous-feedback-intake`. A regra de anonimato continua
    // provada sobre os registros que o board realmente lê.
    const feedbacks = await mockAdapter.anonymousFeedbacks.list();
    expect(feedbacks.length).toBeGreaterThan(0);

    for (const feedback of feedbacks) {
      expect(Object.keys(feedback)).not.toContain('authorName');
      expect(Object.keys(feedback)).not.toContain('authorEmail');
      expect(Object.keys(feedback)).not.toContain('ip');
    }
  });

  it('não existe mais submit() no adapter — a porta de escrita é a Edge Function', () => {
    expect((mockAdapter.anonymousFeedbacks as unknown as Record<string, unknown>).submit).toBeUndefined();
  });

  it('tomar ciência registra a decisão e NÃO cria um feedback de acompanhamento', async () => {
    const before = await mockAdapter.feedbacks.listAll();

    const pending = await mockAdapter.anonymousFeedbacks.list('pendente');
    await mockAdapter.anonymousFeedbacks.moderate(pending[0].id, {
      resolution: 'ciente',
      moderatedById: 'mbr-001',
      moderationNote: 'Levado para a reunião de GG.',
    });

    const after = await mockAdapter.feedbacks.listAll();
    // Fluxos independentes: moderar um anônimo não gera Feedback nenhum.
    expect(after).toHaveLength(before.length);

    const moderated = await mockAdapter.anonymousFeedbacks.getById(pending[0].id);
    expect(moderated?.status).toBe('moderado');
    expect(moderated?.resolution).toBe('ciente');
    expect(moderated?.moderatedAt).toBeTruthy();
  });

  it('direcionar guarda o membro e continua sem criar feedback de acompanhamento', async () => {
    const before = await mockAdapter.feedbacks.listAll();

    const pending = await mockAdapter.anonymousFeedbacks.list('pendente');
    await mockAdapter.anonymousFeedbacks.moderate(pending[0].id, {
      resolution: 'direcionado',
      directedMemberId: 'mbr-003',
      moderatedById: 'mbr-001',
    });

    // A regra mais importante do fluxo: direcionar leva CONTEXTO a uma pessoa.
    // Não vira Informal, não vira Formal, não vira Carta.
    expect(await mockAdapter.feedbacks.listAll()).toHaveLength(before.length);
    expect(await mockAdapter.feedbacks.listByMember('mbr-003')).toHaveLength(
      before.filter((f) => f.memberId === 'mbr-003').length,
    );

    const moderated = await mockAdapter.anonymousFeedbacks.getById(pending[0].id);
    expect(moderated?.resolution).toBe('direcionado');
    expect(moderated?.directedMemberId).toBe('mbr-003');
  });

  it('recusa direcionar sem escolher o membro', async () => {
    const pending = await mockAdapter.anonymousFeedbacks.list('pendente');
    await expect(
      mockAdapter.anonymousFeedbacks.moderate(pending[0].id, {
        resolution: 'direcionado',
        directedMemberId: null,
      }),
    ).rejects.toThrow();
  });

  it('tomar ciência de um relato sobre alguém não o direciona àquela pessoa', async () => {
    // `targetType: 'membro'` é o que QUEM ENVIOU disse. Direcionar é decisão
    // da GG — uma coisa não implica a outra.
    const pending = await mockAdapter.anonymousFeedbacks.list('pendente');
    const aboutMember = pending.find((f) => f.targetMemberId);
    expect(aboutMember).toBeDefined();

    await mockAdapter.anonymousFeedbacks.moderate(aboutMember!.id, { resolution: 'ciente' });

    const moderated = await mockAdapter.anonymousFeedbacks.getById(aboutMember!.id);
    expect(moderated?.directedMemberId).toBeNull();
    expect(moderated?.targetMemberId).toBe(aboutMember!.targetMemberId);
  });
});

describe('auth', () => {
  it('recusa senha errada', async () => {
    await expect(mockAdapter.auth.signIn('gg@citi.org.br', 'errada')).rejects.toThrow();
  });

  it('entra com as credenciais de desenvolvimento', async () => {
    const user = await mockAdapter.auth.signIn('gg@citi.org.br', 'citi123');
    expect(user.email).toBe('gg@citi.org.br');
    expect(await mockAdapter.auth.getCurrentUser()).not.toBeNull();

    await mockAdapter.auth.signOut();
    expect(await mockAdapter.auth.getCurrentUser()).toBeNull();
  });
});

describe('importação (modo mock)', () => {
  /** Uma linha pronta para importar, resolvida contra o catálogo do mock. */
  async function entrada(overrides: Record<string, unknown> = {}) {
    const catalog = await mockAdapter.org.getCatalog();
    const subarea = catalog.subareas.find((s) => s.slug === 'solucoes-dados');
    const position = catalog.positions.find((p) => p.name === 'Analista de Dados');
    const gestoes = await mockAdapter.gestoes.list();

    return {
      externalId: 'csv:novo@teste.invalid',
      payload: { 'Nome Completo': 'Pessoa Nova' },
      fullName: 'Pessoa Nova',
      email: 'novo@teste.invalid',
      positionId: position!.id,
      subareaId: subarea!.id,
      gestaoId: gestoes[0].id,
      ...overrides,
    };
  }

  it('o catálogo tem as quatro áreas e as oito subáreas da migration 0003', async () => {
    const catalog = await mockAdapter.org.getCatalog();

    expect(catalog.areas).toHaveLength(4);
    expect(catalog.subareas).toHaveLength(8);
    // 30: a 0017 fundiu Presidência em Diretor(a) Institucional (−1) e a 0018
    // acrescentou Customer Success (+1).
    expect(catalog.positions).toHaveLength(30);
    // Cargo de área inteira: não pertence a nenhuma subárea.
    expect(catalog.positions.find((p) => p.name === 'Diretor(a) de Soluções')?.subareaId).toBeNull();
    expect(catalog.positions.some((p) => p.name === 'Presidência')).toBe(false);
  });

  it('cria o membro com o cargo da planilha e sem responsável de GG', async () => {
    const result = await mockAdapter.membersImport.importMember(await entrada());

    expect(result.outcome).toBe('criado');

    const member = await mockAdapter.members.getById(result.memberId!);
    expect(member?.role).toBe('Analista de Dados');
    expect(member?.area).toBe('Dados');
    // Alocação de GG é decisão humana posterior — a tela mostra "pendente".
    expect(member?.ggResponsibleId).toBeNull();
  });

  it('reimportar o mesmo envio não cria ninguém de novo', async () => {
    const input = await entrada();
    const primeira = await mockAdapter.membersImport.importMember(input);
    const antes = (await mockAdapter.members.list()).length;

    const segunda = await mockAdapter.membersImport.importMember(input);

    expect(segunda.outcome).toBe('ja_importado');
    expect(segunda.memberId).toBe(primeira.memberId);
    expect((await mockAdapter.members.list()).length).toBe(antes);
  });

  it('e-mail já cadastrado não vira membro novo', async () => {
    const existing = (await mockAdapter.members.list())[0];

    const result = await mockAdapter.membersImport.importMember(
      await entrada({ email: existing.email, externalId: 'csv:outro-envio' }),
    );

    expect(result.outcome).toBe('ja_existia');
    expect(result.memberId).toBe(existing.id);
  });

  it('encontra os e-mails já cadastrados ignorando a caixa', async () => {
    const existing = (await mockAdapter.members.list())[0];

    const found = await mockAdapter.membersImport.findExistingEmails([
      existing.email.toUpperCase(),
      'ninguem@teste.invalid',
    ]);

    expect(found[existing.email.toLowerCase()]).toBe(existing.id);
    expect(found['ninguem@teste.invalid']).toBeUndefined();
  });

  it('grava o caminho da foto por id do membro', async () => {
    const result = await mockAdapter.membersImport.importMember(await entrada());

    const path = await mockAdapter.membersImport.uploadPhoto(result.memberId!, {
      fileName: 'foto.png',
      contentType: 'image/png',
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    });

    expect(path).toBe(`${result.memberId}/foto.png`);
    expect((await mockAdapter.members.getById(result.memberId!))?.photoPath).toBe(path);
  });

  it('cargo de área inteira entra sem subárea, com a área do cargo', async () => {
    const catalog = await mockAdapter.org.getCatalog();
    const diretoria = catalog.positions.find((p) => p.name === 'Diretor(a) de Negócios');

    const result = await mockAdapter.membersImport.importMember(
      await entrada({
        externalId: 'csv:dir.negocios@teste.invalid',
        email: 'dir.negocios@teste.invalid',
        positionId: diretoria!.id,
        subareaId: null,
      }),
    );

    expect(result.outcome).toBe('criado');

    const member = await mockAdapter.members.getById(result.memberId!);
    // A pessoa fica sem subárea de propósito: o cargo cobre a área inteira.
    expect(member?.subareaId).toBeNull();
    expect(member?.areaId).toBe(diretoria!.areaId);
    expect(member?.area).toBe('Negócios');
    expect(member?.role).toBe('Diretor(a) de Negócios');
  });

  it('cargo de subárea sem subárea é recusado, como no banco', async () => {
    await expect(
      mockAdapter.membersImport.importMember(await entrada({ subareaId: null })),
    ).rejects.toThrow();
  });

  it('descarta a subárea informada para cargo de área inteira', async () => {
    const catalog = await mockAdapter.org.getCatalog();
    const diretoria = catalog.positions.find((p) => p.name === 'Diretor(a) de Soluções')!;
    const produto = catalog.subareas.find((s) => s.slug === 'solucoes-produto')!;

    const result = await mockAdapter.membersImport.importMember(
      await entrada({
        externalId: 'csv:dir.produto@teste.invalid',
        email: 'dir.produto@teste.invalid',
        positionId: diretoria.id,
        subareaId: produto.id,
      }),
    );

    const member = await mockAdapter.members.getById(result.memberId!);

    // Prender a diretoria a Produto inventaria um vínculo que não existe.
    expect(member?.subareaId).toBeNull();
    expect(member?.areaId).toBe(diretoria.areaId);
    expect(member?.area).toBe('Soluções');
  });

  it('recusa subárea de outra área, mesmo para cargo de área inteira', async () => {
    const catalog = await mockAdapter.org.getCatalog();
    const diretoria = catalog.positions.find((p) => p.name === 'Diretor(a) de Negócios')!;
    const produto = catalog.subareas.find((s) => s.slug === 'solucoes-produto')!;

    await expect(
      mockAdapter.membersImport.importMember(
        await entrada({
          externalId: 'csv:dir.errada@teste.invalid',
          email: 'dir.errada@teste.invalid',
          positionId: diretoria.id,
          subareaId: produto.id,
        }),
      ),
    ).rejects.toThrow();
  });

  it('ciclo vencido NAO entra inativo: a base atual emenda continuacao', async () => {
    const gestoes = await mockAdapter.gestoes.list();
    const antiga = gestoes.find((g) => g.name === '2025.2')!;

    const result = await mockAdapter.membersImport.importMember(
      await entrada({
        externalId: 'csv:roster.antigo@teste.invalid',
        email: 'roster.antigo@teste.invalid',
        gestaoId: antiga.id,
        referenceDate: '2026-09-17',
      }),
    );

    // 2025.2 → ciclo 01/07/2025 a 30/06/2026, ja vencido em 17/09/2026.
    // Analista de Dados: 6 meses por bloco, um bloco basta (07→12/2026).
    // Ninguem entra inativo.
    expect(result.status).toBe('ativo');
    expect(result.continuation?.cyclesAdded).toBe(1);
    expect(result.continuation?.monthsPerBlock).toEqual([6]);
    expect(result.continuation?.originalEndOn).toBe('2026-06-30');
    expect(result.expectedEndOn).toBe('2026-12-31');
    expect(result.referenceDate).toBe('2026-09-17');

    const member = await mockAdapter.members.getById(result.memberId!);
    expect(member?.status).toBe('ativo');
    // A data de entrada continua sendo a do ciclo inicial.
    expect(member?.joinedAt).toBe('2025-07-01');

    // Nenhum desligamento, retorno ou inativacao: nada disso aconteceu. E um
    // unico evento de importacao, com o resumo da continuacao.
    const events = await mockAdapter.members.listEvents(result.memberId!);
    expect(events.filter((e) => e.type === 'importacao')).toHaveLength(1);
    expect(events.some((e) => e.type === 'inativacao_automatica')).toBe(false);
    expect(events.some((e) => e.type === 'reativacao')).toBe(false);
    expect(events.find((e) => e.type === 'importacao')?.description).toContain('Base atual');
  });

  it('ciclo ainda vigente nao ganha continuacao nenhuma', async () => {
    const gestoes = await mockAdapter.gestoes.list();
    const atual = gestoes.find((g) => g.name === '2026.2')!;

    const result = await mockAdapter.membersImport.importMember(
      await entrada({
        externalId: 'csv:roster.vigente@teste.invalid',
        email: 'roster.vigente@teste.invalid',
        gestaoId: atual.id,
        referenceDate: '2026-09-17',
      }),
    );

    expect(result.continuation).toBeNull();
    expect(result.expectedEndOn).toBe('2027-06-30');
    expect(result.status).toBe('ativo');
  });

  it('reimportar nao emenda ciclo de novo nem estica a data final', async () => {
    const gestoes = await mockAdapter.gestoes.list();
    const antiga = gestoes.find((g) => g.name === '2025.2')!;
    const input = await entrada({
      externalId: 'csv:roster.idempotente@teste.invalid',
      email: 'roster.idempotente@teste.invalid',
      gestaoId: antiga.id,
      referenceDate: '2026-09-17',
    });

    const primeira = await mockAdapter.membersImport.importMember(input);

    // Bem mais tarde: se a regra rodasse de novo, a data final iria adiante.
    const segunda = await mockAdapter.membersImport.importMember({
      ...input,
      referenceDate: '2029-01-01',
    });

    expect(segunda.outcome).toBe('ja_importado');
    expect(segunda.memberId).toBe(primeira.memberId);
    expect(segunda.continuation).toBeUndefined();

    const events = await mockAdapter.members.listEvents(primeira.memberId!);
    expect(events.filter((e) => e.type === 'importacao')).toHaveLength(1);
  });

  it('o filtro por área acha quem tem cargo de área inteira; o de subárea, não', async () => {
    const catalog = await mockAdapter.org.getCatalog();
    const diretoria = catalog.positions.find((p) => p.name === 'Diretor(a) de Negócios')!;
    const negocios = catalog.areas.find((a) => a.slug === 'negocios')!;
    const comercial = catalog.subareas.find((s) => s.slug === 'negocios-comercial')!;

    const result = await mockAdapter.membersImport.importMember(
      await entrada({
        externalId: 'csv:dir.negocios2@teste.invalid',
        email: 'dir.negocios2@teste.invalid',
        fullName: 'Diretoria Piloto',
        positionId: diretoria.id,
        subareaId: null,
      }),
    );

    // Filtrar por Negócios traz a diretoria: ela é da área toda.
    const porArea = await mockAdapter.members.list({ areaId: negocios.id });
    expect(porArea.map((m) => m.id)).toContain(result.memberId);

    // Filtrar por Comercial NÃO a apresenta como se fosse do Comercial.
    const porSubarea = await mockAdapter.members.list({ subareaId: comercial.id });
    expect(porSubarea.map((m) => m.id)).not.toContain(result.memberId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('correção cadastral (PERFIL-006)', () => {
  /** Uma pessoa importada com foto ausente e data ilegível, como no piloto. */
  async function importada() {
    const catalog = await mockAdapter.org.getCatalog();
    const subarea = catalog.subareas.find((s) => s.slug === 'solucoes-dados')!;
    const position = catalog.positions.find((p) => p.name === 'Analista de Dados')!;
    const gestoes = await mockAdapter.gestoes.list();

    const result = await mockAdapter.membersImport.importMember({
      externalId: 'csv:corrigir@teste.invalid',
      payload: { 'Data de Nascimento': '31/02/2006' },
      fullName: 'Pessoa A Corrigir',
      email: 'corrigir@teste.invalid',
      positionId: position.id,
      subareaId: subarea.id,
      gestaoId: gestoes[0].id,
      referenceDate: '2026-09-17',
    });

    await mockAdapter.membersImport.flagReview('csv:corrigir@teste.invalid', [
      'invalid_birth_date',
      'photo_missing',
    ]);

    return result.memberId!;
  }

  it('corrige campos e registra UM evento de correção, com o que mudou', async () => {
    const memberId = await importada();

    const corrigido = await mockAdapter.members.correctRecord(memberId, {
      fullName: 'Pessoa Corrigida',
      phone: '(81) 98888-7777',
    });

    expect(corrigido.fullName).toBe('Pessoa Corrigida');
    // Telefone normalizado: o mesmo número não pode existir de duas formas.
    expect(corrigido.phone).toBe('81988887777');

    const events = await mockAdapter.members.listEvents(memberId);
    const correcoes = events.filter((e) => e.type === 'correcao_cadastral');
    expect(correcoes).toHaveLength(1);
    expect(correcoes[0].description).toContain('nome');
    expect(correcoes[0].description).toContain('telefone');
  });

  it('recusa e-mail institucional que já é de outro membro', async () => {
    const memberId = await importada();
    const outro = (await mockAdapter.members.list())[0];

    await expect(
      mockAdapter.members.correctRecord(memberId, { email: outro.email.toUpperCase() }),
    ).rejects.toThrow(/já pertence/i);

    // Nada foi gravado pela metade.
    expect((await mockAdapter.members.getById(memberId))?.email).toBe('corrigir@teste.invalid');
  });

  it('corrigir a data resolve SÓ a pendência dela', async () => {
    const memberId = await importada();
    expect(await mockAdapter.members.listReviewReasons(memberId)).toEqual([
      'invalid_birth_date',
      'photo_missing',
    ]);

    await mockAdapter.members.correctRecord(memberId, { birthDate: '2005-04-12' });

    // A foto continua faltando: apagar as duas esconderia um problema aberto.
    expect(await mockAdapter.members.listReviewReasons(memberId)).toEqual(['photo_missing']);
  });

  it('resolver o último motivo devolve a submissão para processed', async () => {
    const memberId = await importada();

    await mockAdapter.members.resolveReview(memberId, ['invalid_birth_date']);
    const restantes = await mockAdapter.members.resolveReview(memberId, ['photo_missing']);

    expect(restantes).toEqual([]);
    expect(await mockAdapter.members.listReviewReasons(memberId)).toEqual([]);
  });

  it('corrigir o cargo troca subárea, área e o texto legado', async () => {
    const memberId = await importada();
    const catalog = await mockAdapter.org.getCatalog();
    const diretoria = catalog.positions.find((p) => p.name === 'Diretor(a) de Negócios')!;

    const corrigido = await mockAdapter.members.correctRecord(memberId, {
      positionId: diretoria.id,
      subareaId: null,
    });

    // Cargo de área inteira: sem subárea, com a área do cargo.
    expect(corrigido.subareaId).toBeNull();
    expect(corrigido.areaId).toBe(diretoria.areaId);
    expect(corrigido.area).toBe('Negócios');
    expect(corrigido.role).toBe('Diretor(a) de Negócios');

    const events = await mockAdapter.members.listEvents(memberId);
    expect(events.some((e) => e.type === 'mudanca_cargo')).toBe(true);
    // A diferença que importa: isto é conserto de cadastro, não promoção.
    expect(events.find((e) => e.type === 'mudanca_cargo')?.description).toContain(
      'Correção cadastral',
    );
  });

  it('recusa correção que não corrige nada', async () => {
    const memberId = await importada();
    await expect(mockAdapter.members.correctRecord(memberId, {})).rejects.toThrow(/nada a corrigir/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('foto do membro e responsável de GG', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it('a foto é servida por URL temporária a partir do caminho no bucket', async () => {
    const membro = (await mockAdapter.members.list())[0];

    const path = await mockAdapter.membersImport.uploadPhoto(membro.id, {
      fileName: 'foto.png',
      contentType: 'image/png',
      bytes: PNG,
    });

    // O que fica gravado é o CAMINHO — nunca a URL, que expira.
    expect((await mockAdapter.members.getById(membro.id))?.photoPath).toBe(path);
    expect(await mockAdapter.members.getPhotoUrl(path)).toContain('image/png');
  });

  it('caminho sem objeto devolve null — e a tela cai nas iniciais', async () => {
    expect(await mockAdapter.members.getPhotoUrl('nao-existe/foto.png')).toBeNull();
  });

  it('atribuir, trocar e remover responsável de GG registra os três eventos', async () => {
    const todos = await mockAdapter.members.list();
    const membro = todos[0];
    const gg = todos.find((m) => m.area === 'Gente e Gestão' && m.id !== membro.id)!;
    const outro = todos.find((m) => m.id !== membro.id && m.id !== gg.id)!;

    // Ponto de partida conhecido: as fixtures já trazem alguém alocado, e o
    // teste é sobre as TRÊS transições, não sobre o estado inicial.
    await mockAdapter.members.update(membro.id, { ggResponsibleId: null });
    const antes = (await mockAdapter.members.listEvents(membro.id)).filter(
      (e) => e.type === 'mudanca_responsavel_gg',
    ).length;

    await mockAdapter.members.update(membro.id, { ggResponsibleId: gg.id });
    await mockAdapter.members.update(membro.id, { ggResponsibleId: outro.id });
    const semResponsavel = await mockAdapter.members.update(membro.id, { ggResponsibleId: null });

    expect(semResponsavel.ggResponsibleId).toBeNull();

    const eventos = (await mockAdapter.members.listEvents(membro.id)).filter(
      (e) => e.type === 'mudanca_responsavel_gg',
    );
    expect(eventos.length - antes).toBe(3);
    expect(eventos.some((e) => e.title === 'Responsável de GG atribuído')).toBe(true);
    expect(eventos.some((e) => e.title === 'Responsável de GG alterado')).toBe(true);
    expect(eventos.some((e) => e.title === 'Responsável de GG removido')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('atribuição em lote de responsável de GG (modo mock)', () => {
  async function ggAreaId() {
    const catalog = await mockAdapter.org.getCatalog();
    return catalog.areas.find((a) => a.slug === 'gente-e-gestao')!.id;
  }

  async function criarMembro(overrides: Partial<Parameters<typeof mockAdapter.members.create>[0]>) {
    return mockAdapter.members.create({
      fullName: 'Fixture Lote',
      email: `fixture.lote.${Math.random().toString(36).slice(2)}@citi.org.br`,
      role: 'Analista',
      area: 'Gente e Gestão',
      status: 'ativo',
      joinedAt: '2026-01-01',
      ggResponsibleId: null,
      ...overrides,
    });
  }

  it('atribui o mesmo responsável a vários membros sem responsável de uma vez', async () => {
    const areaId = await ggAreaId();
    const gg = await criarMembro({ fullName: 'GG Responsavel Lote', areaId, status: 'ativo' });
    const a = await criarMembro({ fullName: 'Alvo A' });
    const b = await criarMembro({ fullName: 'Alvo B' });

    const resultado = await mockAdapter.members.bulkAssignGgResponsible([a.id, b.id], gg.id);

    expect(resultado).toEqual({
      requested: 2,
      updated: 2,
      ggResponsibleId: gg.id,
      ggResponsibleName: gg.fullName,
    });
    expect((await mockAdapter.members.getById(a.id))?.ggResponsibleId).toBe(gg.id);
    expect((await mockAdapter.members.getById(b.id))?.ggResponsibleId).toBe(gg.id);
  });

  it('registra um evento mudanca_responsavel_gg para cada membro do lote', async () => {
    const areaId = await ggAreaId();
    const gg = await criarMembro({ fullName: 'GG Lote Evento', areaId, status: 'ativo' });
    const a = await criarMembro({ fullName: 'Alvo Evento A' });

    await mockAdapter.members.bulkAssignGgResponsible([a.id], gg.id);

    const eventos = (await mockAdapter.members.listEvents(a.id)).filter(
      (e) => e.type === 'mudanca_responsavel_gg',
    );
    expect(eventos).toHaveLength(1);
    expect(eventos[0].title).toBe('Responsável de GG atribuído');
  });

  it('lista vazia é recusada, nada é alterado', async () => {
    const areaId = await ggAreaId();
    const gg = await criarMembro({ fullName: 'GG Lote Vazio', areaId, status: 'ativo' });
    await expect(mockAdapter.members.bulkAssignGgResponsible([], gg.id)).rejects.toThrow(/lote_vazio/);
  });

  it('id duplicado na lista é recusado', async () => {
    const areaId = await ggAreaId();
    const gg = await criarMembro({ fullName: 'GG Lote Dup', areaId, status: 'ativo' });
    const a = await criarMembro({ fullName: 'Alvo Dup' });

    await expect(
      mockAdapter.members.bulkAssignGgResponsible([a.id, a.id], gg.id),
    ).rejects.toThrow(/uuid_duplicado_no_lote/);
  });

  it('responsável inativo é recusado', async () => {
    const areaId = await ggAreaId();
    const ggInativo = await criarMembro({ fullName: 'GG Lote Inativo', areaId, status: 'inativo' });
    const a = await criarMembro({ fullName: 'Alvo Resp Inativo' });

    await expect(
      mockAdapter.members.bulkAssignGgResponsible([a.id], ggInativo.id),
    ).rejects.toThrow(/responsavel_invalido/);
  });

  it('responsável fora da área de Gente e Gestão é recusado', async () => {
    const gg = await criarMembro({ fullName: 'GG Lote Fora', area: 'Desenvolvimento', areaId: null, status: 'ativo' });
    const a = await criarMembro({ fullName: 'Alvo Resp Fora' });

    await expect(mockAdapter.members.bulkAssignGgResponsible([a.id], gg.id)).rejects.toThrow(
      /responsavel_invalido/,
    );
  });

  it('membro inativo no lote é recusado — e ninguém do lote é atualizado', async () => {
    const areaId = await ggAreaId();
    const gg = await criarMembro({ fullName: 'GG Lote Parcial', areaId, status: 'ativo' });
    const ativo = await criarMembro({ fullName: 'Alvo Ativo Parcial' });
    const inativo = await criarMembro({ fullName: 'Alvo Inativo Parcial', status: 'inativo' });

    await expect(
      mockAdapter.members.bulkAssignGgResponsible([ativo.id, inativo.id], gg.id),
    ).rejects.toThrow(/membro_inativo/);

    // Tudo ou nada: o alvo válido do MESMO lote não foi tocado.
    expect((await mockAdapter.members.getById(ativo.id))?.ggResponsibleId).toBeNull();
  });

  it('um membro já atribuído reprova o lote inteiro — nenhuma atualização parcial', async () => {
    const areaId = await ggAreaId();
    const gg = await criarMembro({ fullName: 'GG Lote JaAtrib', areaId, status: 'ativo' });
    const outroGg = await criarMembro({ fullName: 'GG Lote JaAtrib Outro', areaId, status: 'ativo' });
    const semResponsavel = await criarMembro({ fullName: 'Alvo Sem Responsavel' });
    const jaAtribuido = await criarMembro({ fullName: 'Alvo Ja Atribuido', ggResponsibleId: outroGg.id });

    await expect(
      mockAdapter.members.bulkAssignGgResponsible([semResponsavel.id, jaAtribuido.id], gg.id),
    ).rejects.toThrow(/membro_ja_atribuido/);

    // Nem o alvo livre ganhou o novo responsável, nem o já atribuído foi sobrescrito.
    expect((await mockAdapter.members.getById(semResponsavel.id))?.ggResponsibleId).toBeNull();
    expect((await mockAdapter.members.getById(jaAtribuido.id))?.ggResponsibleId).toBe(outroGg.id);
  });

  it('membro inexistente na lista é recusado', async () => {
    const areaId = await ggAreaId();
    const gg = await criarMembro({ fullName: 'GG Lote Inexistente', areaId, status: 'ativo' });

    await expect(
      mockAdapter.members.bulkAssignGgResponsible(['mbr-nao-existe'], gg.id),
    ).rejects.toThrow(/membro_inexistente/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('deactivate — desligamento de membro (migration 0032)', () => {
  /**
   * `joinedAt: '2026-01-01'` dá, pela aproximação do mock (ver `mockCurrentCycle`
   * em `mockAdapter.ts`), um ciclo de 2026-01-01 a 2026-12-31 — "hoje" (data real
   * de execução do teste) cai dentro dele, o que é o cenário normal.
   */
  async function criarAtivo(overrides: Partial<Parameters<typeof mockAdapter.members.create>[0]> = {}) {
    return mockAdapter.members.create({
      fullName: 'Fixture Desligamento',
      email: `fixture.deslig.${Math.random().toString(36).slice(2)}@citi.org.br`,
      role: 'Analista',
      area: 'Gente e Gestão',
      status: 'ativo',
      joinedAt: '2026-01-01',
      ...overrides,
    });
  }

  it('desliga um membro ativo: status vira desligado (nunca inativo), exitedAt grava a data', async () => {
    const membro = await criarAtivo();

    const resultado = await mockAdapter.members.deactivate(membro.id, {
      endedOn: '2026-06-15',
      reason: 'Mudança de curso',
    });

    expect(resultado.status).toBe('desligado');
    expect(resultado.exitedAt).toBe('2026-06-15');

    const depois = await mockAdapter.members.getById(membro.id);
    expect(depois?.status).toBe('desligado');
  });

  it('sucesso registra exatamente um evento de desligamento', async () => {
    const membro = await criarAtivo();
    await mockAdapter.members.deactivate(membro.id, { endedOn: '2026-06-15' });

    const eventos = (await mockAdapter.members.listEvents(membro.id)).filter(
      (e) => e.type === 'desligamento',
    );
    expect(eventos).toHaveLength(1);
  });

  it('membro inativo (não ativo) é recusado', async () => {
    const membro = await criarAtivo({ status: 'inativo' });
    await expect(
      mockAdapter.members.deactivate(membro.id, { endedOn: '2026-06-15' }),
    ).rejects.toThrow(/membro_nao_ativo/);
  });

  it('repetir sobre quem já foi desligado é recusado — não duplica evento', async () => {
    const membro = await criarAtivo();
    await mockAdapter.members.deactivate(membro.id, { endedOn: '2026-06-15' });

    await expect(
      mockAdapter.members.deactivate(membro.id, { endedOn: '2026-06-20' }),
    ).rejects.toThrow(/membro_nao_ativo/);

    const eventos = (await mockAdapter.members.listEvents(membro.id)).filter(
      (e) => e.type === 'desligamento',
    );
    expect(eventos).toHaveLength(1);
  });

  it('data no futuro é recusada', async () => {
    const membro = await criarAtivo();
    const futuro = new Date();
    futuro.setDate(futuro.getDate() + 5);

    await expect(
      mockAdapter.members.deactivate(membro.id, { endedOn: futuro.toISOString().slice(0, 10) }),
    ).rejects.toThrow(/data_futura/);
  });

  it('data anterior ao início do ciclo é recusada', async () => {
    const membro = await criarAtivo({ joinedAt: '2026-01-01' });
    await expect(
      mockAdapter.members.deactivate(membro.id, { endedOn: '2025-12-31' }),
    ).rejects.toThrow(/data_anterior_ao_ciclo/);
  });

  it('data que não é interrupção antecipada (ciclo já vencido) é recusada', async () => {
    // Ciclo 2024-01-01 → 2024-12-31: já venceu bem antes de hoje.
    const membro = await criarAtivo({ joinedAt: '2024-01-01' });
    await expect(
      mockAdapter.members.deactivate(membro.id, { endedOn: '2025-06-01' }),
    ).rejects.toThrow(/data_nao_e_interrupcao_antecipada/);
  });

  it('dependente ativo como manager_id bloqueia, com a contagem — sem redistribuição automática', async () => {
    const gerente = await criarAtivo();
    await criarAtivo({ managerId: gerente.id });

    await expect(
      mockAdapter.members.deactivate(gerente.id, { endedOn: '2026-06-15' }),
    ).rejects.toThrow(/membro_com_dependentes/);

    expect((await mockAdapter.members.getById(gerente.id))?.status).toBe('ativo');
  });

  it('dependente ativo como gg_responsible_id bloqueia', async () => {
    const responsavel = await criarAtivo();
    await criarAtivo({ ggResponsibleId: responsavel.id });

    await expect(
      mockAdapter.members.deactivate(responsavel.id, { endedOn: '2026-06-15' }),
    ).rejects.toThrow(/membro_com_dependentes/);
  });

  it('motivo acima do limite de caracteres é recusado', async () => {
    const membro = await criarAtivo();
    await expect(
      mockAdapter.members.deactivate(membro.id, { endedOn: '2026-06-15', reason: 'x'.repeat(501) }),
    ).rejects.toThrow(/motivo_muito_longo/);
  });

  it('motivo só com espaços vira null, nunca string vazia', async () => {
    const membro = await criarAtivo();
    await mockAdapter.members.deactivate(membro.id, { endedOn: '2026-06-15', reason: '   ' });

    const eventos = await mockAdapter.members.listEvents(membro.id);
    const evento = eventos.find((e) => e.type === 'desligamento');
    expect(evento?.description).not.toContain('Motivo:');
  });

  it('não altera CPF, foto nem outros dados do membro', async () => {
    const membro = await criarAtivo({ photoPath: 'algum/caminho.png' });
    const resultado = await mockAdapter.members.deactivate(membro.id, { endedOn: '2026-06-15' });

    expect(resultado.photoPath).toBe('algum/caminho.png');
    expect(resultado.fullName).toBe(membro.fullName);
    expect(resultado.email).toBe(membro.email);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('anonymousFeedbackIntake (canal permanente, migration 0033)', () => {
  it('nasce desabilitada, sem form_id nem responder_url', async () => {
    const config = await mockAdapter.anonymousFeedbackIntake.getConfig();
    expect(config).toEqual({
      enabled: false,
      formId: null,
      responderUrl: null,
      updatedAt: expect.any(String),
    });
  });

  it('atualiza só os campos enviados, preservando o resto', async () => {
    await mockAdapter.anonymousFeedbackIntake.updateConfig({
      formId: 'fixture-form',
      responderUrl: 'https://forms.gle/fixture',
    });
    const config = await mockAdapter.anonymousFeedbackIntake.getConfig();
    expect(config.formId).toBe('fixture-form');
    expect(config.responderUrl).toBe('https://forms.gle/fixture');
    expect(config.enabled).toBe(false);
  });

  it('habilita depois de form_id/responder_url configurados', async () => {
    await mockAdapter.anonymousFeedbackIntake.updateConfig({
      formId: 'fixture-form',
      responderUrl: 'https://forms.gle/fixture',
      enabled: true,
    });
    const config = await mockAdapter.anonymousFeedbackIntake.getConfig();
    expect(config.enabled).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('CPF (modo mock)', () => {
  /** Fictícios, com dígitos verificadores corretos. */
  const CPF_A = '529.982.247-25';
  const CPF_B = '111.444.777-35';

  it('membro sem CPF: status diz que não tem, e nada é revelado', async () => {
    const membro = (await mockAdapter.members.list())[0];

    expect(await mockAdapter.members.getCpfStatus(membro.id)).toEqual({
      hasCpf: false,
      last4: null,
      updatedAt: null,
    });
    expect(await mockAdapter.members.getCpf(membro.id)).toBeNull();
  });

  it('grava, lê de volta e mostra só os quatro últimos no status', async () => {
    const membro = (await mockAdapter.members.list())[0];

    const result = await mockAdapter.members.setCpf(membro.id, CPF_A);
    expect(result.outcome).toBe('criado');

    const status = await mockAdapter.members.getCpfStatus(membro.id);
    // O status NUNCA traz o número inteiro: é o que a tela usa para dizer
    // "tem CPF, terminado em 4725" sem acionar o serviço de decifra.
    expect(status).toMatchObject({ hasCpf: true, last4: '4725' });
    expect(JSON.stringify(status)).not.toContain('52998224725');

    // O número completo só pelo caminho auditado.
    expect(await mockAdapter.members.getCpf(membro.id)).toBe('52998224725');
  });

  it('recusa CPF inválido', async () => {
    const membro = (await mockAdapter.members.list())[0];

    await expect(mockAdapter.members.setCpf(membro.id, '111.111.111-11')).rejects.toThrow();
    await expect(mockAdapter.members.setCpf(membro.id, '123')).rejects.toThrow();
    expect((await mockAdapter.members.getCpfStatus(membro.id)).hasCpf).toBe(false);
  });

  it('recusa o mesmo CPF em duas pessoas, dizendo de quem é', async () => {
    const [primeira, segunda] = await mockAdapter.members.list();

    await mockAdapter.members.setCpf(primeira.id, CPF_A);
    const conflito = await mockAdapter.members.setCpf(segunda.id, CPF_A);

    expect(conflito.outcome).toBe('duplicado');
    expect(conflito.conflictMemberId).toBe(primeira.id);
    // A segunda pessoa continua sem CPF: nada foi gravado pela metade.
    expect((await mockAdapter.members.getCpfStatus(segunda.id)).hasCpf).toBe(false);
  });

  it('corrigir o CPF da MESMA pessoa é atualização, não duplicidade', async () => {
    const membro = (await mockAdapter.members.list())[0];

    await mockAdapter.members.setCpf(membro.id, CPF_A);
    const result = await mockAdapter.members.setCpf(membro.id, CPF_B);

    expect(result.outcome).toBe('atualizado');
    expect(await mockAdapter.members.getCpf(membro.id)).toBe('11144477735');
  });

  it('remover apaga o CPF e NÃO o membro', async () => {
    const membro = (await mockAdapter.members.list())[0];
    await mockAdapter.members.setCpf(membro.id, CPF_A);

    await mockAdapter.members.removeCpf(membro.id);

    expect((await mockAdapter.members.getCpfStatus(membro.id)).hasCpf).toBe(false);
    // A pessoa continua lá, com o histórico dela.
    expect(await mockAdapter.members.getById(membro.id)).not.toBeNull();
  });

  it('gravar o CPF resolve a pendência da importação — e só ela', async () => {
    const catalog = await mockAdapter.org.getCatalog();
    const subarea = catalog.subareas.find((s) => s.slug === 'solucoes-dados')!;
    const position = catalog.positions.find((p) => p.name === 'Analista de Dados')!;
    const gestoes = await mockAdapter.gestoes.list();

    const importado = await mockAdapter.membersImport.importMember({
      externalId: 'csv:cpf.pendente@teste.invalid',
      payload: { 'Nome Completo': 'Pessoa Sem Cpf' },
      fullName: 'Pessoa Sem Cpf',
      email: 'cpf.pendente@teste.invalid',
      positionId: position.id,
      subareaId: subarea.id,
      gestaoId: gestoes[0].id,
      referenceDate: '2026-09-17',
    });

    await mockAdapter.membersImport.flagReview('csv:cpf.pendente@teste.invalid', [
      'cpf_missing',
      'photo_missing',
    ]);

    await mockAdapter.members.setCpf(importado.memberId!, CPF_A);

    // A foto continua faltando: resolver uma pendência não apaga as outras.
    expect(await mockAdapter.members.listReviewReasons(importado.memberId!)).toEqual([
      'photo_missing',
    ]);
  });

  it('a trilha registra as ações — inclusive leitura — e nunca o CPF', async () => {
    const membro = (await mockAdapter.members.list())[0];

    await mockAdapter.members.setCpf(membro.id, CPF_A);
    await mockAdapter.members.getCpf(membro.id);
    await mockAdapter.members.removeCpf(membro.id);

    const trilha = mockCpfAuditTrail.filter((linha) => linha.memberId === membro.id);
    expect(trilha.map((linha) => linha.action)).toEqual(['create', 'read', 'remove']);

    // Ler é auditado: é a única forma de responder "quem viu o CPF dessa
    // pessoa?" depois de um incidente.
    const serializada = JSON.stringify(trilha);
    expect(serializada).not.toContain('52998224725');
    expect(serializada).not.toContain('529.982.247-25');
  });

  it('o CPF não fica no localStorage do navegador', async () => {
    const membro = (await mockAdapter.members.list())[0];
    await mockAdapter.members.setCpf(membro.id, CPF_A);

    // O mock guarda o banco de mentira no localStorage. O CPF é exceção
    // deliberada: ele vive em memória e some ao recarregar a página.
    const tudo = JSON.stringify(localStorage);
    expect(tudo).not.toContain('52998224725');
    expect(tudo).not.toContain('529.982.247-25');
  });
});
