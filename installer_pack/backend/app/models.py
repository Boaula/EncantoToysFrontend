import enum
import uuid
import datetime
from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Enum, Boolean
from sqlalchemy.orm import relationship
from app.database import Base

class CargoUsuario(str, enum.Enum):
    ADMIN = "ADMIN"          # Jessica (pode fazer tudo)
    OPERADOR = "OPERADOR"    # Caixa (só pode vender e buscar)

class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    senha_hash = Column(String, nullable=False)  # Senha criptografada
    cargo = Column(Enum(CargoUsuario), default=CargoUsuario.OPERADOR, nullable=False)

class TipoCodigo(str, enum.Enum):
    FABRICA = "FABRICA"
    INTERNO = "INTERNO"


class FormaPagamento(str, enum.Enum):
    CREDITO = "CARTÃO CRÉDITO"
    DEBITO = "CARTÃO DÉBITO"
    PIX = "PIX"
    DINHEIRO = "DINHEIRO"

class Produto(Base):
    __tablename__ = "produtos"

    id = Column(Integer, primary_key=True, index=True)
    codigo_barras = Column(String, unique=True, index=True, nullable=False)
    tipo_codigo = Column(Enum(TipoCodigo), nullable=False)
    nome_produto = Column(String, nullable=False)
    categoria = Column(String, nullable=False, default="Geral")
    preco_venda = Column(Float, nullable=False)
    quantidade_estoque = Column(Integer, default=0)
    ativo = Column(Boolean, default=True, nullable=False)

class Venda(Base):
    __tablename__ = "vendas"

    id = Column(Integer, primary_key=True, index=True)
    # 🛡️ CHAVE ÚNICA MUNDIAL: Impede que o Caixa 2 sobrescreva o Caixa 1 no Supabase
    uuid = Column(String(36), unique=True, index=True, default=lambda: str(uuid.uuid4()), nullable=False)

    # casi haja acrescimos ou descontos, cada venda pode ter vários ajustes
    ajustes = relationship("VendaAjuste", backref="venda", cascade="all, delete-orphan")
    itens = relationship("ItemVenda", back_populates="venda", cascade="all, delete-orphan")

    data_venda = Column(DateTime, default=datetime.datetime.utcnow)
    total = Column(Float, nullable=False)
    forma_pagamento = Column(Enum(FormaPagamento), nullable=False) # Para o gráfico de pizza/barra de pagamento
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    caixa_id = Column(Integer, ForeignKey("caixas_dispositivos.id"), nullable=False)
    usuario = relationship("Usuario")

    # 🚩 FLAG DE SINCRONIZAÇÃO (O segredo do Offline-First)
    sincronizado = Column(Boolean, default=False, nullable=False, index=True)
    itens = relationship("ItemVenda", back_populates="venda", cascade="all, delete-orphan")

class ItemVenda(Base):
    __tablename__ = "itens_venda"

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, index=True, default=lambda: str(uuid.uuid4()), nullable=False)
    venda_id = Column(Integer, ForeignKey("vendas.id"), nullable=False)
    produto_id = Column(Integer, ForeignKey("produtos.id"), nullable=False)
    quantidade = Column(Integer, nullable=False)
    preco_estatico = Column(Float, nullable=False) 

    venda = relationship("Venda", back_populates="itens")
    produto = relationship("Produto")

# Novos Enums e Modelos
class StatusCaixa(str, enum.Enum):
    ABERTO = "ABERTO"
    FECHADO = "FECHADO"

class Caixa(Base):
    __tablename__ = "caixas"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, unique=True, nullable=False)  # Ex: "Caixa Principal", "Caixa Lateral 02"
    status = Column(Enum(StatusCaixa), default=StatusCaixa.FECHADO, nullable=False)

class CaixaDispositivo(Base):
    __tablename__ = "caixas_dispositivos"

    id = Column(Integer, primary_key=True, index=True)
    # O nome real do computador no Windows/Linux (ex: "DESKTOP-CAIXA1")
    hostname = Column(String, unique=True, index=True, nullable=False)
    # A tag amigável que a Jéssica vai definir (ex: "Caixa 01")
    tag_nome = Column(String, default="Novo Caixa", nullable=False)
    # Status se está ativo/aberto ou não
    esta_aberto = Column(Boolean, default=False)


# ==========================================
# --- EMPRESA NFC ---
# ========================================== 
class EmpresaModel(Base):
    __tablename__ = "empresa_configuracoes"

    id = Column(Integer, primary_key=True, index=True)
    cnpj = Column(String(14), nullable=False, unique=True)
    razao_social = Column(String(100), nullable=False)
    nome_fantasia = Column(String(100))
    inscricao_estadual = Column(String(20), nullable=False)
    crt = Column(Integer, default=1)
    cnae_principal = Column(String(10))
    email = Column(String(100))
    telefone = Column(String(20))
    
    logradouro = Column(String(150))
    numero = Column(String(20))
    complemento = Column(String(100))
    bairro = Column(String(100))
    municipio = Column(String(100))
    codigo_ibge = Column(String(7))
    uf = Column(String(2))
    cep = Column(String(8))
    
    ambiente = Column(Integer, default=2)
    serie_nfce = Column(Integer, default=1)
    proxima_nota_nfce = Column(Integer, default=1)
    csc_id = Column(String(10), nullable=True)
    csc_token = Column(String(100), nullable=True)    

    #certificado = relationship("CertificadoModel", back_populates="empresa", uselist=False)

class CertificadoModel(Base):
    __tablename__ = "certificados"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresa_configuracoes.id"), nullable=False)
    arquivo_path = Column(String(255), nullable=False)  # Caminho do arquivo .pfx salvo
    senha = Column(String(255), nullable=False)          # Senha do certificado
    vencimento = Column(DateTime, nullable=True)         # Data de validade

class VendaAjuste(Base):
    __tablename__ = "venda_ajustes"

    id = Column(Integer, primary_key=True, index=True)
    venda_id = Column(Integer, ForeignKey("vendas.id", ondelete="CASCADE"), nullable=False)
    tipo = Column(String(10), nullable=False)           # 'DESCONTO' ou 'ACRESCIMO'
    forma_calculo = Column(String(2), nullable=False)   # 'R$' ou '%'
    valor_informado = Column(Float, nullable=False)
    valor_aplicado = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.now)

# ==========================================
# --- LICENÇA DO SISTEMA ---
# ==========================================
class Licenca(Base):
    __tablename__ = "licencas"

    id = Column(Integer, primary_key=True, index=True)

    # Identificação desta instalação
    chave_instalacao = Column(String(64), unique=True, nullable=False, index=True)

    # Tipo da licença
    tipo = Column(String(20), nullable=False, default="DEMO")
    # DEMO / DEFINITIVA

    # Controle do período
    inicio = Column(DateTime, nullable=False)
    vencimento = Column(DateTime, nullable=True)

    # Controle de ativação
    ativa = Column(Boolean, default=True, nullable=False)

    # Informações auxiliares
    criada_em = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    ultima_verificacao = Column(DateTime, nullable=True)