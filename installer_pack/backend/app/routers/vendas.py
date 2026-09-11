from fastapi import APIRouter, Depends, HTTPException, status, Query
from app.utils.license import exigir_licenca_valida
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime
from zoneinfo import ZoneInfo

from app.database import get_db
from app import models, schemas

router = APIRouter(
    prefix="/vendas",
    tags=["Vendas"],
    dependencies=[Depends(exigir_licenca_valida)]
)


# ==========================================
# 1. REGISTRAR NOVA VENDA
# ==========================================
@router.post("/", status_code=status.HTTP_201_CREATED)
def registrar_venda(payload: schemas.VendaCreate, db: Session = Depends(get_db)):
    """
    Registra uma nova venda, diminui o estoque dos produtos,
    grava os descontos/acréscimos na tabela venda_ajustes
    e marca a venda com sincronizado = False.
    """
    if not payload.itens:
        raise HTTPException(status_code=400, detail="A venda deve conter pelo menos um item.")

    try:
        # 1. Tratamento da Forma de Pagamento
        texto_forma_pgto = str(payload.forma_pagamento).upper().strip()
        
        try:
            forma_pagamento_enum = models.FormaPagamento[texto_forma_pgto]
        except (KeyError, AttributeError):
            try:
                forma_pagamento_enum = models.FormaPagamento(texto_forma_pgto)
            except ValueError:
                forma_pagamento_enum = texto_forma_pgto

        # Captura o horário no fuso de Cuiabá/MT (UTC-4)
        data_cuiaba = datetime.now(ZoneInfo("America/Cuiaba"))

        # 2. Criar o cabeçalho da Venda
        nova_venda = models.Venda(
            caixa_id=payload.caixa_id or 1,
            usuario_id=payload.usuario_id or 1,
            forma_pagamento=forma_pagamento_enum,
            total=payload.valor_total,
            sincronizado=False,
            data_venda=data_cuiaba
        )
        db.add(nova_venda)
        db.flush()  # Gera o ID da nova_venda no Postgres

        # 🟢 3. Tratamento e Persistência de Desconto / Acréscimo (venda_ajustes)
        try:
            desconto_val = float(getattr(payload, 'desconto', 0) or 0)
        except (ValueError, TypeError):
            desconto_val = 0.0

        try:
            acrescimo_val = float(getattr(payload, 'acrescimo', 0) or 0)
        except (ValueError, TypeError):
            acrescimo_val = 0.0

        desconto_tipo = str(getattr(payload, 'desconto_tipo', 'R$') or 'R$')
        acrescimo_tipo = str(getattr(payload, 'acrescimo_tipo', 'R$') or 'R$')

        ajustes_registrados = []

        # Grava Desconto se for maior que 0
        if desconto_val > 0:
            ajuste_desc = models.VendaAjuste(
                venda_id=nova_venda.id,
                tipo="DESCONTO",
                forma_calculo=desconto_tipo,
                valor_informado=desconto_val,
                valor_aplicado=desconto_val
            )
            db.add(ajuste_desc)
            ajustes_registrados.append({
                "tipo": "DESCONTO",
                "forma_calculo": desconto_tipo,
                "valor": desconto_val
            })

        # Grava Acréscimo se for maior que 0
        if acrescimo_val > 0:
            ajuste_acresc = models.VendaAjuste(
                venda_id=nova_venda.id,
                tipo="ACRESCIMO",
                forma_calculo=acrescimo_tipo,
                valor_informado=acrescimo_val,
                valor_aplicado=acrescimo_val
            )
            db.add(ajuste_acresc)
            ajustes_registrados.append({
                "tipo": "ACRESCIMO",
                "forma_calculo": acrescimo_tipo,
                "valor": acrescimo_val
            })

        # 🟢 4. Processar cada item do carrinho e abater estoque
        itens_completos_cupom = []

        for item in payload.itens:
            produto = db.query(models.Produto).filter(models.Produto.id == item.produto_id).first()
            
            if not produto:
                raise HTTPException(
                    status_code=404, 
                    detail=f"Produto ID {item.produto_id} não encontrado."
                )

            if produto.quantidade_estoque < item.quantidade:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Estoque insuficiente para '{produto.nome_produto}'. Disponível: {produto.quantidade_estoque}"
                )

            # Abater o estoque
            produto.quantidade_estoque -= item.quantidade

            # Criar o item da venda
            item_venda = models.ItemVenda(
                venda_id=nova_venda.id,
                produto_id=produto.id,
                quantidade=item.quantidade,
                preco_estatico=item.preco_unitario
            )
            db.add(item_venda)

            # Dados formatados para retorno
            itens_completos_cupom.append({
                "produto_id": produto.id,
                "nome_produto": produto.nome_produto,
                "quantidade": item.quantidade,
                "preco_unitario": item.preco_unitario,
                "subtotal": round(item.quantidade * item.preco_unitario, 2)
            })

        # 🟢 5. EFETIVAR A TRANSAÇÃO (Commit único de Venda + Ajustes + Itens + Estoque)
        db.commit()
        db.refresh(nova_venda)

        # Log no terminal de confirmação
        print(f"🔥 [SUCESSO] Venda ID {nova_venda.id} finalizada com {len(ajustes_registrados)} ajuste(s) financeiro(s).")

        # 🟢 6. RETORNO COMPLETO PARA O FRONTEND
        return {
            "status": "sucesso",
            "venda_id": nova_venda.id,
            "uuid": nova_venda.uuid,
            "data_venda": nova_venda.data_venda,
            "total": nova_venda.total,
            "forma_pagamento": str(nova_venda.forma_pagamento),
            "caixa_id": nova_venda.caixa_id,
            "ajustes": ajustes_registrados,
            "itens": itens_completos_cupom,
            "mensagem": "Venda realizada e estoque atualizado com sucesso!"
        }

    except Exception as e:
        db.rollback()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Erro ao processar venda: {str(e)}")


