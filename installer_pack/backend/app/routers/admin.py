from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Usuario, CaixaDispositivo
from app.schemas import UsuarioCreate, UsuarioResponse, CaixaResponse, CaixaUpdate
from typing import List
from app.utils.security import gerar_senha_hash
from app.utils.license import exigir_licenca_valida

router = APIRouter(
    prefix="/admin",
    tags=["Gerenciamento Admin"],
    dependencies=[Depends(exigir_licenca_valida)]
)

@router.post("/cadastrar-operador", response_model=UsuarioResponse)
def cadastrar_operador(payload: UsuarioCreate, db: Session = Depends(get_db)):
    """
    Rota para o painel da Jéssica cadastrar novos funcionários (ADMIN ou OPERADOR)
    """
    # Verifica se o username já existe
    usuario_existe = db.query(Usuario).filter(Usuario.username == payload.username.lower()).first()
    if usuario_existe:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Este nome de usuário já está cadastrado."
        )
    
    # Cria o novo funcionário
    novo_funcionario = Usuario(
        username=payload.username.lower(),
        senha_hash=gerar_senha_hash(payload.password),
        cargo=payload.cargo # Usa o Enum configurado no seu schemas/models
    )
    
    db.add(novo_funcionario)
    db.commit()
    db.refresh(novo_funcionario)
    
    return novo_funcionario

# 1. Rota para a Jéssica listar todos os caixas no painel Admin
@router.get("/caixas", response_model=List[CaixaResponse])
def listar_caixas(db: Session = Depends(get_db)):
    return db.query(CaixaDispositivo).all()

# 2. Rota para a Jéssica alterar o nome/tag de um caixa específico
@router.put("/caixas/{caixa_id}", response_model=CaixaResponse)
def atualizar_tag_caixa(caixa_id: int, payload: CaixaUpdate, db: Session = Depends(get_db)):
    caixa = db.query(CaixaDispositivo).filter(CaixaDispositivo.id == caixa_id).first()
    if not caixa:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado")
    
    caixa.tag_nome = payload.tag_nome
    db.commit()
    db.refresh(caixa)
    return caixa