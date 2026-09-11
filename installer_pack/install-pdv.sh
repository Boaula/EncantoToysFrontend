#!/bin/bash
# ==============================================================================
# INSTALADOR AUTOMATIZADO - PDV ENCANTO TOYS
# Linux Mint / Ubuntu
# ==============================================================================

set -e

# ==============================================================================
# CONFIGURAÇÕES
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_SOURCE="$SCRIPT_DIR/backend"
DEB_FILE="$SCRIPT_DIR/encanto-toys_0.1.0_amd64.deb"
BACKEND_DIR="/opt/encanto-toys-backend"
SERVICE_FILE="/etc/systemd/system/encanto-toys-backend.service"

DB_NAME="encanto_toys"
DB_USER="encantotoys_user"
DB_PORT="5433"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ==============================================================================
# FUNÇÕES
# ==============================================================================

erro() {
    echo -e "${RED}ERRO: $1${NC}"
    exit 1
}

info() {
    echo -e "${BLUE}$1${NC}"
}

sucesso() {
    echo -e "${GREEN}$1${NC}"
}

aviso() {
    echo -e "${YELLOW}$1${NC}"
}

# ==============================================================================
# 1. VERIFICAR ROOT
# ==============================================================================

if [ "$EUID" -ne 0 ]; then
    erro "Execute o instalador com sudo:

sudo ./install-pdv.sh"
fi

# ==============================================================================
# GARANTIR ACESSO À IMPRESSORA USB
# ==============================================================================

# Identifica o usuário real que executou o instalador via sudo
PDV_USER="${SUDO_USER:-$(logname 2>/dev/null || true)}"

if [ -z "$PDV_USER" ] || [ "$PDV_USER" = "root" ]; then
    erro "Não foi possível identificar o usuário que executará o PDV."
fi

info "Configurando acesso à impressora Bematech..."

# O dispositivo /dev/ttyACM0 normalmente pertence ao grupo dialout.
# Adicionamos o usuário do PDV a esse grupo.
if getent group dialout >/dev/null 2>&1; then

    usermod -aG dialout "$PDV_USER"

    sucesso "Usuário '$PDV_USER' adicionado ao grupo 'dialout'."

else
    erro "O grupo 'dialout' não existe neste sistema."
fi

echo
echo -e "${GREEN}====================================================${NC}"
echo -e "${GREEN}       INSTALADOR - ENCANTO TOYS PDV${NC}"
echo -e "${GREEN}====================================================${NC}"
echo

# ==============================================================================
# 2. VERIFICAR ESTRUTURA DO INSTALADOR
# ==============================================================================

info "[1/8] Verificando arquivos do instalador..."

if [ ! -d "$BACKEND_SOURCE" ]; then
    erro "Diretório do backend não encontrado:
$BACKEND_SOURCE"
fi

if [ ! -f "$BACKEND_SOURCE/requirements.txt" ]; then
    erro "requirements.txt não encontrado em:
$BACKEND_SOURCE"
fi

if [ ! -f "$BACKEND_SOURCE/app/main.py" ]; then
    erro "app/main.py não encontrado em:
$BACKEND_SOURCE"
fi

if [ ! -f "$DEB_FILE" ]; then
    aviso "Pacote encanto-toys_0.1.0_amd64.deb não encontrado."
    aviso "O backend será instalado normalmente, mas o frontend .deb será ignorado."
fi

sucesso "Estrutura do instalador OK."

# ==============================================================================
# 3. INSTALAR DEPENDÊNCIAS
# ==============================================================================

info "[2/8] Instalando dependências do sistema..."

apt update -y

apt install -y \
    python3 \
    python3-pip \
    python3-venv \
    postgresql \
    postgresql-contrib \
    libgtk-3-0 \
    libwebkit2gtk-4.1-0 \
    libayatana-appindicator3-1 \
    curl \
    openssl

systemctl start postgresql
systemctl enable postgresql

# --------------------------------------------------------------------------
# Configurar PostgreSQL na porta 5433
# --------------------------------------------------------------------------

info "Configurando PostgreSQL para utilizar a porta 5433..."

PG_CONFIG=$(sudo -u postgres psql -tAc "SHOW config_file;" | xargs)

if [ -z "$PG_CONFIG" ] || [ ! -f "$PG_CONFIG" ]; then
    erro "Não foi possível localizar o arquivo de configuração do PostgreSQL."
fi

# Altera somente se ainda não estiver usando a porta 5433
CURRENT_PG_PORT=$(sudo -u postgres psql -tAc "SHOW port;" | xargs)