# ==========================================
# 2. LISTAR HISTÓRICO DE VENDAS
# ==========================================
@router.get("/", response_model=List[schemas.VendaHistoricoResponse])
def listar_historico_vendas(
    data_inicio: Optional[datetime] = Query(None, description="Data inicial no formato ISO (YYYY-MM-DDTHH:MM:SS)"),
    data_fim: Optional[datetime] = Query(None, description="Data final no formato ISO"),
    forma_pagamento: Optional[str] = Query(None, description="Filtrar por forma de pagamento (ex: PIX, DINHEIRO)"),
    sincronizado: Optional[bool] = Query(None, description="Filtrar por status de sincronização em nuvem"),
    limit: int = Query(50, ge=1, le=500, description="Quantidade de registros"),
    offset: int = Query(0, ge=0, description="Paginação"),
    db: Session = Depends(get_db)
):
    """
    Retorna o histórico de vendas ordenado por data mais recente.
    """
    query = db.query(models.Venda).options(
        joinedload(models.Venda.itens).joinedload(models.ItemVenda.produto),
        joinedload(models.Venda.usuario),
        joinedload(models.Venda.ajustes)
    )

    if data_inicio:
        query = query.filter(models.Venda.data_venda >= data_inicio)
    if data_fim:
        query = query.filter(models.Venda.data_venda <= data_fim)
    if forma_pagamento:
        query = query.filter(models.Venda.forma_pagamento == forma_pagamento.upper())
    if sincronizado is not None:
        query = query.filter(models.Venda.sincronizado == sincronizado)

    vendas = query.order_by(models.Venda.data_venda.desc()).offset(offset).limit(limit).all()

    resultado = []
    for venda in vendas:
        itens_formatados = []
        for item in venda.itens:
            nome_prod = item.produto.nome_produto if item.produto else "Produto Removido/Indisponível"
            itens_formatados.append({
                "id": item.id,
                "produto_id": item.produto_id,
                "nome_produto": nome_prod,
                "quantidade": item.quantidade,
                "preco_estatico": item.preco_estatico,
                "subtotal": round(item.quantidade * item.preco_estatico, 2)
            })

        # Mapeamento dos ajustes da venda
        ajustes_formatados = []
        for aj in getattr(venda, 'ajustes', []):
            ajustes_formatados.append({
                "id": aj.id,
                "tipo": aj.tipo,
                "forma_calculo": aj.forma_calculo,
                "valor_informado": aj.valor_informado,
                "valor_aplicado": aj.valor_aplicado
            })

        resultado.append({
            "id": venda.id,
            "uuid": venda.uuid,
            "total": venda.total,
            "forma_pagamento": str(venda.forma_pagamento),
            "data_venda": venda.data_venda,
            "sincronizado": venda.sincronizado,
            "caixa_id": venda.caixa_id,
            "usuario_id": venda.usuario_id,
            "nome_usuario": venda.usuario.username if venda.usuario else "Operador",
            "itens": itens_formatados,
            "ajustes": ajustes_formatados
        })

    return resultado


# ==========================================
# 3. DETALHES DE UMA VENDA ESPECÍFICA
# ==========================================
@router.get("/{venda_id}", response_model=schemas.VendaHistoricoResponse)
def obter_detalhes_venda(venda_id: int, db: Session = Depends(get_db)):
    """
    Obtém os detalhes completos de uma única venda pelo ID.
    """
    venda = db.query(models.Venda).options(
        joinedload(models.Venda.itens).joinedload(models.ItemVenda.produto),
        joinedload(models.Venda.usuario)
    ).filter(models.Venda.id == venda_id).first()

    if not venda:
        raise HTTPException(status_code=404, detail="Venda não encontrada.")

    itens_formatados = [
        {
            "id": item.id,
            "produto_id": item.produto_id,
            "nome_produto": item.produto.nome_produto if item.produto else "Produto Indisponível",
            "quantidade": item.quantidade,
            "preco_estatico": item.preco_estatico,
            "subtotal": round(item.quantidade * item.preco_estatico, 2)
        }
        for item in venda.itens
    ]

    return {
        "id": venda.id,
        "uuid": venda.uuid,
        "total": venda.total,
        "forma_pagamento": str(venda.forma_pagamento),
        "data_venda": venda.data_venda,
        "sincronizado": venda.sincronizado,
        "caixa_id": venda.caixa_id,
        "usuario_id": venda.usuario_id,
        "nome_usuario": venda.usuario.username if venda.usuario else "Operador",
        "itens": itens_formatados
    }