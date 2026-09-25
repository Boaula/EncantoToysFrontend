from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db, SessionSupabase
from app.models import Usuario, CaixaDispositivo
from app.schemas import UsuarioCreate, UsuarioResponse, CaixaResponse, CaixaUpdate
from typing import List
from app.utils.security import gerar_senha_hash
from app.utils.license import exigir_licenca_valida
from sqlalchemy import func

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
    # Normaliza o username para minúsculas
    username_normalizado = payload.username.strip().lower()

    # Verifica se já existe ignorando maiúsculas/minúsculas
    usuario_existe = (
        db.query(Usuario)
        .filter(func.lower(Usuario.username) == username_normalizado)
        .first()
    )
    if usuario_existe:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Este nome de usuário já está cadastrado."
        )
    
    # Cria o novo funcionário
    novo_funcionario = Usuario(
        username=username_normalizado,
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
def atualizar_tag_caixa(
    caixa_id: int,
    payload: CaixaUpdate,
    db: Session = Depends(get_db)
):
    caixa = (
        db.query(CaixaDispositivo)
        .filter(CaixaDispositivo.id == caixa_id)
        .first()
    )

    if not caixa:
        raise HTTPException(
            status_code=404,
            detail="Dispositivo não encontrado"
        )

    nova_tag = payload.tag_nome.strip()

    if not nova_tag:
        raise HTTPException(
            status_code=400,
            detail="A tag do caixa não pode ficar vazia"
        )

    db_supabase = SessionSupabase()

    try:
        caixa_nuvem = (
            db_supabase.query(CaixaDispositivo)
            .filter(CaixaDispositivo.hostname == caixa.hostname)
            .first()
        )

        if caixa_nuvem:
            caixa_nuvem.tag_nome = nova_tag
        else:
            caixa_nuvem = CaixaDispositivo(
                hostname=caixa.hostname,
                tag_nome=nova_tag,
                esta_aberto=caixa.esta_aberto,
            )
            db_supabase.add(caixa_nuvem)

        db_supabase.commit()

    except Exception as e:
        db_supabase.rollback()
        raise HTTPException(
            status_code=503,
            detail=f"Não foi possível sincronizar a tag: {e}"
        )

    finally:
        db_supabase.close()

    caixa.tag_nome = nova_tag
    db.commit()
    db.refresh(caixa)

    return caixa