from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO
from xml.etree.ElementTree import Element, SubElement, tostring
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo

from pathlib import Path
from reportlab.lib.utils import ImageReader

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    LongTable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    TableStyle,
)


def valor_monetario(valor):
    return Decimal(str(valor or 0)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )


def _real(valor):
    texto = f"{valor_monetario(valor):,.2f}"
    return "R$ " + texto.replace(",", "X").replace(".", ",").replace("X", ".")


def gerar_relatorio_vendas(
    vendas, inicio, fim, formato, pagamento="", busca=""
):
        # Confere as parcelas recebidas da rota de exportação.
    for venda in vendas:
        parcelas = venda.get("pagamentos")

        if parcelas is None:
            raise ValueError(
                "Os pagamentos não foram fornecidos ao relatório."
            )

        soma = sum(
            (valor_monetario(p["valor"]) for p in parcelas),
            Decimal("0.00"),
        )

        if not parcelas or soma != valor_monetario(venda["total"]):
            raise ValueError(
                f"Venda {venda['id']}: pagamentos diferentes do total."
            )
    total = sum(
        (valor_monetario(v["total"]) for v in vendas),
        Decimal("0"),
    )
    periodo = f"{inicio:%d/%m/%Y} A {fim:%d/%m/%Y}"
    gerado = datetime.now(ZoneInfo("America/Cuiaba"))

    filtro = f"Pagamento: {pagamento or 'Todos'}"
    if busca:
        filtro += f" | Busca: {busca}"

    if formato == "xml":
        raiz = Element(
            "relatorioVendas",
            versao="1.1",
            natureza="gerencial",
        )
        SubElement(
            raiz,
            "periodo",
            inicio=inicio.isoformat(),
            fim=fim.isoformat(),
        )
        SubElement(raiz, "geradoEm").text = gerado.isoformat()
        SubElement(raiz, "fonte").text = "Banco local do Encanto Toys"

        filtros = SubElement(raiz, "filtros")
        SubElement(filtros, "formaPagamento").text = pagamento or "TODAS"
        SubElement(filtros, "busca").text = busca

        resumo = SubElement(raiz, "resumo")
        SubElement(resumo, "quantidadeVendas").text = str(len(vendas))
        SubElement(resumo, "totalVendido").text = format(total, ".2f")

        if pagamento and pagamento != "MISTO":
            total_no_metodo = sum(
                (
                    valor_monetario(venda["valor_no_metodo_filtrado"])
                    for venda in vendas
                ),
                Decimal("0.00"),
            )

            SubElement(resumo, "totalNoMetodoFiltrado").text = format(
                total_no_metodo, ".2f"
            )

        totais_por_metodo = {}

        for venda in vendas:
            for parcela in venda["pagamentos"]:
                codigo = parcela["forma_pagamento"]

                totais_por_metodo[codigo] = (
                    totais_por_metodo.get(codigo, Decimal("0.00"))
                    + valor_monetario(parcela["valor"])
                )

        distribuicao = SubElement(
            resumo,
            "totaisPorFormaPagamento",
        )

        for codigo, valor in sorted(totais_por_metodo.items()):
            grupo = SubElement(distribuicao, "pagamento")
            SubElement(grupo, "forma_pagamento").text = codigo
            SubElement(grupo, "valor").text = format(valor, ".2f")

        for venda in vendas:
            registro = SubElement(raiz, "venda")

            for campo in (
                "id",
                "uuid",
                "data_venda",
                "operador",
                "forma_pagamento",
                "caixa_id",
                "total",
            ):
                valor = venda.get(campo)

                if isinstance(valor, datetime):
                    texto = valor.isoformat()
                elif campo == "total":
                    texto = format(valor_monetario(valor), ".2f")
                else:
                    texto = "" if valor is None else str(valor)

                SubElement(registro, campo).text = texto

            if pagamento and pagamento != "MISTO":
                SubElement(
                    registro,
                    "valor_no_metodo_filtrado",
                ).text = format(
                    valor_monetario(venda["valor_no_metodo_filtrado"]),
                    ".2f",
                )

            for grupo, etiqueta in (
                ("pagamentos", "pagamento"),
                ("itens", "item"),
                ("ajustes", "ajuste"),
            ):
                container = SubElement(registro, grupo)

                for item in venda.get(grupo, []):
                    filho = SubElement(container, etiqueta)

                    for campo, valor in item.items():
                        SubElement(filho, campo).text = (
                            "" if valor is None
                            else format(valor, ".2f")
                            if isinstance(valor, Decimal)
                            else str(valor)
                        )

        return tostring(
            raiz,
            encoding="utf-8",
            xml_declaration=True,
        )

    if formato != "pdf":
        raise ValueError("Formato deve ser pdf ou xml.")

    nomes_pagamento = {
        "DINHEIRO": "Dinheiro",
        "PIX": "PIX",
        "CREDITO": "Cartão de crédito",
        "DEBITO": "Cartão de débito",
        "MISTO": "Pagamento dividido",
    }

    filtro = (
        "Pagamento: "
        + nomes_pagamento.get(pagamento, pagamento or "Todos")
    )

    if busca:
        filtro += f" | Busca: {busca}"

    totais_pdf = {}

    for venda in vendas:
        for parcela in venda["pagamentos"]:
            codigo = parcela["forma_pagamento"]

            totais_pdf[codigo] = (
                totais_pdf.get(codigo, Decimal("0.00"))
                + valor_monetario(parcela["valor"])
            )

    filtro_especifico = bool(pagamento and pagamento != "MISTO")

    total_no_metodo_pdf = sum(
        (
            valor_monetario(venda["valor_no_metodo_filtrado"])
            for venda in vendas
        ),
        Decimal("0.00"),
    )

    pasta_static = Path(__file__).resolve().parents[1] / "static"

    logo_encanto = ImageReader(
        str(pasta_static / "LogoEncantoToys.jpeg")
    )

    logo_mhs = ImageReader(
        str(pasta_static / "LogoMHS.png")
    )    

    buffer = BytesIO()

    documento = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=58 * mm,
        bottomMargin=20 * mm,
        title=f"Encanto Toys - Vendas - {periodo}",
        author="Encanto Toys",
    )

    estilo = ParagraphStyle(
        "Celula",
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        splitLongWords=True,
    )

    def paragrafo(texto):
        return Paragraph(escape(str(texto)), estilo)

    def cabecalho(canvas, doc):
        largura, altura = landscape(A4)
        canvas.saveState()

        # Logo da loja.
        canvas.drawImage(
            logo_encanto,
            largura - 84 * mm,
            altura - 26 * mm,
            width=68 * mm,
            height=19 * mm,
            preserveAspectRatio=True,
            anchor="c",
            mask="auto",
        )

        # Título.
        canvas.setFillColor(colors.HexColor("#14532d"))
        canvas.setFont("Helvetica-Bold", 15)
        canvas.drawString(
            16 * mm,
            altura - 16 * mm,
            "ENCANTO TOYS",
        )

        canvas.setFont("Helvetica", 10)
        canvas.drawString(
            16 * mm,
            altura - 23 * mm,
            "Relatorio gerencial de vendas - banco local",
        )

        # Período em destaque.
        canvas.setFillColor(colors.HexColor("#dcfce7"))
        canvas.rect(
            16 * mm,
            altura - 40 * mm,
            largura - 32 * mm,
            11 * mm,
            fill=1,
            stroke=0,
        )

        canvas.setFillColor(colors.HexColor("#14532d"))
        canvas.setFont("Helvetica-Bold", 12)
        canvas.drawString(
            19 * mm,
            altura - 36 * mm,
            f"PERIODO: {periodo}",
        )

        texto_filtro = paragrafo(filtro)
        _, altura_filtro = texto_filtro.wrap(
            largura - 32 * mm,
            30 * mm,
        )
        texto_filtro.drawOn(
            canvas,
            16 * mm,
            altura - 44 * mm - altura_filtro,
        )

        # Separação entre o conteúdo e o rodapé.
        canvas.setStrokeColor(colors.HexColor("#cbd5e1"))
        canvas.setLineWidth(0.5)
        canvas.line(
            16 * mm,
            17 * mm,
            largura - 16 * mm,
            17 * mm,
        )

        # Logo MHS, à esquerda dos textos.
        canvas.drawImage(
            logo_mhs,
            16 * mm,
            5 * mm,
            width=16 * mm,
            height=8 * mm,
            preserveAspectRatio=True,
            anchor="c",
            mask="auto",
        )

        # Uma única ocorrência de cada informação.
        canvas.setFillColor(colors.HexColor("#475569"))
        canvas.setFont("Helvetica", 8)
        canvas.drawString(
            39 * mm,
            11 * mm,
            f"Gerado em {gerado:%d/%m/%Y %H:%M} - Campo Verde MT",
        )

        canvas.setFont("Helvetica", 7)
        canvas.drawString(
            39 * mm,
            6 * mm,
            "Sistema desenvolvido por MHS",
        )

        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(
            largura - 16 * mm,
            11 * mm,
            f"Pagina {doc.page}",
        )

        canvas.restoreState()

    conteudo = [
        paragrafo(
            f"Vendas: {len(vendas)} | Total das vendas selecionadas: {_real(total)}"
        ),
        Spacer(1, 4 * mm),
    ]

    if filtro_especifico:
        conteudo.extend([
            paragrafo(
                f"Recebido em {nomes_pagamento[pagamento]}: "
                f"{_real(total_no_metodo_pdf)} "
                "(somente o valor desse método)."
            ),
            Spacer(1, 4 * mm),
        ])

    if totais_pdf:
        conteudo.append(
            paragrafo(
                "Distribuição dos pagamentos das vendas selecionadas"
            )
        )

        for codigo, valor in sorted(totais_pdf.items()):
            conteudo.append(
                paragrafo(
                    f"{nomes_pagamento.get(codigo, codigo)}: "
                    f"{_real(valor)}"
                )
            )

        conteudo.append(Spacer(1, 4 * mm))

    if vendas:
        linhas = [[
            "Venda",
            "Data/hora",
            "Operador",
            "Pagamentos",
            "Unid.",
            "Total da venda",
        ]]

        for venda in vendas:
            unidades = sum(
                int(item["quantidade"]) for item in venda["itens"]
            )

            detalhes_pagamentos = []

            for parcela in venda["pagamentos"]:
                codigo = parcela["forma_pagamento"]
                nome = nomes_pagamento.get(codigo, codigo)

                detalhes_pagamentos.append(
                    f"{nome}: {_real(parcela['valor'])}"
                )

                if parcela["valor_recebido"] is not None:
                    detalhes_pagamentos.append(
                        f"Recebido: {_real(parcela['valor_recebido'])}"
                    )
                    detalhes_pagamentos.append(
                        f"Troco: {_real(parcela['troco'])}"
                    )

            if filtro_especifico:
                detalhes_pagamentos.append(
                    "Neste filtro: "
                    + _real(venda["valor_no_metodo_filtrado"])
                )            

            linhas.append([
                paragrafo(venda["id"]),

                paragrafo(
                    venda["data_venda"].strftime("%d/%m/%Y %H:%M")
                ),

                paragrafo(venda["operador"]),

                Paragraph(
                    "<br/>".join(
                        escape(linha)
                        for linha in detalhes_pagamentos
                    ),
                    estilo,
                ),

                paragrafo(unidades),

                paragrafo(_real(venda["total"])),
            ])

        tabela = LongTable(
            linhas,
            repeatRows=1,
            splitInRow=1,            
            hAlign="LEFT",
            colWidths=[
                valor * mm
                for valor in (14, 34, 45, 105, 17, 50)
            ],
        )

        tabela.setStyle(TableStyle([
            (
                "BACKGROUND", (0, 0), (-1, 0),
                colors.HexColor("#14532d"),
            ),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 8),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            (
                "ROWBACKGROUNDS", (0, 1), (-1, -1),
                [colors.white, colors.HexColor("#f1f5f9")],
            ),
        ]))

        conteudo.append(tabela)
    else:
        conteudo.append(
            paragrafo("Nenhuma venda encontrada para os filtros.")
        )

    documento.build(
        conteudo,
        onFirstPage=cabecalho,
        onLaterPages=cabecalho,
    )

    return buffer.getvalue()