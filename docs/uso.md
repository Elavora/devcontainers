# Como usar a imagem

[README](../README.md) · Próximo: [Versões e publicação da imagem](publicacao.md)

## Por que usar

Cada projeto PHP da Elavora precisa do mesmo ambiente: PHP 8.3, Composer, Git e Xdebug, com um usuário sem
privilégios de root. Em vez de cada projeto montar o seu, todos usam a imagem publicada
`ghcr.io/elavora/php-dev`. Assim o ambiente é igual na máquina de cada pessoa, nos agentes e no CI, e ninguém
precisa clonar este repositório nem construir a imagem.

A imagem é só o ambiente. Ela não traz código nem dependências de nenhuma aplicação: PHPUnit, PHPStan e
formatadores ficam no `require-dev` de cada projeto, e o `composer install` instala as versões que o projeto
definiu.

## Visão geral

1. Escolha uma versão publicada da imagem, por exemplo `ghcr.io/elavora/php-dev:8.3-0.1.0`. As versões estão nas
   [releases do repositório](https://github.com/Elavora/devcontainers/releases): a release `0.1.0` corresponde à
   imagem `8.3-0.1.0`.
2. Coloque essa referência no `.devcontainer/devcontainer.json` do projeto.
3. Abra o projeto no container e rode os testes.

Prefira versões estáveis (`8.3-X.Y.Z`). As betas (`8.3-X.Y.Z-beta.N`) servem para testar uma mudança do ambiente
antes da estável. Para saber como as versões são criadas, veja [Versões e publicação da imagem](publicacao.md).

## Usar no VS Code (Dev Containers)

Copie [`examples/devcontainer.json`](../examples/devcontainer.json) para `.devcontainer/devcontainer.json` do
projeto. O ponto principal é o campo `image`:

```json
{
  "name": "Elavora PHP 8.3",
  "image": "ghcr.io/elavora/php-dev:8.3-0.1.0",
  "remoteUser": "vscode",
  "postCreateCommand": "git config --global --add safe.directory \"$(pwd)\" && composer install --no-interaction --prefer-dist"
}
```

(`0.1.0` é a primeira estável do fluxo atual. Use a versão estável mais recente.)

Com o Docker Desktop e a extensão Dev Containers do VS Code instalados, abra o projeto e execute
**Dev Containers: Reopen in Container**. O repositório é montado no ambiente, e o Composer instala as dependências,
incluindo as de desenvolvimento.

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
docker run --rm --mount "type=bind,source=$($PWD.Path),target=/workspace" -w /workspace ghcr.io/elavora/php-dev:8.3-0.1.0 sh -lc 'git config --global --add safe.directory /workspace && composer install --no-interaction --prefer-dist && composer test'
```

No Linux, ajuste as permissões do bind mount ao UID de quem desenvolve. O VS Code Dev Containers faz esse ajuste
para o `remoteUser`.

## Atualizar a versão

Uma versão publicada não muda. Para receber um ambiente novo, o projeto troca a versão no campo `image`, num PR
próprio. Para consumir exatamente o mesmo artefato, fixe também o digest:
`ghcr.io/elavora/php-dev:8.3-0.1.0@sha256:<digest>`.

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
- Ferramentas: Composer, Git, Xdebug e a extensão `zip`.
- Usuário padrão: `vscode`, sem privilégios de root.
- Xdebug fica desativado (`XDEBUG_MODE=off`). Use `XDEBUG_MODE=debug` ou `XDEBUG_MODE=coverage` quando precisar.
- Arquitetura publicada: Linux amd64.
- Não use esta imagem em produção.

### Extensões e serviços opcionais

A imagem atende o ambiente básico e os testes unitários do Skeleton. Redis, APCu, drivers de banco e MongoDB
entram em variantes, conforme a necessidade dos módulos. Servidores de banco e filas ficam em serviços Compose
separados.

As regras de estilo e formatação vêm de `Elavora/code-standards` e não são definidas neste repositório.

## Referência: `examples/devcontainer.json`

- O campo `image` é exatamente `ghcr.io/elavora/php-dev:8.3-0.1.0`, a primeira estável do fluxo atual (criada
  pelo merge do PR de adoção, ver [publicacao.md](publicacao.md#histórico-legado-e-primeira-versão)), e não mais o
  nome local `elavora/php-dev:8.3`.
- Não existe tag móvel (`8.3`, `8.3-latest`, `latest`): o exemplo sempre aponta para uma versão fixa.
- Os demais campos (`name`, `remoteUser`, `postCreateCommand`, `customizations.vscode.extensions` e
  `customizations.vscode.settings`) ficam como estão.

---

[README](../README.md) · Próximo: [Versões e publicação da imagem](publicacao.md)
