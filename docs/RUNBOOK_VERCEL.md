# Runbook — hospedar o frontend na Vercel

> Cobre só a configuração do projeto na Vercel. Não é o runbook de produção
> (`docs/RUNBOOK_PRODUCAO.md`, sobre o projeto Supabase `stpqnjtqtbjbbqxknjzi`
> — **proibido** nesta etapa). Aqui o banco usado é o de teste,
> `ftghxffivergkmrcxzjm`.

## Por que existe `vercel.json`

A aplicação usa `BrowserRouter` (`src/App.tsx`) — rotas como `/membros`,
`/x1`, `/administracao` só existem no lado do cliente. Sem um rewrite, abrir
ou atualizar uma dessas URLs direto no navegador vira um 404 da Vercel (ela
procura um arquivo físico em `/membros` e não encontra). O `vercel.json` na
raiz resolve isso devolvendo `index.html` para qualquer rota que não seja um
arquivo estático real — arquivos que existem de fato em `dist/` (JS, CSS,
`/assets/*`, `favicon.svg`) continuam sendo servidos diretamente, sem passar
pelo rewrite.

## Configuração do projeto (painel da Vercel)

| Campo | Valor |
| --- | --- |
| Framework Preset | **Vite** |
| Root Directory | raiz do repositório (não mover) |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

Mesma receita que já roda em `.github/workflows/ci.yml` (`npm ci` + `npm run
build`) — nada novo, só reaproveitado.

## Variáveis de ambiente (painel da Vercel → Settings → Environment Variables)

| Nome | Valor | Onde preencher |
| --- | --- | --- |
| `VITE_DATA_SOURCE` | `supabase` | direto no painel — não é secreto |
| `VITE_SUPABASE_URL` | `https://ftghxffivergkmrcxzjm.supabase.co` | direto no painel — é a URL pública do projeto, não é secreta |
| `VITE_SUPABASE_ANON_KEY` | *(preencher manualmente)* | painel da Vercel — pegue o valor no Dashboard do Supabase (`ftghxffivergkmrcxzjm` → Settings → API). **Nunca cole o valor em chat, issue, commit ou log.** |

**Nunca configure na Vercel** (são segredos de servidor, não do frontend):
`service_role key`, senha do banco (`SUPABASE_DB_PASSWORD`), segredos de Edge
Function (`CPF_ENCRYPTION_KEY`, `CPF_HASH_KEY`, `GOOGLE_FORMS_WEBHOOK_SECRET`,
`GOOGLE_OAUTH_CLIENT_SECRET` e os demais listados em `.env.example`). Nenhum
deles tem uso no bundle do navegador — colocá-los na Vercel só os exporia.

## Pendência para depois do primeiro deploy

A URL definitiva que a Vercel gerar (`https://<projeto>.vercel.app` ou domínio
próprio) ainda precisa ser registrada em três lugares, **fora do escopo desta
etapa**:

1. Supabase Auth do projeto `ftghxffivergkmrcxzjm` — `site_url` e
   `additional_redirect_urls` (`supabase/config.toml` §1.1 do runbook de
   produção descreve o mesmo padrão, aplicado aqui ao projeto de teste).
2. `APP_BASE_URL` (segredo da Edge Function `google-calendar-oauth`, se a
   Agenda de X1 estiver ativa neste projeto).
3. `ALLOWED_ORIGINS` (segredo das Edge Functions que validam CORS/origem).

Nenhuma dessas três foi alterada nesta etapa — nenhuma escrita em Supabase
Auth, secrets, Edge Functions ou Google Cloud aconteceu aqui.

## Rollback

Vercel mantém o deploy anterior disponível — "Promote to Production" num
deploy anterior no painel reverte o frontend sem precisar de novo build.
