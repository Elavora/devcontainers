# Elavora Dev Containers

Ambiente de desenvolvimento compartilhado dos projetos PHP da Elavora.

Este repositório constrói e publica a imagem `ghcr.io/elavora/php-dev`: PHP 8.3 sobre a imagem oficial Microsoft
Dev Containers (Debian Bookworm), com Composer, Git e Xdebug, as ferramentas de qualidade PHP-CS-Fixer e
editorconfig-checker, e o usuário `vscode` sem privilégios de root. Os projetos usam essa imagem no VS Code, nos
agentes e no CI, e assim todos rodam no mesmo ambiente, com as mesmas versões das ferramentas, sem precisar clonar
este repositório.

## Começo rápido

1. Escolha uma versão estável nas [releases](https://github.com/Elavora/devcontainers/releases). A release `X.Y.Z`
   corresponde à imagem `ghcr.io/elavora/php-dev:8.3-X.Y.Z`. Fixar a versão garante que todos usam o mesmo
   ambiente. Se preferir acompanhar sempre a última estável, use `ghcr.io/elavora/php-dev:8.3-latest` (a partir
   da `0.3.0`; veja [Versão fixa ou `8.3-latest`](docs/uso.md#versão-fixa-ou-83-latest)).
2. Copie [`examples/devcontainer.json`](examples/devcontainer.json) para `.devcontainer/devcontainer.json` do
   projeto, com essa versão no campo `image`:

   ```json
   "image": "ghcr.io/elavora/php-dev:8.3-0.2.0"
   ```

3. No VS Code, execute **Dev Containers: Reopen in Container** e rode `composer test` no terminal. Os arquivos PHP
   são formatados ao salvar, com a configuração do PHP-CS-Fixer do projeto.

## Documentação

Leia nesta ordem:

1. [Como usar a imagem](docs/uso.md): usar no VS Code ou sem editor, atualizar a versão, construir localmente e o
   que vem no ambiente.
2. [Ferramentas de qualidade](docs/ferramentas-de-qualidade.md): o PHP-CS-Fixer e o editorconfig-checker da
   imagem, a formatação ao salvar no VS Code, como atualizar a versão das ferramentas e o contrato do `Dockerfile`
   e do smoke test.
3. [Versões e publicação da imagem](docs/publicacao.md): como cada PR integrado vira uma versão e uma imagem no
   GHCR, quando a `8.3-latest` é movida, quando a imagem é construída, qual label usar no PR e o contrato dos
   workflows.

As regras de versão, o catálogo de labels e as regras de formatação (configuração do PHP-CS-Fixer e `.editorconfig`
base) são comuns a toda a organização e ficam no [`Elavora/.github`](https://github.com/Elavora/.github).

## Desenvolvimento e testes

O repositório tem dois tipos de teste, separados:

- **Testes dos scripts e workflows** (`tests/*.test.cjs`): conferem `scripts/image-tags.sh`,
  `scripts/image-absent.sh`, os workflows e o exemplo. Rodam com o test runner do Node.js, dentro de um container,
  sem instalar nada na máquina. No PowerShell, na pasta do repositório:

  ```powershell
  docker run --rm -v "${PWD}:/w" -w /w node:22-alpine node --test "tests/*.test.cjs"
  ```

  Para checar a sintaxe dos workflows:

  ```powershell
  docker run --rm -v "${PWD}:/w" -w /w rhysd/actionlint:1.7.12 -color
  ```

- **Teste da imagem** (`tests/smoke.php`): roda **dentro** da imagem construída e confere PHP 8.3, as extensões,
  o Composer, o Git, o PHP-CS-Fixer, o editorconfig-checker e o usuário sem root. Ele não faz parte do
  `node --test`. Veja
  [Construir a imagem localmente](docs/uso.md#construir-a-imagem-localmente).

No CI, o workflow **Testes** roda os testes dos scripts e o actionlint em todo PR e em push na `main`
(detalhes em [publicacao.md](docs/publicacao.md#testes-githubworkflowstestyml)). O workflow da imagem constrói e
roda o `smoke.php` só nos PRs que mexem no ambiente (`Dockerfile`, `.dockerignore`, `php.ini`, `tests/smoke.php`,
`scripts/**` ou `.github/workflows/image.yml`) e na publicação de cada versão; ele não roda no push da `main` (veja
[Quando a imagem é construída](docs/publicacao.md#quando-a-imagem-é-construída)).

## Contribuindo

Mudanças entram por pull request na `main`. As labels do PR definem a próxima versão (veja
[Qual label usar no PR](docs/publicacao.md#qual-label-usar-no-pr)). Não use esta imagem em produção.
