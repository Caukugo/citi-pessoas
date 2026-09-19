/**
 * Decoração de fundo de página: a escultura preta do CITi.
 *
 * É um asset real (`public/bg-blob.webp`, 1200px, alfa de verdade), não um
 * efeito de luz em CSS. As partes escuras da peça somem no grafite do palco e
 * só os reflexos aparecem — é o que faz o canto superior direito ter matéria
 * em vez de brilho. Nenhum blend-mode, nenhum filtro, nenhuma cor: a peça é
 * preta, e é assim que ela convive com o laranja sem disputar com ele.
 *
 * ÂNCORA. A imagem é `absolute` e NÃO tem pai relativo próprio de propósito:
 * ela se resolve contra o contêiner de conteúdo do `AppLayout`, para ficar
 * ancorada na área de conteúdo e não na caixa de quem a renderiza. É por isso
 * que `top` é tão negativo — a peça começa acima da dobra, como no desenho.
 *
 * `-z-10` a coloca atrás de todo o conteúdo da página sem que cada bloco
 * precise declarar um z próprio: o contêiner do layout é um contexto de
 * empilhamento, então o índice negativo não escapa dele.
 *
 * Mora no design system, e não em uma feature, porque é o fundo de TODA tela
 * que adota a linguagem nova — duplicar isso por feature é como as telas
 * começam a divergir.
 */
export function PageDecor() {
  return (
    // O invólucro existe para RECORTAR. A peça sangra para fora da direita e
    // para cima de propósito, mas sangrar de verdade faria a área de conteúdo
    // rolar na horizontal, que é a única coisa que o DESIGN.md proíbe
    // categoricamente. O `overflow-hidden` daqui corta o excedente sem tirar
    // o efeito.
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 block h-[560px] overflow-hidden"
    >
      <img
        src="/bg-blob.webp"
        alt=""
        draggable={false}
        // `w-[46%]`: a peça acompanha a largura do conteúdo em vez de ficar
        // presa a um tamanho de pixel que só estaria certo em 1536.
        className="decor-blob top-[-190px] right-[-60px] w-[46%] opacity-95"
      />
    </span>
  );
}
