# SETUP — instalar e rodar o projeto

Escrito para quem **nunca rodou um projeto de programação**. Se travar em algum
passo, chame o Cauan — e diga em qual número você parou.

---

## 1. O que instalar

### Node.js

O Node é o programa que executa o projeto.

1. Acesse <https://nodejs.org>
2. Baixe a versão **LTS** (o botão da esquerda).
3. Instale clicando "Avançar" em tudo.
4. Reinicie o computador (no Windows isso evita metade dos problemas).

**Confira se funcionou.** Abra o terminal:

- **Windows:** tecla Windows → digite `powershell` → Enter
- **Mac:** Cmd + Espaço → digite `terminal` → Enter

Digite:

```bash
node --version
```

Deve aparecer algo como `v22.x.x` ou maior. Se aparecer "comando não
encontrado", o Node não instalou — refaça o passo 1.

### Git

O Git é o que baixa o código e guarda as versões.

1. Acesse <https://git-scm.com/downloads>
2. Baixe e instale (pode aceitar tudo que ele sugerir).

Confira:

```bash
git --version
```

### VS Code

O editor onde você vai ver e escrever o código.

1. Acesse <https://code.visualstudio.com>
2. Baixe e instale.

---

## 2. Como clonar o projeto

"Clonar" é baixar o código para a sua máquina.

No terminal, vá até onde quer guardar o projeto:

```bash
cd Desktop
```

Depois:

```bash
git clone <URL-DO-REPOSITORIO>
cd citi-pessoas
```

> A URL do repositório está no GitHub, no botão verde **Code**. Se não tiver
> acesso, peça ao Cauan.

---

## 3. Como abrir no editor

Ainda no terminal, dentro da pasta do projeto:

```bash
code .
```

(O ponto faz parte do comando.)

Se `code` não funcionar, abra o VS Code e use **Arquivo → Abrir Pasta**.

Dentro do VS Code, abra o terminal integrado com **Ctrl + '** (ou
**Terminal → Novo Terminal**). É nele que você roda o resto.

---

## 4. Como configurar o `.env`

O `.env` guarda a configuração da sua máquina.

**Windows (PowerShell):**

```powershell
copy .env.example .env
```

**Mac/Linux:**

```bash
cp .env.example .env
```

**Você não precisa mudar nada dentro dele agora.** O padrão já roda o projeto
com dados fictícios.

> ⚠️ O arquivo `.env` **nunca** vai para o GitHub. Isso é proposital.

---

## 5. Como instalar as dependências

Dependências são as bibliotecas que o projeto usa.

```bash
npm install
```

Demora alguns minutos na primeira vez. Deixe terminar.

> **Aviso normal:** o npm pode dizer que bloqueou scripts de instalação de
> `esbuild` e `@tailwindcss/oxide`. **Pode ignorar** — o projeto funciona
> normalmente.

---

## 6. Como iniciar

```bash
npm run dev
```

Deve aparecer algo assim:

```
  VITE v6.3.5  ready in 512 ms

  ➜  Local:   http://localhost:5173/
```

---

## 7. Qual URL abrir

<http://localhost:5173>

O navegador costuma abrir sozinho.

---

## 8. Como saber que funcionou

Você deve ver a tela de login, fundo preto com "citi" em verde.

Entre com:

- **E-mail:** `gg@citi.org.br`
- **Senha:** `citi123`

Depois de entrar você cai na tela **Membros**, com a barra lateral à esquerda.

Está tudo certo se:

- ✅ a barra lateral mostra Membros, X1, Feedbacks, Moderação, Importação, Administração;
- ✅ existe um aviso amarelo escrito **"Dados fictícios"**;
- ✅ a tela abre sem erro vermelho.

> O aviso amarelo é esperado: significa que você está usando dados de mentira,
> como deve ser durante o desenvolvimento.

**Para parar o servidor:** clique no terminal e aperte **Ctrl + C**.

---

## 9. Erros comuns

### "npm não é reconhecido como comando"

O Node não foi instalado ou o computador não foi reiniciado. Refaça o passo 1 e
reinicie.

### "Port 5173 is already in use"

O projeto já está rodando em outra janela. Feche a outra, ou rode:

```bash
npm run dev -- --port 5174
```

### A tela fica em branco

1. Aperte **F12** no navegador e abra a aba **Console**.
2. Copie a mensagem vermelha.
3. Mande para o Cauan com a mensagem copiada.

### "Cannot find module" ou erro estranho depois de dar `git pull`

Alguém adicionou uma biblioteca nova. Rode:

```bash
npm install
```

### O login não aceita a senha

Confira se você está em modo mock: deve haver o aviso amarelo "Dados fictícios"
na barra lateral e uma caixa na tela de login com as credenciais. Se não houver,
abra o `.env` e garanta que está escrito:

```bash
VITE_DATA_SOURCE=mock
```

Depois pare o servidor (**Ctrl + C**) e rode `npm run dev` de novo —
mudança no `.env` só vale depois de reiniciar.

### Quero começar com os dados de exemplo do zero

Na barra lateral, clique em **"Restaurar dados de exemplo"**.

### Nada disso resolveu

Última tentativa:

```bash
rm -rf node_modules
npm install
```

No Windows (PowerShell):

```powershell
Remove-Item -Recurse -Force node_modules
npm install
```

Se ainda assim não funcionar, chame o Cauan com: (1) o comando que você rodou,
(2) a mensagem de erro inteira, (3) o resultado de `node --version`.

---

## 10. Comandos do dia a dia

| Comando | Para quê |
| --- | --- |
| `npm run dev` | Rodar o projeto |
| `npm run check` | Verificar tudo antes de abrir um PR |
| `npm test` | Rodar os testes |
| `npm install` | Instalar dependências (depois de um `git pull`) |

---

## 11. Conectar ao banco real (opcional — Sofia e Cauan)

Só faça isto se você precisa trabalhar com o banco de verdade.

1. Peça a URL e a chave `anon` do Supabase.
2. No `.env`:

```bash
VITE_DATA_SOURCE=supabase
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

3. Reinicie (`Ctrl + C` e `npm run dev`).

Para criar o banco do zero: Supabase Studio → SQL Editor → cole e execute
`supabase/migrations/0001_fase1_schema.sql`. As instruções de convite de
usuários estão no fim do arquivo.

⚠️ Com `VITE_DATA_SOURCE=supabase` você está mexendo em **dados reais**. Não use
esse modo para experimentar.
