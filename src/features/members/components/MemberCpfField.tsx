import { useEffect, useState } from 'react';
import { Eye, EyeOff, Save, Trash2, X } from 'lucide-react';
import { Badge, Button, ConfirmDialog, Input, Panel, useToast } from '@/components/ui';
import {
  checkCpf,
  CPF_PROBLEM_LABEL,
  formatCpf,
  getMemberCpf,
  messageFor,
  useMemberCpfStatus,
  useMembers,
  useRemoveMemberCpf,
  useSetMemberCpf,
  type Member,
} from '@/data';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CPF NO PERFIL.
 *
 * Todo GG autorizado vê o CPF completo — `gg` e `gg_diretoria` têm o mesmo
 * acesso, e NÃO existe máscara por papel. O que existe é máscara por AÇÃO: a
 * tela abre mostrando só os quatro últimos dígitos, e o número inteiro aparece
 * quando alguém clica em "Mostrar".
 *
 * A diferença importa por dois motivos concretos:
 *
 *   • cada leitura do número completo vira uma linha de auditoria no servidor.
 *     Se a tela buscasse o CPF ao abrir, todo acesso a qualquer perfil viraria
 *     "alguém consultou o CPF dessa pessoa" — e a trilha perderia o sentido.
 *   • CPF na tela é CPF na tela de quem está ao lado. Mostrar sob demanda é o
 *     mínimo de cuidado com quem trabalha em sala compartilhada.
 *
 * ⚠️ O NÚMERO NUNCA É GUARDADO: não entra no cache do React Query, não vai
 * para `localStorage`/`sessionStorage`, não entra na URL. Ele vive em estado
 * local e é APAGADO quando o componente desmonta — sair do perfil limpa.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type Modo = 'leitura' | 'editando';

