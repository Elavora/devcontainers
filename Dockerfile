# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/devcontainers/php:8.3-bookworm@sha256:5969378edcd6db3ca5ca5802d778f10c773d91729d868d9a7279151c4e26994e

LABEL org.opencontainers.image.source="https://github.com/Elavora/devcontainers" \
      org.opencontainers.image.description="Ambiente PHP compartilhado da Elavora"

USER root
RUN apt-get update && apt-get install -y --no-install-recommends libzip-dev unzip \
    && docker-php-ext-install zip \
    && rm -rf /var/lib/apt/lists/*
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
