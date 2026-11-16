from fastapi import APIRouter, Depends, HTTPException, status, Query
from app.utils.license import exigir_licenca_valida
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime
from zoneinfo import ZoneInfo

from app.database import get_db
from app import models, schemas

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pydantic import ValidationError

from app.services.pagamento_filtro_service import (
    filtrar_vendas_por_pagamento,
    normalizar_filtro_pagamento,
)

router = APIRouter(
    prefix="/vendas",
    tags=["Vendas"],
    dependencies=[Depends(exigir_licenca_valida)]
)

def serializar_pagamentos_venda(venda):
    pagamentos = venda.pagamentos

    if pagamentos:
        return [
            {
                "uuid": pagamento.uuid,
                "forma_pagamento": pagamento.forma_pagamento.name,
                "valor": pagamento.valor,
                "valor_recebido": pagamento.valor_recebido,
                "troco": pagamento.troco,
            }
            for pagamento in sorted(
                pagamentos,
                key=lambda pagamento: pagamento.id,
            )
        ]

    if venda.forma_pagamento == models.FormaPagamento.MISTO:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Venda {venda.uuid}: pagamentos da venda mista "
                "ainda não estão disponíveis."
            ),
        )

    # Venda antiga: representa o pagamento existente sem alterar o banco.
    return [
        {
            "uuid": None,
            "forma_pagamento": venda.forma_pagamento.name,
            "valor": Decimal(str(venda.total)).quantize(
                Decimal("0.01"),
                rounding=ROUND_HALF_UP,
            ),
            "valor_recebido": None,
            "troco": Decimal("0.00"),
        }
    ]

def preparar_pagamentos_venda(payload: schemas.VendaCreate):
    try:
        total = Decimal(str(payload.valor_total))

        if not total.is_finite():
            raise ValueError("O total da venda deve ser finito.")

        total = total.quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )

        if payload.pagamentos is not None:
            pagamentos = payload.pagamentos
        else:
            # Compatibilidade com o formato antigo.
            pagamentos = [
                schemas.PagamentoVendaCreate(
                    forma_pagamento=models.FormaPagamento[
                        payload.forma_pagamento
                    ],
                    valor=total,
                )
            ]

        conferencia = schemas.PagamentosVendaCreate(
            valor_total=total,
            pagamentos=pagamentos,
        )

    except ValidationError as erro:
        mensagem = "; ".join(
            item["msg"] for item in erro.errors()
        )
        raise HTTPException(
            status_code=422,
            detail=mensagem,
        ) from erro

    except (InvalidOperation, ValueError, KeyError) as erro:
        raise HTTPException(
            status_code=422,
            detail="Total ou forma de pagamento inválidos.",
        ) from erro

    formas = {
        pagamento.forma_pagamento
        for pagamento in conferencia.pagamentos
    }

    forma_resumo = (
        models.FormaPagamento.MISTO
        if len(formas) > 1
        else conferencia.pagamentos[0].forma_pagamento
    )

    registros = []

    for pagamento in conferencia.pagamentos:
        recebido = pagamento.valor_recebido

        troco = (
            recebido - pagamento.valor
            if recebido is not None
            else Decimal("0.00")
        )

        registros.append({
            "forma_pagamento": pagamento.forma_pagamento,
            "valor": pagamento.valor,
            "valor_recebido": recebido,
            "troco": troco,
        })

    return conferencia.valor_total, forma_resumo, registros


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
        total_validado, forma_pagamento_enum, pagamentos = (
            preparar_pagamentos_venda(payload)
        )

        # Captura o horário no fuso de Cuiabá/MT (UTC-4)
        data_cuiaba = datetime.now(ZoneInfo("America/Cuiaba"))

        # 2. Criar o cabeçalho da Venda
        nova_venda = models.Venda(
            caixa_id=payload.caixa_id or 1,
            usuario_id=payload.usuario_id or 1,
            forma_pagamento=forma_pagamento_enum,
            total=float(total_validado),
            sincronizado=False,
            data_venda=data_cuiaba
        )
        db.add(nova_venda)
        db.flush()  # Gera o ID da nova_venda no Postgres
        for pagamento in pagamentos:
            db.add(
                models.VendaPagamento(
                    venda_id=nova_venda.id,
                    **pagamento,
                )
            )

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
                        "pagamentos": [
                {
                    "forma_pagamento": pagamento[
                        "forma_pagamento"
                    ].name,
                    "valor": str(pagamento["valor"]),
                    "valor_recebido": (
                        str(pagamento["valor_recebido"])
                        if pagamento["valor_recebido"] is not None
                        else None
                    ),
                    "troco": str(pagamento["troco"]),
                }
                for pagamento in pagamentos
            ],
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
    completo: bool = Query(
        False,
        description="Consultar todos os registros correspondentes aos filtros",
    ),
    db: Session = Depends(get_db)
):
    """
    Retorna o histórico de vendas ordenado por data mais recente.
    """
    query = db.query(models.Venda).options(
        joinedload(models.Venda.pagamentos),
        joinedload(models.Venda.itens).joinedload(models.ItemVenda.produto),
        joinedload(models.Venda.usuario),
        joinedload(models.Venda.ajustes),
    )

    if data_inicio:
        query = query.filter(models.Venda.data_venda >= data_inicio)
    if data_fim:
        query = query.filter(models.Venda.data_venda <= data_fim)
    forma_filtro = normalizar_filtro_pagamento(forma_pagamento)
    query = filtrar_vendas_por_pagamento(query, forma_filtro)
    if sincronizado is not None:
        query = query.filter(models.Venda.sincronizado == sincronizado)

    query = query.order_by(
        models.Venda.data_venda.desc(),
        models.Venda.id.desc(),
    )

    if not completo:
        query = query.offset(offset).limit(limit)

    vendas = query.all()

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
            "pagamentos": serializar_pagamentos_venda(venda),
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
        joinedload(models.Venda.pagamentos),
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
        "pagamentos": serializar_pagamentos_venda(venda),
        "data_venda": venda.data_venda,
        "sincronizado": venda.sincronizado,
        "caixa_id": venda.caixa_id,
        "usuario_id": venda.usuario_id,
        "nome_usuario": venda.usuario.username if venda.usuario else "Operador",
        "itens": itens_formatados
    }