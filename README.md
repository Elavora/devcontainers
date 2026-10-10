# Elavora Dev Containers

Ambientes de desenvolvimento compartilhados para os projetos da Elavora.

## Ambiente inicial

PHP 8.3 sobre a imagem oficial Microsoft Dev Containers (Debian Bookworm), Composer, Git e Xdebug. O usuário padrão é `vscode`, sem privilégios de root. Xdebug fica desativado por padrão; use `XDEBUG_MODE=debug` ou `XDEBUG_MODE=coverage` quando necessário.

PHPUnit, PHPStan e formatadores pertencem ao `require-dev` de cada projeto. `composer install` instala as versões definidas pelo projeto. Esta imagem não inclui código nem dependências de uma aplicação.

## Uso local

Na pasta deste repositório:

```powershell
docker build -t elavora/php-dev:8.3 .
docker run --rm elavora/php-dev:8.3 php /usr/local/share/elavora/smoke.php
```

Copie `examples/devcontainer.json` para `.devcontainer/devcontainer.json` do projeto PHP. Com Docker Desktop e a extensão Dev Containers do VS Code instalados, abra o projeto e execute **Dev Containers: Reopen in Container**. O repositório é montado no ambiente e o Composer instala as dependências, incluindo as de desenvolvimento.

No terminal do editor:

```sh
composer test
composer check
```

Esses scripts precisam existir no `composer.json` do projeto. O Skeleton já possui ambos. Bibliotecas antigas podem ter apenas `composer test`.

Para testar sem abrir um editor, na pasta do projeto:

```powershell
docker run --rm --mount "type=bind,source=$($PWD.Path),target=/workspace" -w /workspace elavora/php-dev:8.3 sh -lc 'git config --global --add safe.directory /workspace && composer install --no-interaction --prefer-dist && composer test'
```

No Linux, ajuste permissões do bind mount ao UID do desenvolvedor; o VS Code Dev Containers faz esse ajuste para `remoteUser`.

## Publicação e consumo compartilhado

O workflow valida builds em PRs e na main. Somente tags `v*` publicam no GHCR. Exemplo: a tag `v0.1.0` publica `ghcr.io/elavora/php-dev:8.3-v0.1.0`. Nenhuma versão foi publicada apenas por adicionar estes arquivos.

Depois de publicar a primeira versão, configure o pacote como público no GitHub Packages e substitua o campo `image` dos consumidores pela tag publicada. Assim, os consumidores não precisam clonar este repositório nem construir a imagem localmente.

A publicação usa `GITHUB_TOKEN` com `packages: write`; não requer PAT. GitHub Actions e criação de pacotes devem estar permitidos pela organização. As imagens publicadas por este workflow são Linux amd64; outras arquiteturas podem ser adicionadas posteriormente.

Mantenha tags de release sem sobrescrita. Os projetos atualizam a referência deliberadamente. A imagem base está fixada por digest; sua atualização exige alterar o Dockerfile. Os pacotes adicionais do Debian são resolvidos no build. Para consumir exatamente o mesmo artefato publicado, fixe também o digest da imagem GHCR.

## Extensões e serviços opcionais

A primeira imagem atende o ambiente básico e os testes unitários do Skeleton. Redis, APCu, drivers de banco e MongoDB devem entrar em variantes conforme a necessidade dos módulos. Servidores de banco e filas ficam em serviços Compose separados. Não use esta imagem como imagem de produção.

Regras de estilo e formatação serão consumidas de `Elavora/code-standards`; elas não são definidas neste repositório.
