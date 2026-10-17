# Elavora Dev Containers

Ambiente de desenvolvimento compartilhado dos projetos PHP da Elavora.

Este repositório constrói e publica a imagem `ghcr.io/elavora/php-dev`: PHP 8.3 sobre a imagem oficial Microsoft
Dev Containers (Debian Bookworm), com Composer, Git e Xdebug, e o usuário `vscode` sem privilégios de root. Os
projetos usam essa imagem no VS Code, nos agentes e no CI, e assim todos rodam no mesmo ambiente sem precisar
clonar este repositório.

## Começo rápido

1. Escolha uma versão estável nas [releases](https://github.com/Elavora/devcontainers/releases). A release `X.Y.Z`
   corresponde à imagem `ghcr.io/elavora/php-dev:8.3-X.Y.Z`.
2. Copie [`examples/devcontainer.json`](examples/devcontainer.json) para `.devcontainer/devcontainer.json` do
   projeto, com essa versão no campo `image`:

   ```json
   "image": "ghcr.io/elavora/php-dev:8.3-0.1.0"
   ```

3. No VS Code, execute **Dev Containers: Reopen in Container** e rode `composer test` no terminal.

## Documentação

Leia nesta ordem:

1. [Como usar a imagem](docs/uso.md): usar no VS Code ou sem editor, atualizar a versão, construir localmente e o
   que vem no ambiente.
2. [Versões e publicação da imagem](docs/publicacao.md): como cada PR integrado vira uma versão e uma imagem no
   GHCR, qual label usar no PR e o contrato dos workflows.

As regras de versão e o catálogo de labels são comuns a toda a organização e ficam no
[`Elavora/.github`](https://github.com/Elavora/.github).

## Contribuindo

Mudanças entram por pull request na `main`. As labels do PR definem a próxima versão (veja
[Qual label usar no PR](docs/publicacao.md#qual-label-usar-no-pr)). Não use esta imagem em produção.
