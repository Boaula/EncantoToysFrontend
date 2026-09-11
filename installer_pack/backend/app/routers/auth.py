# app/routers/auth.py
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.database import get_db
from app import models
from app import schemas
from app.utils.security import gerar_senha_hash, verificar_senha, criar_token_acesso
router = APIRouter(tags=["Autenticação"])

@router.post("/cadastro", response_model=schemas.UsuarioResponse, status_code=status.HTTP_201_CREATED)
def cadastrar_usuario(usuario_in: schemas.UsuarioCreate, db: Session = Depends(get_db)):
    # Verifica se usuário já existe
    existe_usuario = db.query(models.Usuario).filter(models.Usuario.username == usuario_in.username).first()
    if existe_usuario:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nome de usuário já cadastrado."
        )
    
    # Criptografa a senha antes de salvar
    senha_criptografada = gerar_senha_hash(usuario_in.password)
    
    novo_usuario = models.Usuario(
        username=usuario_in.username,
        senha_hash=senha_criptografada,
        cargo=models.CargoUsuario(usuario_in.cargo.value)
    )
    
    db.add(novo_usuario)
    db.commit()
    db.refresh(novo_usuario)
    return novo_usuario

@router.post("/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # Busca o usuário pelo username
    usuario = db.query(models.Usuario).filter(models.Usuario.username == form_data.username).first()
    
    # Valida se o usuário existe e se a senha bate
    if not usuario or not verificar_senha(form_data.password, usuario.senha_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário ou senha incorretos.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Gera o token embutindo as informações dele (ID, Username e Cargo)
    token_dados = {
        "sub": usuario.username,
        "id": usuario.id,
        "cargo": usuario.cargo.value
    }
    
    token_jwt = criar_token_acesso(dados=token_dados)
    
    return {
        "access_token": token_jwt, 
        "token_type": "bearer",
        "cargo": usuario.cargo.value
    }