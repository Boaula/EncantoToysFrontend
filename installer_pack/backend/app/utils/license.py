from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.license_service import verificar_licenca


def exigir_licenca_valida(db: Session = Depends(get_db)):
    """
    Bloqueia o acesso ao sistema quando a licença estiver
    expirada ou inexistente.
    """

    licenca = verificar_licenca(db)

    if not licenca.get("ativa"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "codigo": "LICENCA_EXPIRADA",
                "status": licenca.get("status"),
                "mensagem": "Período de avaliação encerrado. Entre em contato com o desenvolvedor para realizar a ativação permanente."
            }
        )

    return licenca