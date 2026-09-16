import { cn } from '@/lib/cn';

/**
 * A marca "citi pessoas".
 *
 * PONTO ÚNICO. Antes a marca era remontada em cada tela com dois `<span>` —
 * "citi" em Sora bold e "Pessoas" ao lado — e cada tela tinha a sua versão,
 * com tamanho e cor próprios. Isso não é logo, é imitação de logo: o desenho
 * oficial tem um wordmark próprio, um ponto e uma barra laranja que nenhuma
 * fonte reproduz. Agora existe um asset só (`public/logo-citi-pessoas.svg`,
 * fundo transparente) e um componente só.
 *
 * SE PRECISAR DA MARCA EM UMA TELA NOVA, use este componente. Não recrie em
 * CSS, não escreva o nome em texto, não gere uma variante.
 *
 * O tamanho é sempre dado pela ALTURA: o viewBox está colado na tinta, então a
 * largura acompanha sozinha e a proporção nunca distorce. Por isso o `height`
 * vem em prop e a largura fica `auto`.
 */
export function Logo({
  /** Altura em px. A largura sai da proporção (≈5,9 : 1). */
  height = 20,
  className,
}: {
  height?: number;
  className?: string;
}) {
  return (
    <img
      src="/logo-citi-pessoas.svg"
      // A logo É o nome da plataforma: sem `alt` o leitor de tela anuncia uma
      // imagem sem nome onde deveria dizer onde a pessoa está.
      alt="citi pessoas"
      // A altura vai em `style` porque é um número vindo de prop, e classe do
      // Tailwind não aceita valor dinâmico. Só o atributo `height` não bastava:
      // como item de flex a marca era esticada até a largura do contêiner.
      // Com a altura fixa e `w-auto`, a proporção intrínseca resolve a largura.
      style={{ height }}
      className={cn('w-auto max-w-full select-none', className)}
      draggable={false}
    />
  );
}
