# Retenção de dado pessoal — decisões PENDENTES

> ⚠️ **Nada aqui está decidido.** Este arquivo existe para que as perguntas não
> sejam respondidas por acidente, no meio de um commit. **Nenhum prazo legal foi
> inventado** — quem define é a gestão do CITi, e a decisão é registrada aqui
> com data e quem aprovou. Backlog: **GERAL-013**.

O que já está implementado (migration `0019`) é a **mecânica**: CPF cifrado fora
de `members`, chave só na Edge Function, trilha de auditoria de toda leitura e
escrita, remoção que apaga o CPF sem apagar a pessoa. O que falta é **política**.

---

## 1. Por quanto tempo o CPF fica depois do desligamento

**Em aberto.**

Hoje o CPF permanece indefinidamente: ninguém apaga nada sozinho, e a plataforma
não tem rotina de expurgo. Isso é o estado de fato, não uma decisão.

Para decidir, é preciso responder antes: **para que o CITi usa o CPF?** Emissão
de documento, contrato de estágio, prestação de contas, declaração? A finalidade
é que define o prazo — e sem ela qualquer número escolhido é arbitrário.

| Opção | Consequência |
| --- | --- |
| Apagar no desligamento | Mais seguro; impede emitir documento retroativo para ex-membro |
| Manter por um prazo fixo | Precisa de rotina de expurgo e de alguém conferindo |
| Manter enquanto o membro existir | É o estado atual; acumula dado sem finalidade ativa |

**Quem decide:** Diretoria de Gente e Gestão.

## 2. Quem aprova a remoção

**Em aberto.** Hoje qualquer perfil de GG pode remover o CPF de qualquer membro
(a ação exige confirmação na tela e fica na trilha de auditoria, com quem fez).

A pergunta é se remoção de dado pessoal deveria exigir **duas pessoas** ou
aprovação da diretoria. Implementar isso não é difícil; decidir se vale o atrito
é o ponto.

## 3. Processo de correção e de exclusão a pedido da pessoa

**Em aberto.** Falta definir por onde a pessoa pede, quem responde, em quanto
tempo, e como isso é registrado. A mecânica existe (editar e remover pelo
perfil); o processo, não.

## 4. Rotação das chaves

**Em aberto.** A estrutura está pronta: `member_private_data.cpf_key_version`
diz qual chave cifrou cada linha, e o segredo `CPF_KEY_VERSION` diz qual é a
atual. Uma rotação seria: subir a chave nova como versão 2, decifrar cada linha
com a versão gravada e regravar na nova.

Falta decidir: **com que frequência**, quem executa, e o que fazer se a rotação
falhar no meio (as duas chaves precisam coexistir até o fim).

⚠️ **Perder `CPF_ENCRYPTION_KEY` é perder todos os CPFs**, inclusive os do
backup. O segredo não está em lugar nenhum do repositório, e isso é intencional
— mas significa que ele precisa de um lugar seguro fora daqui. Onde, é decisão
pendente.

## 5. Recuperação em backup

**Em aberto.** O backup do Postgres contém `member_private_data` cifrado. Para
que ele sirva, a chave da época precisa existir. Portanto:

- restaurar um backup antigo exige a chave **daquela versão**;
- descartar uma chave antiga inutiliza os backups feitos com ela.

Isso precisa estar escrito antes da primeira rotação, não depois.

## 6. Procedimento de incidente

**Em aberto.** O que fazer se houver suspeita de acesso indevido. A trilha
`member_private_data_audit` responde "quem leu o CPF de quem, e quando" — é a
matéria-prima de qualquer investigação, e é por isso que **leitura** também é
auditada.

Roteiro mínimo a definir: quem é avisado, em quanto tempo, quem comunica as
pessoas afetadas, quando rotacionar chave, e quem registra o aprendizado.

---

## Consulta útil durante uma investigação

```sql
-- Quem acessou o CPF de quem, do mais recente para o mais antigo.
-- A trilha NÃO contém CPF, ciphertext, hash, chave nem JWT.
select a.created_at, a.actor_email, m.full_name, a.action, a.result, a.request_id
  from member_private_data_audit a
  left join members m on m.id = a.member_id
 order by a.created_at desc
 limit 100;
```
