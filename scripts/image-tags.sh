#!/bin/sh
# Valida a tag criada pelo fluxo central e imprime as referências da imagem no GHCR, uma por linha:
# a versionada primeiro e, se a tag for estável, a 8.3-latest em seguida.
# Uso: sh scripts/image-tags.sh <tag>   (X.Y.Z ou X.Y.Z-beta.N)
# Contrato: docs/publicacao.md, "Script scripts/image-tags.sh".

IMAGE=ghcr.io/elavora/php-dev
PHP_VERSION=8.3

# Número sem zero à esquerda (0 é aceito).
is_num() {
    case $1 in
        '' | *[!0-9]*) return 1 ;;
        0) return 0 ;;
        0*) return 1 ;;
    esac
    return 0
}

# Tag válida: ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-beta\.[1-9][0-9]*)?$
valid_tag() {
    t=$1
    case $t in
        '' | *[!0-9a-z.-]*) return 1 ;;
    esac
    case $t in
        *-*)
            core=${t%%-*}
            pre=${t#*-}
            case $pre in
                beta.*) n=${pre#beta.} ;;
                *) return 1 ;;
            esac
            is_num "$n" && [ "$n" != 0 ] || return 1
            ;;
        *) core=$t ;;
    esac
    major=${core%%.*}
    rest=${core#*.}
    [ "$rest" != "$core" ] || return 1
    minor=${rest%%.*}
    patch=${rest#*.}
    [ "$patch" != "$rest" ] || return 1
    is_num "$major" && is_num "$minor" && is_num "$patch"
}

if [ "$#" -ne 1 ]; then
    echo "image-tags.sh: esperado exatamente um argumento (a tag), recebidos $#" >&2
    exit 1
fi

if ! valid_tag "$1"; then
    printf 'image-tags.sh: tag inválida: %s (esperado X.Y.Z ou X.Y.Z-beta.N)\n' "$1" >&2
    exit 1
fi

printf '%s:%s-%s\n' "$IMAGE" "$PHP_VERSION" "$1"

# Estável (sem sufixo -beta.N): imprime também a referência móvel, depois da versionada.
case $1 in
    *-*) ;;
    *) printf '%s:%s-latest\n' "$IMAGE" "$PHP_VERSION" ;;
esac
