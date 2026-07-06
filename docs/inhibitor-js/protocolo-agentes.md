# Protocolo de trabalho paralelo

Copie este arquivo para `docs/inhibitor-js/protocolo-agentes.md` no repositório, ajuste os
caminhos, e mande todo agente lê-lo antes da primeira edição. Ele é o contrato que permite
cinco agentes escreverem no mesmo repositório sem se atropelar.

---

## 1. Cada agente trabalha num worktree próprio

```bash
REPO=<caminho do repositório>
WT=<caminho>/wt/<slug-do-agente>

git -C "$REPO" worktree add -b <branch> "$WT" main
cp "$REPO/.env" "$WT/.env"          # o .env não é versionado
cd "$WT" && pnpm install             # ou o gerenciador do projeto
```

O worktree isola o trabalho sem exigir clone completo. O `.env` precisa ser copiado à mão
justamente porque não está no git — sem ele o agente não sobe o sistema e conclui, errado,
que o ambiente está quebrado.

**Ninguém roda `git checkout`, `git reset` ou `git rebase` no diretório principal.** Ele é o
ponto de integração e está em uso.

---

## 2. Fronteira de arquivos

Cada agente recebe uma lista de caminhos que são dele. Escrever só ali.

Precisa de mudança fora da fronteira? Duas opções, nesta ordem:

1. Se for pequena e óbvia (um tipo exportado a mais, um campo num schema compartilhado),
   faça e diga no relatório.
2. Se for grande ou arriscada (renomear algo compartilhado, mudar assinatura que outros
   consomem), **não faça** — descreva no relatório e siga com o resto.

Os pontos de registro (barril do schema, arquivo de rotas, mapa de navegação) já vêm
preenchidos pela fundação. Se precisar mesmo mexer num deles, mexa na menor linha possível.

---

## 3. Antes de commitar

Rode só o que cobre o que você mexeu:

```bash
pnpm typecheck
pnpm test -- <seus-testes>
```

Nunca silencie o gate para passar. Supressão só com motivo e prazo.

---

## 4. Commit

Um commit por tarefa concluída, ou por passo coeso se a tarefa for longa.

Mensagem no idioma do repositório, com uma linha de assunto que diga o **efeito** (não
"feat: add x"), linha em branco, e um corpo explicando **por quê** — o que estava errado, o
que a alternativa custaria.

---

## 5. Merge, sempre com o lock

Ao terminar **cada** tarefa, integre. Dois merges simultâneos no mesmo diretório corrompem o
índice, então o merge é serializado por um lock de diretório (`mkdir` é atômico):

```bash
LOCK=/tmp/inhibitor-js-merge.lock

for i in $(seq 1 120); do mkdir "$LOCK" 2>/dev/null && break || sleep 5; done

# 1. traga a main para a sua branch e resolva o conflito AQUI, no seu worktree
git -C "$WT" merge --no-edit main

# 2. só então integre
git -C "$REPO" merge --no-ff --no-edit -m "Integra <branch>: <o que entrou>" <branch>

rmdir "$LOCK"
```

Se o passo 1 der conflito: resolva mantendo **as duas** contribuições (é quase sempre um
barril ou um array de registro), rode os checks de novo e só então siga.
Se o passo 2 falhar, **desfaça** (`git merge --abort`), solte o lock e relate — nunca deixe o
diretório de integração em estado de merge pela metade.

Solte o lock mesmo em caso de erro.

---

## 6. Verificar de verdade

Compilar não é verificar. Suba o sistema e exercite o que você escreveu:

- **SDK**: execute testes reais no navegador e confira snapshots/requests.
- **playground**: abra a tela num navegador de verdade. Use o Chrome já instalado
  (`channel: "chrome"`) em vez de baixar um próprio, instale a ferramenta como dependência
  temporária e **não a commite** — a menos que a tarefa peça uma suíte permanente.
- **fluxo completo**: percorra como um usuário faria, sem atalho por API.

Descreva no relatório **o que você viu**, não o que deveria acontecer.

---

## 7. Quando travar

Se algo do ambiente bloquear — porta ocupada, limite de requisições, servidor fora do ar,
dependência que não instala — **relate ao coordenador**. Não contorne por conta própria
(baixar um limite de segurança, trocar de credencial, desligar uma verificação) e não fique
esperando: você é síncrono e nenhuma notificação vai chegar.

Se você disparou algo em segundo plano, rode em primeiro plano e leia a saída, ou quebre em
pedaços curtos.

---

## 8. Relatório final

Termine dizendo, em poucas linhas:

- o que ficou pronto, por tarefa;
- o que **não** ficou, e por quê;
- decisões que valem registro (o coordenador é quem escreve no arquivo de decisões — só
  relate);
- o que o próximo agente precisa saber: contrato de API que você criou, nomes de funções e
  hooks que ele vai consumir, formato de resposta.

Não invente que passou no gate se não rodou. Não marque tarefa como pronta com teste vermelho.
