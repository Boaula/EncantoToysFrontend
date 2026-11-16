from fastapi import HTTPException
from sqlalchemy import and_, or_

from app.models import FormaPagamento, Venda, VendaPagamento


def normalizar_filtro_pagamento(valor):
    texto = (valor or "").strip().upper()

    if not texto:
        return None

    texto = texto.removeprefix("FORMAPAGAMENTO.")

    aliases = {
        "CARTAO_CREDITO": "CREDITO",
        "CARTÃO CRÉDITO": "CREDITO",
        "CARTAO_DEBITO": "DEBITO",
        "CARTÃO DÉBITO": "DEBITO",
    }

    texto = aliases.get(texto, texto)

    try:
        return FormaPagamento[texto]
    except KeyError as erro:
        raise HTTPException(
            status_code=422,
            detail="Forma de pagamento inválida.",
        ) from erro


def filtrar_vendas_por_pagamento(consulta, forma):
    if forma is None:
        return consulta

    if forma == FormaPagamento.MISTO:
        return consulta.filter(
            Venda.forma_pagamento == FormaPagamento.MISTO
        )

    return consulta.filter(
        or_(
            # Vendas novas: procura o método nas parcelas.
            Venda.pagamentos.any(
                VendaPagamento.forma_pagamento == forma
            ),

            # Vendas antigas: usa a forma do cabeçalho.
            and_(
                ~Venda.pagamentos.any(),
                Venda.forma_pagamento == forma,
            ),
        )
    )