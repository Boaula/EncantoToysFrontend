import os
import requests
import re
import time
import json
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime
from sqlalchemy.orm import Session
from app import models
from dotenv import load_dotenv


load_dotenv()


FOCUS_API_TOKEN = os.getenv("FOCUS_API_TOKEN", "").strip()
FOCUS_BASE_URL = os.getenv("FOCUS_BASE_URL", "").strip()


def _to_decimal(val, default="0.00") -> Decimal:
    """Converte valores com segurança para Decimal."""
    if val is None:
        return Decimal(default)

    try:
        return Decimal(str(val))
    except Exception:
        return Decimal(default)


def _quantize(val: Decimal) -> Decimal:
    """Arredonda para 2 casas decimais."""
    return val.quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP
    )


def _get_val(obj, key, default=None):
    """
    Busca um valor com segurança se o objeto for:
    - Dicionário
    - Modelo SQLAlchemy
    """

    if obj is None:
        return default

    if isinstance(obj, dict):
        return obj.get(key, default)

    return getattr(obj, key, default)

# ==========================================================
# FUNÇÕES UTILITÁRIAS
# ==========================================================

def validar_cpf(cpf: str) -> bool:
    cpf_limpo = re.sub(r"\D", "", str(cpf))
    if len(cpf_limpo) != 11 or cpf_limpo == cpf_limpo[0] * 11:
        return False

    soma = sum(int(cpf_limpo[i]) * (10 - i) for i in range(9))
    resto = (soma * 10) % 11
    d1 = 0 if resto in (10, 11) else resto
    if d1 != int(cpf_limpo[9]):
        return False

    soma = sum(int(cpf_limpo[i]) * (11 - i) for i in range(10))
    resto = (soma * 10) % 11
    d2 = 0 if resto in (10, 11) else resto
    return d2 == int(cpf_limpo[10])


