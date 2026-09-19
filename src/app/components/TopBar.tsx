import { Bell } from 'lucide-react';
import { useToast } from '@/components/ui';
import { cn } from '@/lib/cn';

/**
 * Faixa de topo da área interna: notificações.
 *
 * A busca GLOBAL foi removida no redesenho de 2026 (decisão de produto, não de
 * layout). Ela empurrava o termo para o recorte de Membros, que já tem a sua
 * própria busca dentro do painel — duas caixas de busca na mesma tela, uma
 * dentro da outra, é uma pergunta a mais para quem só queria achar alguém.
 * O atalho ⌘K saiu junto: um selo de atalho sem campo para focar seria mentira.
 *
 * Se a busca global voltar, ela volta como busca de verdade (pessoas, X1 e
 * feedbacks), não como atalho para uma tela só.
 */
export function TopBar({ className }: { className?: string }) {
  const { showToast } = useToast();

  return (
    <div className={cn('hidden items-center justify-end lg:flex', className)}>
      <button
        type="button"
        aria-label="Notificações"
        title="Notificações"
        onClick={() =>
          showToast({
            message: 'Notificações ainda não estão disponíveis',
            description: 'Esta área chega em uma fase seguinte da plataforma.',
            tone: 'info',
          })
        }
        className={cn(
          'glass flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full',
          'text-foreground-secondary transition-colors hover:border-border-hover hover:text-foreground',
        )}
      >
        <Bell size={17} aria-hidden />
      </button>
    </div>
  );
}
