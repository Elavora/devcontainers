# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/devcontainers/php:8.3-bookworm@sha256:5969378edcd6db3ca5ca5802d778f10c773d91729d868d9a7279151c4e26994e

LABEL org.opencontainers.image.source="https://github.com/Elavora/devcontainers" \
      org.opencontainers.image.description="Ambiente PHP compartilhado da Elavora"

USER root
RUN apt-get update && apt-get install -y --no-install-recommends libzip-dev unzip \
    && docker-php-ext-install zip \
    && rm -rf /var/lib/apt/lists/*
ARG APCU_VERSION=5.1.28
ARG APCU_SHA256=ca9c1820810a168786f8048a4c3f8c9e3fd941407ad1553259fb2e30b5f057bf
ARG REDIS_VERSION=6.3.0
ARG REDIS_SHA256=0d5141f634bd1db6c1ddcda053d25ecf2c4fc1c395430d534fd3f8d51dd7f0b5
ARG MONGODB_VERSION=2.5.5
ARG MONGODB_SHA256=0eaf84ff709f73183d80597f31ff02937f6aefde01eb895a0aa19334a290cec0
RUN set -eu; \
    exec < /dev/null; \
    saved="$(apt-mark showmanual)"; \
    apt-get update; \
    apt-get install -y --no-install-recommends $PHPIZE_DEPS libpq-dev; \
    export MAKEFLAGS="-j$(nproc)"; \
    docker-php-ext-install pdo_mysql pdo_pgsql; \
    tmp="$(mktemp -d)"; \
    curl -fsSL -o "$tmp/apcu.tgz" "https://pecl.php.net/get/apcu-${APCU_VERSION}.tgz"; \
    echo "${APCU_SHA256}  $tmp/apcu.tgz" | sha256sum -c -; \
    pecl install $tmp/apcu.tgz; \
    docker-php-ext-enable apcu; \
    curl -fsSL -o "$tmp/redis.tgz" "https://pecl.php.net/get/redis-${REDIS_VERSION}.tgz"; \
    echo "${REDIS_SHA256}  $tmp/redis.tgz" | sha256sum -c -; \
    pecl install $tmp/redis.tgz; \
    docker-php-ext-enable redis; \
    curl -fsSL -o "$tmp/mongodb.tgz" "https://pecl.php.net/get/mongodb-${MONGODB_VERSION}.tgz"; \
    echo "${MONGODB_SHA256}  $tmp/mongodb.tgz" | sha256sum -c -; \
    pecl install $tmp/mongodb.tgz; \
    docker-php-ext-enable mongodb; \
    rm -rf "$tmp" /tmp/pear /tmp/pear-build-root; \
    apt-mark auto ".*" > /dev/null; \
    apt-mark manual $saved > /dev/null; \
    apt-mark manual libpq5; \
    apt-get purge -y --auto-remove libpq-dev; \
    rm -rf /var/lib/apt/lists/*
ARG PHP_CS_FIXER_VERSION=3.95.27
ARG PHP_CS_FIXER_SHA256=47231757eefdd08778e2bd047d98a63dfaad881006c8c1d1bc870d63be7f6a9b
ARG EDITORCONFIG_CHECKER_VERSION=4.0.2
ARG EDITORCONFIG_CHECKER_SHA256=44efaef3ed14c6ab52eb87481d78e5e5c204796dccf26e2f4598a61ba17f8003
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
COPY php.ini /usr/local/etc/php/conf.d/zz-elavora-dev.ini
COPY tests/smoke.php /usr/local/share/elavora/smoke.php
ENV XDEBUG_MODE=off
WORKDIR /workspaces
USER vscode
CMD ["sleep", "infinity"]
