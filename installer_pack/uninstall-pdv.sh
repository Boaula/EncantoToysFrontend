#!/bin/bash

# ==============================================================================
# DESINSTALADOR COMPLETO - PDV ENCANTO TOYS
# ==============================================================================

set -u

SERVICE_NAME="encanto-toys-backend.service"
BACKEND_DIR="/opt/encanto-toys-backend"

DB_NAME="encanto_toys"
DB_USER="encantotoys_user"
DB_PORT="5433"

APP_ID="com.encantotoys.pdv"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

sucesso() {
    echo -e "${GREEN}✓ $1${NC}"
}

aviso() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

erro() {
    echo -e "${RED}✗ $1${NC}"
}

info() {
    echo -e "${BLUE}→ $1${NC}"
}

# ==============================================================================
# VERIFICAÇÃO DE ROOT
# ==============================================================================

if [ "$EUID" -ne 0 ]; then
    erro "Execute este instalador com sudo:"
    echo
    echo "sudo ./installer_pack/uninstall-pdv.sh"
    exit 1
fi

# Usuário que chamou o sudo
REAL_USER="${SUDO_USER:-}"

if [ -z "$REAL_USER" ]; then
    REAL_USER="$(logname 2>/dev/null || true)"
fi

if [ -z "$REAL_USER" ]; then
    REAL_USER="natanael"
fi

USER_HOME="$(getent passwd "$REAL_USER" | cut -d: -f6)"

# ==============================================================================
# CABEÇALHO
# ==============================================================================

clear

echo
echo "=============================================================="
echo "       DESINSTALADOR COMPLETO - ENCANTO TOYS PDV"
echo "=============================================================="
echo
echo "Este processo irá remover:"
echo
echo "  • Serviço systemd"
echo "  • Backend instalado em $BACKEND_DIR"
echo "  • Aplicativo Tauri"
echo "  • Configurações/cache do aplicativo"
echo
echo "O banco PostgreSQL NÃO será removido automaticamente."
echo
echo "Você terá uma opção separada para:"
echo
echo "  • PRESERVAR o banco"
echo "  • REMOVER o banco e o usuário PostgreSQL"
echo
echo "=============================================================="
echo

read -r -p "Deseja continuar com a desinstalação? [s/N]: " CONFIRMACAO

case "$CONFIRMACAO" in
    s|S|sim|SIM|Sim)
        ;;
    *)
        aviso "Desinstalação cancelada."
        exit 0
        ;;
esac

echo

# ==============================================================================
# 1. PARAR O SERVIÇO
# ==============================================================================

info "Verificando serviço $SERVICE_NAME..."

if systemctl list-unit-files | grep -q "^${SERVICE_NAME}"; then

    if systemctl is-active --quiet "$SERVICE_NAME"; then
        info "Parando o backend..."
        systemctl stop "$SERVICE_NAME" || true
        sucesso "Backend parado."
    else
        aviso "Backend já estava parado."
    fi

    info "Desabilitando serviço..."
    systemctl disable "$SERVICE_NAME" 2>/dev/null || true

    if [ -f "/etc/systemd/system/$SERVICE_NAME" ]; then
        rm -f "/etc/systemd/system/$SERVICE_NAME"
        sucesso "Arquivo do serviço removido."
    fi

    systemctl daemon-reload
    systemctl reset-failed "$SERVICE_NAME" 2>/dev/null || true

else
    aviso "Serviço $SERVICE_NAME não encontrado."
fi

# ==============================================================================
# 2. ENCERRAR PROCESSOS DO BACKEND
# ==============================================================================

info "Verificando processos do backend..."

pkill -f "$BACKEND_DIR" 2>/dev/null || true
pkill -f "uvicorn app.main:app" 2>/dev/null || true

sucesso "Processos do backend verificados."

# ==============================================================================
# 3. REMOVER BACKEND
# ==============================================================================