export function MemberCpfField({ member }: { member: Member }) {
  const { showToast } = useToast();
  const status = useMemberCpfStatus(member.id);
  const salvar = useSetMemberCpf();
  const remover = useRemoveMemberCpf();
  /** Só para dizer o NOME de quem já tem o CPF, num conflito. */
  const { data: todos } = useMembers();

  const [modo, setModo] = useState<Modo>('leitura');
  const [revelado, setRevelado] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [rascunho, setRascunho] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);

  // SAIR DO PERFIL LIMPA. Trocar de pessoa também: sem isto, o CPF de quem
  // acabou de ser visto ficaria na tela do próximo perfil aberto.
  useEffect(() => {
    return () => setRevelado(null);
  }, [member.id]);

  useEffect(() => {
    setRevelado(null);
    setModo('leitura');
    setErro(null);
  }, [member.id]);

  const revelar = async () => {
    setErro(null);
    setCarregando(true);
    try {
      // Cada clique é uma leitura auditada no servidor. É de propósito.
      setRevelado(await getMemberCpf(member.id));
    } catch (cause) {
      setErro(messageFor(cause));
    } finally {
      setCarregando(false);
    }
  };

  const abrirEdicao = async () => {
    setErro(null);
    // Editar precisa do valor atual na mão: ninguém corrige um número que não
    // está vendo.
    if (status.data?.hasCpf && revelado === null) {
      setCarregando(true);
      try {
        setRascunho(formatCpf(await getMemberCpf(member.id)));
      } catch (cause) {
        setErro(messageFor(cause));
        setCarregando(false);
        return;
      }
      setCarregando(false);
    } else {
      setRascunho(revelado ? formatCpf(revelado) : '');
    }
    setModo('editando');
  };

  const salvarCpf = async () => {
    setErro(null);

    // Validação ANTES de sair da tela. O servidor valida de novo, com o mesmo
    // módulo — mas errar aqui não deveria custar uma ida à rede.
    const check = checkCpf(rascunho);
    if (!check.valid) {
      setErro(check.problem ? CPF_PROBLEM_LABEL[check.problem] : 'CPF inválido.');
      return;
    }

    try {
      const result = await salvar.mutateAsync({ memberId: member.id, cpf: rascunho });

      if (result.outcome === 'duplicado') {
        const outro = todos?.find((pessoa) => pessoa.id === result.conflictMemberId);
        setErro(
          outro
            ? `Este CPF já está cadastrado em ${outro.fullName}. Dois membros não podem ter o mesmo CPF.`
            : 'Este CPF já está cadastrado em outro membro.',
        );
        return;
      }

      if (result.outcome === 'membro_inexistente') {
        setErro('Membro não encontrado.');
        return;
      }

      setModo('leitura');
      setRevelado(null);
      setRascunho('');
      showToast({
        message: result.outcome === 'criado' ? 'CPF cadastrado' : 'CPF corrigido',
        description: 'A alteração ficou registrada na trilha de acesso a dado privado.',
        tone: 'success',
      });
    } catch (cause) {
      setErro(messageFor(cause));
    }
  };

  const removerCpf = async () => {
    setConfirmarRemocao(false);
    setErro(null);
    try {
      await remover.mutateAsync(member.id);
      setRevelado(null);
      setModo('leitura');
      showToast({ message: 'CPF removido', tone: 'success' });
    } catch (cause) {
      setErro(messageFor(cause));
    }
  };

  const temCpf = status.data?.hasCpf ?? false;
  const ocupado = carregando || salvar.isPending || remover.isPending;

  return (
    <Panel
      title="CPF"
      subtitle="Dado privado: guardado cifrado, e cada consulta ao número completo fica registrada."
    >
      <div className="flex flex-col gap-3">
        {modo === 'leitura' ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              {status.isLoading ? (
                <span className="text-sm text-muted-foreground">Verificando…</span>
              ) : !temCpf ? (
                <Badge tone="warn">Não informado</Badge>
              ) : revelado ? (
                <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
                  {formatCpf(revelado)}
                </span>
              ) : (
                <span className="font-mono text-sm text-foreground-secondary tabular-nums">
                  ••• ••• •••-{status.data?.last4}
                </span>
              )}

              {temCpf &&
                (revelado ? (
                  <Button icon={<EyeOff size={15} />} onClick={() => setRevelado(null)}>
                    Ocultar
                  </Button>
                ) : (
                  <Button icon={<Eye size={15} />} loading={carregando} onClick={() => void revelar()}>
                    Mostrar
                  </Button>
                ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button disabled={ocupado} onClick={() => void abrirEdicao()}>
                {temCpf ? 'Editar CPF' : 'Adicionar CPF'}
              </Button>
              {temCpf && (
                <Button
                  icon={<Trash2 size={15} />}
                  disabled={ocupado}
                  onClick={() => setConfirmarRemocao(true)}
                >
                  Remover
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="max-w-[260px]">
              <Input
                aria-label="CPF"
                value={rascunho}
                inputMode="numeric"
                placeholder="000.000.000-00"
                autoComplete="off"
                // Sem histórico do navegador para este campo.
                spellCheck={false}
                onChange={(event) => setRascunho(event.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                icon={<Save size={15} />}
                loading={salvar.isPending}
                onClick={() => void salvarCpf()}
              >
                Salvar CPF
              </Button>
              <Button
                icon={<X size={15} />}
                disabled={salvar.isPending}
                onClick={() => {
                  setModo('leitura');
                  setRascunho('');
                  setErro(null);
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {erro && (
          <p role="alert" className="text-sm text-bad">
            {erro}
          </p>
        )}

        {status.data?.updatedAt && modo === 'leitura' && temCpf && (
          <p className="text-xs text-muted-foreground">
            Última alteração registrada na trilha de auditoria.
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirmarRemocao}
        onClose={() => setConfirmarRemocao(false)}
        onConfirm={() => void removerCpf()}
        title="Remover o CPF desta pessoa?"
        description="O CPF é apagado; o membro continua cadastrado, com todo o histórico. A remoção fica registrada na trilha de acesso a dado privado."
        confirmLabel="Remover CPF"
        destructive
        loading={remover.isPending}
      />
    </Panel>
  );
}
