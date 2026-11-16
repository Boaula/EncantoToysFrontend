from pydantic import BaseModel, Field, EmailStr, model_validator, field_validator
from decimal import Decimal
from typing import List, Optional
from datetime import datetime, date
from app.models import TipoCodigo, CargoUsuario, FormaPagamento

# ==========================================
# --- SCHEMAS DE PRODUTO ---
# ==========================================
class ProdutoDadosCompra(BaseModel):
    quantidade_compra: Optional[int] = Field(default=None, gt=0)

    valor_compra_total: Optional[Decimal] = Field(
        default=None, ge=0, max_digits=14, decimal_places=2
    )
    frete_total: Optional[Decimal] = Field(
        default=None, ge=0, max_digits=14, decimal_places=2
    )
    imposto_total: Optional[Decimal] = Field(
        default=None, ge=0, max_digits=14, decimal_places=2
    )
    outras_despesas_total: Optional[Decimal] = Field(
        default=None, ge=0, max_digits=14, decimal_places=2
    )

    fornecedor: Optional[str] = Field(default=None, max_length=150)
    data_validade: Optional[date] = None


class ProdutoBase(ProdutoDadosCompra):
    nome_produto: str
    categoria: str = "Geral"
    preco_venda: float = Field(gt=0)
    quantidade_estoque: int = Field(default=0, ge=0)


class ProdutoCreate(ProdutoBase):
    codigo_barras: str
    tipo_codigo: TipoCodigo = TipoCodigo.FABRICA
    ativo: bool = True

    @model_validator(mode="after")
    def validar_dados_compra(self):
        valores = (
            self.quantidade_compra,
            self.valor_compra_total,
            self.frete_total,
            self.imposto_total,
            self.outras_despesas_total,
        )

        if any(valor is not None for valor in valores):
            if (
                self.quantidade_compra is None
                or self.valor_compra_total is None
            ):
                raise ValueError(
                    "Ao informar dados de compra, preencha a quantidade "
                    "comprada e o valor total dos produtos."
                )

        return self


class ProdutoResponse(ProdutoBase):
    id: int
    codigo_barras: str
    tipo_codigo: TipoCodigo
    custo_unitario: Optional[Decimal] = None
    dados_produto_atualizados_em: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProdutoPDVResponse(ProdutoDadosCompra):
    id: int
    name: str
    barcode: str
    category: str
    price: float
    stock: int

    custo_unitario: Optional[Decimal] = None
    dados_produto_atualizados_em: Optional[datetime] = None

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
            stock=obj.quantidade_estoque,
            quantidade_compra=obj.quantidade_compra,
            valor_compra_total=obj.valor_compra_total,
            frete_total=obj.frete_total,
            imposto_total=obj.imposto_total,
            outras_despesas_total=obj.outras_despesas_total,
            custo_unitario=obj.custo_unitario,
            fornecedor=obj.fornecedor,
            data_validade=obj.data_validade,
            dados_produto_atualizados_em=obj.dados_produto_atualizados_em,
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

class PagamentoVendaCreate(BaseModel):
    forma_pagamento: FormaPagamento

    valor: Decimal = Field(
        gt=0,
        max_digits=14,
        decimal_places=2,
        allow_inf_nan=False,
    )

    valor_recebido: Optional[Decimal] = Field(
        default=None,
        ge=0,
        max_digits=14,
        decimal_places=2,
        allow_inf_nan=False,
    )

    @model_validator(mode="after")
    def validar_recebimento(self):
        if self.forma_pagamento == FormaPagamento.MISTO:
            raise ValueError(
                "Cada parcela deve informar dinheiro, "
                "PIX, crédito ou débito."
            )

        if self.valor_recebido is not None:
            if self.forma_pagamento != FormaPagamento.DINHEIRO:
                raise ValueError(
                    "Valor recebido e troco são exclusivos "
                    "do pagamento em dinheiro."
                )

            if self.valor_recebido < self.valor:
                raise ValueError(
                    "O dinheiro recebido não pode ser menor "
                    "que o valor aplicado à venda."
                )

        return self


class PagamentosVendaCreate(BaseModel):
    valor_total: Decimal = Field(
        gt=0,
        max_digits=14,
        decimal_places=2,
        allow_inf_nan=False,
    )

    pagamentos: List[PagamentoVendaCreate] = Field(
        min_length=1,
        max_length=20,
    )

    @model_validator(mode="after")
    def conferir_total(self):
        total_pagamentos = sum(
            (pagamento.valor for pagamento in self.pagamentos),
            Decimal("0.00"),
        )

        if total_pagamentos != self.valor_total:
            raise ValueError(
                "A soma dos pagamentos deve ser igual "
                "ao total final da venda."
            )

        return self

