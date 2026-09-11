from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from datetime import datetime

from app.database import get_db
from app.models import Produto, Venda, ItemVenda 

router = APIRouter(
    prefix="/sync",
    tags=["Sincronização PDV"]
)

class ItemVendaSchema(BaseModel):
    produto_id: int
    quantidade: int
    preco_unitario: float

class VendaSchema(BaseModel):
    uuid: str
    data_venda: datetime
    usuario_id: int
    caixa_id: int
    forma_pagamento: str
    total: float
    itens: List[ItemVendaSchema]

@router.get("/pull-produtos")
def pull_produtos(db: Session = Depends(get_db)):
    """Baixa o catálogo do Supabase para o caixa local."""
    return db.query(Produto).all()

@router.post("/push-vendas")
def push_vendas(vendas: List[VendaSchema], db: Session = Depends(get_db)):
    """Recebe as vendas offline e salva no Supabase com idempotência."""
    sincronizadas = []

    for item_venda in vendas:
        # Idempotência: Se o UUID já existe, ignora e marca como ok
        existente = db.query(Venda).filter(Venda.uuid == item_venda.uuid).first()
        if existente:
            sincronizadas.append(item_venda.uuid)
            continue

        # Grava a venda no PostgreSQL respeitando as chaves estrangeiras
        nova_venda = Venda(
            uuid=item_venda.uuid,
            data_venda=item_venda.data_venda,
            usuario_id=item_venda.usuario_id,
            caixa_id=item_venda.caixa_id,
            forma_pagamento=item_venda.forma_pagamento,
            total=item_venda.total
        )
        db.add(nova_venda)
        db.flush()

        # Insere os itens e abate do estoque
        for item in item_venda.itens:
            novo_item = ItemVenda(
                venda_id=nova_venda.id,
                produto_id=item.produto_id,
                quantidade=item.quantidade,
                preco_estatico=item.preco_unitario
            )
            db.add(novo_item)

            produto = db.query(Produto).filter(Produto.id == item.produto_id).first()
            if produto:
                produto.quantidade_estoque -= item.quantidade

        sincronizadas.append(item_venda.uuid)

    db.commit()
    return {"status": "sucesso", "sincronizados": sincronizadas}