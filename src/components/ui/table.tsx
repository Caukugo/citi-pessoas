import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Tabela da plataforma.
 *
 * Sempre envolva em `<TableWrapper>`: é ele que dá rolagem horizontal no
 * celular sem deixar a página inteira rolar para o lado.
 *
 * ```tsx
 * <TableWrapper>
 *   <Table>
 *     <THead><TR><TH>Nome</TH><TH>Subárea</TH></TR></THead>
 *     <TBody>
 *       {members.map((m) => (
 *         <TR key={m.id} onClick={() => navigate(`/membros/${m.id}`)}>
 *           <TD>{m.fullName}</TD><TD>{m.area}</TD>
 *         </TR>
 *       ))}
 *     </TBody>
 *   </Table>
 * </TableWrapper>
 * ```
 */

export function TableWrapper({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('w-full overflow-x-auto', className)}>{children}</div>;
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <table className={cn('w-full min-w-[640px] border-collapse text-sm', className)}>
      {children}
    </table>
  );
}

export function THead({ children, className }: { children: ReactNode; className?: string }) {
  return <thead className={cn('border-b border-border', className)}>{children}</thead>;
}

export function TBody({ children, className }: { children: ReactNode; className?: string }) {
  return <tbody className={className}>{children}</tbody>;
}

export function TR({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      // Linha clicável precisa ser alcançável por teclado.
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? 'button' : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        'border-b border-border last:border-0',
        onClick && 'cursor-pointer transition-colors hover:bg-foreground/[0.03]',
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TH({
  children,
  className,
  align = 'left',
}: {
  children: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <th
      scope="col"
      className={cn(
        'px-4 py-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase',
        align === 'left' && 'text-left',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TD({
  children,
  className,
  align = 'left',
}: {
  children: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <td
      className={cn(
        'px-4 py-3 text-foreground-secondary',
        align === 'left' && 'text-left',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}