# ==========================================
# --- SCHEMAS DE VENDA ---
# ==========================================
class VendaCreate(BaseModel):
    caixa_id: Optional[int] = 1
    usuario_id: Optional[int] = 1
    forma_pagamento: Optional[str] = None

    pagamentos: Optional[List[PagamentoVendaCreate]] = Field(
        default=None,
        min_length=1,
        max_length=20,
    )

    valor_total: float

    subtotal: Optional[float] = 0.0
    desconto: Optional[float] = 0.0
    desconto_tipo: Optional[str] = "R$"
    acrescimo: Optional[float] = 0.0
    acrescimo_tipo: Optional[str] = "R$"
    
    itens: List[ItemVendaCreate]

    @model_validator(mode="after")
    def validar_formas_de_pagamento(self):
        if self.pagamentos is not None:
            formas = {
                pagamento.forma_pagamento
                for pagamento in self.pagamentos
            }

            forma_resumo = (
                FormaPagamento.MISTO
                if len(formas) > 1
                else self.pagamentos[0].forma_pagamento
            )

            # O resumo é determinado pelos pagamentos informados.
            self.forma_pagamento = forma_resumo.name

        else:
            texto = (self.forma_pagamento or "").strip().upper()

            # Aceita os nomes utilizados pelo frontend.
            aliases = {
                "CARTAO_CREDITO": "CREDITO",
                "CARTÃO CRÉDITO": "CREDITO",
                "CARTAO_DEBITO": "DEBITO",
                "CARTÃO DÉBITO": "DEBITO",
            }

            texto = aliases.get(texto, texto)

            try:
                forma = FormaPagamento[texto]
            except KeyError:
                raise ValueError("Forma de pagamento inválida.")

            if forma == FormaPagamento.MISTO:
                raise ValueError(
                    "Uma venda mista precisa informar "
                    "a lista dos pagamentos."
                )

            self.forma_pagamento = forma.name

        return self

class PagamentoVendaResponse(BaseModel):
    uuid: Optional[str] = None
    forma_pagamento: str
    valor: Decimal
    valor_recebido: Optional[Decimal] = None
    troco: Decimal

class VendaResponse(BaseModel):
    id: int
    uuid: str
    total: float
    forma_pagamento: FormaPagamento
    data_venda: datetime
    sincronizado: bool
    pagamentos: List[PagamentoVendaResponse] = Field(
        default_factory=list
    )

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
    usuario_id: int


# ==========================================
# --- SCHEMAS DE CAIXA ---
# ==========================================
class CaixaResponse(BaseModel):
    id: int
    hostname: str
    tag_nome: str
    esta_aberto: bool

    operador_atual: Optional[str] = None
    aberto_em: Optional[datetime] = None
    fechado_em: Optional[datetime] = None
    ultima_atividade_em: Optional[datetime] = None

    status_atividade: Optional[str] = None
    referencia_em: Optional[datetime] = None

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
    pagamentos: List[PagamentoVendaResponse] = Field(
        default_factory=list
    )

    class Config:
        from_attributes = True

# ==========================================
# --- CLIENTES ---
# ==========================================

class ClienteBase(BaseModel):
    nome: str = Field(..., min_length=1, max_length=150)
    cpf: Optional[str] = Field(None, max_length=14)
    telefone: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    data_nascimento: Optional[date] = None
    observacoes: Optional[str] = None
    ativo: bool = True

    @field_validator(
        "cpf",
        "telefone",
        "email",
        "data_nascimento",
        "observacoes",
        mode="before",
    )
    @classmethod
    def normalizar_campos_opcionais(cls, valor):
        if isinstance(valor, str):
            return valor.strip() or None
        return valor


class ClienteCreate(ClienteBase):
    pass


class ClienteUpdate(BaseModel):
    nome: Optional[str] = Field(None, min_length=1, max_length=150)
    cpf: Optional[str] = Field(None, max_length=14)
    telefone: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    data_nascimento: Optional[date] = None    
    observacoes: Optional[str] = None
    ativo: Optional[bool] = None

    @field_validator(
        "cpf",
        "telefone",
        "email",
        "data_nascimento",
        "observacoes",
        mode="before",
    )
    @classmethod
    def normalizar_campos_opcionais(cls, valor):
        if isinstance(valor, str):
            return valor.strip() or None
        return valor    


class ClienteResponse(ClienteBase):
    id: int
    created_at: datetime
    updated_at: datetime

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
    