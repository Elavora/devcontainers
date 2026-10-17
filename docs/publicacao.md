# Versões e publicação da imagem

[README](../README.md) · Anterior: [Como usar a imagem](uso.md)

## Por que existe este fluxo

Os projetos da Elavora usam a imagem `ghcr.io/elavora/php-dev` como ambiente de desenvolvimento. Para que cada
projeto escolha quando atualizar o ambiente, a imagem é publicada com uma **versão fixa**, e uma versão publicada
não muda depois.

Ninguém cria essas versões à mão. Toda a organização usa o mesmo fluxo automático, mantido no repositório
[`Elavora/.github`](https://github.com/Elavora/.github): quando um pull request entra na `main`, a versão nova é
calculada pelas labels do PR, a tag é criada e a imagem correspondente é publicada no GitHub Container Registry
(GHCR).

## Visão geral

```
PR integrado na main
  └─ release.yml (este repo) chama o workflow central do Elavora/.github
       └─ calcula a versão pelas labels, cria a tag e a GitHub Release
            └─ envia o evento "tag-created" para este repo
                 └─ image.yml constrói a imagem na tag, valida, confere que a versão ainda não existe e publica no GHCR
```

Um exemplo do dia a dia:

1. Um PR com a label `bug` é integrado e a última estável é `1.1.1`.
2. O fluxo central cria a tag `1.1.2-beta.1` (uma pré-release).
3. O `image.yml` publica `ghcr.io/elavora/php-dev:8.3-1.1.2-beta.1`.
4. Mais tarde, um PR com a label `release` é integrado. Sai a estável `1.1.2`, e a imagem
   `ghcr.io/elavora/php-dev:8.3-1.1.2`.

Na referência da imagem, `8.3` é a versão do PHP e o que vem depois do hífen é a versão deste repositório.

### Qual label usar no PR

| Quero... | Label |
| --- | --- |
| uma correção ou ajuste pequeno (patch) | `bug`, `refactor`, `documentation`... ou nenhuma |
| uma novidade compatível (minor) | `enhancement`, `feature` ou `improvement` |
| uma mudança incompatível (major) | `upgrade` |
| que a versão saia estável, e não beta | `release`, junto com as outras |

As regras completas estão em [`Elavora/.github/docs/versionamento.md`](https://github.com/Elavora/.github/blob/main/docs/versionamento.md),
e o catálogo de labels em [`Elavora/.github/docs/labels.md`](https://github.com/Elavora/.github/blob/main/docs/labels.md).
Esta página não as repete. Ela descreve só o que é específico do `devcontainers`.

### O que você precisa fazer à mão

- **Tornar o pacote público** (uma vez): o pacote `php-dev` nasce privado no primeiro push. Um administrador da
  organização abre `https://github.com/orgs/Elavora/packages/container/package/php-dev` > **Package settings** >
  **Change visibility** > **Public**. Enquanto ele for privado, quem consome a imagem precisa de
  `docker login ghcr.io` com um token que tenha `read:packages`.
- **Permissões da organização**: GitHub Actions e a criação de pacotes precisam estar permitidos na organização.
  A publicação usa só o `GITHUB_TOKEN`, sem PAT.
- **Primeira sincronização de labels**: depois do merge que adota este fluxo, rode o workflow
  **Sincronizar labels** manualmente (`workflow_dispatch`), para não esperar a execução semanal.

---

## Referência

As seções abaixo são o contrato dos workflows e do script. Elas são a base dos testes.

### Versão do `.github` usada

Os dois chamadores fixam a versão `1.0.0` do `Elavora/.github` pelo **SHA completo do commit** dessa tag, com a
versão em comentário na mesma linha do `uses`:

| Versão | SHA |
| --- | --- |
| `1.0.0` | `6884d27a5dc5930dceee3fe39f0b112faf5c3034` |

- O `uses` e o `automation_ref` recebem **o mesmo SHA**. Um valor diferente mistura duas versões da automação,
  porque o `automation_ref` define de onde vêm os scripts.
- Os chamadores deste repositório não usam `main`, nome de branch, tag beta nem o nome da tag (`@1.0.0`). O SHA
  impede que uma tag movida por engano mude a automação sem um PR aqui.
- Atualizar a automação é um PR que troca o SHA nas duas posições de cada chamador e o comentário de versão.

### Chamador de release: `.github/workflows/release.yml`

Substitui o `release.yml` antigo, que chamava o SHA `b1651502678ad20b6d6f01eea2f3bb480d220c72`, no mesmo caminho.
Conteúdo esperado (a ordem das chaves pode variar):

```yaml
name: Release

on:
  pull_request:
    types: [closed]
    branches: [main]

permissions:
  contents: read

jobs:
  release:
    if: github.event.pull_request.merged == true
    permissions:
      contents: write
      pull-requests: read
    uses: Elavora/.github/.github/workflows/release.yml@6884d27a5dc5930dceee3fe39f0b112faf5c3034 # 1.0.0
    with:
      automation_ref: 6884d27a5dc5930dceee3fe39f0b112faf5c3034
      package_name: elavora/devcontainers
      packagist: false
```

- Permissões no nível do workflow: só `contents: read`. As de escrita ficam no job: `contents: write` (tag e
  release) e `pull-requests: read` (levantar os PRs do intervalo).
- `packagist: false`, porque o `devcontainers` não é pacote Composer nem está no Packagist. Por isso não há bloco
  `secrets`.
- `package_name: elavora/devcontainers` aparece no título da release (exemplo: `elavora/devcontainers 0.1.0`).
- Não há outras entradas.

O workflow central só cria versão quando o PR foi integrado com base `main`. PR fechado sem merge aparece como
`skipped`.

### Chamador de labels: `.github/workflows/sync-labels.yml`

Substitui o `sync_labels.yml` antigo (com `micnncim/action-label-syncer` e o manifesto local `.github/labels.yml`).
Conteúdo esperado:

```yaml
name: Sincronizar labels

on:
  schedule:
    - cron: '17 3 * * 1'
  workflow_dispatch:

permissions:
  contents: read

jobs:
  sync:
    permissions:
      contents: read
      issues: write
    uses: Elavora/.github/.github/workflows/sync-labels.yml@6884d27a5dc5930dceee3fe39f0b112faf5c3034 # 1.0.0
    with:
      automation_ref: 6884d27a5dc5930dceee3fe39f0b112faf5c3034
```

- Sem gatilho `push`: o catálogo fica no `.github`, então nenhum arquivo local deve disparar a sincronização.
- Sem a entrada `prune`: o workflow central sempre faz prune total.
- O repositório fica com exatamente as 17 labels do catálogo da versão fixada.

Efeito da primeira sincronização aqui: `accessibility`, que não está no catálogo, é apagada; as descrições e
cores das labels existentes passam a ser as do catálogo (em português); `feature` é criada, porque ainda não
existe neste repositório.

### Workflow da imagem: `.github/workflows/image.yml`

#### Gatilhos

| Evento | O que faz |
| --- | --- |
| `pull_request` | constrói e valida a imagem; não publica |
| `push` na `main` | constrói e valida a imagem; não publica |
| `repository_dispatch` do tipo `tag-created` | constrói a imagem na tag, valida e **publica** |
| `workflow_dispatch` | constrói e valida a imagem da ref escolhida; não publica |

- O gatilho `push` de tags (`tags: ['v*']`) é **removido**. As tags agora são criadas pelo workflow central com o
  `GITHUB_TOKEN`, e tags criadas assim não disparam `push: tags`. A única via de publicação é o
  `repository_dispatch` `tag-created`.
- A condição antiga `startsWith(github.ref, 'refs/tags/v')` é removida. A publicação acontece se, e somente se,
  `github.event_name == 'repository_dispatch'`.
- `workflow_dispatch` nunca publica, mesmo quando a ref escolhida é uma tag.

#### Payload do evento

O workflow central envia `client_payload: { tag, release_id, prerelease }`. O `image.yml` usa só `tag`
(exemplos: `1.2.0`, `1.2.0-beta.3`). `prerelease` não muda a publicação: estáveis e betas publicam a imagem
versionada do mesmo jeito.

#### Passos do job

1. **Checkout**: `actions/checkout` fixado por SHA, com a versão em comentário, como no `.github`:
   `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`.
   A ref é `github.event.client_payload.tag` no `repository_dispatch` e `github.ref` nos outros eventos.
2. **Build**: `docker build --pull -t elavora/php-dev:8.3 .` (o nome local continua o mesmo).
3. **Validação**: `docker run --rm elavora/php-dev:8.3 php /usr/local/share/elavora/smoke.php`.
4. **Publicação** (só no `repository_dispatch`):
   1. A tag do payload chega ao script por variável de ambiente, nunca interpolada direto no `run`, e é passada
      para `scripts/image-tags.sh`, que valida a tag e imprime as referências da imagem (ver abaixo). Se o script
      falhar, o job falha **antes** do login no GHCR e nada é publicado.
   2. Login no `ghcr.io` com o `GITHUB_TOKEN` (via `--password-stdin`) e `github.actor`.
   3. Para **cada** referência impressa pelo `image-tags.sh`, roda `scripts/image-absent.sh <referência>` (ver
      abaixo), que confere no GHCR se a referência ainda não existe. Todas as referências são conferidas antes de
      qualquer push. Se alguma já existir, ou se a consulta der erro, o job falha e nada é enviado.
   4. Para cada referência: `docker tag elavora/php-dev:8.3 <referência>` e `docker push <referência>`.
   5. Logout do `ghcr.io` ao final, também em caso de falha (`trap ... EXIT`).

Permissões: `contents: read` no workflow; no job, `contents: read` e `packages: write`. Não há PAT. A imagem
publicada é Linux amd64.

#### Referências publicadas

Para cada tag `X.Y.Z` ou `X.Y.Z-beta.N` criada pelo fluxo central, o workflow publica
`ghcr.io/elavora/php-dev:8.3-<tag>`, sem prefixo `v`:

| Tag criada | Imagem publicada |
| --- | --- |
| `0.1.0` | `ghcr.io/elavora/php-dev:8.3-0.1.0` |
| `0.1.1-beta.1` | `ghcr.io/elavora/php-dev:8.3-0.1.1-beta.1` |
| `1.0.0` | `ghcr.io/elavora/php-dev:8.3-1.0.0` |
| `1.2.0-beta.3` | `ghcr.io/elavora/php-dev:8.3-1.2.0-beta.3` |

Não há tag móvel. Nem a estável nem a beta publicam `8.3`, `8.3-latest`, `latest` ou qualquer outra referência
que mude de imagem com o tempo: cada tag criada gera exatamente uma referência, e ela nunca é sobrescrita.

#### Script `scripts/image-tags.sh`

Script POSIX `sh`, sem dependências além do `sh` e de utilitários básicos. Roda em `node:22-alpine`, na imagem
`elavora/php-dev` e no `ubuntu-latest` do Actions. Ele não acessa a rede nem o Docker: só valida a tag e monta as
referências. Quem publica é o workflow.

```sh
$ sh scripts/image-tags.sh 1.2.0-beta.3
ghcr.io/elavora/php-dev:8.3-1.2.0-beta.3
```

- Recebe **exatamente um** argumento: a tag criada pelo fluxo central.
- Tag válida: casa com `^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-beta\.[1-9][0-9]*)?$`. É o formato
  novo do `.github`: `X.Y.Z` ou `X.Y.Z-beta.N` com `N >= 1`, sem zero à esquerda e sem `v`.
- Sucesso: imprime em stdout exatamente uma linha, `ghcr.io/elavora/php-dev:8.3-<tag>`, não imprime nada em
  stderr e sai com código 0.
- Falha: sai com código 1, imprime em stderr uma mensagem que contém o valor recebido e **nada** em stdout.

| Entrada | Resultado |
| --- | --- |
| `1.0.0` | stdout `ghcr.io/elavora/php-dev:8.3-1.0.0`, código 0 |
| `0.0.1-beta.1` | stdout `ghcr.io/elavora/php-dev:8.3-0.0.1-beta.1`, código 0 |
| `10.20.30-beta.12` | stdout `ghcr.io/elavora/php-dev:8.3-10.20.30-beta.12`, código 0 |
| `0.0.0` | stdout `ghcr.io/elavora/php-dev:8.3-0.0.0`, código 0 (formato válido) |
| `v1.0.0` | código 1 (prefixo `v` legado) |
| `v0.0.1-rc.1` | código 1 (`rc` legada) |
| `1.0.0-rc.1` | código 1 |
| `1.0.0-beta` | código 1 (sem número) |
| `1.0.0-beta.0` | código 1 (`N` começa em 1) |
| `1.0.0-beta.01` | código 1 (zero à esquerda) |
| `01.0.0` | código 1 (zero à esquerda) |
| `1.0` | código 1 |
| `latest`, `8.3` | código 1 |
| `""` (argumento vazio) | código 1 |
| `1.0.0 ` ou ` 1.0.0` (com espaço na ponta) | código 1 |
| `1.0.0`, quebra de linha, `x` (um argumento com duas linhas) | código 1 |
| `1.0.0;id` | código 1 |
| nenhum argumento | código 1 |
| dois argumentos (`1.0.0 1.0.1`) | código 1 |

O `.dockerignore` continua excluindo tudo o que não é necessário ao build, então `scripts/` não entra no contexto
da imagem.

#### Script `scripts/image-absent.sh`

Garante que uma versão publicada nunca é sobrescrita. Um build novo da mesma tag teria outro digest, porque os
pacotes do Debian são resolvidos no build. Por isso, antes do push, o workflow pergunta ao GHCR se a referência
já existe e só segue quando a resposta é, com certeza, "não existe".

```sh
$ sh scripts/image-absent.sh ghcr.io/elavora/php-dev:8.3-0.1.0
$ echo $?
0
```

Script POSIX `sh`, como o `image-tags.sh`. Ele não faz login: o workflow faz o login antes de chamá-lo.

**Comando de inspeção injetável.** O script consulta o registro rodando o comando da variável de ambiente
`IMAGE_INSPECT_CMD`, com a referência como último argumento: `$IMAGE_INSPECT_CMD <referência>`. O valor da variável
é separado em palavras pelos espaços, sem `eval`. Sem a variável, ou com ela vazia, o comando é
`docker manifest inspect`. Nos testes, `IMAGE_INSPECT_CMD` aponta para um script falso que imprime uma mensagem e
sai com o código desejado, o que permite simular cada caso sem rede nem Docker.

**Argumento.** Exatamente um, na forma `ghcr.io/elavora/php-dev:8.3-<tag>`, com `<tag>` válida pela mesma regra do
`image-tags.sh`. Com argumento ausente, vazio, a mais ou fora dessa forma, o script sai com código 2, imprime a
mensagem em stderr e **não roda** o comando de inspeção.

**Classificação da resposta.** O script guarda a saída do comando (stdout e stderr juntos) e o código de saída:

| Comando de inspeção | Significa | Código do script | Saída do script |
| --- | --- | --- | --- |
| sai com 0 | a referência **já existe** | 1 | stderr com uma mensagem que contém a referência e diz que ela já existe |
| sai com código diferente de 0, 126 e 127, e a saída contém `manifest unknown` ou `no such manifest` (sem diferenciar maiúsculas de minúsculas) | a referência **não existe** | 0 | nada em stdout nem em stderr |
| sai com 126 ou 127 (comando não encontrado ou não executável), mesmo que a saída contenha um dos textos acima | erro | 2 | stderr com uma mensagem que contém a referência e a saída do comando |
| qualquer outro código diferente de 0 (autenticação, permissão, rede, timeout, mensagem desconhecida) | erro | 2 | stderr com uma mensagem que contém a referência e a saída do comando |

Em nenhum caso o script imprime algo em stdout. O texto genérico `not found` **não** conta como "não existe",
porque aparece também em erros como `sh: docker: not found`. Na dúvida, o script trata como erro, e a publicação
para.

Exemplos, com um comando falso em `IMAGE_INSPECT_CMD`:

| O comando falso imprime | e sai com | Código do script |
| --- | --- | --- |
| `{"schemaVersion":2,...}` | 0 | 1 |
| `manifest unknown` | 1 | 0 |
| `MANIFEST_UNKNOWN: manifest unknown` | 1 | 0 |
| `no such manifest: ghcr.io/elavora/php-dev:8.3-0.1.0` | 1 | 0 |
| `unauthorized: authentication required` | 1 | 2 |
| `denied: permission_denied` | 1 | 2 |
| `Get "https://ghcr.io/v2/": dial tcp: lookup ghcr.io: no such host` | 1 | 2 |
| `sh: docker: not found` | 127 | 2 |
| `manifest unknown` | 127 | 2 |
| (nada) | 1 | 2 |

#### Reexecução e sobrescrita

- Se a publicação falhar antes do push (por exemplo, erro na consulta ou no login), use **Re-run failed jobs** na
  execução do `repository_dispatch`. Ela refaz o checkout da mesma tag e publica.
- Reexecutar uma publicação que já deu certo **falha** no `image-absent.sh`, sem enviar nada. A imagem publicada
  continua a mesma.
- Não há como republicar uma versão. Se uma imagem publicada tiver problema, a correção é um PR novo, que gera uma
  versão nova.
- O fluxo central nunca move nem apaga tags do Git; a imagem versionada segue a mesma regra.

### Arquivos removidos

| Arquivo | Motivo |
| --- | --- |
| `.github/workflows/release.yml` antigo (SHA `b165150...`) | substituído pelo chamador acima, no mesmo caminho |
| `.github/workflows/sync_labels.yml` | substituído por `.github/workflows/sync-labels.yml` |
| `.github/labels.yml` | o catálogo agora é o `.github/labels.json` do `Elavora/.github` |

Depois da mudança, `.github/workflows/` contém exatamente `image.yml`, `release.yml` e `sync-labels.yml`. Nenhum
workflow faz referência a `micnncim/action-label-syncer`, a `b1651502678ad20b6d6f01eea2f3bb480d220c72`, a
`refs/tags/v` ou a `tags: ['v*']`.

### Histórico legado e primeira versão

- A tag `v0.0.1-rc.1`, a pré-release correspondente e a imagem `ghcr.io/elavora/php-dev:8.3-v0.0.1-rc.1` foram
  publicadas pelo fluxo antigo, no merge do PR #2. Elas continuam existindo e não são apagadas.
- O fluxo novo **ignora** `rc` legadas. Para ele, este repositório ainda não tem nenhuma tag.
- Na primeira release do fluxo novo (o merge do PR que adota este fluxo):
  - o intervalo de PRs é todo o histórico first-parent da `main` (o commit inicial `fda3ae0`, sem PR, e os
    merges dos PRs #1 e #2), mais o PR do evento;
  - os PRs #1 e #2 não têm labels, então a versão depende só das labels do PR de adoção;
  - o PR de adoção recebe as labels `enhancement` + `release`, e a primeira versão é a estável **`0.1.0`**, com a
    imagem `ghcr.io/elavora/php-dev:8.3-0.1.0`. É essa referência que o `examples/devcontainer.json` usa.

Foi usada `enhancement`, e não `feature`, porque `feature` ainda não existe neste repositório e só passa a existir
depois da primeira sincronização de labels.

---

[README](../README.md) · Anterior: [Como usar a imagem](uso.md)
