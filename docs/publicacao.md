# Versões e publicação da imagem

[README](../README.md) · Anterior: [Ferramentas de qualidade](ferramentas-de-qualidade.md)

## Por que existe este fluxo

Os projetos da Elavora usam a imagem `ghcr.io/elavora/php-dev` como ambiente de desenvolvimento. Para que cada
projeto escolha quando atualizar o ambiente, cada versão da imagem é publicada com uma **referência fixa**
(`8.3-X.Y.Z`), e uma versão publicada não muda depois.

Quem prefere acompanhar sempre a última estável, sem trocar a versão à mão, usa a referência móvel `8.3-latest`.
Ela é movida a cada release estável e aponta para a mesma imagem (o mesmo digest) da versão fixa dessa release.
As betas nunca mexem nela.

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
                      └─ se a versão é estável, move também a 8.3-latest para a mesma imagem
```

Um exemplo do dia a dia:

1. Um PR com a label `bug` é integrado e a última estável é `1.1.1`. A `8.3-latest` aponta para a `8.3-1.1.1`.
2. O fluxo central cria a tag `1.1.2-beta.1` (uma pré-release).
3. O `image.yml` publica só `ghcr.io/elavora/php-dev:8.3-1.1.2-beta.1`. A `8.3-latest` continua na `8.3-1.1.1`.
4. Mais tarde, um PR com a label `release` é integrado. Sai a estável `1.1.2`: o `image.yml` publica
   `ghcr.io/elavora/php-dev:8.3-1.1.2` e move `ghcr.io/elavora/php-dev:8.3-latest` para essa mesma imagem.

Na referência da imagem, `8.3` é a versão do PHP e o que vem depois do hífen é a versão deste repositório (ou
`latest`). O `8.3` fica também na referência móvel para que uma futura imagem com outro PHP tenha a sua própria,
por exemplo `8.4-latest`.

### Quando a imagem é construída

Construir a imagem leva alguns minutos, e antes ela era construída três vezes para cada mudança: no PR, no push
na `main` e na publicação. Agora:

| Momento | O que acontece |
| --- | --- |
| PR que mexe no ambiente (`Dockerfile`, `.dockerignore`, `php.ini`, `tests/smoke.php`, `scripts/**` ou `.github/workflows/image.yml`) | constrói e roda o smoke test; não publica |
| PR que não mexe em nenhum desses arquivos (por exemplo, só docs ou testes dos scripts) | não constrói |
| push na `main` (merge do PR) | não constrói |
| publicação (`repository_dispatch` `tag-created`, depois do merge) | constrói na tag, roda o smoke test e publica |
| execução manual (`workflow_dispatch`) | constrói e roda o smoke test da ref escolhida; não publica |

Os testes dos scripts e dos workflows (`test.yml`) continuam rodando em todo PR e em push na `main`.

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

### Descrição do PR e notas da release

O PR abre com o template da organização (`Objetivo`, `Principais mudanças`, `Testes executados`, `Riscos` e
`Notas de release`). A seção `## Notas de release` é opcional: o que estiver nela, em português, substitui o título
do PR na GitHub Release. A seção termina no próximo título de nível 1 ou 2 ou na linha de atribuição dos agentes
(`🤖 Generated with ...`): essa linha e o que vem depois não entram nas notas. Detalhes em
[`Elavora/.github/docs/notas-de-release.md`](https://github.com/Elavora/.github/blob/main/docs/notas-de-release.md).
Este repositório não precisa de nenhum arquivo para isso.

### Branches `tmp/`

Trabalho não salvo sobe para `tmp/<dev>/<nome>`, e essas branches não rodam CI
([regra da organização](https://github.com/Elavora/.github/blob/main/docs/branches-temporarias.md)). Por isso,
todo gatilho `push`, `pull_request` ou `pull_request_target` dos workflows deste repositório tem **um** filtro de
branch, `branches` com nomes exatos (sem `*`, `?`, `[` ou `!` e sem `tmp/`) ou `branches-ignore` com `'tmp/**'`:

| Arquivo | Gatilho | Filtro |
| --- | --- | --- |
| `.github/workflows/image.yml` | `pull_request` (com `paths`) | `branches-ignore: ['tmp/**']` |
| `.github/workflows/test.yml` | `pull_request` | `branches-ignore: ['tmp/**']` |
| `.github/workflows/test.yml` | `push` | `branches: [main]` |
| `.github/workflows/release.yml` | `pull_request` (`types: [closed]`) | `branches: [main]` |
| `.github/workflows/sync-labels.yml` | só `schedule` e `workflow_dispatch` | fora da regra |

`repository_dispatch` e `workflow_dispatch` (no `image.yml`) também ficam fora da regra. Nenhum workflow usa
`branches` e `branches-ignore` no mesmo gatilho. Um PR de uma branch `tmp/` com destino a `main` roda o CI
normalmente: o filtro olha a branch de destino.

### `.gitattributes`

O `.gitattributes` da raiz segue o padrão da organização (o mesmo do `Elavora/.github`), para que os scripts `.sh`
e os workflows sempre tenham fim de linha LF, também no Windows, e as imagens não sejam alteradas:

```gitattributes
* text=auto eol=lf

*.bat text eol=crlf
*.cmd text eol=crlf
*.gif binary
*.ico binary
*.jpeg binary
*.jpg binary
*.pdf binary
*.png binary
*.webp binary

*.sh text eol=lf
*.yml text eol=lf
*.yaml text eol=lf
```

Não há `.gitignore` neste repositório e ele não é necessário: não existem arquivos gerados no diretório de trabalho.

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

Os dois chamadores fixam a versão `1.3.2` do `Elavora/.github` pelo **SHA completo do commit** dessa tag, com a
versão em comentário na mesma linha do `uses`:

| Versão | SHA |
| --- | --- |
| `1.3.2` | `2a6cd142f0cd3f1aac93b98d19f561d4f91e169e` |

- O `uses` é a **única** posição que carrega a versão. Os chamadores não informam `automation_ref`: desde a
  `1.1.0`, o workflow central descobre sozinho o SHA de onde foi carregado (claim `job_workflow_sha` do token
  OIDC) e baixa os scripts desse mesmo SHA. Por isso o job chamador concede `id-token: write`. Veja
  [Versão da automação](https://github.com/Elavora/.github/blob/main/docs/versao-da-automacao.md).
- Os chamadores deste repositório não usam `main`, nome de branch, tag beta nem o nome da tag (`@1.3.2`). O SHA
  impede que uma tag movida por engano mude a automação sem um PR aqui.
- Atualizar a automação é um PR que troca o SHA no `uses` de cada chamador e o comentário de versão.
- Os SHAs `6884d27a5dc5930dceee3fe39f0b112faf5c3034` (`1.0.0`) e `b1651502678ad20b6d6f01eea2f3bb480d220c72`
  (anterior à `1.0.0`) não podem aparecer em nenhum arquivo de `.github/workflows/`.
- O que mudou da `1.0.0` para a `1.3.2` e afeta estes chamadores: `automation_ref` ficou opcional (e exige
  `id-token: write` quando omitido); os workflows centrais deixaram de declarar `permissions` e herdam as do job
  chamador; `package_name` é ignorado desde a `1.2.0` (o título da release é sempre `owner/repo tag`); as notas da
  release passam a ser geradas em pt-BR e terminam na linha de atribuição (veja
  [Descrição do PR e notas da release](#descrição-do-pr-e-notas-da-release)). A entrada `packagist` e o evento
  `tag-created` (`client_payload: { tag, release_id, prerelease }`) não mudaram.

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
      id-token: write
    uses: Elavora/.github/.github/workflows/release.yml@2a6cd142f0cd3f1aac93b98d19f561d4f91e169e # 1.3.2
    with:
      packagist: false
```

- Permissões no nível do workflow: só `contents: read`. As do job: `contents: write` (tag e release),
  `pull-requests: read` (levantar os PRs do intervalo) e `id-token: write` (descobrir a versão da automação). O
  workflow central não declara `permissions`: ele herda exatamente estas.
- Sem `automation_ref` e sem `package_name` (a entrada é ignorada desde a `1.2.0`).
- `packagist: false`, porque o `devcontainers` não é pacote Composer nem está no Packagist. Por isso não há bloco
  `secrets`.
- O título da release é sempre `<dono>/<repositório> <tag>` (aqui, `Elavora/devcontainers 0.1.0`), sem depender de
  entrada.
- A única entrada é `packagist: false`.

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
      id-token: write
    uses: Elavora/.github/.github/workflows/sync-labels.yml@2a6cd142f0cd3f1aac93b98d19f561d4f91e169e # 1.3.2
```

- Sem gatilho `push`: o catálogo fica no `.github`, então nenhum arquivo local deve disparar a sincronização.
- Sem a entrada `prune`: o workflow central sempre faz prune total.
- O repositório fica com exatamente as 17 labels do catálogo da versão fixada.

Efeito da primeira sincronização aqui: `accessibility`, que não está no catálogo, é apagada; as descrições e
cores das labels existentes passam a ser as do catálogo (em português); `feature` é criada, porque ainda não
existe neste repositório.

### Workflow da imagem: `.github/workflows/image.yml`

#### Gatilhos

Bloco `on` esperado (a ordem das chaves e dos itens de `paths` pode variar; as listas podem estar na forma
`[a, b]` ou `- a`):

```yaml
on:
  pull_request:
    branches-ignore:
      - 'tmp/**'
    paths:
      - Dockerfile
      - .dockerignore
      - php.ini
      - tests/smoke.php
      - 'scripts/**'
      - .github/workflows/image.yml
  repository_dispatch:
    types: [tag-created]
  workflow_dispatch:
```

| Evento | O que faz |
| --- | --- |
| `pull_request` que altera algum arquivo de `paths` | constrói e valida a imagem; não publica |
| `pull_request` que não altera nenhum arquivo de `paths` | o workflow não roda |
| `repository_dispatch` do tipo `tag-created` | constrói a imagem na tag, valida e **publica** |
| `workflow_dispatch` | constrói e valida a imagem da ref escolhida; não publica |

- `paths` do `pull_request` tem exatamente estes seis itens: `Dockerfile`, `.dockerignore`, `php.ini`,
  `tests/smoke.php`, `scripts/**` e `.github/workflows/image.yml`. O `.dockerignore` entra porque define o que vai
  para o contexto do build e, portanto, afeta a imagem. Não há `paths-ignore` nem `branches` no `pull_request`.
- O `pull_request` tem `branches-ignore: ['tmp/**']` (e só esse filtro de branch): o PR com destino a uma branch
  `tmp/` não constrói a imagem. O GitHub não aceita `branches` e `branches-ignore` no mesmo gatilho, por isso é
  `branches-ignore`. Ele convive com `paths` no mesmo gatilho. Veja [Branches `tmp/`](#branches-tmp).
- **Não há gatilho `push`**, nem de branch nem de tag. O build que rodava no push da `main` saiu: o PR já validou a
  imagem, e a publicação constrói de novo na tag.
- Nenhum outro gatilho (`pull_request_target`, `schedule`...).
- Como os checks não são obrigatórios na `main`, um PR em que o workflow não roda pode ser integrado normalmente.
- O gatilho `push` de tags (`tags: ['v*']`) é **removido**. As tags agora são criadas pelo workflow central com o
  `GITHUB_TOKEN`, e tags criadas assim não disparam `push: tags`. A única via de publicação é o
  `repository_dispatch` `tag-created`.
- A condição antiga `startsWith(github.ref, 'refs/tags/v')` é removida. A publicação acontece se, e somente se,
  `github.event_name == 'repository_dispatch'`.
- `workflow_dispatch` nunca publica, mesmo quando a ref escolhida é uma tag.

#### Payload do evento

O workflow central envia `client_payload: { tag, release_id, prerelease }`. O `image.yml` usa só `tag`
(exemplos: `1.2.0`, `1.2.0-beta.3`). O workflow **não** lê `prerelease`: quem decide se a versão é estável ou
beta é o `image-tags.sh`, pelo formato da tag (`X.Y.Z` é estável, `X.Y.Z-beta.N` é beta). Assim a regra fica num
único lugar, testável sem o evento.

#### Passos do job

1. **Checkout**: `actions/checkout` fixado por SHA, com a versão em comentário, como no `.github`:
   `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`.
   A ref é `github.event.client_payload.tag` no `repository_dispatch` e `github.ref` nos outros eventos.
2. **Build**: `docker build --pull -t elavora/php-dev:8.3 .` (o nome local continua o mesmo).
3. **Validação**: `docker run --rm elavora/php-dev:8.3 php /usr/local/share/elavora/smoke.php`.
4. **Publicação** (só no `repository_dispatch`):
   1. A tag do payload chega ao script por variável de ambiente, nunca interpolada direto no `run`, e é passada
      para `scripts/image-tags.sh`, que valida a tag e imprime as referências da imagem, uma por linha (ver
      abaixo). A **primeira linha** é sempre a referência versionada; numa estável, a segunda é a `8.3-latest`.
      Se o script falhar, o job falha **antes** do login no GHCR e nada é publicado.
   2. Login no `ghcr.io` com o `GITHUB_TOKEN` (via `--password-stdin`) e `github.actor`.
   3. Roda `scripts/image-absent.sh` **uma única vez**, com a referência versionada (a primeira linha), antes de
      qualquer `docker tag` ou `docker push`. Se ela já existir, ou se a consulta der erro, o job falha e nada é
      enviado. A `8.3-latest` **não** passa pelo `image-absent.sh`: ela é sobrescrita de propósito. (Se passasse,
      o script sairia com 2, porque `latest` não é uma tag válida para ele.)
   4. Para cada referência, na ordem impressa pelo `image-tags.sh`: `docker tag elavora/php-dev:8.3 <referência>`
      e `docker push <referência>`. A versionada é enviada antes da `8.3-latest`, então a `latest` nunca aponta
      para uma imagem cuja versão fixa não foi publicada. As duas referências vêm da mesma imagem local, por isso
      têm o mesmo digest.
   5. Logout do `ghcr.io` ao final, também em caso de falha (`trap ... EXIT`). A posição do `trap` em relação
      ao login é livre (antes ou depois do `docker login`), desde que o logout aconteça sempre que o passo de
      publicação terminar, com sucesso ou falha.

   Um `run` que cumpre esse contrato:

   ```sh
   set -eu
   # Valida a tag antes do login: se falhar, nada é publicado.
   refs=$(sh scripts/image-tags.sh "$RELEASE_TAG")
   version_ref=$(printf '%s\n' "$refs" | sed -n 1p)
   trap 'docker logout ghcr.io' EXIT
   printf '%s' "$GH_TOKEN" | docker login ghcr.io -u "$GH_ACTOR" --password-stdin
   # Só a versionada não pode existir; a 8.3-latest é sobrescrita de propósito.
   sh scripts/image-absent.sh "$version_ref"
   for ref in $refs; do
     docker tag elavora/php-dev:8.3 "$ref"
     docker push "$ref"
   done
   ```

   Fora de comentários, o texto `latest` não aparece no `image.yml`: a referência móvel vem só do
   `image-tags.sh`. A única exceção é o rótulo do runner, `runs-on: ubuntu-latest`, que não é referência de
   imagem. A chamada ao `image-absent.sh` não fica dentro do laço `for` que percorre as referências.

   O `run` da publicação é **POSIX `sh`**: não usa recursos exclusivos do bash (arrays, `[[ ]]`, `pipefail`,
   `<<<`, `$'...'`). Ele precisa funcionar ao ser executado com `sh -e` (o ash do busybox no `node:22-alpine`, onde
   os testes o rodam com `docker` e scripts falsos), além do bash do runner do Actions.

Permissões: `contents: read` no workflow; no job, `contents: read` e `packages: write`. Não há PAT. A imagem
publicada é Linux amd64.

#### Referências publicadas

Para cada tag `X.Y.Z` ou `X.Y.Z-beta.N` criada pelo fluxo central, o workflow publica
`ghcr.io/elavora/php-dev:8.3-<tag>`, sem prefixo `v`. Quando a tag é estável (`X.Y.Z`), publica também
`ghcr.io/elavora/php-dev:8.3-latest`, apontando para a mesma imagem:

| Tag criada | Tipo | Referências publicadas |
| --- | --- | --- |
| `0.3.0` | estável | `ghcr.io/elavora/php-dev:8.3-0.3.0` e `ghcr.io/elavora/php-dev:8.3-latest` |
| `0.3.1-beta.1` | beta | só `ghcr.io/elavora/php-dev:8.3-0.3.1-beta.1`; a `8.3-latest` não muda |
| `1.0.0` | estável | `ghcr.io/elavora/php-dev:8.3-1.0.0` e `ghcr.io/elavora/php-dev:8.3-latest` |
| `1.2.0-beta.3` | beta | só `ghcr.io/elavora/php-dev:8.3-1.2.0-beta.3`; a `8.3-latest` não muda |

Regras:

- A referência versionada (`8.3-<tag>`) nunca é sobrescrita: o `image-absent.sh` impede publicar uma tag que já
  existe.
- A `8.3-latest` é a **única** referência móvel e é sobrescrita de propósito a cada estável. Não há `8.3`,
  `latest` puro, `8.3-beta` nem outra referência móvel.
- Depois de uma publicação estável, `8.3-latest` e `8.3-<tag>` têm o mesmo digest.
- A `8.3-latest` só passa a existir na primeira estável publicada depois desta mudança (a `0.3.0`). As versões
  anteriores (`0.1.0`, `0.2.0`) não são republicadas.

#### Script `scripts/image-tags.sh`

Script POSIX `sh`, sem dependências além do `sh` e de utilitários básicos. Roda em `node:22-alpine`, na imagem
`elavora/php-dev` e no `ubuntu-latest` do Actions. Ele não acessa a rede nem o Docker: só valida a tag e monta as
referências. Quem publica é o workflow.

```sh
$ sh scripts/image-tags.sh 1.2.0
ghcr.io/elavora/php-dev:8.3-1.2.0
ghcr.io/elavora/php-dev:8.3-latest

$ sh scripts/image-tags.sh 1.2.0-beta.3
ghcr.io/elavora/php-dev:8.3-1.2.0-beta.3
```

- Recebe **exatamente um** argumento: a tag criada pelo fluxo central.
- Tag válida: casa com `^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-beta\.[1-9][0-9]*)?$`. É o formato
  novo do `.github`: `X.Y.Z` ou `X.Y.Z-beta.N` com `N >= 1`, sem zero à esquerda e sem `v`.
- Tag **estável** é a que não tem sufixo (`X.Y.Z`). Tag **beta** é a que tem `-beta.N`.
- Sucesso com tag estável: imprime em stdout exatamente **duas** linhas, nesta ordem, cada uma terminada por
  quebra de linha:
  1. `ghcr.io/elavora/php-dev:8.3-<tag>`
  2. `ghcr.io/elavora/php-dev:8.3-latest`

  Não imprime nada em stderr e sai com código 0.
- Sucesso com tag beta: imprime em stdout exatamente **uma** linha, `ghcr.io/elavora/php-dev:8.3-<tag>`,
  terminada por quebra de linha. Nunca imprime a `8.3-latest`. Não imprime nada em stderr e sai com código 0.
- A primeira linha é sempre a referência versionada. É nela que o workflow roda o `image-absent.sh`.
- Falha: sai com código 1, imprime em stderr uma mensagem que contém o valor recebido e **nada** em stdout (nem a
  `8.3-latest`).

| Entrada | Resultado |
| --- | --- |
| `1.0.0` | stdout `ghcr.io/elavora/php-dev:8.3-1.0.0` e `ghcr.io/elavora/php-dev:8.3-latest` (duas linhas), código 0 |
| `0.3.0` | stdout `ghcr.io/elavora/php-dev:8.3-0.3.0` e `ghcr.io/elavora/php-dev:8.3-latest` (duas linhas), código 0 |
| `0.0.0` | stdout `ghcr.io/elavora/php-dev:8.3-0.0.0` e `ghcr.io/elavora/php-dev:8.3-latest` (duas linhas), código 0 (formato válido) |
| `0.0.1-beta.1` | stdout só `ghcr.io/elavora/php-dev:8.3-0.0.1-beta.1` (uma linha), código 0 |
| `10.20.30-beta.12` | stdout só `ghcr.io/elavora/php-dev:8.3-10.20.30-beta.12` (uma linha), código 0 |
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
mensagem em stderr e **não roda** o comando de inspeção. Isso vale também para
`ghcr.io/elavora/php-dev:8.3-latest`: o script não muda com a referência móvel, e `latest` continua sendo
argumento inválido (código 2, sem rodar a inspeção). O workflow nunca o chama com ela.

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
  continua a mesma, e a `8.3-latest` também.
- Se o push da versionada der certo e o da `8.3-latest` falhar, a reexecução também para no `image-absent.sh`,
  porque a versionada já existe. A versão fixa fica correta, e a `8.3-latest` continua na estável anterior até a
  próxima publicação estável.
- Não há como republicar uma versão. Se uma imagem publicada tiver problema, a correção é um PR novo, que gera uma
  versão nova.
- O fluxo central nunca move nem apaga tags do Git; a imagem versionada segue a mesma regra.

### Testes: `.github/workflows/test.yml`

Os testes dos scripts e dos workflows rodam num workflow próprio, separado do `image.yml`. Assim, uma falha nos
testes aparece com nome próprio no PR e não depende do build da imagem, e o arquivo segue o mesmo modelo do
`test.yml` do `Elavora/.github`. O `image.yml` continua com o build e o `smoke.php`, sem mudança por causa disso.

Conteúdo esperado (a ordem das chaves pode variar):

```yaml
name: Testes

on:
  pull_request:
    branches-ignore:
      - 'tmp/**'
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  tests:
    name: node --test e actionlint
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - name: Testes dos scripts e workflows
        run: docker run --rm -v "$PWD:/w:ro" -w /w node:22-alpine node --test "tests/*.test.cjs"

      - name: actionlint
        run: docker run --rm -v "$PWD:/w:ro" -w /w rhysd/actionlint:1.7.12 -color
```

- Gatilhos: todo `pull_request` cujo destino não seja uma branch `tmp/` (`branches-ignore: ['tmp/**']`) e `push` na
  `main` (`branches: [main]`). Não roda em `repository_dispatch` nem em `workflow_dispatch`.
- Permissões: só `contents: read`, sem permissões no job além dessa. O checkout não persiste credenciais.
- O job se chama `tests`.
- `node:22-alpine` roda `node --test "tests/*.test.cjs"`. O `tests/smoke.php` não entra: ele é o teste da imagem e
  roda no `image.yml`, dentro da imagem construída.
- O actionlint é a imagem `rhysd/actionlint:1.7.12`, fixada nessa versão, como no `.github`.
- O repositório é montado só para leitura (`:ro`) nos dois passos.

Para rodar localmente, no PowerShell, na pasta do repositório (o mesmo comando, montando sem `:ro`):

```powershell
docker run --rm -v "${PWD}:/w" -w /w node:22-alpine node --test "tests/*.test.cjs"
docker run --rm -v "${PWD}:/w" -w /w rhysd/actionlint:1.7.12 -color
```

No Git Bash, a conversão automática de caminhos quebra o `-v`; use o PowerShell.

### Arquivos removidos

| Arquivo | Motivo |
| --- | --- |
| `.github/workflows/release.yml` antigo (SHA `b165150...`) | substituído pelo chamador acima, no mesmo caminho |
| `.github/workflows/sync_labels.yml` | substituído por `.github/workflows/sync-labels.yml` |
| `.github/labels.yml` | o catálogo agora é o `.github/labels.json` do `Elavora/.github` |

Depois da mudança, `.github/workflows/` contém exatamente `image.yml`, `release.yml`, `sync-labels.yml` e
`test.yml`. Nenhum
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
    imagem `ghcr.io/elavora/php-dev:8.3-0.1.0`. O `examples/devcontainer.json` usou essa referência até a
    `0.2.0`.

Foi usada `enhancement`, e não `feature`, porque `feature` ainda não existe neste repositório e só passa a existir
depois da primeira sincronização de labels.

### 0.2.0: ferramentas de qualidade

- O PR que adiciona o PHP-CS-Fixer e o editorconfig-checker à imagem (branch `feat/ferramentas-qualidade`, ver
  [Ferramentas de qualidade](ferramentas-de-qualidade.md)) recebe as labels `enhancement` + `release`.
- A última estável é `0.1.0` e não há beta depois dela. Se nenhum outro PR entrar antes, o merge desse PR gera
  a estável **`0.2.0`**, com a imagem `ghcr.io/elavora/php-dev:8.3-0.2.0`.
- O `examples/devcontainer.json` passa a usar `ghcr.io/elavora/php-dev:8.3-0.2.0` nesse mesmo PR. Até o merge,
  essa imagem ainda não existe no GHCR.
- O PR não muda os workflows, os scripts nem a versão fixada do `Elavora/.github`.

### 0.3.0: tag `8.3-latest` e regras de build

Esta versão revoga a regra anterior de "nenhuma tag móvel", por decisão do usuário em 2026-10-17.

- O PR da branch `feat/tag-latest-e-regras-build` recebe as labels `enhancement` + `release`.
- A última estável é `0.2.0`. Se nenhum outro PR entrar antes, o merge gera a estável **`0.3.0`**, com as
  imagens `ghcr.io/elavora/php-dev:8.3-0.3.0` e `ghcr.io/elavora/php-dev:8.3-latest` (a primeira publicação da
  `latest`).
- Mudam o `image.yml` (gatilhos e passo de publicação) e o `scripts/image-tags.sh` (duas linhas na estável). O
  `image-absent.sh`, o `Dockerfile`, o `php.ini`, o smoke test, o `test.yml`, os chamadores do `Elavora/.github` e a
  versão fixada dele não mudam.
- O conteúdo da imagem é o mesmo da `0.2.0`, por isso o `examples/devcontainer.json` continua em
  `ghcr.io/elavora/php-dev:8.3-0.2.0`.
- Este PR altera `scripts/` e o `image.yml`, então o build da imagem roda no próprio PR.

---

[README](../README.md) · Anterior: [Ferramentas de qualidade](ferramentas-de-qualidade.md)
