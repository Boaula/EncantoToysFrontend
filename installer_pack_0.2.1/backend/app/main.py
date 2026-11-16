import os
import asyncio
from contextlib import asynccontextmanager
from dotenv import load_dotenv

from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import Base, get_db, engine_local, SessionLocal
from app.routers import produtos, vendas, auth, admin, pdv, sync, fiscal, license, clientes, xml_compras, relatorios_vendas
from app.routers.admin import router as admin_router
from app.models import Usuario, CaixaDispositivo
from app.utils.security import gerar_senha_hash
from app.services.sync_service import (
    sincronizar_tudo_com_supabase,
    logger as log_sincronizacao,
)

load_dotenv()

# ==============================================================================
# 1. LOOP DE SINCRONIZAÇÃO E LIFESPAN (Definido ANTES do FastAPI)
# ==============================================================================

async def loop_sincronizacao():
    while True:
        try:
            log_sincronizacao.debug("Iniciando sincronização.")

            await asyncio.wait_for(
                asyncio.to_thread(sincronizar_tudo_com_supabase),
                timeout=20.0,
            )

            log_sincronizacao.debug("Ciclo de sincronização encerrado.")

        except asyncio.TimeoutError:
            log_sincronizacao.warning(
                "Sincronização excedeu 20 segundos. "
                "Nova tentativa em 30 segundos."
            )

        except Exception:
            log_sincronizacao.exception(
                "Falha no ciclo de sincronização."
            )

        await asyncio.sleep(30)


# 3. DEFINA O LIFESPAN ANTES DE USÁ-LO
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Cria tabelas locais no banco
    Base.metadata.create_all(bind=engine_local)

    # Inicia a sincronização.
    # A licença oficial será determinada pelo Supabase.
    task = asyncio.create_task(loop_sincronizacao())

    yield

    # Cancela ao desligar o servidor
    task.cancel()

# ==============================================================================
# 2. INSTÂNCIA ÚNICA DO FASTAPI
# ==============================================================================

app = FastAPI(
    title="Encanto Toys API Gateway", 
    description="Servidor Central de Sincronização e Cadastro da Loja Encanto Toys", 
    version="1.0.0",
    lifespan=lifespan
)

# ==============================================================================
# 3. MIDDLEWARE DE CORS
# ==============================================================================

origins = [
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",

    # Tauri
    "tauri://localhost",
    "http://tauri.localhost",
]

@app.middleware("http")
async def log_origin(request, call_next):
    origin = request.headers.get("origin")
    print(f"🌐 [CORS] {request.method} {request.url.path} | Origin: {origin}")
    response = await call_next(request)
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================================================================
# 4. INCLUSÃO DOS ROUTERS PRINCIPAIS
# ==============================================================================

app.include_router(produtos.router)
app.include_router(vendas.router)
app.include_router(auth.router)
app.include_router(admin_router)
app.include_router(pdv.router)
app.include_router(sync.router)
app.include_router(fiscal.router)
app.include_router(license.router)
app.include_router(clientes.router)
app.include_router(xml_compras.router)
app.include_router(relatorios_vendas.router)

# ==============================================================================
# 5. ROTAS BÁSICAS E DE SISTEMA
# ==============================================================================

@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": "API Gateway da Encanto Toys operando perfeitamente!"
    }

@app.get("/favicon.ico", include_in_schema=True)
def favicon():
    return FileResponse("app/static/ET.ico", media_type="image/x-icon")

# --- Router de Setup do Desenvolvedor ---
system_router = APIRouter(prefix="/system", tags=["System Setup"])

class DeveloperCreateUserSchema(BaseModel):
    username: str
    password: str
    cargo: str  # "ADMIN" ou "CAIXA"

@system_router.post("/setup-user")
def developer_setup_user(
    payload: DeveloperCreateUserSchema, 
    x_developer_token: str = Header(...), 
    db: Session = Depends(get_db)
):
    DEV_TOKEN_MASTER = os.getenv("DEVELOPER_TOKEN", "fallback_provisorio")
    if x_developer_token != DEV_TOKEN_MASTER:
        raise HTTPException(status_code=403, detail="Acesso restrito ao desenvolvedor do sistema.")
    
    user_exists = db.query(Usuario).filter(Usuario.username == payload.username.lower()).first()
    if user_exists:
        raise HTTPException(status_code=400, detail="Este usuário já está cadastrado.")
    
    novo_usuario = Usuario(
        username=payload.username.lower(),
        senha_hash=gerar_senha_hash(payload.password),
        cargo=payload.cargo.upper()
    )
    
    db.add(novo_usuario)
    db.commit()
    
    return {"status": "sucesso", "message": f"Usuário {payload.username} criado como {payload.cargo}."}

app.include_router(system_router)