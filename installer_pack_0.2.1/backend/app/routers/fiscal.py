import os
import shutil
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
import requests

from app.database import get_db
from app import models, schemas

from app.services.fiscal_service import emitir_nfce_venda

from fastapi.responses import Response

from pydantic import BaseModel

from app.utils.license import exigir_licenca_valida

router = APIRouter(
    prefix="/fiscal",
    tags=["Fiscal"],
    dependencies=[Depends(exigir_licenca_valida)]
)

# Configurações do diretório de uploads
UPLOADS_DIR = "uploads/certificados"
os.makedirs(UPLOADS_DIR, exist_ok=True)

# 🔑 CONFIGURE SEU TOKEN E URL BASE AQUI:
FOCUS_API_TOKEN = os.getenv("FOCUS_API_TOKEN", "").strip()
FOCUS_BASE_URL = os.getenv("FOCUS_BASE_URL", "").strip()


# 🟢 Modelo para capturar o corpo da requisição enviada pelo React
class EmitirNfceRequest(BaseModel):
    cpf_cliente: Optional[str] = None

# ==========================================
# 1. GESTÃO DA EMPRESA FISCAL (Local + FocusNFe)
# ==========================================

@router.get("/empresa/", response_model=Optional[schemas.EmpresaFiscalSchema])
def obter_configuracao_fiscal(db: Session = Depends(get_db)):
    config = db.query(models.EmpresaModel).first()
    return config


@router.post("/empresa/", response_model=schemas.EmpresaFiscalSchema)
def salvar_configuracao_fiscal(payload: schemas.EmpresaCreate, db: Session = Depends(get_db)):
    config = db.query(models.EmpresaModel).first()
    
    dados = payload.model_dump() if hasattr(payload, 'model_dump') else payload.dict()
    dados.pop("id", None)
    
    # --- PASSO A: Enviar/Atualizar os Dados da Empresa na API da FocusNFe ---
    payload_focus = {
        "nome": dados.get("razao_social"),
        "nome_fantasia": dados.get("nome_fantasia"),
        "cnpj": dados.get("cnpj"),
        "inscricao_estadual": dados.get("inscricao_estadual"),
        "regime_tributario": dados.get("regime_tributario", 1), # 1: Simples Nacional
        "csc_nfce_producao": dados.get("csc_token"),
        "id_token_csc_nfce_producao": dados.get("csc_id"),
        "habilita_nfce": True,
        "envio_email_destinatario": False
    }

    try:
        # Tenta enviar para a Focus NFe usando Basic Auth (Token como usuário, senha em branco)
        response_focus = requests.post(
            f"{FOCUS_BASE_URL}/empresas",
            json=payload_focus,
            auth=(FOCUS_API_TOKEN, "")
        )
        
        # Se a empresa já existir, tentamos atualizar via PUT
        if response_focus.status_code == 422: # Código comum para "Empresa já cadastrada"
            requests.put(
                f"{FOCUS_BASE_URL}/empresas/{dados.get('cnpj')}",
                json=payload_focus,
                auth=(FOCUS_API_TOKEN, "")
            )
    except requests.RequestException as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro de comunicação com Focus NFe ao cadastrar empresa: {str(e)}"
        )

    # --- PASSO B: Salvar no Banco de Dados Local ---
    if config:
        for key, value in dados.items():
            setattr(config, key, value)
    else:
        config = models.EmpresaModel(**dados)
        db.add(config)
        
    db.commit()
    db.refresh(config)
    return config


# ==========================================
# 2. UPLOAD DO CERTIFICADO DIGITAL A1 (FocusNFe)
# ==========================================

@router.post("/empresa/certificado/", status_code=status.HTTP_201_CREATED)
async def upload_certificado(
    senha: str = Form(...),
    arquivo: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # 1. Validação do arquivo
    if not (arquivo.filename.endswith('.pfx') or arquivo.filename.endswith('.p12')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Formato inválido. Envie um arquivo com extensão .pfx ou .p12."
        )

    # 2. Busca a empresa local
    empresa = db.query(models.EmpresaModel).first()
    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Cadastre os dados da empresa antes de enviar o certificado."
        )

    # 3. Salva no servidor local (PDV)
    caminho_arquivo = os.path.join(UPLOADS_DIR, f"cert_{empresa.cnpj}.pfx")
    with open(caminho_arquivo, "wb") as buffer:
        shutil.copyfileobj(arquivo.file, buffer)

    # 4. Salva no Banco de Dados
    cert_db = db.query(models.CertificadoModel).filter_by(empresa_id=empresa.id).first()
    if not cert_db:
        cert_db = models.CertificadoModel(
            empresa_id=empresa.id,
            arquivo_path=caminho_arquivo,
            senha=senha
        )
        db.add(cert_db)
    else:
        cert_db.arquivo_path = caminho_arquivo
        cert_db.senha = senha

    db.commit()
    db.refresh(cert_db)

    return {"mensagem": "Certificado A1 configurado com sucesso no sistema local!"}

# ==========================================
# 3. EMISSÃO DE NFC-E
# ==========================================

@router.post("/emitir-nfce/{venda_id}")
def emitir_nota_fiscal(
    venda_id: int, 
    req: Optional[EmitirNfceRequest] = None, # 👈 Adicionado aqui
    db: Session = Depends(get_db)
):
    try:
        # Extrai o CPF se o corpo tiver sido enviado
        cpf = req.cpf_cliente if req else None
        
        # Repassa para a função fiscal
        resultado = emitir_nfce_venda(venda_id=venda_id, db=db, cpf_cliente=cpf)
        return resultado
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
