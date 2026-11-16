#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BACKEND_SOURCE="$SCRIPT_DIR/backend"
DEB_FILE="$SCRIPT_DIR/encanto-toys.deb"
PREPARAR_SISTEMA="$SCRIPT_DIR/preparar-sistema.sh"
CONTROLADOR="$SCRIPT_DIR/instalar-pdv.py"

MODO="${1:---verificar}"

erro() {
    printf 'ERRO: %s\n' "$1" >&2
    exit 1
}

info() {
    printf '%s\n' "$1"
}

case "$MODO" in
    --verificar|--instalar)
        ;;
    *)
        erro "Use --verificar ou --instalar."
        ;;
esac

[ "$#" -le 1 ] || erro \
    "Quantidade de argumentos inválida."

for comando in python3 dpkg-deb bash; do
    command -v "$comando" >/dev/null || erro \
        "Comando necessário não encontrado: $comando"
done

[ -d "$BACKEND_SOURCE" ] || erro \
    "Pasta backend ausente no pacote."

[ -f "$PREPARAR_SISTEMA" ] || erro \
    "preparar-sistema.sh ausente no pacote."

[ -f "$DEB_FILE" ] || erro \
        "Pacote encanto-toys.deb não encontrado."

ARQUIVOS_OBRIGATORIOS=(
    "requirements.txt"
    "backup-banco.py"
    "migrar-banco.py"
    "app/main.py"
    "app/models.py"
    "app/services/migracao_instalacao_service.py"
    "app/services/monitoramento_caixas_service.py"
    "app/services/pagamento_filtro_service.py"
    "app/services/xml_compra_service.py"
    "app/services/relatorio_vendas_service.py"
    "app/routers/xml_compras.py"
    "app/routers/relatorios_vendas.py"
    "app/static/LogoEncantoToys.jpeg"
    "app/static/LogoMHS.png"
)

for relativo in "${ARQUIVOS_OBRIGATORIOS[@]}"; do
    [ -f "$BACKEND_SOURCE/$relativo" ] || erro \
        "Arquivo obrigatório ausente: backend/$relativo"
done

# Não distribuir as credenciais de desenvolvimento.
if [ -e "$BACKEND_SOURCE/.env" ]; then
    erro "Existe um .env dentro do backend do pacote. Retire-o do pacote antes de distribuir."
fi

[ "$(dpkg-deb -f "$DEB_FILE" Package)" = "encanto-toys" ] \
    || erro "Nome interno do pacote diferente do esperado."

VERSAO="$(dpkg-deb -f "$DEB_FILE" Version)"

[ -n "$VERSAO" ] || erro \
    "Não foi possível identificar a versão do pacote."

info "Versão do pacote: $VERSAO"

[ "$(dpkg-deb -f "$DEB_FILE" Architecture)" = "amd64" ] \
    || erro "Arquitetura do pacote diferente de amd64."

bash -n "$PREPARAR_SISTEMA"

python3 - "$BACKEND_SOURCE" "$CONTROLADOR" <<'PY'
import ast
from pathlib import Path
import sys

backend = Path(sys.argv[1])
controlador = Path(sys.argv[2])

arquivos = list((backend / "app").rglob("*.py"))

arquivos.extend([
    backend / "backup-banco.py",
    backend / "migrar-banco.py",
])

if controlador.is_file():
    arquivos.append(controlador)

for arquivo in arquivos:
    ast.parse(
        arquivo.read_text(encoding="utf-8-sig"),
        filename=str(arquivo),
    )

print("OK: sintaxe dos arquivos Python conferida.")
PY

info "OK: arquivos e pacote desktop conferidos."

if [ "$MODO" = "--verificar" ]; then
    bash "$PREPARAR_SISTEMA" --verificar

    if [ -f "$CONTROLADOR" ]; then
        info "OK: controlador de instalação presente."
    else
        info "PENDENTE: instalar-pdv.py ainda precisa ser acrescentado."
    fi

    info "Verificação do pacote concluída."
    info "Nenhuma instalação ou migração foi executada."
    exit 0
fi

[ "$EUID" -eq 0 ] || erro \
    "A instalação exige sudo."

[ -f "$CONTROLADOR" ] || erro \
    "Instalação bloqueada: instalar-pdv.py ainda não foi preparado."

# A instalação efetiva será coordenada pelo controlador.
# O controlador deve confirmar os destinos e verificar os backups
# antes de aplicar qualquer migração.
exec python3 "$CONTROLADOR" \
    --pacote "$SCRIPT_DIR" \
    --versao "$VERSAO"