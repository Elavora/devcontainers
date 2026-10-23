# Ferramentas de qualidade

[README](../README.md) · Anterior: [Como usar a imagem](uso.md) · Próximo: [Versões e publicação da imagem](publicacao.md)

## Por que estão na imagem

Os projetos PHP da Elavora seguem o mesmo pipeline de qualidade: o código é formatado ao salvar no editor e, no
PR, o CI formata de novo e confere o `.editorconfig`, mesmo que a pessoa não tenha usado o devcontainer. Para que
o editor e o CI cheguem ao mesmo resultado, os dois precisam rodar **a mesma versão** das ferramentas.

Por isso, a partir da versão `0.2.0`, a imagem `ghcr.io/elavora/php-dev` traz duas ferramentas, com versão fixa:

| Ferramenta | Para que serve | Versão | Comando |
| --- | --- | --- | --- |
| [PHP-CS-Fixer](https://github.com/PHP-CS-Fixer/PHP-CS-Fixer) | formata o código PHP segundo as regras do projeto | `3.95.27` | `php-cs-fixer` |
| [editorconfig-checker](https://github.com/editorconfig-checker/editorconfig-checker) | confere se os arquivos respeitam o `.editorconfig` (indentação, fim de linha, espaços no fim...) | `4.0.2` | `editorconfig-checker` |

Este repositório entrega **só as ferramentas**. As regras de formatação (a configuração base do PHP-CS-Fixer, no
padrão PER-CS, e o `.editorconfig` base) ficam versionadas no [`Elavora/.github`](https://github.com/Elavora/.github),
junto com o workflow de qualidade que o CI dos projetos usa.

## Visão geral

```
Elavora/.github             → regras (.php-cs-fixer, .editorconfig) e workflow de qualidade do CI
Elavora/devcontainers       → imagem php-dev com php-cs-fixer e editorconfig-checker em versão fixa
projeto (api-*, skeleton)   → usa a imagem no devcontainer e no CI, e traz a config de regras na raiz
```

No dia a dia:

1. O projeto usa `ghcr.io/elavora/php-dev:8.3-latest` (que acompanha a última estável) no
   `.devcontainer/devcontainer.json`. Se preferir fixar a versão, use `8.3-0.2.0` ou mais nova.
2. Ao salvar um arquivo PHP no VS Code, a extensão do PHP-CS-Fixer roda o `php-cs-fixer` da imagem com a
   configuração do projeto, e a extensão EditorConfig aplica o `.editorconfig` enquanto se edita.
3. No PR, o CI roda as mesmas ferramentas, da mesma imagem.

## Usar no terminal

Dentro do container, na raiz do projeto:

```sh
php-cs-fixer fix --dry-run --diff   # mostra o que seria alterado, sem alterar
php-cs-fixer fix                    # formata os arquivos
editorconfig-checker                # confere todos os arquivos contra o .editorconfig
```

O `php-cs-fixer` lê a configuração do projeto (`.php-cs-fixer.php` ou `.php-cs-fixer.dist.php`, na raiz). O
`editorconfig-checker` lê o `.editorconfig` do projeto.

O projeto não precisa colocar o PHP-CS-Fixer no `require-dev`. Se colocar, o editor e o CI continuam usando o da
imagem, e as duas versões podem dar resultados diferentes. Outras ferramentas de desenvolvimento, como PHPUnit e
PHPStan, continuam no `require-dev` de cada projeto.

## Formatar ao salvar no VS Code

O [`examples/devcontainer.json`](../examples/devcontainer.json) já vem configurado. Ele instala duas extensões no
container, além das que já existiam:

- **`junstyle.php-cs-fixer`**: formata arquivos PHP com o `php-cs-fixer` da imagem (`/usr/local/bin/php-cs-fixer`),
  e não com uma cópia própria da extensão. Ela procura a configuração do projeto na raiz, primeiro
  `.php-cs-fixer.php` e depois `.php-cs-fixer.dist.php`, a mesma ordem que o PHP-CS-Fixer usa.
- **`EditorConfig.EditorConfig`**: aplica o `.editorconfig` do projeto no editor (indentação, fim de linha,
  linha final).

Para arquivos PHP, o formatador padrão passa a ser o PHP-CS-Fixer, e o VS Code formata ao salvar. Se o projeto
ainda não tiver arquivo de configuração, a extensão usa o padrão `@PER-CS`, o mesmo escolhido para a organização.

Projetos que já têm `.devcontainer/devcontainer.json` copiam as mudanças do exemplo ao trocar a versão da imagem.
O contrato exato do exemplo está em [Referência: `examples/devcontainer.json`](uso.md#referência-examplesdevcontainerjson).

## Atualizar a versão de uma ferramenta

Uma versão nova de ferramenta é uma versão nova da imagem: um PR neste repositório que muda o `Dockerfile` e o
`tests/smoke.php`, e os projetos recebem a mudança quando trocam a versão da imagem.

1. Escolha a versão na página de releases da ferramenta. Prefira uma publicada há pelo menos duas semanas.
2. Pegue o SHA-256 do arquivo que a imagem baixa. O GitHub mostra esse valor (`digest`) em cada arquivo da
   release:

   ```powershell
   & "C:\Program Files\GitHub CLI\gh.exe" api repos/PHP-CS-Fixer/PHP-CS-Fixer/releases/tags/v3.95.27 --jq '.assets[] | select(.name == "php-cs-fixer.phar") | .digest'
   & "C:\Program Files\GitHub CLI\gh.exe" api repos/editorconfig-checker/editorconfig-checker/releases/tags/v4.0.2 --jq '.assets[] | select(.name == "editorconfig-checker-linux-amd64.tar.gz") | .digest'
   ```

   O editorconfig-checker também publica o `checksums.txt` na release, com o mesmo valor.
3. Troque a versão e o SHA-256 nos `ARG` do `Dockerfile` e a versão esperada no `tests/smoke.php`.
4. Construa e rode o smoke test (veja [Construir a imagem localmente](uso.md#construir-a-imagem-localmente)).

Uma versão nova do PHP-CS-Fixer pode mudar a formatação de código que já estava formatado. Diga isso na descrição
do PR, para quem atualizar a imagem nos projetos saber que pode surgir um commit `style:`.

---

## Referência

As seções abaixo são o contrato do `Dockerfile` e do smoke test. Elas são a base dos testes.

### Instalação no `Dockerfile`

**Forma de instalação.** As duas ferramentas são baixadas como arquivo pronto da release oficial no GitHub e
conferidas por SHA-256 antes de instalar. O PHP-CS-Fixer usa o PHAR, e não `composer global require`, porque o PHAR
é um arquivo só, com as dependências embutidas: não há resolução de dependências no build, o checksum cobre tudo o
que é instalado e nada se mistura com o `vendor/` do projeto.

**Versões e checksums**, declarados como `ARG` no `Dockerfile`, um por linha, exatamente com estes nomes e valores
padrão:

```dockerfile
ARG PHP_CS_FIXER_VERSION=3.95.27
ARG PHP_CS_FIXER_SHA256=47231757eefdd08778e2bd047d98a63dfaad881006c8c1d1bc870d63be7f6a9b
ARG EDITORCONFIG_CHECKER_VERSION=4.0.2
ARG EDITORCONFIG_CHECKER_SHA256=44efaef3ed14c6ab52eb87481d78e5e5c204796dccf26e2f4598a61ba17f8003
```

**Origem dos arquivos**, montada a partir dos `ARG` (com `${...}`, sem repetir a versão literal na URL):

| Ferramenta | URL |
| --- | --- |
| PHP-CS-Fixer | `https://github.com/PHP-CS-Fixer/PHP-CS-Fixer/releases/download/v${PHP_CS_FIXER_VERSION}/php-cs-fixer.phar` |
| editorconfig-checker | `https://github.com/editorconfig-checker/editorconfig-checker/releases/download/v${EDITORCONFIG_CHECKER_VERSION}/editorconfig-checker-linux-amd64.tar.gz` |

O `.tar.gz` do editorconfig-checker `4.0.2` traz o executável `editorconfig-checker` na raiz do arquivo, junto com
`README.md`, `LICENSE` e `CHANGELOG.md`, que não são instalados.

**Regras:**

- O download usa o `curl` que já vem na imagem base, com falha em erro HTTP (`-f`). Nenhum pacote do Debian é
  adicionado: a linha do `apt-get install` continua só com `libzip-dev unzip`.
- Cada arquivo baixado é conferido com `sha256sum -c` contra o `ARG` correspondente **antes** de ser instalado. Se
  o checksum não bater, o comando falha e o build para. Não há outra forma de verificação (sem GPG).
- Destinos, com modo `0755`, dono `root` e executáveis pelo usuário `vscode`:
  - o PHAR em `/usr/local/bin/php-cs-fixer` (sem extensão; o PHAR já tem o shebang `#!/usr/bin/env php`);
  - o executável do editorconfig-checker em `/usr/local/bin/editorconfig-checker`.
- Nenhum outro nome é criado (nem `ec`, nem `php-cs-fixer.phar`).
- A instalação roda como `root`, depois do `apt-get` e antes do `USER vscode`.
- Os arquivos temporários (o PHAR baixado, o `.tar.gz` e o que foi extraído) são apagados no mesmo `RUN`.
- A imagem base, o `php.ini`, o `ENV XDEBUG_MODE=off`, o `WORKDIR`, o `CMD` e o `.dockerignore` não mudam.
- A arquitetura continua só Linux amd64. O PHAR independe de arquitetura, mas o editorconfig-checker é o binário
  `linux-amd64`.

Forma esperada (os nomes dos arquivos temporários e a ordem dos comandos dentro do `RUN` podem variar):

```dockerfile
RUN set -eu; \
    tmp="$(mktemp -d)"; \
    curl -fsSL -o "$tmp/php-cs-fixer.phar" \
      "https://github.com/PHP-CS-Fixer/PHP-CS-Fixer/releases/download/v${PHP_CS_FIXER_VERSION}/php-cs-fixer.phar"; \
    echo "${PHP_CS_FIXER_SHA256}  $tmp/php-cs-fixer.phar" | sha256sum -c -; \
    install -m 0755 "$tmp/php-cs-fixer.phar" /usr/local/bin/php-cs-fixer; \
    curl -fsSL -o "$tmp/editorconfig-checker.tar.gz" \
      "https://github.com/editorconfig-checker/editorconfig-checker/releases/download/v${EDITORCONFIG_CHECKER_VERSION}/editorconfig-checker-linux-amd64.tar.gz"; \
    echo "${EDITORCONFIG_CHECKER_SHA256}  $tmp/editorconfig-checker.tar.gz" | sha256sum -c -; \
    tar -xzf "$tmp/editorconfig-checker.tar.gz" -C "$tmp" editorconfig-checker; \
    install -m 0755 "$tmp/editorconfig-checker" /usr/local/bin/editorconfig-checker; \
    rm -rf "$tmp"
```

### Smoke test: `tests/smoke.php`

O smoke test roda dentro da imagem construída, como o usuário `vscode`, no `image.yml`
(`docker run --rm elavora/php-dev:8.3 php /usr/local/share/elavora/smoke.php`). O comando e o workflow não mudam.
Ele continua fazendo tudo o que já fazia (PHP 8.3, extensões, Composer, Git, usuário sem root) e passa a conferir
também as duas ferramentas:

| Verificação | Comando | Passa quando |
| --- | --- | --- |
| PHP-CS-Fixer no PATH, na versão fixada | `php-cs-fixer --version` | sai com 0 e a saída contém `3.95.27` |
| editorconfig-checker no PATH, na versão fixada | `editorconfig-checker --version` | sai com 0 e a saída contém `4.0.2` |
| PHP-CS-Fixer funciona | `php-cs-fixer fix --dry-run --using-cache=no --rules=@PER-CS <arquivo>`, com um arquivo temporário cujo conteúdo é `<?php` + quebra de linha + `if(true){echo 1;}` + quebra de linha | sai com **8** (o código do PHP-CS-Fixer para "há arquivos a corrigir" em `--dry-run`) e o arquivo continua igual ao original |
| editorconfig-checker acusa erro | num diretório temporário com o `.editorconfig` abaixo, rodar `editorconfig-checker ruim.php` com o diretório como diretório atual; `ruim.php` contém um TAB, `x` e uma quebra de linha | sai com código diferente de 0 |
| editorconfig-checker aceita arquivo correto | no mesmo diretório, `editorconfig-checker bom.php`; `bom.php` contém `x` e uma quebra de linha | sai com 0 |

`.editorconfig` usado no teste:

```ini
root = true

[*]
indent_style = space
```

Regras:

- Os comandos são chamados pelo nome, sem caminho, para provar que estão no PATH.
- As versões esperadas ficam escritas no próprio `smoke.php`, e não lidas do `Dockerfile`: se alguém trocar o `ARG`
  sem atualizar o smoke test, o build da imagem falha. As duas mudam juntas.
- As regras `@PER-CS` no teste só provam que o PHP-CS-Fixer formata. Elas não são a configuração dos projetos.
- Os arquivos temporários ficam em `sys_get_temp_dir()` e são apagados ao final, com sucesso ou falha.
- Em qualquer falha, o script lança `RuntimeException` com uma mensagem que contém o nome da ferramenta
  (`php-cs-fixer` ou `editorconfig-checker`), e o PHP sai com código diferente de 0. Em sucesso, a última linha
  continua `Ambiente PHP validado.`.

### Exemplo: `examples/devcontainer.json`

O contrato do exemplo, com as extensões e configurações acima, está em
[uso.md](uso.md#referência-examplesdevcontainerjson).

---

[README](../README.md) · Anterior: [Como usar a imagem](uso.md) · Próximo: [Versões e publicação da imagem](publicacao.md)
