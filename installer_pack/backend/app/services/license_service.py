import uuid
import datetime

from sqlalchemy.orm import Session

from app.models import Licenca


DIAS_DEMO = 14


def gerar_chave_instalacao() -> str:
    """
    Gera uma identificação única para esta instalação.
    """
    return uuid.uuid4().hex


def criar_licenca_demo(db: Session) -> Licenca:
    """
    Cria uma licença DEMO de 14 dias somente se
    nenhuma licença existir para esta instalação.

    Uma licença expirada NÃO gera uma nova licença DEMO.
    """

    licenca_existente = (
        db.query(Licenca)
        .order_by(Licenca.id.asc())
        .first()
    )

    if licenca_existente:
        return licenca_existente

    agora = datetime.datetime.utcnow()
    vencimento = agora + datetime.timedelta(days=DIAS_DEMO)

    licenca = Licenca(
        chave_instalacao=gerar_chave_instalacao(),
        tipo="DEMO",
        inicio=agora,
        vencimento=vencimento,
        ativa=True,
        criada_em=agora,
        ultima_verificacao=agora,
    )

    db.add(licenca)
    db.commit()
    db.refresh(licenca)

    return licenca


def obter_licenca(db: Session) -> Licenca | None:
    """
    Retorna a única licença existente para esta instalação.
    """
    return (
        db.query(Licenca)
        .order_by(Licenca.id.asc())
        .first()
    )


def verificar_licenca(db: Session) -> dict:
    """
    Verifica o estado atual da licença.
    """

    licenca = obter_licenca(db)

    if not licenca:
        return {
            "ativa": False,
            "tipo": None,
            "status": "SEM_LICENCA",
            "mensagem": "Nenhuma licença encontrada."
        }

    # Licença desativada remotamente pelo Supabase.
    # O Supabase é a fonte da verdade.
    if not licenca.ativa:
        return {
            "ativa": False,
            "tipo": licenca.tipo,
            "status": "DESATIVADA",
            "inicio": licenca.inicio.isoformat() if licenca.inicio else None,
            "vencimento": (
                licenca.vencimento.isoformat()
                if licenca.vencimento
                else None
            ),
            "dias_restantes": None,
            "horas_restantes": None,
            "minutos_restantes": None,
            "segundos_restantes": None,
            "mensagem": "Licença desativada."
        }

    agora = datetime.datetime.utcnow()
    licenca.ultima_verificacao = agora

    if licenca.tipo == "DEFINITIVA":
        licenca.ativa = True
        licenca.ultima_verificacao = agora
        db.commit()

        return {
            "ativa": True,
            "tipo": "DEFINITIVA",
            "status": "ATIVA",
            "inicio": licenca.inicio.isoformat(),
            "vencimento": None,
            "dias_restantes": None,
            "horas_restantes": None,
            "minutos_restantes": None,
            "segundos_restantes": None,
            "mensagem": "Licença definitiva ativa."
        }

    # 🔴 Licença vencida
    if agora >= licenca.vencimento:
        licenca.ativa = False
        db.commit()

        return {
            "ativa": False,
            "tipo": licenca.tipo,
            "status": "EXPIRADA",
            "inicio": licenca.inicio.isoformat(),
            "vencimento": licenca.vencimento.isoformat(),
            "mensagem": "Período de avaliação encerrado."
        }

    # 🟢 Licença válida
    licenca.ativa = True

    restante = licenca.vencimento - agora

    total_segundos = int(restante.total_seconds())

    dias = total_segundos // 86400
    horas = (total_segundos % 86400) // 3600
    minutos = (total_segundos % 3600) // 60
    segundos = total_segundos % 60

    db.commit()

    return {
        "ativa": True,
        "tipo": licenca.tipo,
        "status": "ATIVA",
        "inicio": licenca.inicio.isoformat(),
        "vencimento": licenca.vencimento.isoformat(),
        "dias_restantes": dias,
        "horas_restantes": horas,
        "minutos_restantes": minutos,
        "segundos_restantes": segundos,
        "mensagem": (
            "Este sistema está usando tecnologia que vai "
            "expirar em breve. Contate o desenvolvedor "
            "para mais detalhes."
        )
    }