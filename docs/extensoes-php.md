# Extensões de PHP da imagem

[README](../README.md) · Anterior: [Ferramentas de qualidade](ferramentas-de-qualidade.md) · Próximo: [Versões e publicação da imagem](publicacao.md)

## Por que existem

O CI dos pacotes `api-*` roda dentro da imagem `ghcr.io/elavora/php-dev` (pelo workflow `php-quality.yml` do
[`Elavora/.github`](https://github.com/Elavora/.github)). Esse workflow não instala extensões de PHP: ele usa o que a
imagem tem. Até a `0.3.2` a imagem não trazia cinco extensões que esses pacotes exigem no `composer.json`. O
`composer install` falhava, e o CI ficava vermelho em `api-cache-apcu`, `api-redis`, `api-cache-redis`,
`api-queue-redis`, `api-database-mysql`, `api-database-postgresql` e `api-log-mongodb`.

A partir da versão `0.4.0`, a imagem traz as cinco extensões. A imagem continua **sem servidores**: só os drivers.

## O que a imagem traz

| Extensão | Usada por | Versão | Como é instalada |
| --- | --- | --- | --- |
| `pdo_mysql` | `api-database-mysql` | a do PHP (8.3.x da base) | `docker-php-ext-install` |
| `pdo_pgsql` | `api-database-postgresql` | a do PHP (8.3.x da base) | `docker-php-ext-install` |
| `apcu` | `api-cache-apcu` | `5.1.28` | PECL, pelo arquivo `.tgz` com SHA-256 |
| `redis` | `api-redis`, `api-cache-redis`, `api-queue-redis` | `6.3.0` | PECL, pelo arquivo `.tgz` com SHA-256 |
| `mongodb` | `api-log-mongodb` | `2.5.5` | PECL, pelo arquivo `.tgz` com SHA-256 |

As extensões que já existiam continuam (`pdo_sqlite`, `zip`, `xdebug` e as demais). `mysqlnd` já vinha na base, e o
`pdo_mysql` usa essa biblioteca.

As três versões de PECL são estáveis e foram publicadas há pelo menos duas semanas (a `mongodb 2.5.5`, em
2026-10-15; as outras, em 2025). Para atualizar, veja [Atualizar a versão de uma extensão](#atualizar-a-versão-de-uma-extensão).

## O que a imagem não traz

- **Nenhum servidor.** Não há MySQL, PostgreSQL, Redis nem MongoDB dentro da imagem, e o processo principal
  continua `sleep infinity`. Os testes que precisam de servidor **pulam** quando ele não existe. Isso é feito nos
  próprios pacotes, e não neste repositório. Quem quiser rodar esses testes sobe o servidor num serviço Compose à
  parte e aponta o teste para ele.
- Nenhuma variante da imagem. Todos os projetos usam a mesma `php-dev`, com as mesmas cinco extensões, mesmo os
  que não precisam delas.
- Nenhuma extensão além das cinco (nada de `intl`, `gd`, `pdo_sqlsrv`, `memcached`...). Uma extensão nova é uma
  versão nova da imagem.

## Como conferir

Dentro da imagem, `php -m` lista as cinco, cada uma em uma linha, ao lado das que já existiam:

```sh
$ php -m | grep -E '^(apcu|mongodb|pdo_mysql|pdo_pgsql|redis)$'
apcu
mongodb
pdo_mysql
pdo_pgsql
redis
```

(A ordem da saída do `php -m` é alfabética dentro de cada seção. Se alguma das cinco faltar, o smoke test falha.)

As versões:

```sh
$ php -r 'foreach (["apcu","redis","mongodb"] as $e) echo $e, " ", phpversion($e), PHP_EOL;'
apcu 5.1.28
redis 6.3.0
mongodb 2.5.5
$ php -r 'echo implode(",", PDO::getAvailableDrivers()), PHP_EOL;'
mysql,pgsql,sqlite
```

(`PDO::getAvailableDrivers()` devolve os três nomes, em qualquer ordem.)

Nenhuma das cinco depende de variável de ambiente nem de arquivo de configuração do projeto para ser carregada. As
linhas `extension=` ficam em arquivos de `/usr/local/etc/php/conf.d/`, criados na instalação, e carregam sozinhas
tanto no CLI quanto no PHPUnit.

### Configuração do APCu no CLI

O APCu desliga o cache no CLI por padrão (`apc.enable_cli=0`): `apcu_store()` devolve `false` e os testes do
`api-cache-apcu` falhariam no CI, que roda tudo no CLI. Por isso o `php.ini` da imagem passa a conter:

```ini
apc.enable_cli = 1
```

Com isso, `apcu_store('k', 1)` devolve `true` e `apcu_fetch('k')` devolve `1` no CLI. Nenhuma outra opção do APCu
é alterada (`apc.shm_size` continua no padrão, `32M`).

## Tamanho e tempo de build

Medido em 2026-10-30, num container da `8.3-0.3.2` (a `8.3-latest` de então), com as cinco extensões compiladas
por cima:

| Item | Tamanho |
| --- | --- |
| `mongodb.so` | cerca de 12 MB |
| `redis.so` | cerca de 2,5 MB |
| `apcu.so` | cerca de 0,4 MB |
| `pdo_mysql.so` e `pdo_pgsql.so` | menos de 0,1 MB cada |
| sistema de arquivos do container, antes (`8.3-0.3.2`) | 860 MB |
| depois, **com** as ferramentas de compilação e o `libpq-dev` ainda instalados | 911 MB (+51 MB) |

O que a imagem final deve ter é o segundo grupo, sem as ferramentas de compilação: **cerca de +16 MB** sobre a
`8.3-0.3.2` (as extensões e o `libpq5`). Limite do contrato: a imagem final não pode crescer mais de **+60 MB**
(medido pelo mesmo `du -sm /` dentro do container, sem `/proc` e `/sys`). Se passar disso, sobrou arquivo de
compilação numa camada.

Tempo de build: a `mongodb` compila a biblioteca `libmongoc` junto e leva vários minutos (mais de cinco, num
computador comum). O build da imagem passa a ser o passo mais demorado do PR. As demais extensões levam menos de um
minuto cada.

Opções da `mongodb` nesta compilação (confirmadas com `php --ri mongodb`): TLS ligado, com OpenSSL
(`libmongoc SSL => enabled` e `libmongoc SSL library => OpenSSL`), compressão `zlib` ligada, SASL, `snappy` e `zstd`
desligados. Nenhum pacote do Debian a mais é necessário além dos de compilação (o `libssl-dev` já vem na base).
SASL fica desligado de propósito: nenhum pacote da Elavora usa autenticação Kerberos. Se um dia precisar, é uma
versão nova da imagem.

## Contrato do `Dockerfile`

Esta é a base dos testes. A ordem dos comandos dentro de um `RUN` pode variar.

**Versões e checksums**, declarados como `ARG`, um por linha, com estes nomes e valores padrão:

```dockerfile
ARG APCU_VERSION=5.1.28
ARG APCU_SHA256=ca9c1820810a168786f8048a4c3f8c9e3fd941407ad1553259fb2e30b5f057bf
ARG REDIS_VERSION=6.3.0
ARG REDIS_SHA256=0d5141f634bd1db6c1ddcda053d25ecf2c4fc1c395430d534fd3f8d51dd7f0b5
ARG MONGODB_VERSION=2.5.5
ARG MONGODB_SHA256=0eaf84ff709f73183d80597f31ff02937f6aefde01eb895a0aa19334a290cec0
```

**Origem dos arquivos**, montada a partir dos `ARG` (com `${...}`, sem repetir a versão literal na URL):

| Extensão | URL |
| --- | --- |
| `apcu` | `https://pecl.php.net/get/apcu-${APCU_VERSION}.tgz` |
| `redis` | `https://pecl.php.net/get/redis-${REDIS_VERSION}.tgz` |
| `mongodb` | `https://pecl.php.net/get/mongodb-${MONGODB_VERSION}.tgz` |

O SHA-256 é o do arquivo que essa URL entrega.

**Regras:**

- Cada `.tgz` é conferido com `sha256sum -c` contra o `ARG` correspondente **antes** de ser instalado. Se o
  checksum não bater, o build para. Mesmo padrão do PHP-CS-Fixer (veja
  [Ferramentas de qualidade](ferramentas-de-qualidade.md#instalação-no-dockerfile)).
- A instalação de `apcu`, `redis` e `mongodb` é `pecl install <arquivo>.tgz` seguida de `docker-php-ext-enable
  <nome>`. Não se usa `pecl install <nome>` sem versão nem `install-php-extensions`, porque isso resolve a
  versão no momento do build.
- `pdo_mysql` e `pdo_pgsql` são instalados com `docker-php-ext-install`, junto com o `zip` ou em um comando
  próprio.
- O `pdo_pgsql` precisa do pacote `libpq-dev` só para compilar. A biblioteca de execução, o pacote `libpq5`,
  **precisa ficar na imagem final**. Se o `Dockerfile` remover o `libpq-dev` com `apt-get purge` e `autoremove`,
  deve marcar antes o `libpq5` como manual (`apt-mark manual libpq5`), senão o `autoremove` o leva junto.
- Na imagem final, o pacote `libpq-dev` **não** está instalado (`dpkg -s libpq-dev` falha), e o `libpq5` está
  (`dpkg -s libpq5` sai com 0). Os pacotes de compilação que o passo instalou só para o build (por exemplo,
  `autoconf`, `gcc`, `make`) também são removidos, e os que já vinham na imagem base continuam.
- Os arquivos temporários (os `.tgz`, as pastas de compilação, os caches do `pecl` em `/tmp/pear` e as listas do
  `apt`) são apagados no mesmo `RUN` em que foram criados. Nenhum arquivo de compilação fica numa camada da imagem.
- A instalação roda como `root`, antes do `USER vscode`. A imagem base, o `ENV XDEBUG_MODE=off`, o `WORKDIR` e o
  `CMD` não mudam. A arquitetura continua só Linux amd64.
- O `php.ini` ganha só a linha `apc.enable_cli = 1`. As demais linhas ficam como estão.

## Smoke test: `tests/smoke.php`

O smoke test continua rodando dentro da imagem construída, como `vscode`, com o mesmo comando de antes. Ele passa a
conferir também as extensões. Nenhuma verificação precisa de servidor nem de rede.

| Verificação | Passa quando |
| --- | --- |
| as cinco extensões estão carregadas | `extension_loaded()` devolve `true` para `apcu`, `redis`, `mongodb`, `pdo_mysql` e `pdo_pgsql` |
| versões das extensões de PECL | `phpversion('apcu')` é `5.1.28`, `phpversion('redis')` é `6.3.0` e `phpversion('mongodb')` é `2.5.5` |
| drivers do PDO | `PDO::getAvailableDrivers()` contém `mysql`, `pgsql` e `sqlite` |
| APCu funciona no CLI | `apcu_store('elavora-smoke', 42)` devolve `true` e `apcu_fetch('elavora-smoke')` devolve `42`; depois `apcu_delete('elavora-smoke')` |
| redis tem a classe | `class_exists('Redis')` é `true`, e `new Redis()` não lança exceção (não conecta) |
| mongodb funciona sem servidor | `new MongoDB\BSON\ObjectId()` devolve um objeto cujo `(string)` tem 24 caracteres hexadecimais, e `new MongoDB\Driver\BulkWrite()` não lança exceção |
| a `mongodb` tem TLS | a saída de `php --ri mongodb` contém `libmongoc SSL => enabled` |
| as bibliotecas de execução estão presentes | `libpq5` está instalado (`dpkg -s libpq5` sai com 0) |

Regras:

- As versões das extensões ficam escritas no próprio `smoke.php`, e não lidas do `Dockerfile`, como as das
  ferramentas de qualidade: se alguém trocar um `ARG` sem atualizar o smoke test, o build da imagem falha.
- Em qualquer falha, o script lança `RuntimeException` com uma mensagem que contém o nome da extensão. Em sucesso, a
  última linha continua `Ambiente PHP validado.`.
- A lista de extensões que o smoke já conferia (`ctype`, `curl`, `dom`, `filter`, `json`, `mbstring`, `openssl`,
  `tokenizer`, `xml`, `xmlwriter`, `zip`, `xdebug`) não muda.

## Atualizar a versão de uma extensão

Uma versão nova de extensão é uma versão nova da imagem: um PR neste repositório que muda o `Dockerfile` e o
`tests/smoke.php`.

1. Escolha uma versão **estável** na página da extensão em `pecl.php.net`. Prefira uma publicada há pelo menos duas
   semanas.
2. Calcule o SHA-256 do arquivo que a imagem baixa, num container (nada é instalado na máquina):

   ```powershell
   docker run --rm ghcr.io/elavora/php-dev:8.3-latest sh -c 'curl -fsSL https://pecl.php.net/get/redis-6.3.0.tgz | sha256sum'
   ```

3. Troque a versão e o SHA-256 nos `ARG` do `Dockerfile` e a versão esperada no `tests/smoke.php`.
4. Construa a imagem e rode o smoke test (veja [Construir a imagem localmente](uso.md#construir-a-imagem-localmente)).
5. Diga no PR qual extensão mudou de versão, para quem usa a imagem saber.

---

[README](../README.md) · Anterior: [Ferramentas de qualidade](ferramentas-de-qualidade.md) · Próximo: [Versões e publicação da imagem](publicacao.md)
