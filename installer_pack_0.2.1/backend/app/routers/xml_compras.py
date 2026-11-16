import logging
import os

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, Query, Response
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.database import engine_local, engine_supabase, get_db
from app.models import Usuario

from app.services.xml_compra_service import (
    LIMITE_XML,
    importar_e_arquivar_xml,
    ler_xml_arquivado,
    listar_xmls_arquivados,
)

from app.utils.license import exigir_licenca_valida
from app.utils.security import ALGORITHM, SECRET_KEY

logger = logging.getLogger(__name__)
oauth2 = OAuth2PasswordBearer(tokenUrl="/login")


def exigir_destinos_configurados():
    ambiente = os.getenv("APP_ENV", "development").strip().lower()

    local = engine_local.url
    remoto = engine_supabase.url

    if ambiente == "development":
        destinos_corretos = (
            local.host in ("127.0.0.1", "localhost")
            and local.port == 5433
            and local.database == "encanto_toys_dev"
            and local.username == "encantotoys_dev_user"
            and remoto.host == "aws-1-sa-east-1.pooler.supabase.com"
            and remoto.username == "postgres.iscguilmcghkhgqsrolu"
        )

    elif ambiente == "production":
        host_esperado = os.getenv(
            "EXPECTED_SUPABASE_HOST", ""
        ).strip()

        usuario_esperado = os.getenv(
            "EXPECTED_SUPABASE_USER", ""
        ).strip()

        if not host_esperado or not usuario_esperado:
            raise HTTPException(
                status_code=503,
                detail="Identificação do Supabase de produção não configurada.",
            )

        destinos_corretos = (
            local.host in ("127.0.0.1", "localhost")
            and local.port == 5433
            and local.database == "encanto_toys"
            and local.username == "encantotoys_user"
            and remoto.host == host_esperado
            and remoto.username == usuario_esperado
            and remoto.database == "postgres"
            and remoto.username != "postgres.iscguilmcghkhgqsrolu"
            and remoto.host != "db.iscguilmcghkhgqsrolu.supabase.co"
        )

    else:
        raise HTTPException(
            status_code=503,
            detail="APP_ENV deve ser development ou production.",
        )

    if not destinos_corretos:
        raise HTTPException(
            status_code=503,
            detail="Os bancos configurados não correspondem ao ambiente esperado.",
        )


def exigir_admin_xml(
    token: str = Depends(oauth2),
    db: Session = Depends(get_db),
):
    try:
        dados = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )
        username = dados.get("sub")
        if not isinstance(username, str) or not username:
            raise ValueError("Usuário ausente.")
    except (JWTError, ValueError):
        raise HTTPException(
            status_code=401,
            detail="Sessão inválida ou expirada. Entre novamente.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    usuario = (
        db.query(Usuario)
        .filter(Usuario.username == username)
        .first()
    )

    cargo = (
        getattr(usuario.cargo, "value", usuario.cargo)
        if usuario is not None
        else None
    )

    if cargo != "ADMIN":
        raise HTTPException(
            status_code=403,
            detail="Somente administradores podem importar XML.",
        )

    return usuario


router = APIRouter(
    prefix="/compras/xml",
    tags=["XML de compras"],
    dependencies=[
        Depends(exigir_destinos_configurados),
        Depends(exigir_licenca_valida),
        Depends(exigir_admin_xml),
    ],
)


@router.post("/importar")
async def importar_xml(arquivo: UploadFile = File(...)):
    try:
        conteudo = await arquivo.read(LIMITE_XML + 1)
    finally:
        await arquivo.close()

    if len(conteudo) > LIMITE_XML:
        raise HTTPException(
            status_code=413,
            detail="O XML deve ter no máximo 2 MB.",
        )

    try:
        return await run_in_threadpool(
            importar_e_arquivar_xml,
            conteudo,
        )
    except ValueError as erro:
        raise HTTPException(
            status_code=422,
            detail=str(erro),
        ) from erro
    except OSError as erro:
        logger.exception("Falha ao arquivar XML de compra.")
        raise HTTPException(
            status_code=500,
            detail=(
                "Não foi possível guardar o XML. "
                "Confira a pasta configurada e suas permissões."
            ),
        ) from erro


@router.get("")
def listar_xmls(
    limite: int = Query(default=50, ge=1, le=100),
    deslocamento: int = Query(default=0, ge=0),
):
    try:
        return listar_xmls_arquivados(limite, deslocamento)
    except OSError as erro:
        logger.exception("Falha ao consultar os XMLs arquivados.")
        raise HTTPException(
            status_code=500,
            detail="Não foi possível acessar a pasta de XMLs.",
        ) from erro


@router.get("/arquivos/{arquivo_id}")
def baixar_xml(arquivo_id: str):
    try:
        conteudo = ler_xml_arquivado(arquivo_id)
    except ValueError as erro:
        raise HTTPException(
            status_code=422,
            detail=str(erro),
        ) from erro
    except FileNotFoundError as erro:
        raise HTTPException(
            status_code=404,
            detail="XML arquivado não encontrado.",
        ) from erro
    except OSError as erro:
        logger.exception("Falha ao recuperar XML arquivado.")
        raise HTTPException(
            status_code=500,
            detail="Não foi possível recuperar o XML original.",
        ) from erro

    return Response(
        content=conteudo,
        media_type="application/xml",
        headers={
            "Content-Disposition": (
                f'attachment; filename="compra_{arquivo_id}.xml"'
            ),
            "Cache-Control": "no-store",
        },
    )