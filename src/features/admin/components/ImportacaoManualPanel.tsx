import { Link } from 'react-router-dom';
import { ArrowRight, Info } from 'lucide-react';
import { Button, Panel } from '@/components/ui';
import { ROUTES } from '@/app/routes';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTAÇÃO MANUAL — contingência, não fluxo principal.
 *
 * A entrada automática pelo Google Forms (painel "Entrada de membros", acima)
 * é o caminho normal. A importação por planilha existe para o dia em que essa
 * automação estiver fora do ar — por isso ela não tem item próprio na barra
 * lateral: um lugar por engano vira o caminho padrão.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function ImportacaoManualPanel() {
  return (
    <Panel
      title="Importação manual"
      subtitle="Alternativa de contingência para quando a entrada automática não estiver funcionando."
    >
      <div className="flex flex-col gap-3">
        <p className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
          <Info size={13} className="mt-[2px] shrink-0" aria-hidden />
          Use somente quando o formulário do Google não puder ser usado. Antes de gravar qualquer
          coisa, a tela mostra uma prévia com o que vai acontecer e o que está errado.
        </p>

        <div>
          <Link to={ROUTES.import}>
            <Button variant="primary" icon={<ArrowRight size={15} aria-hidden />}>
              Abrir importação manual
            </Button>
          </Link>
        </div>
      </div>
    </Panel>
  );
}
