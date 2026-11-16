from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from app.database import get_db
from app import models, schemas
from app.utils.ean13 import gerar_codigo_interno_ean13
from app.utils.license import exigir_licenca_valida

from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timezone
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

router = APIRouter(
    prefix="/produtos",
    tags=["Produtos"],
    dependencies=[Depends(exigir_licenca_valida)]
)

def _calcular_custo_unitario(payload: schemas.ProdutoCreate):
    if payload.quantidade_compra is None:
        return None

    if payload.quantidade_compra > 2_147_483_647:
        raise HTTPException(
            status_code=422,
            detail="Quantidade comprada acima do limite permitido.",
        )

    total = (
        payload.valor_compra_total
        + (payload.frete_total or Decimal("0"))
        + (payload.imposto_total or Decimal("0"))
        + (payload.outras_despesas_total or Decimal("0"))
    )

    custo = (total / Decimal(payload.quantidade_compra)).quantize(
        Decimal("0.0001"), rounding=ROUND_HALF_UP
    )

    if custo > Decimal("9999999999.9999"):
        raise HTTPException(
            status_code=422,
            detail="Custo unitário acima do limite permitido.",
        )

    return custo


def _preparar_dados_produto(payload: schemas.ProdutoCreate, produto=None):
    if produto is None:
        validado = payload
    else:
        # Preserva os campos que não foram enviados na edição.
        dados_atuais = {
            campo: getattr(produto, campo)
            for campo in schemas.ProdutoCreate.model_fields
        }
        dados_atuais.update(payload.model_dump(exclude_unset=True))

        try:
            validado = schemas.ProdutoCreate.model_validate(dados_atuais)
        except ValidationError as erro:
            raise HTTPException(
                status_code=422,
                detail=erro.errors(
                    include_context=False,
                    include_input=False,
                ),
            ) from erro

    dados = validado.model_dump()
    custo = _calcular_custo_unitario(validado)

    # Alterar apenas a quantidade em estoque não altera esta versão.
    cadastro_alterado = produto is None or any(
        getattr(produto, campo) != valor
        for campo, valor in dados.items()
        if campo != "quantidade_estoque"
    )

    if produto is not None and produto.custo_unitario != custo:
        cadastro_alterado = True

    return dados, custo, cadastro_alterado


def _salvar_produto(db: Session, produto: models.Produto):
    db.add(produto)

    try:
        db.commit()
    except IntegrityError as erro:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Não foi possível salvar: há dados conflitantes no cadastro.",
        ) from erro

    db.refresh(produto)
    return produto

# ==========================================
# --- CADASTRAR PRODUTO ---
# ==========================================
@router.post(
    "",
    response_model=schemas.ProdutoResponse,
    status_code=status.HTTP_201_CREATED,
)
@router.post(
    "/",
    response_model=schemas.ProdutoResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
def criar_produto(
    payload: schemas.ProdutoCreate,
    db: Session = Depends(get_db),
):
    produto_existente = (
        db.query(models.Produto)
        .filter(models.Produto.codigo_barras == payload.codigo_barras)
        .first()
    )

    if produto_existente:
        raise HTTPException(
            status_code=400,
            detail="Já existe um produto cadastrado com este código de barras.",
        )

    dados, custo, _ = _preparar_dados_produto(payload)

    novo_produto = models.Produto(
        **dados,
        custo_unitario=custo,
        dados_produto_atualizados_em=datetime.now(timezone.utc),
    )

    return _salvar_produto(db, novo_produto)

# ==========================================
# --- ATUALIZAR PRODUTO (PUT) ---
# ==========================================
@router.put("/{produto_id}", response_model=schemas.ProdutoResponse)
def atualizar_produto(
    produto_id: int,
    payload: schemas.ProdutoCreate,
    db: Session = Depends(get_db),
):
    produto = (
        db.query(models.Produto)
        .filter(models.Produto.id == produto_id)
        .first()
    )

    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")

    dados, custo, cadastro_alterado = _preparar_dados_produto(
        payload, produto
    )

    codigo_em_uso = (
        db.query(models.Produto)
        .filter(
            models.Produto.codigo_barras == dados["codigo_barras"],
            models.Produto.id != produto_id,
        )
        .first()
    )

    if codigo_em_uso:
        raise HTTPException(
            status_code=400,
            detail="Já existe outro produto com este código de barras.",
        )

    for campo, valor in dados.items():
        setattr(produto, campo, valor)

    produto.custo_unitario = custo

    if cadastro_alterado:
        produto.dados_produto_atualizados_em = datetime.now(timezone.utc)

    return _salvar_produto(db, produto)
# ==========================================
# --- EXCLUIR PRODUTO (DELETE) ---
# ==========================================
@router.delete("/{produto_id}", status_code=status.HTTP_200_OK)
def deletar_produto(produto_id: int, db: Session = Depends(get_db)):
    produto = db.query(models.Produto).filter(models.Produto.id == produto_id).first()
    
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
    
    # NÃO USE: db.delete(produto)
    # USE: Apenas altera a coluna 'ativo' para False
    produto.ativo = False

    # Registra a inativação para a futura sincronização por data. Preserve as funções de listagem e busca.
    produto.dados_produto_atualizados_em = datetime.now(timezone.utc)
    
    db.commit()
    db.refresh(produto)
    
    return {"message": "Produto inativado com sucesso"}

# ==========================================
# --- LISTAR/BUSCAR PRODUTOS PARA O PDV ---
# ==========================================
@router.get("", response_model=List[schemas.ProdutoPDVResponse])
@router.get("/", response_model=List[schemas.ProdutoPDVResponse], include_in_schema=False)
def listar_produtos(busca: str = "", db: Session = Depends(get_db)):
    query = db.query(models.Produto).filter(models.Produto.ativo == True)
    
 # Se houver termo na busca, pesquisa em múltiplos campos
    if busca.strip():
        termo = f"%{busca.strip()}%"
        query = query.filter(
            or_(
                models.Produto.nome_produto.ilike(termo),   # Busca por Nome
                models.Produto.codigo_barras.ilike(termo), # Busca por Código de Barras
                models.Produto.categoria.ilike(termo)      # Busca por Categoria
            )
        )

    produtos = query.all()
    
    # 🟢 MANTÉM a sua conversão customizada para a resposta
    return [schemas.ProdutoPDVResponse.from_orm_custom(produto) for produto in produtos]
# ==========================================
# --- BUSCAR PRODUTO POR CÓDIGO ---
# ==========================================
@router.get("/{codigo_barras}", response_model=schemas.ProdutoResponse)
def obter_produto_por_codigo(codigo_barras: str, db: Session = Depends(get_db)):
    produto = db.query(models.Produto).filter(models.Produto.codigo_barras == codigo_barras).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
    return produto