if [ "$CURRENT_PG_PORT" != "5433" ]; then

    aviso "PostgreSQL está utilizando a porta $CURRENT_PG_PORT."
    info "Alterando para a porta 5433..."

    sed -i -E "s/^[#[:space:]]*port[[:space:]]*=.*/port = 5433/" "$PG_CONFIG"

    # Caso a diretiva port não exista no arquivo
    if ! grep -Eq "^[[:space:]]*port[[:space:]]*=" "$PG_CONFIG"; then
        echo "port = 5433" >> "$PG_CONFIG"
    fi

    systemctl restart postgresql

else

    sucesso "PostgreSQL já está configurado na porta 5433."

fi

# Confirma a porta
CURRENT_PG_PORT=$(sudo -u postgres psql -tAc "SHOW port;" | xargs)

if [ "$CURRENT_PG_PORT" != "5433" ]; then
    erro "PostgreSQL não conseguiu iniciar na porta 5433."
fi

sucesso "PostgreSQL configurado na porta 5433."

# ==============================================================================
# 4. CONFIGURAÇÃO DAS CREDENCIAIS
# ==============================================================================

info "[3/8] Configuração das conexões externas."
echo
echo "As informações abaixo serão gravadas somente em:"
echo "$BACKEND_DIR/.env"
echo
echo "Elas NÃO serão gravadas dentro do instalador."
echo

read -r -p "URL do banco Supabase (DATABASE_URL): " SUPABASE_DATABASE_URL

if [ -z "$SUPABASE_DATABASE_URL" ]; then
    erro "DATABASE_URL do Supabase não pode ficar vazia."
fi

echo
read -r -s -p "Token da FocusNFe (FOCUS_API_TOKEN): " FOCUS_API_TOKEN
echo

if [ -z "$FOCUS_API_TOKEN" ]; then
    erro "FOCUS_API_TOKEN não pode ficar vazio."
fi

echo
read -r -p "URL da FocusNFe (FOCUS_BASE_URL): " FOCUS_BASE_URL

if [ -z "$FOCUS_BASE_URL" ]; then
    erro "FOCUS_BASE_URL não pode ficar vazia."
fi

echo
sucesso "Credenciais externas recebidas."

# ==============================================================================
# 5. CONFIGURAR POSTGRESQL LOCAL
# ==============================================================================

info "[4/8] Configurando PostgreSQL local..."

# Gera senha exclusiva para o usuário do banco
DB_PASS=$(openssl rand -hex 24)

# Verifica se o PostgreSQL está realmente acessível na porta configurada
if ! sudo -u postgres psql -p "$DB_PORT" -tAc "SELECT 1;" >/dev/null 2>&1; then
    erro "Não foi possível conectar ao PostgreSQL na porta $DB_PORT."
fi

# Cria banco caso ainda não exista
if sudo -u postgres psql -p "$DB_PORT" -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then

    aviso "Banco $DB_NAME já existe."

else

    sudo -u postgres createdb -p "$DB_PORT" "$DB_NAME"
    sucesso "Banco $DB_NAME criado."

fi

# Cria usuário caso ainda não exista
if sudo -u postgres psql -p "$DB_PORT" -tAc \
    "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then

    aviso "Usuário PostgreSQL $DB_USER já existe."

else

    sudo -u postgres psql -p "$DB_PORT" \
        -c "CREATE USER $DB_USER WITH LOGIN PASSWORD '$DB_PASS';"

    sucesso "Usuário $DB_USER criado."

fi

# Atualiza senha
sudo -u postgres psql -p "$DB_PORT" \
    -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASS';"

# Permissões necessárias
sudo -u postgres psql -p "$DB_PORT" \
    -c "GRANT CONNECT ON DATABASE $DB_NAME TO $DB_USER;"

sudo -u postgres psql -p "$DB_PORT" -d "$DB_NAME" \
    -c "GRANT USAGE, CREATE ON SCHEMA public TO $DB_USER;"

sudo -u postgres psql -p "$DB_PORT" -d "$DB_NAME" \
    -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;"

sudo -u postgres psql -p "$DB_PORT" -d "$DB_NAME" \
    -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;"

sucesso "PostgreSQL local configurado."

# ==============================================================================
# 6. COPIAR BACKEND
# ==============================================================================

info "[5/8] Instalando backend..."

# Remove instalação anterior do backend
if [ -d "$BACKEND_DIR" ]; then
    aviso "Removendo instalação anterior do backend..."
    systemctl stop encanto-toys-backend.service 2>/dev/null || true
    rm -rf "$BACKEND_DIR"
fi

mkdir -p "$BACKEND_DIR"

# Copiar somente arquivos necessários
cp -r "$BACKEND_SOURCE/app" "$BACKEND_DIR/"
cp "$BACKEND_SOURCE/requirements.txt" "$BACKEND_DIR/"

