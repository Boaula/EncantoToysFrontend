from datetime import date, datetime, time, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session, joinedload

from app import models
from app.database import get_db
from app.routers.xml_compras import (
    exigir_admin_xml,
    exigir_destinos_configurados
)
from app.services.relatorio_vendas_service import (
    gerar_relatorio_vendas,
    valor_monetario,
)
from app.utils.license import exigir_licenca_valida

from decimal import Decimal

from app.routers.vendas import serializar_pagamentos_venda
from app.services.pagamento_filtro_service import (
    filtrar_vendas_por_pagamento,
    normalizar_filtro_pagamento,
)


router = APIRouter(
    prefix="/relatorios/vendas",
    tags=["Relatórios de vendas"],
    dependencies=[
        Depends(exigir_destinos_configurados),
        Depends(exigir_licenca_valida),
        Depends(exigir_admin_xml),
    ],
)


@router.get("/exportar")
def exportar_vendas(
    data_inicio: date,
    data_fim: date,
    formato: Literal["pdf", "xml"] = "pdf",
    forma_pagamento: str = Query(default="", max_length=40),
    busca: str = Query(default="", max_length=120),
    db: Session = Depends(get_db),
):
    if data_fim < data_inicio or data_fim == date.max:
        raise HTTPException(
            status_code=422,
            detail="Informe um intervalo de datas válido.",
        )

    forma_filtro = normalizar_filtro_pagamento(forma_pagamento)
    pagamento = forma_filtro.name if forma_filtro else ""
    termo = busca.strip().lower()

    inicio = datetime.combine(data_inicio, time.min)
    fim_exclusivo = datetime.combine(
        data_fim + timedelta(days=1),
        time.min,
    )

    consulta = (
        db.query(models.Venda)
        .options(
            joinedload(models.Venda.itens)
            .joinedload(models.ItemVenda.produto),
            joinedload(models.Venda.usuario),
            joinedload(models.Venda.ajustes),
            joinedload(models.Venda.pagamentos),
        )
        .filter(
            models.Venda.data_venda >= inicio,
            models.Venda.data_venda < fim_exclusivo,
        )
    )

    consulta = filtrar_vendas_por_pagamento(
        consulta,
        forma_filtro,
    )

    registros = consulta.order_by(
        models.Venda.data_venda.desc(),
        models.Venda.id.desc(),
    ).all()

    vendas = []

    for venda in registros:
        operador = (
            venda.usuario.username
            if venda.usuario
            else "Não informado"
        )

        if termo and not any(
            termo in texto.lower()
            for texto in (
                str(venda.id),
                str(venda.uuid),
                operador,
            )
        ):
            continue

        forma = getattr(
            venda.forma_pagamento,
            "value",
            str(venda.forma_pagamento),
        )

        itens = []

        for item in venda.itens:
            itens.append({
                "produto_id": item.produto_id,
                "nome_produto": (
                    item.produto.nome_produto
                    if item.produto
                    else "Produto indisponível"
                ),
                "quantidade": item.quantidade,
                "preco_unitario": format(
                    valor_monetario(item.preco_estatico), ".2f"
                ),
                "subtotal": format(
                    valor_monetario(
                        item.quantidade
                        * valor_monetario(item.preco_estatico)
                    ),
                    ".2f",
                ),
            })

        ajustes = [
            {
                "tipo": ajuste.tipo,
                "forma_calculo": ajuste.forma_calculo,
                "valor_informado": str(ajuste.valor_informado),
                "valor_aplicado": format(
                    valor_monetario(ajuste.valor_aplicado), ".2f"
                ),
            }
            for ajuste in venda.ajustes
        ]

        parcelas = serializar_pagamentos_venda(venda)

        if forma_filtro is None or forma_filtro == models.FormaPagamento.MISTO:
            valor_no_metodo = valor_monetario(venda.total)
        else:
            valor_no_metodo = sum(
                (
                    parcela["valor"]
                    for parcela in parcelas
                    if parcela["forma_pagamento"] == forma_filtro.name
                ),
                Decimal("0.00"),
            )

        pagamentos_exportacao = [
            {
                "uuid": parcela["uuid"],
                "forma_pagamento": parcela["forma_pagamento"],
                "valor": format(parcela["valor"], ".2f"),
                "valor_recebido": (
                    format(parcela["valor_recebido"], ".2f")
                    if parcela["valor_recebido"] is not None
                    else None
                ),
                "troco": format(parcela["troco"], ".2f"),
            }
            for parcela in parcelas
        ]

        vendas.append({
            "id": venda.id,
            "uuid": venda.uuid,
            "data_venda": venda.data_venda,
            "operador": operador,
            "forma_pagamento": forma,
            "caixa_id": venda.caixa_id,
            "total": valor_monetario(venda.total),
            "itens": itens,
            "ajustes": ajustes,
            "pagamentos": pagamentos_exportacao,
            "valor_no_metodo_filtrado": valor_no_metodo,
        })

    conteudo = gerar_relatorio_vendas(
        vendas,
        data_inicio,
        data_fim,
        formato,
        pagamento,
        busca.strip(),
    )

    nome = (
        f"relatorio_vendas_{data_inicio}_{data_fim}.{formato}"
    )

    return Response(
        content=conteudo,
        media_type=(
            "application/pdf"
            if formato == "pdf"
            else "application/xml"
        ),
        headers={
            "Content-Disposition": f'attachment; filename="{nome}"',
            "Cache-Control": "no-store",
        },
    )