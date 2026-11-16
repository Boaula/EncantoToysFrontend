import socket
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CaixaDispositivo, Usuario
from app.services.monitoramento_caixas_service import (
    classificar_atividade,
    registrar_abertura,
    registrar_atividade,
    registrar_fechamento,
)
from app.utils.license import exigir_licenca_valida
from app.utils.security import ALGORITHM, SECRET_KEY


router = APIRouter(
    prefix="/pdv",
    tags=["Operações do PDV"],
    dependencies=[Depends(exigir_licenca_valida)],
)

oauth2_pdv = OAuth2PasswordBearer(tokenUrl="/login")


def exigir_usuario_pdv(
    token: str = Depends(oauth2_pdv),
    db: Session = Depends(get_db),
):
    erro = HTTPException(
        status_code=401,
        detail="Sessão inválida. Entre novamente no sistema.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        dados = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )
    except JWTError:
        raise erro

    username = dados.get("sub")

    if (
        not isinstance(username, str)
        or not username
        or "exp" not in dados
    ):
        raise erro

    usuario = (
        db.query(Usuario)
        .filter(Usuario.username == username)
        .first()
    )

    if usuario is None:
        raise erro

    return usuario


class IdentificarRequest(BaseModel):
    # Mantido para aceitar as chamadas atuais do frontend.
    # A identidade usada será a do backend local.
    hostname: Optional[str] = None


class IniciarOperacaoRequest(IdentificarRequest):
    # O operador efetivo será obtido do token.
    username: Optional[str] = None


class FecharOperacaoRequest(IdentificarRequest):
    pass


def _buscar_caixa_local(db, criar=False):
    hostname = socket.gethostname()

    caixa = (
        db.query(CaixaDispositivo)
        .filter(CaixaDispositivo.hostname == hostname)
        .with_for_update()
        .first()
    )

    if caixa is None:
        if not criar:
            raise HTTPException(
                status_code=404,
                detail="Este computador ainda não foi identificado.",
            )

        caixa = CaixaDispositivo(
            hostname=hostname,
            tag_nome=f"Caixa - {hostname}",
            esta_aberto=False,
        )

        db.add(caixa)
        db.flush()

    return caixa


def _resposta_caixa(caixa):
    agora = datetime.now(timezone.utc)

    return {
        "id": caixa.id,
        "hostname": caixa.hostname,
        "tag_nome": caixa.tag_nome,
        "esta_aberto": caixa.esta_aberto,
        "operador_atual": caixa.operador_atual,
        "aberto_em": caixa.aberto_em,
        "fechado_em": caixa.fechado_em,
        "ultima_atividade_em": caixa.ultima_atividade_em,
        "status_atividade": classificar_atividade(
            caixa.ultima_atividade_em,
            agora,
        ),
        "referencia_em": agora,
    }


def _salvar_caixa(db, caixa):
    try:
        db.commit()
        db.refresh(caixa)
    except Exception:
        db.rollback()
        raise

    return _resposta_caixa(caixa)


@router.post("/identificar")
def identificar_maquina(
    payload: IdentificarRequest,
    usuario: Usuario = Depends(exigir_usuario_pdv),
    db: Session = Depends(get_db),
):
    caixa = _buscar_caixa_local(db, criar=True)

    # Identificar não abre o caixa nem renova a atividade.
    return _salvar_caixa(db, caixa)


@router.post("/iniciar-operacao")
def iniciar_operacao(
    payload: IniciarOperacaoRequest,
    usuario: Usuario = Depends(exigir_usuario_pdv),
    db: Session = Depends(get_db),
):
    caixa = _buscar_caixa_local(db, criar=True)

    registrar_abertura(
        caixa,
        usuario.username,
    )

    return _salvar_caixa(db, caixa)


@router.post("/atividade")
def atualizar_atividade(
    payload: IdentificarRequest,
    usuario: Usuario = Depends(exigir_usuario_pdv),
    db: Session = Depends(get_db),
):
    caixa = _buscar_caixa_local(db)

    try:
        atualizou = registrar_atividade(
            caixa,
            usuario.username,
        )
    except ValueError as erro:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=str(erro),
        ) from erro

    resposta = _salvar_caixa(db, caixa)
    resposta["atividade_registrada"] = atualizou
    return resposta


@router.post("/fechar-operacao")
def fechar_operacao(
    payload: FecharOperacaoRequest,
    usuario: Usuario = Depends(exigir_usuario_pdv),
    db: Session = Depends(get_db),
):
    caixa = _buscar_caixa_local(db)

    try:
        registrar_fechamento(
            caixa,
            usuario.username,
        )
    except ValueError as erro:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=str(erro),
        ) from erro

    return _salvar_caixa(db, caixa)