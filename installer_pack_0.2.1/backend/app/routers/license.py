from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.license_service import verificar_licenca

router = APIRouter(
    prefix="/licenca",
    tags=["Licença"]
)


@router.get("/status")
def status_licenca(db: Session = Depends(get_db)):
    """
    Retorna o estado atual da licença da instalação.
    """

    return verificar_licenca(db)