if [ -d "$BACKEND_DIR" ]; then
    info "Removendo backend instalado em:"
    echo "  $BACKEND_DIR"

    rm -rf "$BACKEND_DIR"

    sucesso "Backend removido."
else
    aviso "Diretório do backend não encontrado."
fi

# ==============================================================================
# 4. REMOVER APLICAÇÃO TAURI
# ==============================================================================

info "Procurando aplicativo Encanto Toys..."

APP_PATHS=(
    "/usr/bin/encanto-toys"
    "/usr/local/bin/encanto-toys"
    "/opt/Encanto Toys"
    "/opt/encanto-toys"
    "/usr/share/applications/encanto-toys.desktop"
    "/usr/share/applications/com.encantotoys.pdv.desktop"
)

for PATH_ITEM in "${APP_PATHS[@]}"; do
    if [ -e "$PATH_ITEM" ]; then
        rm -rf "$PATH_ITEM"
        sucesso "Removido: $PATH_ITEM"
    fi
done

# ==============================================================================
# 5. REMOVER CONFIGURAÇÕES DO ROOT
# ==============================================================================

info "Removendo configurações do root..."

rm -rf "/root/.local/share/$APP_ID"
rm -rf "/root/.config/$APP_ID"
rm -rf "/root/.cache/$APP_ID"

# ==============================================================================
# 6. REMOVER CONFIGURAÇÕES DO USUÁRIO REAL
# ==============================================================================

if [ -n "$USER_HOME" ] && [ -d "$USER_HOME" ]; then

    info "Removendo configurações do usuário $REAL_USER..."

    rm -rf "$USER_HOME/.local/share/$APP_ID"
    rm -rf "$USER_HOME/.config/$APP_ID"
    rm -rf "$USER_HOME/.cache/$APP_ID"

    sucesso "Configurações do aplicativo removidas."

else
    aviso "Diretório HOME do usuário não encontrado."
fi

# ==============================================================================
# 7. REMOVER ARQUIVOS DESKTOP
# ==============================================================================

DESKTOP_FILES=(
    "/usr/share/applications/encanto-toys.desktop"
    "/usr/share/applications/encanto-toys-pdv.desktop"
    "/usr/share/applications/com.encantotoys.pdv.desktop"
)

for DESKTOP in "${DESKTOP_FILES[@]}"; do
    if [ -f "$DESKTOP" ]; then
        rm -f "$DESKTOP"
        sucesso "Atalho removido: $DESKTOP"
    fi
done

# ==============================================================================
# 8. ATUALIZAR CACHE DE APLICATIVOS
# ==============================================================================

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database /usr/share/applications 2>/dev/null || true
fi

# ==============================================================================
# 9. OPÇÃO DE REMOVER BANCO
# ==============================================================================

echo
echo "=============================================================="
echo "             BANCO DE DADOS LOCAL"
echo "=============================================================="
echo
echo "Banco:"
echo "  $DB_NAME"
echo
echo "Usuário PostgreSQL:"
echo "  $DB_USER"
echo
echo "Porta:"
echo "  $DB_PORT"
echo
echo "ATENÇÃO:"
echo
echo "Se você escolher SIM, serão removidos:"
echo
echo "  • Banco $DB_NAME"
echo "  • Usuário $DB_USER"
echo
echo "TODOS OS DADOS LOCAIS DESSE BANCO SERÃO PERDIDOS."
echo
echo "=============================================================="
echo

read -r -p "Deseja APAGAR o banco local e o usuário PostgreSQL? [s/N]: " REMOVER_BANCO

