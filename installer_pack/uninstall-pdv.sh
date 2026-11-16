#!/usr/bin/env bash

# Desinstala o programa, preservando banco, credenciais e documentos.
# Não utilizar como etapa obrigatória de uma atualização.

set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BACKEND_DIR="/opt/encanto-toys-backend"
SERVICE_NAME="encanto-toys-backend.service"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME"
PACKAGE_NAME="encanto-toys"

BACKUP_ROOT="/var/backups/encanto-toys"
XML_PERMANENTE="/var/lib/encanto-toys/compras_xml"

BACKUP_HELPER="$SCRIPT_DIR/backend/backup-banco.py"
PYTHON_INSTALADO="$BACKEND_DIR/.venv/bin/python"

SERVICO_ESTAVA_ATIVO=0
CONCLUIDO=0
PASTA_BACKUP=""

erro() {
    printf 'ERRO: %s\n' "$1" >&2
    exit 1
}

info() {
    printf '%s\n' "$1"
}

finalizar() {
    codigo=$?

    if [ "$CONCLUIDO" -ne 1 ]; then
        printf '\nProcedimento interrompido.\n' >&2

        if [ -n "$PASTA_BACKUP" ]; then
            printf 'Confira os arquivos em: %s\n' "$PASTA_BACKUP" >&2
        fi

        if [ "$SERVICO_ESTAVA_ATIVO" -eq 1 ] \
            && [ -d "$BACKEND_DIR" ] \
            && [ -f "$SERVICE_FILE" ]; then

            if systemctl start "$SERVICE_NAME"; then
                printf 'O backend anterior foi iniciado novamente.\n' >&2
            else
                printf 'Não foi possível reiniciar o backend anterior.\n' >&2
            fi
        fi
    fi

    trap - EXIT
    exit "$codigo"
}

trap finalizar EXIT

[ "$EUID" -eq 0 ] || erro \
    "Execute com sudo."

[ "$#" -eq 0 ] || erro \
    "Este desinstalador não aceita opções de exclusão do banco."

[ ! -L "$BACKEND_DIR" ] || erro \
    "O diretório instalado é um link simbólico. Revise manualmente."

[ -d "$BACKEND_DIR" ] || erro \
    "Backend instalado não encontrado. Nenhum arquivo foi removido."

[ -f "$BACKEND_DIR/.env" ] || erro \
    "Configuração instalada não encontrada. Nenhum arquivo foi removido."

[ -x "$PYTHON_INSTALADO" ] || erro \
    "Python da instalação não encontrado. Nenhum arquivo foi removido."

[ -f "$BACKUP_HELPER" ] || erro \
    "backup-banco.py não encontrado no pacote."

for comando in systemctl tar dpkg dpkg-query pgrep realpath diff; do
    command -v "$comando" >/dev/null || erro \
        "Comando necessário não encontrado: $comando"
done

if pgrep -x "encanto-toys" >/dev/null; then
    erro "Feche o aplicativo Encanto Toys antes de continuar."
fi

STATUS_PACOTE="$(
    dpkg-query -W -f='${db:Status-Status}' "$PACKAGE_NAME" \
        2>/dev/null || true
)"

if [ "$STATUS_PACOTE" != "installed" ]; then
    erro "Pacote instalado não identificado. Revise antes de remover arquivos."
fi

# Ler apenas a identificação do banco e o caminho dos XMLs.
# A senha não é impressa.
METADADOS="$(
    "$PYTHON_INSTALADO" - "$BACKEND_DIR/.env" <<'PY'
import sys
from pathlib import Path

from dotenv import dotenv_values
from sqlalchemy.engine import make_url

config = dotenv_values(sys.argv[1], interpolate=False)
valor = config.get("LOCAL_DATABASE_URL")

if not valor:
    raise SystemExit("LOCAL_DATABASE_URL ausente.")

url = make_url(valor)

if not (
    url.get_backend_name() == "postgresql"
    and url.host in ("127.0.0.1", "localhost")
    and url.port == 5433
    and url.database == "encanto_toys"
    and url.username == "encantotoys_user"
):
    raise SystemExit(
        "Banco diferente da instalação de produção esperada."
    )

xml = (config.get("COMPRAS_XML_DIR") or "").strip()

if xml and not Path(xml).is_absolute():
    raise SystemExit("COMPRAS_XML_DIR deve ser absoluto.")

for valor in (url.host, url.username, url.database, xml):
    if "\n" in valor or "\r" in valor:
        raise SystemExit("Configuração com formato inválido.")
    print(valor)
PY
)"

mapfile -t CONFIGURACAO <<< "$METADADOS"

DB_HOST="${CONFIGURACAO[0]:-}"
DB_USER="${CONFIGURACAO[1]:-}"
DB_NAME="${CONFIGURACAO[2]:-}"
XML_DIR="${CONFIGURACAO[3]:-}"

PG_VERSAO="$(
    pg_lsclusters --no-header |
        awk '$3 == 5433 { print $1 }'
)"

