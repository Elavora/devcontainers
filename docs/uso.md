# Como usar a imagem

[README](../README.md) · Próximo: [Ferramentas de qualidade](ferramentas-de-qualidade.md)

## Por que usar

Cada projeto PHP da Elavora precisa do mesmo ambiente: PHP 8.3, Composer, Git e Xdebug, com um usuário sem
privilégios de root. Em vez de cada projeto montar o seu, todos usam a imagem publicada
`ghcr.io/elavora/php-dev`. Assim o ambiente é igual na máquina de cada pessoa, nos agentes e no CI, e ninguém
precisa clonar este repositório nem construir a imagem.

A imagem é só o ambiente. Ela não traz código nem dependências de nenhuma aplicação: PHPUnit e PHPStan ficam no
`require-dev` de cada projeto, e o `composer install` instala as versões que o projeto definiu. A exceção são as
ferramentas de qualidade (PHP-CS-Fixer e editorconfig-checker), que vêm na imagem a partir da `0.2.0` para que o
editor e o CI usem a mesma versão (veja [Ferramentas de qualidade](ferramentas-de-qualidade.md)), e as extensões de
PHP exigidas pelos pacotes (a partir da `0.4.0`; veja [Extensões de PHP](extensoes-php.md)).

## Visão geral

1. Escolha uma versão publicada da imagem, por exemplo `ghcr.io/elavora/php-dev:8.3-0.2.0`. As versões estão nas
   [releases do repositório](https://github.com/Elavora/devcontainers/releases): a release `0.2.0` corresponde à
   imagem `8.3-0.2.0`.
2. Coloque essa referência no `.devcontainer/devcontainer.json` do projeto.
3. Abra o projeto no container e rode os testes.

Prefira versões estáveis (`8.3-X.Y.Z`). As betas (`8.3-X.Y.Z-beta.N`) servem para testar uma mudança do ambiente
antes da estável. Para saber como as versões são criadas, veja [Versões e publicação da imagem](publicacao.md).

### Versão fixa ou `8.3-latest`

Há duas formas de apontar para a imagem:

| Referência | Quando usar | O que acontece |
| --- | --- | --- |
| `ghcr.io/elavora/php-dev:8.3-X.Y.Z` (versão fixa) | quando o projeto precisa de reprodutibilidade: todos, inclusive o CI, usam exatamente o mesmo ambiente até alguém trocar a versão num PR | a referência nunca muda de imagem |
| `ghcr.io/elavora/php-dev:8.3-latest` | quando você quer sempre a última estável, sem atualizar a versão à mão | a cada release estável, passa a apontar para a imagem nova; betas não a alteram |

O exemplo deste repositório usa a `8.3-latest`, para não ficar desatualizado: ela acompanha a última versão
estável. Fixar a versão (`8.3-X.Y.Z`) continua possível e é a melhor escolha quando o projeto precisa de
reprodutibilidade. A `8.3-latest` existe a partir da `0.3.0`.

Com a `8.3-latest`, o Docker só usa a imagem nova depois de baixá-la de novo: rode
`docker pull ghcr.io/elavora/php-dev:8.3-latest` e reconstrua o container (**Dev Containers: Rebuild Container**
no VS Code). Duas máquinas podem estar em estáveis diferentes se uma delas não baixou a imagem nova.

## Usar no VS Code (Dev Containers)

Copie [`examples/devcontainer.json`](../examples/devcontainer.json) para `.devcontainer/devcontainer.json` do
projeto. O ponto principal é o campo `image`:

```json
{
  "name": "Elavora PHP 8.3",
  "image": "ghcr.io/elavora/php-dev:8.3-latest",
  "remoteUser": "vscode",
  "postCreateCommand": "git config --global --add safe.directory \"$(pwd)\" && composer install --no-interaction --prefer-dist"
}
```

(`8.3-latest` acompanha a última versão estável, que já traz as ferramentas de qualidade. Para fixar a versão,
troque por `8.3-X.Y.Z`, por exemplo `8.3-0.2.0`, a primeira com essas ferramentas.)

Com o Docker Desktop e a extensão Dev Containers do VS Code instalados, abra o projeto e execute
**Dev Containers: Reopen in Container**. O repositório é montado no ambiente, e o Composer instala as dependências,
incluindo as de desenvolvimento. O exemplo também instala as extensões do PHP-CS-Fixer e do EditorConfig e liga a
formatação ao salvar (veja [Formatar ao salvar no VS Code](ferramentas-de-qualidade.md#formatar-ao-salvar-no-vs-code)).

No terminal do editor:

```sh
composer test
composer check
```

Esses scripts precisam existir no `composer.json` do projeto. O Skeleton já tem os dois. Bibliotecas antigas
podem ter só `composer test`.

## Usar sem editor

Na pasta do projeto, no PowerShell:

```powershell
docker run --rm --mount "type=bind,source=$($PWD.Path),target=/workspace" -w /workspace ghcr.io/elavora/php-dev:8.3-0.2.0 sh -lc 'git config --global --add safe.directory /workspace && composer install --no-interaction --prefer-dist && composer test'
```

No Linux, ajuste as permissões do bind mount ao UID de quem desenvolve. O VS Code Dev Containers faz esse ajuste
para o `remoteUser`.

## Atualizar a versão

Uma versão publicada não muda. Para receber um ambiente novo, o projeto troca a versão no campo `image`, num PR
próprio. Para consumir exatamente o mesmo artefato, fixe também o digest:
`ghcr.io/elavora/php-dev:8.3-0.2.0@sha256:<digest>`.

Quem usa `8.3-latest` não troca nada no `devcontainer.json`: basta baixar a imagem de novo e reconstruir o
container (veja [Versão fixa ou `8.3-latest`](#versão-fixa-ou-83-latest)).

## Construir a imagem localmente

Só é preciso para mudar o próprio ambiente (o `Dockerfile`, o `php.ini` ou o smoke test). Na pasta deste
repositório:

```powershell
docker build -t elavora/php-dev:8.3 .
docker run --rm elavora/php-dev:8.3 php /usr/local/share/elavora/smoke.php
```

O nome local `elavora/php-dev:8.3` continua existindo para esse uso e para rodar testes de outros repositórios
contra uma imagem ainda não publicada.

## Detalhes do ambiente

- Base: imagem oficial Microsoft Dev Containers para PHP 8.3 (Debian Bookworm), fixada por digest no
  `Dockerfile`. Atualizar a base exige alterar o `Dockerfile`. Os pacotes adicionais do Debian são resolvidos no
  build.
- Ferramentas: Composer, Git, Xdebug e a extensão `zip`. A partir da `0.2.0`, também `php-cs-fixer` (3.95.27) e
  `editorconfig-checker` (4.0.2), em `/usr/local/bin` (veja [Ferramentas de qualidade](ferramentas-de-qualidade.md)).
- Extensões de banco e cache: a partir da `0.4.0`, `pdo_mysql`, `pdo_pgsql`, `apcu` (5.1.28), `redis` (6.3.0) e
  `mongodb` (2.5.5). Veja [Extensões de PHP](extensoes-php.md).
- Usuário padrão: `vscode`, sem privilégios de root.
- Xdebug fica desativado (`XDEBUG_MODE=off`). Use `XDEBUG_MODE=debug` ou `XDEBUG_MODE=coverage` quando precisar.
- Arquitetura publicada: Linux amd64.
- Não use esta imagem em produção.

### Extensões e serviços

Desde a `0.4.0`, a imagem traz os drivers `pdo_mysql` e `pdo_pgsql` e as extensões `apcu`, `redis` e `mongodb`,
para que o `composer install` e os testes dos pacotes `api-*` rodem no CI sem instalar nada. Não há variantes da
imagem: todo projeto usa a mesma. Veja [Extensões de PHP](extensoes-php.md).

**Servidores não vêm na imagem.** MySQL, PostgreSQL, Redis e MongoDB ficam em serviços Compose separados. Os testes
que precisam deles pulam quando o servidor não existe.

Nas versões anteriores à `0.4.0` (por exemplo, `8.3-0.3.2`), as cinco extensões não existem.

As regras de estilo e formatação (configuração do PHP-CS-Fixer e `.editorconfig` base) ficam no
[`Elavora/.github`](https://github.com/Elavora/.github) e não são definidas neste repositório. Aqui ficam só as
ferramentas.

## Referência: `examples/devcontainer.json`

Conteúdo esperado (a ordem das chaves pode variar; a ordem da lista de extensões, não):

```json
{
  "name": "Elavora PHP 8.3",
  "image": "ghcr.io/elavora/php-dev:8.3-latest",
  "remoteUser": "vscode",
  "postCreateCommand": "git config --global --add safe.directory \"$(pwd)\" && composer install --no-interaction --prefer-dist",
  "customizations": {
    "vscode": {
      "extensions": [
        "xdebug.php-debug",
        "bmewburn.vscode-intelephense-client",
        "junstyle.php-cs-fixer",
        "EditorConfig.EditorConfig"
      ],
      "settings": {
        "php.validate.executablePath": "/usr/local/bin/php",
        "php-cs-fixer.executablePath": "/usr/local/bin/php-cs-fixer",
        "php-cs-fixer.config": ".php-cs-fixer.php;.php-cs-fixer.dist.php",
        "php-cs-fixer.rules": "@PER-CS",
        "php-cs-fixer.onsave": false,
        "[php]": {
          "editor.defaultFormatter": "junstyle.php-cs-fixer",
          "editor.formatOnSave": true
        }
      }
    }
  }
}
```

- O campo `image` é exatamente `ghcr.io/elavora/php-dev:8.3-latest`, a referência que acompanha a última versão
  estável (ver [Versão fixa ou `8.3-latest`](#versão-fixa-ou-83-latest)). Ela é movida a cada estável, então o
  exemplo não fica desatualizado. As ferramentas de qualidade vêm desde a `0.2.0`
  (ver [publicacao.md](publicacao.md#020-ferramentas-de-qualidade)).
- Quem precisa de reprodutibilidade troca o campo `image` no próprio projeto por uma versão fixa (`8.3-X.Y.Z`,
  como `8.3-0.2.0`). Não existem `8.3` nem `latest` puros.
- `name`, `remoteUser`, `postCreateCommand` e `php.validate.executablePath` ficam como estavam.
- `extensions` contém exatamente as quatro extensões acima, nessa ordem: as duas que já existiam e, no fim,
  `junstyle.php-cs-fixer` e `EditorConfig.EditorConfig`.
- `settings` contém exatamente as chaves acima, com estes valores:

| Chave | Valor | Por quê |
| --- | --- | --- |
| `php.validate.executablePath` | `/usr/local/bin/php` | já existia |
| `php-cs-fixer.executablePath` | `/usr/local/bin/php-cs-fixer` | usa o binário da imagem, na mesma versão do CI, e não a cópia da extensão |
| `php-cs-fixer.config` | `.php-cs-fixer.php;.php-cs-fixer.dist.php` | usa a configuração do projeto, na mesma ordem de prioridade do PHP-CS-Fixer |
| `php-cs-fixer.rules` | `@PER-CS` | só vale quando o projeto não tem configuração; é o padrão escolhido para a organização, em vez do `@PSR12` que a extensão usaria |
| `php-cs-fixer.onsave` | `false` | a formatação ao salvar vem do `editor.formatOnSave`; ligar os dois rodaria o fixer duas vezes |
| `[php]` → `editor.defaultFormatter` | `junstyle.php-cs-fixer` | o Intelephense também formata PHP; isto escolhe o PHP-CS-Fixer |
| `[php]` → `editor.formatOnSave` | `true` | formata ao salvar, só em arquivos PHP |

---

[README](../README.md) · Próximo: [Ferramentas de qualidade](ferramentas-de-qualidade.md)
