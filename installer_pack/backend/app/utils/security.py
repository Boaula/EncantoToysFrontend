# app/utils/security.py
import bcrypt
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt
import os

# Chave secreta para assinar o token (em produção, use uma variável de ambiente)
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "chave_secreta_super_segura_para_encanto_toys_2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 horas de duração (um turno de trabalho completo)

def verificar_senha(senha_pura: str, senha_criptografada: str) -> bool:
    """Compara uma senha digitada com o hash salvo no banco."""
    # O bcrypt trabalha com bytes, então codificamos as strings em utf-8
    senha_bytes = senha_pura.encode("utf-8")
    hash_bytes = senha_criptografada.encode("utf-8")
    return bcrypt.checkpw(senha_bytes, hash_bytes)

def gerar_senha_hash(senha: str) -> str:
    """Gera um hash criptografado a partir de uma senha comum."""
    senha_bytes = senha.encode("utf-8")
    # Gera o sal (salt) aleatório e o hash final
    salt = bcrypt.gensalt()
    hash_bytes = bcrypt.hashpw(senha_bytes, salt)
    # Retorna como string para ser salvo amigavelmente no banco
    return hash_bytes.decode("utf-8")

def criar_token_acesso(dados: dict, tempo_expiracao: Optional[timedelta] = None) -> str:
    """Gera um Token JWT seguro com tempo limite de validade."""
    dados_para_criptografar = dados.copy()
    
    if tempo_expiracao:
        expire = datetime.utcnow() + tempo_expiracao
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        
    dados_para_criptografar.update({"exp": expire})
    token_jwt = jwt.encode(dados_para_criptografar, SECRET_KEY, algorithm=ALGORITHM)
    return token_jwt