from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from app.database import get_db
from app import models, schemas
from app.utils.ean13 import gerar_codigo_interno_ean13
from app.utils.license import exigir_licenca_valida

router = APIRouter(
    prefix="/produtos",
    tags=["Produtos"],
    dependencies=[Depends(exigir_licenca_valida)]
)

# ==========================================
# --- CADASTRAR PRODUTO ---
# ==========================================
@router.post("", response_model=schemas.ProdutoResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=schemas.ProdutoResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def criar_produto(payload: schemas.ProdutoCreate, db: Session = Depends(get_db)):
    """
    Cadastra um novo produto no banco de dados local.
    """
    # 🔍 Verifica se já existe um produto com o mesmo código de barras
    produto_existente = db.query(models.Produto).filter(
        models.Produto.codigo_barras == payload.codigo_barras
    ).first()

    if produto_existente:
        raise HTTPException(
            status_code=400, 
            detail="Já existe um produto cadastrado com este código de barras."
        )

    # 🟢 Cria a nova instância do produto
    novo_produto = models.Produto(
        codigo_barras=payload.codigo_barras,
        tipo_codigo=payload.tipo_codigo,
        nome_produto=payload.nome_produto,
        preco_venda=payload.preco_venda,
        quantidade_estoque=payload.quantidade_estoque,
        categoria=payload.categoria
    )

    db.add(novo_produto)
    db.commit()
    db.refresh(novo_produto)

    return novo_produto

# ==========================================
# --- ATUALIZAR PRODUTO (PUT) ---
# ==========================================
@router.put("/{produto_id}", response_model=schemas.ProdutoResponse)
def atualizar_produto(produto_id: int, payload: schemas.ProdutoCreate, db: Session = Depends(get_db)):
    produto = db.query(models.Produto).filter(models.Produto.id == produto_id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
    
    # Atualiza os campos
    produto.codigo_barras = payload.codigo_barras
    produto.tipo_codigo = payload.tipo_codigo
    produto.nome_produto = payload.nome_produto
    produto.preco_venda = payload.preco_venda
    produto.quantidade_estoque = payload.quantidade_estoque
    produto.categoria = payload.categoria

    db.commit()
    db.refresh(produto)
    return produto

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