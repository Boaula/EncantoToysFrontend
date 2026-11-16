from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from xml.etree.ElementTree import ParseError

from defusedxml import ElementTree
from defusedxml.common import DefusedXmlException

import hashlib
import os
import tempfile
from pathlib import Path

NS = {"n": "http://www.portalfiscal.inf.br/nfe"}
LIMITE_XML = 2 * 1024 * 1024


def _texto(elemento, caminho):
    if elemento is None:
        return ""
    return (elemento.findtext(caminho, default="", namespaces=NS) or "").strip()


def _numero(elemento, caminho, obrigatorio=False):
    texto = _texto(elemento, caminho)

    if not texto and not obrigatorio:
        return Decimal("0")

    try:
        valor = Decimal(texto)
    except InvalidOperation as erro:
        raise ValueError(f"Valor numérico inválido: {caminho}") from erro

    if not valor.is_finite() or valor < 0:
        raise ValueError(f"Valor negativo ou inválido: {caminho}")

    return valor


def _moeda(valor):
    if valor > Decimal("999999999999.99"):
        raise ValueError("Valor monetário acima do limite permitido.")

    if valor != valor.quantize(Decimal("0.01")):
        raise ValueError("Valor monetário com mais de duas casas decimais.")

    return format(valor, ".2f")


def ler_xml_compra(conteudo: bytes):

    if not conteudo or len(conteudo) > LIMITE_XML:
        raise ValueError("Selecione um XML de até 2 MB.")

    try:
        raiz = ElementTree.fromstring(
            conteudo,
            forbid_dtd=True,
            forbid_entities=True,
            forbid_external=True,
        )
    except (ParseError, DefusedXmlException) as erro:
        raise ValueError("XML inválido ou com estrutura não permitida.") from erro

    if raiz.tag == f"{{{NS['n']}}}NFe":
        nfe = raiz
    elif raiz.tag == f"{{{NS['n']}}}nfeProc":
        notas = raiz.findall("n:NFe", NS)
        if len(notas) != 1:
            raise ValueError("O arquivo deve conter exatamente uma NF-e.")
        nfe = notas[0]
    else:
        raise ValueError("O arquivo não é uma NF-e de compra.")

    infos = nfe.findall("n:infNFe", NS)
    if len(infos) != 1:
        raise ValueError("O arquivo deve conter exatamente uma NF-e.")

    info = infos[0]

    if info.get("versao") != "4.00":
        raise ValueError("Esta etapa aceita somente NF-e versão 4.00.")

    if _texto(info, "n:ide/n:mod") != "55":
        raise ValueError("Selecione uma NF-e de mercadorias, modelo 55.")

    detalhes = info.findall("n:det", NS)
    if not 1 <= len(detalhes) <= 990:
        raise ValueError("A nota deve conter entre 1 e 990 itens.")

    itens = []
    numeros = set()

    for detalhe in detalhes:
        numero = detalhe.get("nItem", "")

        if not numero.isdigit() or numero in numeros:
            raise ValueError("Número de item ausente ou repetido.")
        numeros.add(numero)

        produto = detalhe.find("n:prod", NS)
        nome = _texto(produto, "n:xProd")

        if not nome:
            raise ValueError(f"Item {numero}: nome do produto ausente.")

        avisos = []
        quantidade = _numero(produto, "n:qCom", obrigatorio=True)

        if quantidade <= 0:
            raise ValueError(f"Item {numero}: quantidade deve ser positiva.")

        unidade = _texto(produto, "n:uCom").upper()
        quantidade_compra = None

        if (
            unidade in {"UN", "UND", "UNID", "UNIDADE", "UNIDADES"}
            and quantidade == quantidade.to_integral_value()
            and quantidade <= 2_147_483_647
        ):
            quantidade_compra = int(quantidade)
        else:
            avisos.append("Confira a conversão da quantidade para unidades.")

        bruto = _numero(produto, "n:vProd", obrigatorio=True)
        desconto = _numero(produto, "n:vDesc")

        if desconto > bruto:
            raise ValueError(f"Item {numero}: desconto maior que o valor.")

        gtin = _texto(produto, "n:cEAN")
        if not gtin or gtin.upper() == "SEM GTIN":
            gtin = None
            avisos.append(
                "Informe o código de barras ou gere um código interno."
            )

        rastros = produto.findall("n:rastro", NS)
        validades = [_texto(rastro, "n:dVal") for rastro in rastros]
        validade = None

        if validades:
            if all(validades) and len(set(validades)) == 1:
                try:
                    validade = date.fromisoformat(validades[0]).isoformat()
                except ValueError as erro:
                    raise ValueError(
                        f"Item {numero}: validade inválida."
                    ) from erro
            else:
                avisos.append(
                    "Há lotes com validades diferentes ou incompletas."
                )

        itens.append({
            "numero_item": numero,
            "codigo_fornecedor": _texto(produto, "n:cProd"),
            "codigo_barras": gtin,
            "nome_produto": nome,
            "unidade_xml": unidade,
            "quantidade_xml": str(quantidade),
            "quantidade_compra": quantidade_compra,
            "valor_compra_total": _moeda(bruto - desconto),
            "desconto_total": _moeda(desconto),
            "frete_total": _moeda(_numero(produto, "n:vFrete")),
            "outras_despesas_total": _moeda(
                _numero(produto, "n:vOutro")
                + _numero(produto, "n:vSeg")
            ),
            "ipi_total": _moeda(
                _numero(
                    detalhe,
                    "n:imposto/n:IPI/n:IPITrib/n:vIPI",
                )
            ),
            "data_validade": validade,
            "avisos": avisos,
        })

    avisos_nota = [
        "Confira os impostos adicionais antes de salvar o produto."
    ]

    frete_nota = _numero(info, "n:total/n:ICMSTot/n:vFrete")
    soma_frete_itens = sum(
        Decimal(item["frete_total"]) for item in itens
    )

    if soma_frete_itens != frete_nota:
        avisos_nota.append(
            "O frete total diverge da soma do frete dos itens."
        )

    ambiente = _texto(info, "n:ide/n:tpAmb")
    if ambiente not in {"1", "2"}:
        raise ValueError("Ambiente da NF-e ausente ou inválido.")

    if ambiente == "2":
        avisos_nota.append(
            "Documento de homologação: usar somente no DEV."
        )

    return {
        "chave": info.get("Id", "").removeprefix("NFe"),
        "numero_nota": _texto(info, "n:ide/n:nNF"),
        "ambiente": ambiente,
        "fornecedor": _texto(info, "n:emit/n:xNome"),
        "itens": itens,
        "avisos": avisos_nota,
    }


