from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime
from app.models import TipoCodigo, CargoUsuario, FormaPagamento

# ==========================================
# --- SCHEMAS DE PRODUTO ---
# ==========================================
class ProdutoBase(BaseModel):
    nome_produto: str
    categoria: str = Field(default="Geral", description="Categoria do brinquedo/produto")
    preco_venda: float = Field(gt=0, description="Preço deve ser maior que zero")
    quantidade_estoque: int = Field(default=0, ge=0)

# Para criar um novo produto
class ProdutoCreate(ProdutoBase):
    codigo_barras: str
    tipo_codigo: Optional[str] = "FABRICA"
    nome_produto: str
    preco_venda: float
    quantidade_estoque: int
    categoria: Optional[str] = "Geral"
    ativo: Optional[bool] = True

# Para responder ao Frontend após criar
class ProdutoResponse(ProdutoBase):
    id: int
    codigo_barras: str
    tipo_codigo: TipoCodigo

    class Config:
        from_attributes = True


# 🎯 SCHEMA DEDICADO AO PDV (Mapeia para o React)
class ProdutoPDVResponse(BaseModel):
    id: int
    name: str
    barcode: str
    category: str
    price: float
    stock: int

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_custom(cls, obj):
        return cls(
            id=obj.id,
            name=obj.nome_produto,
            barcode=obj.codigo_barras or "",
            category=obj.categoria or "Geral",
            price=float(obj.preco_venda),
            stock=obj.quantidade_estoque
        )


# ==========================================
# --- SCHEMAS DE ITENS DE VENDA ---
# ==========================================
class ItemVendaBase(BaseModel):
    produto_id: int
    quantidade: int = Field(gt=0, description="Quantidade comprada deve ser no mínimo 1")


class ItemVendaCreate(BaseModel):
    produto_id: int
    quantidade: int
    preco_unitario: float


class ItemVendaResponse(ItemVendaBase):
    id: int
    preco_estatico: float

    class Config:
        from_attributes = True


# ==========================================
# --- SCHEMAS DE VENDA ---
# ==========================================
class VendaCreate(BaseModel):
    caixa_id: Optional[int] = 1
    usuario_id: Optional[int] = 1
    forma_pagamento: str  # ex: "PIX", "DINHEIRO", "CARTAO_CREDITO", "CARTAO_DEBITO"
    valor_total: float

    subtotal: Optional[float] = 0.0
    desconto: Optional[float] = 0.0
    desconto_tipo: Optional[str] = "R$"
    acrescimo: Optional[float] = 0.0
    acrescimo_tipo: Optional[str] = "R$"
    
    itens: List[ItemVendaCreate]


class VendaResponse(BaseModel):
    id: int
    uuid: str
    total: float
    forma_pagamento: FormaPagamento
    data_venda: datetime
    sincronizado: bool

    class Config:
        from_attributes = True


# ==========================================
# --- SCHEMAS DE USUÁRIO E AUTH ---
# ==========================================
class UsuarioCreate(BaseModel):
    username: str
    password: str
    cargo: CargoUsuario = CargoUsuario.OPERADOR


class UsuarioResponse(BaseModel):
    id: int
    username: str
    cargo: CargoUsuario

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str
    cargo: str


# ==========================================
# --- SCHEMAS DE CAIXA ---
# ==========================================
class CaixaResponse(BaseModel):
    id: int
    hostname: str
    tag_nome: str
    esta_aberto: bool

    class Config:
        from_attributes = True


class CaixaUpdate(BaseModel):
    tag_nome: str
    esta_aberto: Optional[bool] = None

# ==========================================
# --- SCHEMAS DE HISTÓRICO DE VENDAS ---
# ==========================================
class ItemVendaHistoricoResponse(BaseModel):
    id: int
    produto_id: int
    nome_produto: str
    quantidade: int
    preco_estatico: float
    subtotal: float

    class Config:
        from_attributes = True

class VendaAjusteResponse(BaseModel):
    id: int
    tipo: str  # 'DESCONTO' ou 'ACRESCIMO'
    forma_calculo: str  # 'R$' ou '%'
    valor_informado: float
    valor_aplicado: float

    class Config:
        from_attributes = True


class VendaHistoricoResponse(BaseModel):
    id: int
    uuid: str
    total: float
    forma_pagamento: str
    data_venda: datetime
    sincronizado: bool
    caixa_id: Optional[int] = None
    usuario_id: Optional[int] = None
    nome_usuario: Optional[str] = "Operador"
    itens: List[ItemVendaHistoricoResponse] = []
    ajustes: Optional[List[VendaAjusteResponse]] = []

    class Config:
        from_attributes = True

# ==========================================
# --- EMPRESA NFC ---
# ==========================================

class EmpresaBase(BaseModel):
    model_config = {"extra": "ignore"}
    cnpj: str = Field(..., min_length=14, max_length=18, description="Com ou sem pontuação")
    razao_social: str = Field(..., max_length=100)
    nome_fantasia: Optional[str] = Field(None, max_length=100)
    inscricao_estadual: str = Field(..., max_length=20)
    crt: int = Field(default=1)
    cnae_principal: Optional[str] = Field(None, max_length=10) # Tornou opcional
    email: Optional[EmailStr] = None                          # Tornou opcional
    telefone: Optional[str] = Field(None, max_length=20)      # Tornou opcional
    
    # Endereço
    logradouro: str = Field(..., max_length=150)
    numero: str = Field(..., max_length=20)
    complemento: Optional[str] = Field(None, max_length=100)
    bairro: str = Field(..., max_length=100)
    municipio: str = Field(..., max_length=100)
    codigo_ibge: str = Field(..., min_length=7, max_length=7)
    uf: str = Field(..., min_length=2, max_length=2)
    cep: str = Field(..., min_length=8, max_length=9)         # Aceita hífen ex: 78840-000
    
    # Parâmetros Emissão NFC-e
    ambiente: int = Field(default=2)
    serie_nfce: int = Field(default=1)
    proxima_nota_nfce: int = Field(default=1)
    csc_id: Optional[str] = Field(None, max_length=10)
    csc_token: Optional[str] = Field(None, max_length=100)

class EmpresaCreate(EmpresaBase):
    class Config:
        extra = "ignore"
class EmpresaResponse(EmpresaBase):
    id: int

    class Config:
        from_attributes = True

EmpresaFiscalSchema = EmpresaResponse

class CertificadoUpload(BaseModel):
    senha: str

class CertificadoResponse(BaseModel):
    id: int
    vencimento: Optional[datetime] = None

    class Config:
        from_attributes = True
    