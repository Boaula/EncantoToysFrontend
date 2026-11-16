from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional

from app.database import get_db
from app import models, schemas
from app.utils.license import exigir_licenca_valida


router = APIRouter(
    prefix="/clientes",
    tags=["Clientes"],
    dependencies=[Depends(exigir_licenca_valida)]
)


# ==========================================
# --- LISTAR CLIENTES ---
# ==========================================

@router.get("/", response_model=List[schemas.ClienteResponse])
def listar_clientes(
    busca: Optional[str] = Query(None, description="Busca por nome, CPF, telefone ou e-mail"),
    apenas_ativos: bool = Query(True, description="Retorna somente clientes ativos"),
    db: Session = Depends(get_db)
):
    query = db.query(models.Cliente)

    if apenas_ativos:
        query = query.filter(models.Cliente.ativo == True)

    if busca:
        termo = f"%{busca}%"

        query = query.filter(
            or_(
                models.Cliente.nome.ilike(termo),
                models.Cliente.cpf.ilike(termo),
                models.Cliente.telefone.ilike(termo),
                models.Cliente.email.ilike(termo)
            )
        )

    return query.order_by(models.Cliente.nome.asc()).all()


# ==========================================
# --- BUSCAR CLIENTE POR ID ---
# ==========================================

@router.get("/{cliente_id}", response_model=schemas.ClienteResponse)
def buscar_cliente(
    cliente_id: int,
    db: Session = Depends(get_db)
):
    cliente = (
        db.query(models.Cliente)
        .filter(models.Cliente.id == cliente_id)
        .first()
    )

    if not cliente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente não encontrado."
        )

    return cliente


# ==========================================
# --- CRIAR CLIENTE ---
# ==========================================

@router.post("/", response_model=schemas.ClienteResponse, status_code=status.HTTP_201_CREATED)
def criar_cliente(
    payload: schemas.ClienteCreate,
    db: Session = Depends(get_db)
):
    # Verifica CPF duplicado
    if payload.cpf:
        cliente_existente = (
            db.query(models.Cliente)
            .filter(models.Cliente.cpf == payload.cpf)
            .first()
        )

        if cliente_existente:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Já existe um cliente cadastrado com este CPF."
            )

    novo_cliente = models.Cliente(
        nome=payload.nome,
        cpf=payload.cpf,
        telefone=payload.telefone,
        email=payload.email,
        data_nascimento=payload.data_nascimento,
        observacoes=payload.observacoes,
        ativo=payload.ativo
    )

    db.add(novo_cliente)
    db.commit()
    db.refresh(novo_cliente)

    return novo_cliente


# ==========================================
# --- ATUALIZAR CLIENTE ---
# ==========================================

@router.put("/{cliente_id}", response_model=schemas.ClienteResponse)
def atualizar_cliente(
    cliente_id: int,
    payload: schemas.ClienteUpdate,
    db: Session = Depends(get_db)
):
    cliente = (
        db.query(models.Cliente)
        .filter(models.Cliente.id == cliente_id)
        .first()
    )

    if not cliente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente não encontrado."
        )

    # Verifica CPF duplicado em outro cliente
    if payload.cpf:
        cliente_existente = (
            db.query(models.Cliente)
            .filter(
                models.Cliente.cpf == payload.cpf,
                models.Cliente.id != cliente_id
            )
            .first()
        )

        if cliente_existente:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Já existe outro cliente cadastrado com este CPF."
            )

    dados = payload.model_dump(exclude_unset=True)

    for campo, valor in dados.items():
        setattr(cliente, campo, valor)

    db.commit()
    db.refresh(cliente)

    return cliente


# ==========================================
# --- EXCLUIR CLIENTE ---
# ==========================================

@router.delete("/{cliente_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_cliente(
    cliente_id: int,
    db: Session = Depends(get_db)
):
    cliente = (
        db.query(models.Cliente)
        .filter(models.Cliente.id == cliente_id)
        .first()
    )

    if not cliente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente não encontrado."
        )

    # Exclusão lógica
    cliente.ativo = False

    db.commit()

    return None