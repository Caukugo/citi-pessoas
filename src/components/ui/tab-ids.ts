/**
 * Ids que ligam uma aba ao painel que ela controla.
 *
 * Fica fora de `tabs.tsx` porque o Fast Refresh do Vite exige que um arquivo
 * `.tsx` exporte apenas componentes — mesmo motivo de `authContext.ts` existir
 * ao lado de `AuthProvider.tsx`.
 *
 * Use os dois lados, sempre juntos — leitor de tela precisa saber qual painel
 * pertence a qual aba:
 *
 *   <Tabs tabs={TABS} active={aba} onChange={setAba} idPrefix="perfil" />
 *   <div {...tabPanelProps('perfil', aba)}>…</div>
 */

export function tabId(prefix: string, id: string) {
  return `${prefix}-tab-${id}`;
}

export function tabPanelId(prefix: string, id: string) {
  return `${prefix}-panel-${id}`;
}

export function tabPanelProps(prefix: string, id: string) {
  return {
    id: tabPanelId(prefix, id),
    role: 'tabpanel' as const,
    'aria-labelledby': tabId(prefix, id),
    tabIndex: 0,
  };
}