case "$REMOVER_BANCO" in

    s|S|sim|SIM|Sim)

        echo
        aviso "Você escolheu REMOVER o banco local."
        echo

        read -r -p "Digite APAGAR para confirmar: " CONFIRMACAO_DB

        if [ "$CONFIRMACAO_DB" = "APAGAR" ]; then

            # ------------------------------------------------------------------
            # Verificar se PostgreSQL está disponível
            # ------------------------------------------------------------------

            if command -v psql >/dev/null 2>&1; then

                info "Verificando banco $DB_NAME..."

                DB_EXISTS=$(
                    sudo -u postgres psql \
                        -p "$DB_PORT" \
                        -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME';" \
                        2>/dev/null || true
                )

                if [ "$DB_EXISTS" = "1" ]; then

                    info "Encerrando conexões do banco..."

                    sudo -u postgres psql \
                        -p "$DB_PORT" \
                        -d postgres \
                        -c "
                            SELECT pg_terminate_backend(pid)
                            FROM pg_stat_activity
                            WHERE datname='$DB_NAME'
                            AND pid <> pg_backend_pid();
                        " >/dev/null 2>&1 || true

                    info "Removendo banco $DB_NAME..."

                    sudo -u postgres psql \
                        -p "$DB_PORT" \
                        -d postgres \
                        -c "DROP DATABASE \"$DB_NAME\";" \
                        >/dev/null

                    sucesso "Banco $DB_NAME removido."

                else
                    aviso "Banco $DB_NAME não existe."
                fi

                # ------------------------------------------------------------------
                # Remover usuário PostgreSQL
                # ------------------------------------------------------------------

                info "Verificando usuário PostgreSQL $DB_USER..."

                ROLE_EXISTS=$(
                    sudo -u postgres psql \
                        -p "$DB_PORT" \
                        -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER';" \
                        2>/dev/null || true
                )

                if [ "$ROLE_EXISTS" = "1" ]; then

                    info "Removendo usuário $DB_USER..."

                    sudo -u postgres psql \
                        -p "$DB_PORT" \
                        -d postgres \
                        -c "DROP ROLE \"$DB_USER\";" \
                        >/dev/null

                    sucesso "Usuário PostgreSQL $DB_USER removido."

                else
                    aviso "Usuário PostgreSQL $DB_USER não existe."
                fi

            else
                erro "Comando psql não encontrado."
                aviso "O banco não foi removido."
            fi

        else

            aviso "Confirmação incorreta."
            aviso "O banco foi PRESERVADO."

        fi

        ;;

    *)

        echo
        sucesso "Banco de dados PRESERVADO."
        echo
        echo "Banco: $DB_NAME"
        echo "Usuário: $DB_USER"
        echo

        ;;

esac

# ==============================================================================
# 10. VERIFICAÇÕES FINAIS
# ==============================================================================

echo
echo "=============================================================="
echo "                  VERIFICAÇÃO FINAL"
echo "=============================================================="
echo

if systemctl is-active --quiet "$SERVICE_NAME"; then
    erro "O serviço ainda está ativo."
else
    sucesso "Serviço do backend está parado."
fi

if [ -d "$BACKEND_DIR" ]; then
    erro "Diretório do backend ainda existe: $BACKEND_DIR"
else
    sucesso "Backend removido."
fi

if ss -lntp 2>/dev/null | grep -q ':8000'; then
    aviso "A porta 8000 ainda está sendo utilizada:"
    ss -lntp 2>/dev/null | grep ':8000' || true
else
    sucesso "Porta 8000 está livre."
fi

# ==============================================================================
# FINAL
# ==============================================================================

echo
echo "=============================================================="
echo "        DESINSTALAÇÃO DO ENCANTO TOYS FINALIZADA"
echo "=============================================================="
echo
echo "O serviço, backend e arquivos do aplicativo foram removidos."
echo
echo "O banco foi:"
echo

case "$REMOVER_BANCO" in
    s|S|sim|SIM|Sim)
        if [ "${CONFIRMACAO_DB:-}" = "APAGAR" ]; then
            echo "  → REMOVIDO"
        else
            echo "  → PRESERVADO"
        fi
        ;;
    *)
        echo "  → PRESERVADO"
        ;;
esac

echo
echo "=============================================================="