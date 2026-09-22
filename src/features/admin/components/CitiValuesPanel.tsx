import { useState } from 'react';
import { Plus, RotateCcw } from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmDialog,
  ErrorState,
  Input,
  LoadingState,
  Panel,
  useToast,
} from '@/components/ui';
import { messageFor, useSettings, useUpdateSettings, type CitiValueSetting } from '@/data';
import { formatDate } from '@/lib/format';
import {
  activeOnes,
  addCitiValue,
  canRetire,
  CITI_VALUE_ERROR_MESSAGE,
  reactivateCitiValue,
  retireCitiValue,
  retiredOnes,
  validateLabel,
} from '../model/citiValues';

/**
 * ADM-004 — os valores do CITi.
 *
 * ⚠️ AQUI NÃO SE APAGA NADA. Um valor sai de circulação sendo APOSENTADO: some
 * do formulário de X1 novo e continua legível em toda conversa que já o
 * avaliou. Isso não é excesso de zelo — cada X1 guarda o RÓTULO do dia em que
 * foi escrito, então aposentar um valor nunca reescreve o passado. É o que
 * o PROJECT_CONTEXT §11 exige de qualquer regra configurável. Ver ADR-023.
 *
 * A tela faz DUAS coisas: acrescentar e aposentar (mais reativar o que foi
 * aposentado). Renomear não existe de propósito — o nome de um valor do CITi é
 * decisão de cultura, não ajuste de tela.
 *
 * Se alguém pedir "remover de vez" ou "limpar os valores antigos", isso é
 * mudança de produto, não ajuste de tela.
 */
export function CitiValuesPanel() {
  const { showToast } = useToast();
  const settings = useSettings();
  const updateSettings = useUpdateSettings();

  const [novo, setNovo] = useState('');
  const [aposentando, setAposentando] = useState<CitiValueSetting | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  if (settings.isLoading) {
    return (
      <Panel title="Valores do CITi">
        <LoadingState label="Carregando valores…" />
      </Panel>
    );
  }

  if (settings.isError || !settings.data) {
    return (
      <Panel title="Valores do CITi">
        <ErrorState
          title="Não foi possível carregar os valores"
          description="Pode ter sido uma falha momentânea de conexão."
          onRetry={() => void settings.refetch()}
        />
      </Panel>
    );
  }

  const lista = settings.data.citiValues;
  const ativos = activeOnes(lista);
  const aposentados = retiredOnes(lista);

  // Lista vazia = o banco não tem `citi_values` preenchida, quase sempre porque
  // a migration 0038 não rodou ali. O X1 segue funcionando com os quatro
  // fundadores (`activeCitiValues`), mas gravar daqui vai falhar — e o erro que
  // o Postgres devolve ("could not find the column") não diz o que fazer.
  const semConfiguracao = lista.length === 0;

  /** Toda gravação passa por aqui: lista nova inteira, como o modelo devolve. */
  const salvar = async (citiValues: CitiValueSetting[], mensagem: string) => {
    setErro(null);
    try {
      await updateSettings.mutateAsync({ citiValues });
      showToast({ message: mensagem, tone: 'success' });
      return true;
    } catch (cause) {
      setErro(messageFor(cause));
      return false;
    }
  };

  const adicionar = async () => {
    const problema = validateLabel(lista, novo);
    if (problema) {
      setErro(CITI_VALUE_ERROR_MESSAGE[problema]);
      return;
    }
    if (await salvar(addCitiValue(lista, novo), `"${novo.trim()}" entrou nos valores do CITi.`)) {
      setNovo('');
    }
  };

  const pedirParaAposentar = (valor: CitiValueSetting) => {
    const problema = canRetire(lista, valor.id);
    if (problema) {
      setErro(CITI_VALUE_ERROR_MESSAGE[problema]);
      return;
    }
    setErro(null);
    setAposentando(valor);
  };

  const confirmarAposentadoria = async () => {
    if (!aposentando) return;
    if (
      await salvar(
        retireCitiValue(lista, aposentando.id),
        `"${aposentando.label}" saiu de circulação.`,
      )
    ) {
      setAposentando(null);
    }
  };

  return (
    <Panel
      title="Valores do CITi"
      subtitle="O que o X1 pergunta sobre cultura. Cada gestão ajusta a sua lista."
    >
      <div className="flex flex-col gap-5">
        {semConfiguracao && (
          <p className="rounded-control border border-warn/40 bg-warn/10 px-3 py-2.5 text-sm text-foreground-secondary">
            A lista ainda não existe neste banco: falta aplicar a migration{' '}
            <code>0038_valores_citi_configuraveis.sql</code>. Até lá o X1 usa os quatro valores
            fundadores, e salvar mudanças aqui não vai funcionar.
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {ativos.map((valor) => (
            <li
              key={valor.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-foreground/[0.02] px-3 py-2.5"
            >
              <span className="text-sm font-semibold text-foreground-secondary">{valor.label}</span>
              <Button
                variant="ghost"
                className="shrink-0"
                onClick={() => pedirParaAposentar(valor)}
              >
                Aposentar
              </Button>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={novo}
            onChange={(event) => setNovo(event.target.value)}
            aria-label="Nome do novo valor"
            placeholder="Ex.: Protagonismo"
            className="min-w-[200px] flex-1"
          />
          <Button
            icon={<Plus size={14} />}
            className="shrink-0"
            disabled={updateSettings.isPending}
            onClick={() => void adicionar()}
          >
            Adicionar valor
          </Button>
        </div>

        {erro && (
          <p role="alert" className="text-sm text-bad">
            {erro}
          </p>
        )}

        {aposentados.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              Fora de circulação
            </p>
            {/* Continuam visíveis de propósito: são eles que explicam o que um
                X1 de outra gestão está avaliando. */}
            <ul className="mt-2 flex flex-col gap-2">
              {aposentados.map((valor) => (
                <li
                  key={valor.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border px-3 py-2.5 opacity-70"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground">{valor.label}</span>
                    <Badge tone="neutral">aposentado</Badge>
                    {valor.retiredAt && (
                      <span className="text-xs text-muted-foreground">
                        desde {formatDate(valor.retiredAt)}
                      </span>
                    )}
                  </span>
                  <Button
                    variant="ghost"
                    icon={<RotateCcw size={14} />}
                    className="shrink-0"
                    disabled={updateSettings.isPending}
                    onClick={() =>
                      void salvar(
                        reactivateCitiValue(lista, valor.id),
                        `"${valor.label}" voltou para os valores do CITi.`,
                      )
                    }
                  >
                    Reativar
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={aposentando !== null}
        onClose={() => setAposentando(null)}
        onConfirm={() => void confirmarAposentadoria()}
        title={`Aposentar "${aposentando?.label}"?`}
        description="Este valor sai do formulário de X1 novo. Os X1 que já o avaliaram continuam mostrando a avaliação — nada é apagado, e dá para reativar depois."
        confirmLabel="Aposentar"
        destructive
        loading={updateSettings.isPending}
      />
    </Panel>
  );
}
