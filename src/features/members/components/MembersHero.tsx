import { PageDecor, PageHeader } from '@/components/ui';

/**
 * Cabeçalho da tela de Membros.
 *
 * Além do título, ele traz o `<PageDecor>` — a escultura do fundo, que é a
 * mesma peça em todas as telas da linguagem nova. A documentação dela vive no
 * próprio componente, em @/components/ui.
 */
export function MembersHero() {
  return (
    <>
      <PageDecor />

      <PageHeader
        title="Membros"
        // `pb` e não `mb`: margem de h1 e margem de p colapsam entre si, e o
        // respiro viraria só o `mt` do PageHeader.
        titleClassName="text-[26px] leading-[1.18] tracking-[-0.02em] pb-[1px]"
        // O `<span>` vence o tamanho padrão do subtítulo do PageHeader sem
        // alterar o componente compartilhado.
        subtitle={
          <span className="text-[13px]">Acompanhe as pessoas e suas jornadas aqui no CITi.</span>
        }
      />
    </>
  );
}
