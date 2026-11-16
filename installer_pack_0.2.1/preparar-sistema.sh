#!/usr/bin/env bash

set -Eeuo pipefail

MODO="${1:---verificar}"

erro() {
    printf 'ERRO: %s\n' "$1" >&2
    exit 1
}

case "$MODO" in
    --verificar|--aplicar)
        ;;
    *)
        erro "Use --verificar ou --aplicar."
        ;;
esac

[ "$#" -le 1 ] || erro "Quantidade de argumentos inválida."

command -v apt-get >/dev/null || erro \
    "Este pacote exige Linux Mint ou Ubuntu com APT."

command -v dpkg >/dev/null || erro \
    "Gerenciador de pacotes Debian não encontrado."

[ "$(dpkg --print-architecture)" = "amd64" ] || erro \
    "Este pacote foi compilado para amd64."

# Arquivo de identificação do próprio sistema operacional.
. /etc/os-release

CODINOME_BASE="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"

case "$CODINOME_BASE" in
    jammy|noble)
        ;;
    *)
        erro "Base não validada por este instalador: $CODINOME_BASE"
        ;;
esac

CLUSTERS=""
CLUSTER_ALVO=""
VERSAO_ALVO="17"
INSTALACAO_NOVA=1

if command -v pg_lsclusters >/dev/null; then
    CLUSTERS="$(pg_lsclusters --no-header)"

    if [ -n "$CLUSTERS" ]; then
        INSTALACAO_NOVA=0

        ALVOS="$(
            printf '%s\n' "$CLUSTERS" |
                awk '$3 == 5433 { print $1, $2 }'
        )"

        [ -n "$ALVOS" ] || erro \
            "Já existe PostgreSQL, mas não há cluster na porta 5433. Revise manualmente."

        QUANTIDADE="$(
            printf '%s\n' "$ALVOS" |
                awk 'NF { n++ } END { print n+0 }'
        )"

        [ "$QUANTIDADE" -eq 1 ] || erro \
            "Mais de um cluster identificado na porta 5433."

        read -r VERSAO_CLUSTER CLUSTER_ALVO <<< "$ALVOS"

        case "$VERSAO_CLUSTER" in
            16|17)
                VERSAO_ALVO="$VERSAO_CLUSTER"
                ;;
            *)
                erro "Versão PostgreSQL não validada: $VERSAO_CLUSTER"
                ;;
        esac

    fi
fi

PACOTE_GTK="libgtk-3-0"

if [ "$CODINOME_BASE" = "noble" ]; then
    PACOTE_GTK="libgtk-3-0t64"
fi

PACOTES=(
    python3
    python3-pip
    python3-venv
    "postgresql-$VERSAO_ALVO"
    postgresql-client-17
    "$PACOTE_GTK"
    libwebkit2gtk-4.1-0
    libayatana-appindicator3-1
    ca-certificates
    curl
    openssl
)

if [ "$MODO" = "--verificar" ]; then
    printf 'Base do sistema: %s\n' "$CODINOME_BASE"
    printf 'Arquitetura: amd64\n\n'

    for pacote in "${PACOTES[@]}"; do
        estado="$(
            dpkg-query -W -f='${db:Status-Status}' "$pacote" \
                2>/dev/null || true
        )"

        if [ "$estado" = "installed" ]; then
            printf 'OK: %s instalado\n' "$pacote"
        else
            printf 'PENDENTE: %s\n' "$pacote"
        fi
    done

    printf '\n'

    if [ "$INSTALACAO_NOVA" -eq 1 ]; then
        printf 'Nenhum cluster PostgreSQL foi encontrado.\n'
        printf 'A instalação deverá criar um cluster PostgreSQL 17.\n'
    else
        printf 'Cluster selecionado: PostgreSQL %s / %s / porta 5433\n' \
            "$VERSAO_ALVO" "$CLUSTER_ALVO"
    fi

    printf '\nVerificação concluída sem instalar pacotes ou alterar bancos.\n'
    exit 0
fi

[ "$EUID" -eq 0 ] || erro \
    "A preparação com --aplicar exige sudo."

# O instalador principal só deverá autorizar esta etapa
# depois de executar suas verificações e backups.
[ "${PDV_PREPARACAO_AUTORIZADA:-}" = "SIM" ] || erro \
    "Execute a preparação pelo instalador principal."

apt-get update
apt-get install -y curl ca-certificates

if ! apt-cache show postgresql-17 >/dev/null 2>&1; then
    if grep -Rqs "apt.postgresql.org" \
        /etc/apt/sources.list \
        /etc/apt/sources.list.d 2>/dev/null; then

        erro "Já existe configuração PGDG, mas o pacote 17 não está disponível. Revise o repositório."
    fi

    install -d -m 755 /usr/share/postgresql-common/pgdg

    curl --fail --silent --show-error \
        https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc

    chmod 644 \
        /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc

    cat > /etc/apt/sources.list.d/encanto-pgdg.sources <<EOF
Types: deb
URIs: https://apt.postgresql.org/pub/repos/apt
Suites: ${CODINOME_BASE}-pgdg
Architectures: amd64
Components: main
Signed-By: /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
EOF

    apt-get update
fi

apt-get install -y "${PACOTES[@]}"

if [ "$INSTALACAO_NOVA" -eq 1 ]; then
    # Somente nesta situação é permitido configurar um cluster novo.
    OUTROS="$(
        pg_lsclusters --no-header |
            awk '!($1 == 17 && $2 == "main") { print }'
    )"

    [ -z "$OUTROS" ] || erro \
        "Apareceu outro cluster durante a preparação. Revise antes de continuar."

    if pg_lsclusters --no-header |
        awk '$1 == 17 && $2 == "main" { found=1 } END { exit !found }'
    then
        pg_conftool 17 main set port 5433

        if pg_ctlcluster 17 main status >/dev/null 2>&1; then
            pg_ctlcluster 17 main restart
        else
            pg_ctlcluster 17 main start
        fi
    else
        pg_createcluster 17 main --port 5433 --start
    fi

    CLUSTER_ALVO="main"
else
    # Não altera a porta de um cluster existente.
    if ! pg_ctlcluster "$VERSAO_ALVO" "$CLUSTER_ALVO" status >/dev/null 2>&1; then
        pg_ctlcluster "$VERSAO_ALVO" "$CLUSTER_ALVO" start
    fi
fi

/usr/lib/postgresql/17/bin/pg_isready \
    -h 127.0.0.1 \
    -p 5433 >/dev/null || erro \
    "PostgreSQL não respondeu na porta 5433."

printf 'Preparação do sistema concluída.\n'