def emitir_nfce_venda(venda_id: int, db: Session, cpf_cliente: str = None):

    # ==========================================================
    # 0. VALIDAÇÃO PRÉVIA DO CPF/CNPJ (BLOQUEIO IMEDIATO)
    # ==========================================================
    doc_limpo = None

    if cpf_cliente and str(cpf_cliente).strip():
        doc_limpo = re.sub(r"\D", "", str(cpf_cliente))

        if len(doc_limpo) == 11:
            if not validar_cpf(doc_limpo):
                raise Exception(
                    f"CPF inválido ({cpf_cliente}). Digite um CPF válido com os dígitos verificadores corretos."
                )
        elif len(doc_limpo) == 14:
            pass  # CNPJ (14 dígitos)
        else:
            raise Exception(
                f"Documento do cliente inválido ({cpf_cliente}). O CPF deve conter 11 dígitos e o CNPJ 14 dígitos."
            )



    # ==========================================================
    # 1. BUSCAR VENDA E EMPRESA
    # ==========================================================

    venda = (
        db.query(models.Venda)
        .filter_by(id=venda_id)
        .first()
    )

    empresa = (
        db.query(models.EmpresaModel)
        .first()
    )

    if not venda:
        raise Exception(
            f"Venda ID {venda_id} não encontrada no banco local."
        )

    if not empresa:
        raise Exception(
            "Dados cadastrais da empresa não configurados para emissão fiscal."
        )


    # ==========================================================
    # 2. CNPJ
    # ==========================================================

    cnpj_emitente = re.sub(
        r"\D",
        "",
        empresa.cnpj or ""
    )

    if len(cnpj_emitente) != 14:
        raise Exception(
            f"CNPJ inválido para emissão: {cnpj_emitente}"
        )


    # ==========================================================
    # 3. FORMA DE PAGAMENTO
    # ==========================================================

    mapa_pagamento = {
        "DINHEIRO": "01",
        "CHEQUE": "02",
        "CARTAO_CREDITO": "03",
        "CARTAO_DEBITO": "04",
        "CREDITO": "03",
        "DEBITO": "04",

        # PIX dinâmico
        "PIX": "17",

        # PIX estático
        "PIX_ESTATICO": "20",

        "TRANSFERENCIA": "18",

        "OUTROS": "99"
    }


    forma_pagto_raw = _get_val(
        venda,
        "forma_pagamento",
        "DINHEIRO"
    )


    forma_pagto_str = (
        forma_pagto_raw.value
        if hasattr(forma_pagto_raw, "value")
        else str(forma_pagto_raw)
    )


    forma_pagto_str = forma_pagto_str.upper().strip()


    codigo_pagto_sefaz = mapa_pagamento.get(
        forma_pagto_str,
        "01"
    )


    # ==========================================================
    # 4. BUSCAR ITENS
    # ==========================================================

    venda_itens = _get_val(
        venda,
        "itens",
        []
    )


    if not venda_itens:
        raise Exception(
            "A venda não possui itens para emissão da NFC-e."
        )


    dados_itens_temp = []

    total_bruto_acumulado = Decimal("0.00")


    # ==========================================================
    # 5. PROCESSAR CADA ITEM
    # ==========================================================

    for index, item in enumerate(
        venda_itens,
        start=1
    ):

        produto = _get_val(
            item,
            "produto",
            None
        )

        if produto is None:
            produto_id = _get_val(item, "produto_id")
            if produto_id is not None:
                produto = (
                    db.query(models.Produto)
                    .filter_by(id=produto_id)
                    .first()
                )
                


        # ------------------------------------------------------
        # NCM
        # ------------------------------------------------------

        ncm_produto = _get_val(
            produto,
            "ncm",
            None
        )


        ncm_limpo = (
            re.sub(
                r"\D",
                "",
                str(ncm_produto)
            )
            if ncm_produto
            else "95030099"
        )


        if len(ncm_limpo) != 8:
            ncm_limpo = "95030099"


        # ------------------------------------------------------
        # DESCRIÇÃO
        # ------------------------------------------------------

        nome_prod = (
            _get_val(produto, "nome_produto")
            or _get_val(produto, "descricao")
            or _get_val(produto, "nome")
            or _get_val(produto, "descricao_produto")
            or _get_val(item, "descricao")
            or _get_val(item, "nome_produto")
            or _get_val(item, "nome")
            or f"Produto #{_get_val(item, 'produto_id', index)}"
        )

        nome_prod = str(nome_prod).strip()
        if not nome_prod:
            nome_prod = f"Produto #{_get_val(item, 'produto_id', index)}"


        # ------------------------------------------------------
        # QUANTIDADE
        # ------------------------------------------------------

        qtd_raw = (
            _get_val(item, "quantidade")
            or _get_val(item, "qtd")
        )


        qtd_dec = _to_decimal(
            qtd_raw,
            "1.00"
        )


        if qtd_dec <= 0:
            qtd_dec = Decimal("1.00")


        # ------------------------------------------------------
        # PREÇO UNITÁRIO
        # ------------------------------------------------------

        preco_dec = Decimal("0.00")


        campos_preco_item = [
            "preco_unitario",
            "preco_estatico",
            "preco",
            "preco_venda",
            "valor_unitario",
            "valor"
        ]


        for field in campos_preco_item:

            valor = _get_val(
                item,
                field
            )


            if valor is not None:

                valor_decimal = _to_decimal(
                    valor
                )


                if valor_decimal > 0:

                    preco_dec = valor_decimal

                    break


        # ------------------------------------------------------
        # SE NÃO ACHOU NO ITEM, BUSCA NO PRODUTO
        # ------------------------------------------------------

        if preco_dec <= 0 and produto:

            campos_preco_produto = [
                "preco_venda",
                "preco",
                "preco_unitario",
                "valor"
            ]


            for field in campos_preco_produto:

                valor = _get_val(
                    produto,
                    field
                )


                if valor is not None:

                    valor_decimal = _to_decimal(
                        valor
                    )


                    if valor_decimal > 0:

                        preco_dec = valor_decimal

                        break


        # ------------------------------------------------------
        # VALORES
        # ------------------------------------------------------

        preco_unitario = _quantize(
            preco_dec
        )


        valor_bruto = _quantize(
            qtd_dec * preco_unitario
        )


        total_bruto_acumulado += valor_bruto


        dados_itens_temp.append({

            "index": index,

            "produto_id": _get_val(
                item,
                "produto_id",
                index
            ),

            "descricao": str(
                nome_prod
            ),

            "ncm": ncm_limpo,

            "quantidade": qtd_dec,

            "valor_unitario": preco_unitario,

            "valor_bruto": valor_bruto

        })


    # ==========================================================
    # 6. TOTAL DA VENDA
    # ==========================================================

    v_tot_banco = (
        _get_val(
            venda,
            "valor_total"
        )
        or _get_val(
            venda,
            "total"
        )
    )


    if v_tot_banco is not None:

        total_venda = _quantize(
            _to_decimal(
                v_tot_banco
            )
        )

    else:

        total_venda = total_bruto_acumulado


    if total_venda <= 0:

        total_venda = total_bruto_acumulado


    # ==========================================================
    # 7. DESCONTO
    # ==========================================================

    desconto_total = Decimal("0.00")


    if total_venda < total_bruto_acumulado:

        desconto_total = _quantize(
            total_bruto_acumulado
            - total_venda
        )


    # ==========================================================
    # 8. VALOR DE OUTRAS DESPESAS
    # ==========================================================

    outras_despesas = Decimal("0.00")


    if total_venda > total_bruto_acumulado:

        outras_despesas = _quantize(
            total_venda
            - total_bruto_acumulado
        )


    # ==========================================================
    # 9. MONTAR ITENS
    # ==========================================================

    itens_payload = []

    desconto_acumulado = Decimal("0.00")

    qtd_itens = len(
        dados_itens_temp
    )


    for i, item_data in enumerate(
        dados_itens_temp
    ):

        desconto_item = Decimal("0.00")


        # ------------------------------------------------------
        # RATEIO DO DESCONTO
        # ------------------------------------------------------

        if (
            desconto_total > 0
            and total_bruto_acumulado > 0
        ):

            if i == qtd_itens - 1:

                desconto_item = _quantize(
                    desconto_total
                    - desconto_acumulado
                )

            else:

                proporcao = (
                    item_data["valor_bruto"]
                    / total_bruto_acumulado
                )


                desconto_item = _quantize(
                    desconto_total
                    * proporcao
                )


                desconto_acumulado += (
                    desconto_item
                )


        # ------------------------------------------------------
        # ITEM FOCUS NFE
        # ------------------------------------------------------

        item_dict = {

            "numero_item": str(
                item_data["index"]
            ),

            "codigo_produto": str(
                item_data["produto_id"]
            ),

            "descricao": item_data[
                "descricao"
            ],

            "codigo_ncm": item_data[
                "ncm"
            ],

            "cfop": "5102",

            "icms_origem": "0",

            "icms_situacao_tributaria": "102",

            "unidade_comercial": "UN",

            "unidade_tributavel": "UN",

            "quantidade_comercial": (
                f'{item_data["quantidade"]:.2f}'
            ),

            "quantidade_tributavel": (
                f'{item_data["quantidade"]:.2f}'
            ),

            "valor_unitario_comercial": (
                f'{item_data["valor_unitario"]:.2f}'
            ),

            "valor_unitario_tributavel": (
                f'{item_data["valor_unitario"]:.2f}'
            ),

            "valor_bruto": (
                f'{item_data["valor_bruto"]:.2f}'
            ),

            # Muito importante:
            # indica que o item entra no total da NFC-e
            "inclui_no_total": "1"

        }


        # ------------------------------------------------------
        # DESCONTO DO ITEM
        # ------------------------------------------------------

        if desconto_item > 0:

            item_dict[
                "valor_desconto"
            ] = f"{desconto_item:.2f}"


        itens_payload.append(
            item_dict
        )


    # ==========================================================
    # 10. DATA
    # ==========================================================

    data_emissao_atual = (
        datetime.now()
        .astimezone()
        .isoformat(
            timespec="seconds"
        )
    )