def importar_e_arquivar_xml(conteudo: bytes):
    # Só arquiva depois que a leitura for concluída.
    nota = ler_xml_compra(conteudo)

    diretorio_configurado = os.getenv("COMPRAS_XML_DIR", "").strip()
    if not diretorio_configurado:
        raise OSError("COMPRAS_XML_DIR não foi configurado.")

    pasta = Path(diretorio_configurado).expanduser()
    if not pasta.is_absolute():
        raise OSError("COMPRAS_XML_DIR deve ser um caminho absoluto.")

    pasta.mkdir(parents=True, exist_ok=True, mode=0o700)

    identificador = hashlib.sha256(conteudo).hexdigest()
    destino = pasta / f"{identificador}.xml"
    ja_arquivado = False

    descritor, temporario = tempfile.mkstemp(
        prefix=".importacao-",
        suffix=".tmp",
        dir=pasta,
    )

    try:
        with os.fdopen(descritor, "wb") as arquivo:
            arquivo.write(conteudo)
            arquivo.flush()
            os.fsync(arquivo.fileno())

        try:
            # Publica o arquivo completo sem sobrescrever outro.
            os.link(temporario, destino)
        except FileExistsError:
            if destino.is_symlink() or destino.read_bytes() != conteudo:
                raise OSError(
                    "O arquivo existente diverge do XML importado."
                )
            ja_arquivado = True
    finally:
        Path(temporario).unlink(missing_ok=True)

    return {
        "arquivo": {
            "id": identificador,
            "nome": destino.name,
            "ja_arquivado": ja_arquivado,
        },
        "nota": nota,
    }


def _diretorio_xml():
    configurado = os.getenv("COMPRAS_XML_DIR", "").strip()

    if not configurado:
        raise OSError("COMPRAS_XML_DIR não foi configurado.")

    pasta = Path(configurado).expanduser()

    if not pasta.is_absolute():
        raise OSError("COMPRAS_XML_DIR deve ser um caminho absoluto.")

    return pasta


def _identificador_xml_valido(identificador):
    return (
        len(identificador) == 64
        and all(
            caractere in "0123456789abcdef"
            for caractere in identificador
        )
    )


def ler_xml_arquivado(identificador: str):
    if not _identificador_xml_valido(identificador):
        raise ValueError("Identificador do XML inválido.")

    caminho = _diretorio_xml() / f"{identificador}.xml"

    if caminho.is_symlink():
        raise OSError("O arquivo não pode ser um link simbólico.")

    with caminho.open("rb") as arquivo:
        conteudo = arquivo.read(LIMITE_XML + 1)

    if len(conteudo) > LIMITE_XML:
        raise OSError("O arquivo arquivado excedeu o tamanho permitido.")

    if hashlib.sha256(conteudo).hexdigest() != identificador:
        raise OSError("O conteúdo do arquivo arquivado foi alterado.")

    return conteudo


def listar_xmls_arquivados(limite=50, deslocamento=0):
    pasta = _diretorio_xml()

    if not pasta.exists():
        return {
            "total": 0,
            "limite": limite,
            "deslocamento": deslocamento,
            "arquivos": [],
        }

    candidatos = []

    for caminho in pasta.glob("*.xml"):
        if (
            caminho.is_symlink()
            or not _identificador_xml_valido(caminho.stem)
            or not caminho.is_file()
        ):
            continue

        try:
            dados = caminho.stat()
        except FileNotFoundError:
            continue

        candidatos.append((
            dados.st_mtime,
            caminho.stem,
            dados.st_size,
        ))

    candidatos.sort(reverse=True)

    arquivos = []

    for instante, identificador, tamanho in candidatos[
        deslocamento:deslocamento + limite
    ]:
        registro = {
            "id": identificador,
            "nome": f"{identificador}.xml",
            "tamanho_bytes": tamanho,
            "arquivado_em": datetime.fromtimestamp(
                instante, timezone.utc
            ).isoformat(),
            "numero_nota": None,
            "fornecedor": None,
            "quantidade_itens": None,
            "erro": None,
        }

        try:
            conteudo = ler_xml_arquivado(identificador)
            nota = ler_xml_compra(conteudo)

            registro.update({
                "numero_nota": nota["numero_nota"],
                "fornecedor": nota["fornecedor"],
                "quantidade_itens": len(nota["itens"]),
            })
        except (OSError, ValueError):
            registro["erro"] = (
                "Não foi possível conferir este arquivo arquivado."
            )

        arquivos.append(registro)

    return {
        "total": len(candidatos),
        "limite": limite,
        "deslocamento": deslocamento,
        "arquivos": arquivos,
    }