case "$PG_VERSAO" in
    16|17)
        PG_BIN_LOCAL="/usr/lib/postgresql/$PG_VERSAO/bin"
        ;;
    *)
        erro "PostgreSQL local não identificado com segurança."
        ;;
esac

[ -n "$DB_HOST" ] && [ -n "$DB_USER" ] && [ -n "$DB_NAME" ] \
    || erro "Identificação do banco incompleta."

if [ -n "$XML_DIR" ]; then
    XML_DIR="$(realpath -m -- "$XML_DIR")"

    case "$XML_DIR" in
        /|/home|/opt|/var|/var/lib|"$BACKEND_DIR")
            erro "Pasta de XMLs ampla demais. Revise a configuração."
            ;;
    esac
fi

printf '\nDESINSTALAÇÃO DO ENCANTO TOYS\n\n'
printf 'Será removido o aplicativo e seu serviço.\n'
printf 'O banco %s será PRESERVADO.\n' "$DB_NAME"
printf 'Os XMLs e as configurações serão preservados.\n'
printf 'Nenhum banco Supabase será alterado.\n\n'

read -r -p "Digite DESINSTALAR para continuar: " CONFIRMACAO

[ "$CONFIRMACAO" = "DESINSTALAR" ] || erro \
    "Confirmação não recebida. Nenhuma remoção foi executada."

mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"

PASTA_BACKUP="$(
    mktemp -d \
        "$BACKUP_ROOT/desinstalacao_$(date -u +%Y-%m-%d_%H-%M-%S)_UTC_XXXXXX"
)"

# Parar antes de copiar banco e documentos.
# Se o backup falhar, a rotina de saída tentará reiniciar o serviço.
if systemctl is-active --quiet "$SERVICE_NAME"; then
    SERVICO_ESTAVA_ATIVO=1
    systemctl stop "$SERVICE_NAME"
fi

info "Fazendo backup obrigatório do banco local..."

ARQUIVO_BANCO="$(
    "$PYTHON_INSTALADO" "$BACKUP_HELPER" \
        --env-file "$BACKEND_DIR/.env" \
        --destino local \
        --confirmar-host "$DB_HOST" \
        --confirmar-usuario "$DB_USER" \
        --confirmar-banco "$DB_NAME" \
        --pasta "$PASTA_BACKUP" \
        --pg-bin-dir "$PG_BIN_LOCAL"
)"

[ -s "$ARQUIVO_BANCO" ] || erro \
    "Backup do banco não foi concluído."

info "Copiando os arquivos da instalação..."

tar -czf "$PASTA_BACKUP/backend_instalado.tar.gz" \
    -C /opt encanto-toys-backend

tar -tzf "$PASTA_BACKUP/backend_instalado.tar.gz" >/dev/null

if [ -f "$SERVICE_FILE" ]; then
    cp -a "$SERVICE_FILE" "$PASTA_BACKUP/"
fi

# Documentos fora do backend também precisam de backup.
if [ -n "$XML_DIR" ] && [ -d "$XML_DIR" ]; then
    tar -czf "$PASTA_BACKUP/xmls_originais.tar.gz" \
        -C "$XML_DIR" .

    tar -tzf "$PASTA_BACKUP/xmls_originais.tar.gz" >/dev/null
fi

# Se os XMLs estiverem dentro do backend, preservá-los fora dele.
# Não distribuir esses documentos para outros computadores.
case "$XML_DIR" in
    "$BACKEND_DIR"/*)
        if [ -d "$XML_DIR" ]; then
            if [ -e "$XML_PERMANENTE" ]; then
                [ -d "$XML_PERMANENTE" ] || erro \
                    "O destino permanente dos XMLs não é uma pasta."

                diff -qr "$XML_DIR" "$XML_PERMANENTE" >/dev/null \
                    || erro \
                    "Já existe outra coleção de XMLs no destino permanente. Revise antes de continuar."
            else
                mkdir -p "$(dirname "$XML_PERMANENTE")"
                cp -a "$XML_DIR" "$XML_PERMANENTE"

                diff -qr "$XML_DIR" "$XML_PERMANENTE" >/dev/null \
                    || erro "A preservação dos XMLs não foi conferida."
            fi
        fi
        ;;
esac

info "Backups concluídos. Removendo o pacote do aplicativo..."

dpkg --remove "$PACKAGE_NAME"

if [ -f "$SERVICE_FILE" ]; then
    systemctl disable "$SERVICE_NAME"
fi

# Guardar o diretório completo em vez de apagá-lo.
mv "$BACKEND_DIR" "$PASTA_BACKUP/backend_preservado"

if [ -f "$SERVICE_FILE" ]; then
    rm -- "$SERVICE_FILE"
fi

systemctl daemon-reload

CONCLUIDO=1

printf '\nDESINSTALAÇÃO CONCLUÍDA.\n'
printf 'Banco e usuário PostgreSQL preservados.\n'
printf 'Configurações e documentos do usuário não foram apagados.\n'
printf 'Backup e backend anterior: %s\n' "$PASTA_BACKUP"
printf 'Nenhum banco Supabase foi alterado.\n'