# ==========================================================
# 11. PAYLOAD NFC-e
# ==========================================================

    payload_nfce = {

        "cnpj_emitente":
            cnpj_emitente,

        "data_emissao":
            data_emissao_atual,

        "natureza_operacao":
            "VENDA AO CONSUMIDOR",

        "presenca_comprador":
            "1",

        "modalidade_frete":
            "9",

        # ======================================================
        # TOTAIS DA NOTA
        # ======================================================

        "valor_produtos":
            f"{total_bruto_acumulado:.2f}",

        "valor_desconto":
            f"{desconto_total:.2f}",

        "valor_outras_despesas":
            f"{outras_despesas:.2f}",

        "valor_total":
            f"{total_venda:.2f}",


        # ======================================================
        # PAGAMENTO
        #
        # IMPORTANTE:
        # É valor_pagamento, NÃO valor
        # ======================================================

        "formas_pagamento": [

            {

                "forma_pagamento":
                    codigo_pagto_sefaz,

                "valor_pagamento":
                    f"{total_venda:.2f}",

                "troco":
                    "0.00"

            }

        ],


        # ======================================================
        # ITENS
        # ======================================================

        "items":
            itens_payload

    }

    # ==========================================================
    # INJEÇÃO DINÂMICA DO CPF/CNPJ DO DESTINATÁRIO
    # ==========================================================
    if cpf_cliente:
        doc_limpo = re.sub(r"\D", "", str(cpf_cliente))
        if len(doc_limpo) == 11:
            if not validar_cpf(doc_limpo):
                raise Exception(f"O CPF informado ({cpf_cliente}) é matematicamente inválido.")
            payload_nfce["cpf_destinatario"] = doc_limpo
        elif len(doc_limpo) == 14:
            payload_nfce["cnpj_destinatario"] = doc_limpo

    # ==========================================================
    # 12. VALIDAÇÃO LOCAL
    # ==========================================================

    valor_pagamento = _quantize(
        total_venda
    )


    valor_nota = _quantize(
        total_bruto_acumulado
        - desconto_total
        + outras_despesas
    )


    if valor_pagamento != valor_nota:

        raise Exception(
            "ERRO FISCAL LOCAL: "
            f"Pagamento={valor_pagamento} "
            f"é diferente de "
            f"Nota={valor_nota}"
        )


    # ==========================================================
    # 13. MOSTRAR JSON
    # ==========================================================

    print(
        "\n========== NFC-e =========="
    )

    print(
        json.dumps(
            payload_nfce,
            indent=2,
            ensure_ascii=False
        )
    )

    print(
        "============================\n"
    )


    # ==========================================================
    # 14. REFERÊNCIA
    # ==========================================================

    ref_venda = (
        f"encanto_venda_"
        f"{venda.id}_"
        f"{int(time.time())}"
    )


    url_envio = (
        f"{FOCUS_BASE_URL}"
        f"/nfce"
        f"?ref={ref_venda}"
        f"&completa=1"
    )


    # ==========================================================
    # 15. ENVIO PARA FOCUS NFE
    # ==========================================================

    response = requests.post(

        url_envio,

        json=payload_nfce,

        auth=(
            FOCUS_API_TOKEN,
            ""
        ),

        headers={
            "Content-Type":
                "application/json",

            "Accept":
                "application/json"
        },

        timeout=60
    )


    print(
        f"\n========== RESPOSTA FOCUS "
        f"HTTP {response.status_code} =========="
    )

    print(
        response.text
    )

    print(
        "============================================\n"
    )


    # ==========================================================
    # 16. JSON DE RESPOSTA
    # ==========================================================

    try:

        dados_resposta = (
            response.json()
        )

    except Exception:

        raise Exception(
            f"Resposta inválida da FocusNFe "
            f"({response.status_code}): "
            f"{response.text}"
        )


    # ==========================================================
    # 17. STATUS
    # ==========================================================

    status_retorno = (

        dados_resposta.get(
            "status"
        )

        if isinstance(
            dados_resposta,
            dict
        )

        else None

    )


    # ==========================================================
    # 18. AUTORIZADA
    # ==========================================================

    if response.status_code in [200, 201] and status_retorno == "autorizado":

        link_danfe = dados_resposta.get("caminho_danfe") or dados_resposta.get("url_danfe")

        if hasattr(venda, "sincronizado"):
            venda.sincronizado = True

        if hasattr(venda, "chave_acesso"):
            venda.chave_acesso = dados_resposta.get("chave_nfe")

        # 🟢 SALVA O LINK DA DANFE NO BANCO LOCAL
        venda.caminho_danfe = link_danfe

        db.commit()
        db.refresh(venda)

        return {
            "sucesso": True,
            "status": status_retorno,
            "chave_nfe": dados_resposta.get("chave_nfe"),
            "caminho_danfe": link_danfe,
            "qrcode_url": dados_resposta.get("qrcode_url")
        }

    # ==========================================================
    # 19. ERRO
    # ==========================================================

    detalhes = []


    if isinstance(
        dados_resposta,
        dict
    ):

        for campo in [
            "motivo_status",
            "mensagem_sefaz",
            "mensagem",
            "codigo"
        ]:

            if campo in dados_resposta:

                detalhes.append(
                    str(
                        dados_resposta[
                            campo
                        ]
                    )
                )


        erros = dados_resposta.get(
            "erros",
            []
        )


        if isinstance(
            erros,
            list
        ):

            for erro in erros:

                if isinstance(
                    erro,
                    dict
                ):

                    mensagem = (

                        erro.get(
                            "mensagem"
                        )

                        or erro.get(
                            "erro"
                        )

                        or erro.get(
                            "campo"
                        )

                        or str(erro)

                    )


                    detalhes.append(
                        str(mensagem)
                    )


                elif isinstance(
                    erro,
                    str
                ):

                    detalhes.append(
                        erro
                    )


        elif isinstance(
            erros,
            str
        ):

            detalhes.append(
                erros
            )


    mensagem_detalhada = (

        " | ".join(
            dict.fromkeys(
                filter(
                    None,
                    detalhes
                )
            )
        )

        if detalhes

        else str(
            dados_resposta
        )

    )


    raise Exception(
        "FocusNFe / SEFAZ: "
        + mensagem_detalhada
    )