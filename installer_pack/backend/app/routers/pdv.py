from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models import CaixaDispositivo, Usuario

from app.utils.license import exigir_licenca_valida

router = APIRouter(
    prefix="/pdv",
    tags=["Operações do PDV"],
    dependencies=[Depends(exigir_licenca_valida)]
)


# --- Schemas Auxiliares para Entrada de Dados ---
class IdentificarRequest(BaseModel):
    hostname: str


class IniciarOperacaoRequest(BaseModel):
    hostname: str
    username: str


class FecharOperacaoRequest(BaseModel):
    hostname: str


# 🟢 1. IDENTIFICAR MÁQUINA AO LIGAR
@router.post("/identificar")
def identificar_maquina(payload: IdentificarRequest, db: Session = Depends(get_db)):
    # Busca o caixa pelo hostname do computador
    caixa = db.query(CaixaDispositivo).filter(CaixaDispositivo.hostname == payload.hostname).first()
    
    if not caixa:
        # Se for o primeiro acesso da máquina, cadastra automaticamente no banco
        caixa = CaixaDispositivo(
            hostname=payload.hostname,
            tag_nome=f"Caixa - {payload.hostname}",
            esta_aberto=False
        )
        db.add(caixa)
        db.commit()
        db.refresh(caixa)
        
    return {
        "id": caixa.id,
        "hostname": caixa.hostname,
        "tag_nome": caixa.tag_nome,
        "esta_aberto": caixa.esta_aberto
    }


# 🟢 2. ABRIR CAIXA (INICIAR OPERAÇÃO)
@router.post("/iniciar-operacao")
def iniciar_operacao(payload: IniciarOperacaoRequest, db: Session = Depends(get_db)):
    caixa = db.query(CaixaDispositivo).filter(CaixaDispositivo.hostname == payload.hostname).first()
    
    if not caixa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Caixa/Dispositivo não cadastrado."
        )

    # Marca o caixa como aberto
    caixa.esta_aberto = True
    db.commit()
    db.refresh(caixa)

    return {
        "tag_nome": caixa.tag_nome,
        "esta_aberto": caixa.esta_aberto,
        "mensagem": f"Caixa aberto com sucesso pelo operador {payload.username}"
    }


# 🟢 3. FECHAR CAIXA (FECHAR OPERAÇÃO)
@router.post("/fechar-operacao")
def fechar_operacao(payload: FecharOperacaoRequest, db: Session = Depends(get_db)):
    caixa = db.query(CaixaDispositivo).filter(CaixaDispositivo.hostname == payload.hostname).first()
    
    if not caixa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Caixa/Dispositivo não encontrado."
        )

    # Marca o caixa como fechado
    caixa.esta_aberto = False
    db.commit()

    return {
        "esta_aberto": False,
        "mensagem": "Caixa fechado com sucesso."
    }