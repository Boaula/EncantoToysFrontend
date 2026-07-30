🧸 Encanto Toys — Sistema de PDV & Gestão de Estoque
O Encanto Toys é uma aplicação desktop de alta performance desenvolvida para gestão de estoque e Ponto de Venda (PDV). O sistema adota uma arquitetura Offline-First, permitindo que o caixa continue operando sem interrupções mesmo se houver queda de conexão com a internet, sincronizando os dados em segundo plano com a nuvem.

🏗️ Arquitetura do Sistema
O sistema é dividido em três camadas principais:

┌───────────────────────────────────────────────────────────┐
│                    DESKTOP APPLICATION                    │
│   React 18 + TypeScript + Tailwind CSS + Shadcn UI         │
│   ┌───────────────────────────────────────────────────┐   │
│   │   Tauri v2 (Rust Core Wrapper - Windows/Linux)    │   │
│   └───────────────────────────────────────────────────┘   │
└─────────────────────────────┬─────────────────────────────┘
                              │ HTTP / REST API (Localhost:8000)
┌─────────────────────────────▼─────────────────────────────┐
│                      BACKEND LOCAL                        │
│             FastAPI + Uvicorn + SQLAlchemy                │
└──────────────┬─────────────────────────────┬──────────────┘
               │ SQLAlchemy                  │ Sync Worker (30s)
┌──────────────▼────────────┐   ┌────────────▼──────────────┐
│ BANCO DE DADOS LOCAL      │   │ BANCO DE DADOS NUVEM      │
│ PostgreSQL (Local)        │   │ Supabase (PostgreSQL)     │
│  • Operação em tempo real │   │  • Backup & Sincronia     │
└───────────────────────────┘   └───────────────────────────┘
🛠️ Tecnologias Utilizadas
Frontend & Desktop
Tauri v2: Framework Rust ultra leve (~20MB de build) para encapsular a aplicação web em um executável nativo.

React + TypeScript: Interface reativa e fortemente tipada.

Tailwind CSS: Estilização ágil e responsiva.

Shadcn UI / Lucide Icons: Componentes de interface e iconografia moderna.

Sonner: Notificações estilo toast em tempo real.

Backend & APIs
FastAPI: Framework Python assíncrono de altíssimo desempenho para fornecimento das APIs REST.

Pydantic v2: Validação e serialização rigorosa dos schemas de dados (ProdutoResponse, ProdutoPDVResponse).

SQLAlchemy: ORM para abstração das consultas ao banco de dados PostgreSQL.

Banco de Dados & Sincronização
PostgreSQL (Local): Banco primário de escrita e leitura instantânea no PDV.

Supabase (Cloud PostgreSQL): Banco na nuvem para consolidação de dados e gestão remota.

🗄️ Estrutura e Sincronização de Banco de Dados
1. Estratégia Offline-First
Todas as transações de venda, consulta de estoque e cadastros ocorrem diretamente no banco de dados local (PostgreSQL). Isso garante:

Latência zero ao bipar produtos com o leitor de código de barras.

Funcionamento contínuo sem dependência de internet.

2. Inativação Lógica (Soft Delete)
Produtos deletados na interface nunca são excluídos fisicamente do banco de dados.

Ao excluir um produto, o backend altera o atributo ativo = False.

A API e a interface filtram e exibem apenas itens onde ativo == True.

Essa abordagem preserva o histórico fiscal/financeiro de vendas antigas vinculadas a esses produtos.

3. Sincronização Automática (syncService.py)
Um serviço em segundo plano roda a cada 30 segundos executando o seguinte fluxo:

Consulta todos os registros do banco local (incluindo os marcados como ativo = False).

Realiza o merge no Supabase, atualizando dados alterados ou desativando registros excluídos localmente.

Garanta alinhamento perfeito entre a loja física e o painel na nuvem.

🦀 Integração com o Tauri (Desktop Wrapper)
Diferente do Electron (que consome centenas de megabytes de memória RAM), o Tauri v2 utiliza a engine nativa do sistema operacional (WebKitGTK no Linux / WebView2 no Windows) controlada por um núcleo escrito em Rust.

Destaques da Integração:
Consumo Mínimo de Recursos: Consome apenas ~50MB a 80MB de memória RAM em execução.

Atalhos Globais do Teclado: Integração direta com eventos de teclado para agilizar a operação do caixa:

F2 — Focar instantaneamente no campo de busca.

F3 — Limpar o carrinho de compras.

F4 — Abrir o menu de finalização de pagamento.

ESC — Limpar pesquisas ou fechar modais.

Componentes Arrastáveis: Suporte a componentes flutuantes (ex: CardHistoricoFlutuante) com diferenciação inteligente entre evento de arrasto e clique.

⚠️ Nota de Desenvolvimento: A pasta src-tauri/target armazena os arquivos temporários da compilação incremental do Rust e pode crescer bastante em disco durante o desenvolvimento. Para limpar o cache de build, execute cargo clean na pasta src-tauri.

🚀 Como Executar o Projeto
Pré-requisitos
Node.js (v18+)

Python (3.10+)

Rust & Cargo (Instalar Rust)

Instâncias do PostgreSQL rodando localmente e no Supabase.

1️⃣ Configurando o Backend (FastAPI)
Bash
# Entre na pasta do backend
cd encanto-toys-backend

# Crie e ative o ambiente virtual
python -m venv venv
source venv/bin/activate  # No Windows: venv\Scripts\activate

# Instale as dependências
pip install -r requirements.txt

# Inicie o servidor FastAPI
uvicorn app.main:app --reload --port 8000
2️⃣ Configurando o Frontend & Tauri
Bash
# Entre na pasta do frontend
cd encanto-toys-frontend

# Instale os pacotes Node
npm install  # ou pnpm install / yarn

# Inicie a aplicação no modo Desktop (Tauri + React Dev)
npm run tauri dev
🔍 Regras da Busca Unificada no PDV
A rota GET /produtos?busca=... utiliza consultas parametrizadas do SQLAlchemy com a cláusula or_ para filtrar dados dinamicamente:

Python
# Busca realizada simultaneamente em 3 campos (insensível a maiúsculas/minúsculas)
query.filter(
    or_(
        models.Produto.nome_produto.ilike(f"%{termo}%"),
        models.Produto.codigo_barras.ilike(f"%{termo}%"),
        models.Produto.categoria.ilike(f"%{termo}%")
    )
)
🎲 Gerador de Código de Barras Interno
Para evitar conflitos com EANs de fábrica e garantir 0% de risco de duplicidade, os produtos sem código de fábrica recebem um código no padrão EAN-13 Interno:

Prefixo: 200

Sufixo: Os últimos 9 dígitos do carimbo de data/hora atual em milissegundos (Date.now()).

📜 Licença
Este projeto é de uso privado para o sistema de gestão de vendas e estoque Encanto Toys.