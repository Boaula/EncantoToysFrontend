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
from app.routers import produtos, vendas, auth, admin, pdv, sync, fiscal, license
from app.routers.admin import router as admin_router
from app.models import Usuario, CaixaDispositivo
from app.utils.security import gerar_senha_hash
from app.services.sync_service import sincronizar_tudo_com_supabase

load_dotenv()

# ==============================================================================
# 1. LOOP DE SINCRONIZAÇÃO E LIFESPAN (Definido ANTES do FastAPI)
# ==============================================================================

async def loop_sincronizacao():
    while True:
        try:
            print("🔄 Iniciando tentativa de sincronização...")
            await asyncio.wait_for(
                asyncio.to_thread(sincronizar_tudo_com_supabase),
                timeout=20.0
            )
            print("🟢 Sincronização concluída com sucesso!")
        except asyncio.TimeoutError:
            print("⚠️ Timeout: Wi-Fi oscilou. Tentando novamente em 30s...")
        except Exception as e:
            print(f"⚠️ Erro na sincronização: {e}")

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

# --- Endpoints Diretos de Operação do Caixa (PDV) ---
class IdentificarPayload(BaseModel):
    hostname: str
    username: str

@app.post("/pdv/iniciar-operacao")
def identificar_maquina(payload: IdentificarPayload, db: Session = Depends(get_db)):
    caixa = db.query(CaixaDispositivo).filter(CaixaDispositivo.hostname == payload.hostname).first()
    
    if not caixa:
        caixa = CaixaDispositivo(
            hostname=payload.hostname,
            tag_nome=f"Caixa Pendente ({payload.hostname})",
            esta_aberto=True
        )
        db.add(caixa)
    else:
        caixa.esta_aberto = True
    
    db.commit()
    db.refresh(caixa)
        
    return {
        "tag_nome": caixa.tag_nome,
        "esta_aberto": caixa.esta_aberto
    }

class FecharPayload(BaseModel):
    hostname: str

@app.post("/pdv/fechar-operacao")
def fechar_operacao(payload: FecharPayload, db: Session = Depends(get_db)):
    caixa = db.query(CaixaDispositivo).filter(CaixaDispositivo.hostname == payload.hostname).first()
    
    if caixa:
        caixa.esta_aberto = False
        db.commit()
        db.refresh(caixa)
        return {"status": "caixa_fechado", "tag_nome": caixa.tag_nome}
        
    return {"status": "erro", "message": "Dispositivo não encontrado"}