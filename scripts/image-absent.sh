#!/bin/sh
# Confere no registro que uma referência da imagem ainda não existe.
# Uso: sh scripts/image-absent.sh ghcr.io/elavora/php-dev:8.3-<tag>
# Saída: 0 = não existe; 1 = já existe; 2 = argumento inválido ou erro na consulta.
# O comando de inspeção vem de IMAGE_INSPECT_CMD (padrão: docker manifest inspect),
# separado em palavras pelos espaços, sem eval.
# Contrato: docs/publicacao.md, "Script scripts/image-absent.sh".

PREFIX=ghcr.io/elavora/php-dev:8.3-

is_num() {
    case $1 in
        '' | *[!0-9]*) return 1 ;;
        0) return 0 ;;
        0*) return 1 ;;
    esac
    return 0
}

# Mesma regra do image-tags.sh.
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
    echo "image-absent.sh: esperado exatamente um argumento (a referência), recebidos $#" >&2
    exit 2
fi

ref=$1
case $ref in
    "$PREFIX"*) tag=${ref#"$PREFIX"} ;;
    *) tag= ;;
esac
if ! valid_tag "$tag"; then
    printf 'image-absent.sh: referência inválida: %s (esperado %s<tag>)\n' "$ref" "$PREFIX" >&2
    exit 2
fi

cmd=${IMAGE_INSPECT_CMD:-docker manifest inspect}

# Separação em palavras sem expansão de curingas e sem eval.
set -f
# shellcheck disable=SC2086
out=$($cmd "$ref" 2>&1)
code=$?
set +f

if [ "$code" -eq 0 ]; then
    printf 'image-absent.sh: a referência %s já existe no registro; nada será publicado\n' "$ref" >&2
    exit 1
fi

if [ "$code" -ne 126 ] && [ "$code" -ne 127 ]; then
    lower=$(printf '%s' "$out" | tr '[:upper:]' '[:lower:]')
    case $lower in
        *'manifest unknown'* | *'no such manifest'*) exit 0 ;;
    esac
fi

printf 'image-absent.sh: erro ao consultar %s (código %s): %s\n' "$ref" "$code" "$out" >&2
exit 2
