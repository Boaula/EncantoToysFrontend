import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

load_dotenv()

# Banco Local (Uso contínuo do caixa)
LOCAL_DATABASE_URL = os.getenv("LOCAL_DATABASE_URL")
if not LOCAL_DATABASE_URL:
    raise RuntimeError("LOCAL_DATABASE_URL não configurada.")

# Banco Supabase (Nuvem)
SUPABASE_DATABASE_URL = os.getenv("DATABASE_URL")
if not SUPABASE_DATABASE_URL:
    raise RuntimeError("DATABASE_URL não configurada.")

# --- CONEXÃO LOCAL ---
engine_local = create_engine(LOCAL_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine_local)

# --- CONEXÃO SUPABASE ---
engine_supabase = create_engine(SUPABASE_DATABASE_URL) if SUPABASE_DATABASE_URL else None
SessionSupabase = sessionmaker(autocommit=False, autoflush=False, bind=engine_supabase) if engine_supabase else None

Base = declarative_base()

# Dependência do FastAPI para as rotas normais do caixa (Usa Banco Local)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()