# Copiar uploads, se existirem
if [ -d "$BACKEND_SOURCE/uploads" ]; then
    cp -r "$BACKEND_SOURCE/uploads" "$BACKEND_DIR/"
fi

# Criar ambiente virtual
python3 -m venv "$BACKEND_DIR/.venv"

"$BACKEND_DIR/.venv/bin/pip" install --upgrade pip
"$BACKEND_DIR/.venv/bin/pip" install -r "$BACKEND_DIR/requirements.txt"

sucesso "Backend instalado."

# ==============================================================================
# 7. CRIAR .ENV
# ==============================================================================

info "[6/8] Criando configuração segura do backend..."

JWT_SECRET=$(openssl rand -hex 32)
DEVELOPER_TOKEN=$(openssl rand -hex 32)

LOCAL_DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5433/${DB_NAME}"

cat > "$BACKEND_DIR/.env" <<EOF
# ==============================================================================
# ENCANTO TOYS - CONFIGURAÇÃO DE PRODUÇÃO
# Arquivo gerado automaticamente pelo instalador.
# ==============================================================================

# Banco PostgreSQL LOCAL
LOCAL_DATABASE_URL=$LOCAL_DATABASE_URL

# Banco SUPABASE - sincronização
DATABASE_URL=$SUPABASE_DATABASE_URL

# Segurança
JWT_SECRET_KEY=$JWT_SECRET
DEVELOPER_TOKEN=$DEVELOPER_TOKEN

# Servidor
HOST=0.0.0.0
PORT=8000

# CORS
CORS_ORIGINS=http://localhost:1420,http://127.0.0.1:1420,tauri://localhost,http://localhost:5173,http://127.0.0.1:5173

# FocusNFe
FOCUS_API_TOKEN=$FOCUS_API_TOKEN
FOCUS_BASE_URL=$FOCUS_BASE_URL
EOF

chmod 600 "$BACKEND_DIR/.env"

# Permissão do backend
chown -R root:root "$BACKEND_DIR"

sucesso "Arquivo .env criado com permissões 600."

# ==============================================================================
# 8. CRIAR SERVIÇO SYSTEMD
# ==============================================================================

info "[7/8] Configurando serviço systemd..."

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Encanto Toys Backend Service
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple

User=root
Group=root

WorkingDirectory=$BACKEND_DIR

EnvironmentFile=$BACKEND_DIR/.env

ExecStart=$BACKEND_DIR/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000

Restart=always
RestartSec=5

NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable encanto-toys-backend.service
systemctl restart encanto-toys-backend.service

sucesso "Serviço systemd configurado."

# ==============================================================================
# 9. INSTALAR FRONTEND
# ==============================================================================

info "[8/8] Instalando aplicativo desktop..."

if [ -f "$DEB_FILE" ]; then

    dpkg -i "$DEB_FILE" || apt-get install -f -y

    sucesso "Aplicativo desktop instalado."

else

    aviso "encanto-toys_0.1.0_amd64.deb não encontrado."
    aviso "Instalação do frontend desktop ignorada."

fi

# ==============================================================================
# HEALTHCHECK
# ==============================================================================

echo
info "Aguardando o backend iniciar..."

sleep 5

echo
echo "===== STATUS DO SERVIÇO ====="

systemctl status encanto-toys-backend.service --no-pager || true

echo
echo "===== TESTANDO API ====="

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    http://127.0.0.1:8000/docs || true)

if [ "$HTTP_STATUS" = "200" ]; then

    echo
    echo -e "${GREEN}====================================================${NC}"
    echo -e "${GREEN}       INSTALAÇÃO CONCLUÍDA COM SUCESSO!${NC}"
    echo -e "${GREEN}====================================================${NC}"
    echo
    echo "Backend:"
    echo "  http://127.0.0.1:8000"
    echo
    echo "Swagger:"
    echo "  http://127.0.0.1:8000/docs"
    echo
    echo "Banco local:"
    echo "  $DB_NAME"
    echo
    echo "Diretório:"
    echo "  $BACKEND_DIR"
    echo
    echo "Serviço:"
    echo "  encanto-toys-backend.service"
    echo
    echo -e "${GREEN}O ambiente de desenvolvimento não foi alterado.${NC}"
    echo

else

    echo
    echo -e "${RED}====================================================${NC}"
    echo -e "${RED}       ATENÇÃO: API NÃO RESPONDEU${NC}"
    echo -e "${RED}====================================================${NC}"
    echo
    echo "HTTP Status: $HTTP_STATUS"
    echo
    echo "Verifique os logs:"
    echo
    echo "sudo journalctl -u encanto-toys-backend.service -n 100 --no-pager"
    echo

    exit 1

fi