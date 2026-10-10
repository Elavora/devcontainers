# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/devcontainers/php:8.3-bookworm@sha256:5969378edcd6db3ca5ca5802d778f10c773d91729d868d9a7279151c4e26994e

LABEL org.opencontainers.image.source="https://github.com/Elavora/devcontainers" \
      org.opencontainers.image.description="Ambiente PHP compartilhado da Elavora"

USER root
RUN apt-get update && apt-get install -y --no-install-recommends libzip-dev unzip \
    && docker-php-ext-install zip \
    && rm -rf /var/lib/apt/lists/*
COPY php.ini /usr/local/etc/php/conf.d/zz-elavora-dev.ini
COPY tests/smoke.php /usr/local/share/elavora/smoke.php
ENV XDEBUG_MODE=off
WORKDIR /workspaces
USER vscode
CMD ["sleep", "infinity"]
