import logging
from sqlalchemy.orm import joinedload
from datetime import datetime, timezone
from app.database import SessionLocal, SessionSupabase
import socket
# 🟢 1. Adicionado modelo 'VendaAjuste' no import
from app.models import (
    Usuario,
    Produto,
    Cliente,
    CaixaDispositivo,
    Venda,
    ItemVenda,
    VendaAjuste,
    Licenca,
    VendaPagamento,
    FormaPagamento,
)

from decimal import Decimal, ROUND_HALF_UP

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.setLevel(logging.WARNING)

# Campos cadastrais compartilhados entre os PDVs.
# ID e quantidade em estoque não entram nesta lista.
CAMPOS_CADASTRO_PRODUTO = (
    "tipo_codigo",
    "nome_produto",
    "categoria",
    "preco_venda",
    "ativo",
    "quantidade_compra",
    "valor_compra_total",
    "frete_total",
    "imposto_total",
    "outras_despesas_total",
    "custo_unitario",
    "fornecedor",
    "data_validade",
    "dados_produto_atualizados_em",
)


def _dados_cadastro_produto(produto):
    return {
        campo: getattr(produto, campo)
        for campo in CAMPOS_CADASTRO_PRODUTO
    }


def _versao_cadastro_produto(produto):
    data = produto.dados_produto_atualizados_em

    # Cadastros antigos ainda não possuem data de atualização.
    if data is None:
        return datetime.min.replace(tzinfo=timezone.utc)

    if data.tzinfo is None:
        return data.replace(tzinfo=timezone.utc)

    return data.astimezone(timezone.utc)


def _atualizar_cadastro_produto(sessao, destino, origem):
    # Só atualiza se o destino continuar com a versão que lemos.
    # Se outra edição mudar essa versão, tentaremos no próximo ciclo.
    quantidade = (
        sessao.query(Produto)
        .filter(
            Produto.id == destino.id,
            Produto.dados_produto_atualizados_em
            == destino.dados_produto_atualizados_em,
        )
        .update(
            _dados_cadastro_produto(origem),
            synchronize_session=False,
        )
    )

    return quantidade == 1

def copiar_pagamentos_venda(
    db_origem,
    venda_origem,
    db_destino,
    venda_destino,
):
    pagamentos = (
        db_origem.query(VendaPagamento)
        .filter(VendaPagamento.venda_id == venda_origem.id)
        .all()
    )

    if not pagamentos:
        if venda_origem.forma_pagamento == FormaPagamento.MISTO:
            raise ValueError(
                f"Venda {venda_origem.uuid}: "
                "venda mista sem pagamentos na origem."
            )

        # Vendas antigas podem não possuir parcelas registradas.
        return 0

    def total_em_centavos(valor):
        numero = Decimal(str(valor))
        if not numero.is_finite():
            raise ValueError("Total de venda inválido.")
        return numero.quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )

    total = total_em_centavos(venda_origem.total)

    if (
        venda_origem.uuid != venda_destino.uuid
        or total != total_em_centavos(venda_destino.total)
        or venda_origem.forma_pagamento
        != venda_destino.forma_pagamento
    ):
        raise ValueError(
            "As vendas de origem e destino possuem dados divergentes."
        )

    uuids = {p.uuid for p in pagamentos}

    if None in uuids or "" in uuids or len(uuids) != len(pagamentos):
        raise ValueError("Identificadores de pagamentos inválidos.")

    soma = Decimal("0.00")

    for pagamento in pagamentos:
        if (
            pagamento.forma_pagamento == FormaPagamento.MISTO
            or pagamento.valor <= 0
        ):
            raise ValueError("Parcela com forma ou valor inválido.")

        recebido = pagamento.valor_recebido
        troco = pagamento.troco

        if recebido is None:
            if troco != 0:
                raise ValueError("Troco sem valor recebido.")
        elif (
            pagamento.forma_pagamento != FormaPagamento.DINHEIRO
            or recebido < pagamento.valor
            or recebido - pagamento.valor != troco
        ):
            raise ValueError("Recebimento ou troco inconsistente.")

        soma += pagamento.valor

    if soma != total:
        raise ValueError(
            f"Venda {venda_origem.uuid}: "
            "pagamentos diferentes do total."
        )

    formas = {p.forma_pagamento for p in pagamentos}
    resumo = (
        FormaPagamento.MISTO
        if len(formas) > 1
        else pagamentos[0].forma_pagamento
    )

    if resumo != venda_origem.forma_pagamento:
        raise ValueError("Resumo da forma de pagamento inconsistente.")

    existentes = (
        db_destino.query(VendaPagamento)
        .filter(VendaPagamento.venda_id == venda_destino.id)
        .all()
    )

    if any(p.uuid not in uuids for p in existentes):
        raise ValueError(
            "O destino contém pagamentos diferentes dos da origem."
        )

    campos = (
        "forma_pagamento",
        "valor",
        "valor_recebido",
        "troco",
    )

    # Primeiro confere todos os registros; depois adiciona os faltantes.
    faltantes = []

    for pagamento in pagamentos:
        existente = (
            db_destino.query(VendaPagamento)
            .filter(VendaPagamento.uuid == pagamento.uuid)
            .first()
        )

        if existente is not None:
            if (
                existente.venda_id != venda_destino.id
                or any(
                    getattr(existente, campo)
                    != getattr(pagamento, campo)
                    for campo in campos
                )
            ):
                raise ValueError(
                    f"Pagamento {pagamento.uuid}: conflito no destino."
                )
        else:
            faltantes.append(pagamento)

    for pagamento in faltantes:
        db_destino.add(
            VendaPagamento(
                uuid=pagamento.uuid,
                venda_id=venda_destino.id,
                **{
                    campo: getattr(pagamento, campo)
                    for campo in campos
                },
            )
        )

    db_destino.flush()
    return len(faltantes)

def _dados_monitoramento_caixa(caixa):
    return {
        "esta_aberto": caixa.esta_aberto,
        "operador_atual": caixa.operador_atual,
        "aberto_em": caixa.aberto_em,
        "fechado_em": caixa.fechado_em,
        "ultima_atividade_em": caixa.ultima_atividade_em,
    }

def sincronizar_tudo_com_supabase():
    """Sincroniza cadastros e vendas pendentes com o Supabase de forma isolada e segura."""
    if not SessionSupabase:
        logger.warning("⚠️ [SYNC] SessionSupabase não está configurada ou indisponível.")
        return

    try:
        db_local = SessionLocal()
        db_supabase = SessionSupabase()
    except Exception as e:
        logger.error(f"❌ [SYNC] Erro ao conectar nos bancos: {e}")
        return

    # --- 1. SINCRONIZAR LICENÇA (Supabase ➔ Local) ---
    try:
        # ==========================================================================
        # O SUPABASE É A FONTE DA VERDADE DA LICENÇA
        # ==========================================================================

        # Busca a única licença oficial cadastrada no Supabase.
        licenca_nuvem = (
            db_supabase.query(Licenca)
            .order_by(Licenca.id.asc())
            .first()
        )

        # --------------------------------------------------------------------------
        # NÃO EXISTE LICENÇA NO SUPABASE
        # --------------------------------------------------------------------------
        if not licenca_nuvem:
            logger.warning(
                "⚠️ [SYNC] Nenhuma licença encontrada no Supabase."
            )

            # Remove qualquer licença que tenha ficado no banco local.
            # Isso impede que uma licença antiga continue sendo utilizada
            # quando ela não existe mais na fonte oficial.
            licencas_locais = db_local.query(Licenca).all()

            if licencas_locais:
                for licenca_local in licencas_locais:
                    db_local.delete(licenca_local)

                db_local.commit()

                logger.warning(
                    "🗑️ [SYNC] Licença(s) local(is) removida(s): "
                    "não existe licença oficial no Supabase."
                )

            else:
                logger.info(
                    "ℹ️ [SYNC] Banco local também não possui licença."
                )

        # --------------------------------------------------------------------------
        # EXISTE LICENÇA NO SUPABASE
        # --------------------------------------------------------------------------
        else:

            # Procuramos a licença local pela chave que veio do Supabase.
            licenca_local = (
                db_local.query(Licenca)
                .filter(
                    Licenca.chave_instalacao
                    == licenca_nuvem.chave_instalacao
                )
                .first()
            )

            # ----------------------------------------------------------------------
            # NÃO EXISTE LOCALMENTE → CRIA A CÓPIA DA LICENÇA DO SUPABASE
            # ----------------------------------------------------------------------
            if not licenca_local:

                # Segurança adicional:
                # se houver alguma licença local antiga com outra chave,
                # ela não deve permanecer junto da licença oficial.
                licencas_locais = db_local.query(Licenca).all()

                for licenca_antiga in licencas_locais:
                    db_local.delete(licenca_antiga)

                licenca_local = Licenca(
                    chave_instalacao=licenca_nuvem.chave_instalacao,
                    tipo=licenca_nuvem.tipo,
                    inicio=licenca_nuvem.inicio,
                    vencimento=licenca_nuvem.vencimento,
                    ativa=licenca_nuvem.ativa,
                    criada_em=licenca_nuvem.criada_em,
                    ultima_verificacao=licenca_nuvem.ultima_verificacao,
                )

                db_local.add(licenca_local)
                db_local.commit()

                logger.info(
                    f"✅ [SYNC] Licença criada no banco local a partir do Supabase: "
                    f"tipo={licenca_local.tipo}"
                )

            # ----------------------------------------------------------------------
            # JÁ EXISTE LOCALMENTE → ATUALIZA COM A FONTE OFICIAL
            # ----------------------------------------------------------------------
            else:

                licenca_local.tipo = licenca_nuvem.tipo
                licenca_local.inicio = licenca_nuvem.inicio
                licenca_local.vencimento = licenca_nuvem.vencimento
                licenca_local.ativa = licenca_nuvem.ativa
                licenca_local.criada_em = licenca_nuvem.criada_em
                licenca_local.ultima_verificacao = (
                    licenca_nuvem.ultima_verificacao
                )

                db_local.commit()

                logger.info(
                    f"✅ [SYNC] Licença criada no banco local a partir do Supabase: "
                    f"tipo={licenca_local.tipo}"
                )

    except Exception as e:
        db_local.rollback()
        logger.error(
            f"❌ [SYNC] Falha ao sincronizar Licença: {e}"
        )

    try:
        # --- 2. SINCRONIZAR USUÁRIOS (Local ↔ Supabase) ---
        try:
            usuarios_locais = db_local.query(Usuario).all()
            usuarios_nuvem = db_supabase.query(Usuario).all()

            # ==============================================================
            # ÍNDICES PELO USERNAME
            # ==============================================================
            # O username é UNIQUE e será usado como identidade global
            # do operador entre os bancos.
            usuarios_nuvem_por_username = {
                usuario.username.lower(): usuario
                for usuario in usuarios_nuvem
            }

            usuarios_locais_por_username = {
                usuario.username.lower(): usuario
                for usuario in usuarios_locais
            }

            enviados = 0
            baixados = 0
            atualizados = 0

            # ==============================================================
            # LOCAL → SUPABASE
            # ==============================================================
            for usuario_local in usuarios_locais:

                username = usuario_local.username.lower()

                usuario_nuvem = usuarios_nuvem_por_username.get(username)

                # ----------------------------------------------------------
                # USUÁRIO JÁ EXISTE NO SUPABASE
                # ----------------------------------------------------------
                if usuario_nuvem:

                    # Atualiza somente os dados do usuário.
                    # O ID do Supabase é preservado.
                    usuario_nuvem.senha_hash = usuario_local.senha_hash
                    usuario_nuvem.cargo = usuario_local.cargo

                    continue

                # ----------------------------------------------------------
                # USUÁRIO NOVO NO PDV
                # ----------------------------------------------------------
                #
                # NÃO enviamos o ID local.
                #
                # O PostgreSQL/Supabase irá gerar um novo ID automaticamente.
                #
                novo_usuario_nuvem = Usuario(
                    username=username,
                    senha_hash=usuario_local.senha_hash,
                    cargo=usuario_local.cargo
                )

                db_supabase.add(novo_usuario_nuvem)
                enviados += 1

            # Confirma os novos usuários no Supabase.
            db_supabase.commit()

            # ==============================================================
            # SUPABASE → LOCAL
            # ==============================================================
            #
            # Reconsulta após o commit para incluir usuários que acabaram
            # de ser enviados por este próprio PDV.
            #
            usuarios_nuvem = db_supabase.query(Usuario).all()

            # Atualiza o índice local novamente.
            usuarios_locais_por_username = {
                usuario.username.lower(): usuario
                for usuario in db_local.query(Usuario).all()
            }

            for usuario_nuvem in usuarios_nuvem:

                username = usuario_nuvem.username.lower()

                usuario_local = usuarios_locais_por_username.get(username)

                # ----------------------------------------------------------
                # USUÁRIO JÁ EXISTE LOCALMENTE
                # ----------------------------------------------------------
                if usuario_local:

                    # IMPORTANTE:
                    # Mantemos o ID LOCAL existente.
                    #
                    # Isso preserva as vendas que já apontam para esse ID.
                    #
                    usuario_local.senha_hash = usuario_nuvem.senha_hash
                    usuario_local.cargo = usuario_nuvem.cargo

                    atualizados += 1

                    continue

                # ----------------------------------------------------------
                # USUÁRIO NOVO VINDO DO SUPABASE
                # ----------------------------------------------------------
                #
                # Aqui podemos usar o ID do Supabase porque este usuário
                # ainda não possui registros locais.
                #
                novo_usuario_local = Usuario(
                    id=usuario_nuvem.id,
                    username=username,
                    senha_hash=usuario_nuvem.senha_hash,
                    cargo=usuario_nuvem.cargo
                )

                db_local.add(novo_usuario_local)
                baixados += 1

            db_local.commit()

            # ==============================================================
            # CORRIGE A SEQUENCE LOCAL
            # ==============================================================
            from sqlalchemy import text

            db_local.execute(text("""
                SELECT setval(
                    pg_get_serial_sequence('usuarios', 'id'),
                    COALESCE((SELECT MAX(id) FROM usuarios), 1),
                    (SELECT COUNT(*) > 0 FROM usuarios)
                )
            """))

            db_local.commit()

            logger.info(
                f"✅ [SYNC] Usuários sincronizados: "
                f"{enviados} enviado(s), "
                f"{baixados} baixado(s), "
                f"{atualizados} atualizado(s). "
                f"Sequence local ajustada."
            )

        except Exception as e:
            db_supabase.rollback()
            db_local.rollback()

            logger.error(
                f"❌ [SYNC] Falha ao sincronizar Usuários: {e}"
            )


        # --- 3. SINCRONIZAR PRODUTOS (Local ↔ Supabase) ---
        try:
            locais = {
                produto.codigo_barras: produto
                for produto in db_local.query(Produto).all()
                if produto.codigo_barras
            }
            nuvem = {
                produto.codigo_barras: produto
                for produto in db_supabase.query(Produto).all()
                if produto.codigo_barras
            }

            resumo = {
                "enviados": 0,
                "baixados": 0,
                "atualizados_nuvem": 0,
                "atualizados_local": 0,
                "sem_alteracao": 0,
                "conflitos": 0,
                "concorrentes": 0,
            }

            for codigo in sorted(set(locais) | set(nuvem)):
                produto_local = locais.get(codigo)
                produto_nuvem = nuvem.get(codigo)

                # Produto ainda não existe na nuvem.
                # O banco de destino gera seu próprio ID.
                if produto_nuvem is None:
                    db_supabase.add(
                        Produto(
                            codigo_barras=codigo,
                            quantidade_estoque=produto_local.quantidade_estoque,
                            **_dados_cadastro_produto(produto_local),
                        )
                    )
                    resumo["enviados"] += 1
                    continue

                # Produto ainda não existe localmente.
                if produto_local is None:
                    db_local.add(
                        Produto(
                            codigo_barras=codigo,
                            quantidade_estoque=produto_nuvem.quantidade_estoque,
                            **_dados_cadastro_produto(produto_nuvem),
                        )
                    )
                    resumo["baixados"] += 1
                    continue

                versao_local = _versao_cadastro_produto(produto_local)
                versao_nuvem = _versao_cadastro_produto(produto_nuvem)

                if versao_local > versao_nuvem:
                    atualizado = _atualizar_cadastro_produto(
                        db_supabase,
                        produto_nuvem,
                        produto_local,
                    )
                    if atualizado:
                        resumo["atualizados_nuvem"] += 1
                    else:
                        resumo["concorrentes"] += 1

                elif versao_nuvem > versao_local:
                    atualizado = _atualizar_cadastro_produto(
                        db_local,
                        produto_local,
                        produto_nuvem,
                    )
                    if atualizado:
                        resumo["atualizados_local"] += 1
                    else:
                        resumo["concorrentes"] += 1

                else:
                    # Datas iguais com dados diferentes não permitem
                    # determinar qual cadastro é o mais recente.
                    iguais = all(
                        getattr(produto_local, campo)
                        == getattr(produto_nuvem, campo)
                        for campo in CAMPOS_CADASTRO_PRODUTO
                        if campo != "dados_produto_atualizados_em"
                    )

                    if iguais:
                        resumo["sem_alteracao"] += 1
                    else:
                        resumo["conflitos"] += 1
                        logger.warning(
                            "[SYNC] Produto %s: cadastros diferentes com "
                            "a mesma data de atualização. Nenhum foi sobrescrito.",
                            codigo,
                        )

            db_supabase.commit()
            db_local.commit()

            logger.info(
                "[SYNC] Produtos: %s enviado(s), %s baixado(s), "
                "%s atualizado(s) na nuvem, %s atualizado(s) localmente, "
                "%s sem alteração, %s conflito(s), "
                "%s alteração(ões) concorrente(s) para reavaliar.",
                resumo["enviados"],
                resumo["baixados"],
                resumo["atualizados_nuvem"],
                resumo["atualizados_local"],
                resumo["sem_alteracao"],
                resumo["conflitos"],
                resumo["concorrentes"],
            )

        except Exception:
            db_supabase.rollback()
            db_local.rollback()
            logger.exception("[SYNC] Falha ao sincronizar produtos.")

            
        # --- 4. SINCRONIZAR CAIXAS (Local atual ↔ Supabase ↔ Local) ---
        try:
            hostname_atual = socket.gethostname()

            # ==============================================================
            # 1. PUBLICA O ESTADO DESTE COMPUTADOR NO SUPABASE
            # ==============================================================
            caixa_local_atual = (
                db_local.query(CaixaDispositivo)
                .filter(CaixaDispositivo.hostname == hostname_atual)
                .first()
            )

            if caixa_local_atual:
                caixa_nuvem_atual = (
                    db_supabase.query(CaixaDispositivo)
                    .filter(CaixaDispositivo.hostname == hostname_atual)
                    .first()
                )

                if caixa_nuvem_atual:
                    # Somente este computador publica sua operação.
                    for campo, valor in _dados_monitoramento_caixa(
                        caixa_local_atual
                    ).items():
                        setattr(caixa_nuvem_atual, campo, valor)
                else:
                    # Não copia o ID local. O Supabase gera seu próprio ID.
                    caixa_nuvem_atual = CaixaDispositivo(
                        hostname=caixa_local_atual.hostname,
                        tag_nome=caixa_local_atual.tag_nome,
                        **_dados_monitoramento_caixa(caixa_local_atual),
                    )
                    db_supabase.add(caixa_nuvem_atual)

                db_supabase.commit()

            # ==============================================================
            # 2. BAIXA TODOS OS CAIXAS USANDO HOSTNAME COMO IDENTIDADE
            # ==============================================================
            dispositivos_nuvem = (
                db_supabase.query(CaixaDispositivo).all()
            )

            for caixa_nuvem in dispositivos_nuvem:
                caixa_local = (
                    db_local.query(CaixaDispositivo)
                    .filter(
                        CaixaDispositivo.hostname
                        == caixa_nuvem.hostname
                    )
                    .first()
                )

                if caixa_local:
                    # A tag administrada no Supabase é distribuída aos PDVs.
                    caixa_local.tag_nome = caixa_nuvem.tag_nome

                    # O computador atual preserva seu próprio estado.
                    if caixa_nuvem.hostname != hostname_atual:
                        for campo, valor in _dados_monitoramento_caixa(
                            caixa_nuvem
                        ).items():
                            setattr(caixa_local, campo, valor)
                else:
                    # O banco local gera seu próprio ID.
                    db_local.add(
                        CaixaDispositivo(
                            hostname=caixa_nuvem.hostname,
                            tag_nome=caixa_nuvem.tag_nome,
                            **_dados_monitoramento_caixa(caixa_nuvem),
                        )
                    )

            db_local.commit()

            logger.info(
                "✅ [SYNC] Caixas sincronizados pelo hostname. "
                f"Computador atual: {hostname_atual}"
            )

        except Exception as e:
            db_supabase.rollback()
            db_local.rollback()
            logger.error(
                f"❌ [SYNC] Falha ao sincronizar caixas: {e}"
            )

        # --- 5. SINCRONIZAR CLIENTES (Local ↔ Supabase) ---
        try:
            clientes_locais = db_local.query(Cliente).all()
            clientes_nuvem = db_supabase.query(Cliente).all()

            # Índices para localizar rapidamente os clientes
            clientes_local_por_id = {
                cliente.id: cliente
                for cliente in clientes_locais
            }

            clientes_nuvem_por_id = {
                cliente.id: cliente
                for cliente in clientes_nuvem
            }

            clientes_local_por_cpf = {
                cliente.cpf: cliente
                for cliente in clientes_locais
                if cliente.cpf
            }

            clientes_nuvem_por_cpf = {
                cliente.cpf: cliente
                for cliente in clientes_nuvem
                if cliente.cpf
            }

            enviados = 0
            baixados = 0
            atualizados_local = 0
            atualizados_nuvem = 0
            sem_alteracao = 0

            # ==============================================================
            # 1. LOCAL → SUPABASE
            # ==============================================================
            for cliente_local in clientes_locais:

                cliente_nuvem = clientes_nuvem_por_id.get(cliente_local.id)

                # Se não encontrou pelo ID, tenta pelo CPF
                if not cliente_nuvem and cliente_local.cpf:
                    cliente_nuvem = clientes_nuvem_por_cpf.get(
                        cliente_local.cpf
                    )

                # ----------------------------------------------------------
                # CLIENTE NÃO EXISTE NO SUPABASE
                # ----------------------------------------------------------
                if not cliente_nuvem:

                    cliente_nuvem = Cliente(
                        id=cliente_local.id,
                        nome=cliente_local.nome,
                        cpf=cliente_local.cpf,
                        telefone=cliente_local.telefone,
                        email=cliente_local.email,
                        data_nascimento=cliente_local.data_nascimento,
                        observacoes=cliente_local.observacoes,
                        ativo=cliente_local.ativo,
                        created_at=cliente_local.created_at,
                        updated_at=cliente_local.updated_at
                    )

                    db_supabase.add(cliente_nuvem)

                    enviados += 1
                    continue

                # ----------------------------------------------------------
                # CLIENTE EXISTE NOS DOIS → COMPARA updated_at
                # ----------------------------------------------------------

                if cliente_local.updated_at > cliente_nuvem.updated_at:

                    cliente_nuvem.nome = cliente_local.nome
                    cliente_nuvem.cpf = cliente_local.cpf
                    cliente_nuvem.telefone = cliente_local.telefone
                    cliente_nuvem.email = cliente_local.email
                    cliente_nuvem.data_nascimento = cliente_local.data_nascimento
                    cliente_nuvem.observacoes = cliente_local.observacoes
                    cliente_nuvem.ativo = cliente_local.ativo
                    cliente_nuvem.updated_at = cliente_local.updated_at

                    atualizados_nuvem += 1

                elif cliente_nuvem.updated_at > cliente_local.updated_at:

                    cliente_local.nome = cliente_nuvem.nome
                    cliente_local.cpf = cliente_nuvem.cpf
                    cliente_local.telefone = cliente_nuvem.telefone
                    cliente_local.email = cliente_nuvem.email
                    cliente_local.data_nascimento = cliente_nuvem.data_nascimento
                    cliente_local.observacoes = cliente_nuvem.observacoes
                    cliente_local.ativo = cliente_nuvem.ativo
                    cliente_local.updated_at = cliente_nuvem.updated_at

                    atualizados_local += 1

                else:
                    sem_alteracao += 1

            # ==============================================================
            # 2. SUPABASE → LOCAL
            #
            # Procura clientes que existem na nuvem mas ainda não existem
            # localmente.
            # ==============================================================
            for cliente_nuvem in clientes_nuvem:

                cliente_local = clientes_local_por_id.get(cliente_nuvem.id)

                # Se não encontrou pelo ID, tenta pelo CPF
                if not cliente_local and cliente_nuvem.cpf:
                    cliente_local = clientes_local_por_cpf.get(
                        cliente_nuvem.cpf
                    )

                # ----------------------------------------------------------
                # CLIENTE EXISTE NO SUPABASE, MAS NÃO NO LOCAL
                # ----------------------------------------------------------
                if not cliente_local:

                    cliente_local = Cliente(
                        id=cliente_nuvem.id,
                        nome=cliente_nuvem.nome,
                        cpf=cliente_nuvem.cpf,
                        telefone=cliente_nuvem.telefone,
                        email=cliente_nuvem.email,
                        data_nascimento=cliente_nuvem.data_nascimento,
                        observacoes=cliente_nuvem.observacoes,
                        ativo=cliente_nuvem.ativo,
                        created_at=cliente_nuvem.created_at,
                        updated_at=cliente_nuvem.updated_at
                    )

                    db_local.add(cliente_local)

                    baixados += 1

            # ==============================================================
            # 3. CONFIRMA AS ALTERAÇÕES
            # ==============================================================
            db_supabase.commit()
            db_local.commit()

            logger.info(
                f"✅ [SYNC] Clientes sincronizados: "
                f"{enviados} enviado(s), "
                f"{baixados} baixado(s), "
                f"{atualizados_nuvem} atualização(ões) para Supabase, "
                f"{atualizados_local} atualização(ões) local(is), "
                f"{sem_alteracao} sem alteração."
            )

        except Exception as e:
            db_supabase.rollback()
            db_local.rollback()

            logger.error(
                f"❌ [SYNC] Falha ao sincronizar Clientes: {e}"
            )

        # --- 6. RECUPERAR VENDAS DO SUPABASE ➔ LOCAL ---
        try:
            vendas_nuvem = (
                db_supabase.query(Venda)
                .options(joinedload(Venda.itens))
                .all()
            )

            recuperadas = 0
            existentes = 0

            for v_nuvem in vendas_nuvem:

                # ----------------------------------------------------------
                # PROCURA A VENDA PELO UUID PARA EVITAR DUPLICAÇÃO
                # ----------------------------------------------------------
                venda_local = (
                    db_local.query(Venda)
                    .filter(Venda.uuid == v_nuvem.uuid)
                    .first()
                )

                if venda_local:
                    copiar_pagamentos_venda(
                        db_supabase,
                        v_nuvem,
                        db_local,
                        venda_local,
                    )
                    existentes += 1
                    continue

                # ----------------------------------------------------------
                # RESOLVE O USUÁRIO SUPABASE → LOCAL PELO USERNAME
                # ----------------------------------------------------------
                usuario_nuvem = (
                    db_supabase.query(Usuario)
                    .filter(Usuario.id == v_nuvem.usuario_id)
                    .first()
                )

                if not usuario_nuvem:
                    logger.error(
                        f"❌ [SYNC] Usuário ID {v_nuvem.usuario_id} "
                        f"não encontrado no Supabase para a venda "
                        f"{v_nuvem.uuid}."
                    )
                    continue

                usuario_local = (
                    db_local.query(Usuario)
                    .filter(
                        Usuario.username ==
                        usuario_nuvem.username.lower()
                    )
                    .first()
                )

                if not usuario_local:
                    logger.error(
                        f"❌ [SYNC] Usuário '{usuario_nuvem.username}' "
                        f"não encontrado no banco local para a venda "
                        f"{v_nuvem.uuid}."
                    )
                    continue

                # ----------------------------------------------------------
                # CRIA A VENDA LOCAL
                # ----------------------------------------------------------
                venda_local = Venda(
                    uuid=v_nuvem.uuid,
                    data_venda=v_nuvem.data_venda,
                    total=v_nuvem.total,
                    forma_pagamento=v_nuvem.forma_pagamento,
                    usuario_id=usuario_local.id,
                    caixa_id=v_nuvem.caixa_id,
                    sincronizado=True
                )

                db_local.add(venda_local)
                db_local.flush()

                # ----------------------------------------------------------
                # RECUPERA OS ITENS DA VENDA
                #
                # O produto é resolvido pelo código de barras:
                #
                # Supabase produto_id
                #        ↓
                # Produto Supabase
                #        ↓
                # código de barras
                #        ↓
                # Produto Local
                #        ↓
                # produto_id local
                #
                # Os IDs dos dois bancos NÃO precisam ser iguais.
                # ----------------------------------------------------------

                itens_recuperados = True

                for item_nuvem in v_nuvem.itens:

                    produto_nuvem = (
                        db_supabase.query(Produto)
                        .filter(Produto.id == item_nuvem.produto_id)
                        .first()
                    )

                    if not produto_nuvem:
                        logger.error(
                            f"❌ [SYNC] Produto Supabase ID "
                            f"{item_nuvem.produto_id} não encontrado "
                            f"para o item {item_nuvem.uuid} "
                            f"da venda {v_nuvem.uuid}."
                        )
                        itens_recuperados = False
                        break

                    produto_local = (
                        db_local.query(Produto)
                        .filter(
                            Produto.codigo_barras ==
                            produto_nuvem.codigo_barras
                        )
                        .first()
                    )

                    if not produto_local:
                        logger.error(
                            f"❌ [SYNC] Produto com código de barras "
                            f"'{produto_nuvem.codigo_barras}' não encontrado "
                            f"no banco local para a venda {v_nuvem.uuid}."
                        )
                        itens_recuperados = False
                        break

                    item_local = ItemVenda(
                        uuid=item_nuvem.uuid,
                        venda_id=venda_local.id,
                        produto_id=produto_local.id,
                        quantidade=item_nuvem.quantidade,
                        preco_estatico=item_nuvem.preco_estatico
                    )

                    db_local.add(item_local)

                # ----------------------------------------------------------
                # SOMENTE CONSIDERA A VENDA RECUPERADA SE TODOS OS ITENS
                # PUDERAM SER RESOLVIDOS CORRETAMENTE.
                # ----------------------------------------------------------
                if itens_recuperados:
                    copiar_pagamentos_venda(
                        db_supabase,
                        v_nuvem,
                        db_local,
                        venda_local,
                    )
                    recuperadas += 1
                else:
                    db_local.rollback()
                    continue

            db_local.commit()

            logger.info(
                f"✅ [SYNC] Recuperação de vendas concluída: "
                f"{recuperadas} venda(s) recuperada(s), "
                f"{existentes} já existente(s) localmente."
            )

        except Exception as e:
            db_local.rollback()
            logger.error(
                f"❌ [SYNC] Falha ao recuperar Vendas do Supabase: {e}"
            )

        # --- 7. SINCRONIZAR VENDAS, ITENS E AJUSTES PENDENTES ---
        try:
            vendas_pendentes = (
                db_local.query(Venda)
                .options(joinedload(Venda.itens))
                .filter(Venda.sincronizado == False)
                .all()
            )

            if vendas_pendentes:
                logger.info(
                    f"🔄 [SYNC] Sincronizando "
                    f"{len(vendas_pendentes)} venda(s) pendente(s)..."
                )

                for v_local in vendas_pendentes:
                    try:
                        venda_existente = (
                            db_supabase.query(Venda)
                            .filter(Venda.uuid == v_local.uuid)
                            .first()
                        )

                        if not venda_existente:

                            # --------------------------------------------------
                            # RESOLVE O USUÁRIO LOCAL → SUPABASE PELO USERNAME
                            # --------------------------------------------------
                            usuario_local = (
                                db_local.query(Usuario)
                                .filter(Usuario.id == v_local.usuario_id)
                                .first()
                            )

                            if not usuario_local:
                                raise Exception(
                                    f"Usuário local ID {v_local.usuario_id} "
                                    f"não encontrado para a venda {v_local.uuid}."
                                )

                            usuario_nuvem = (
                                db_supabase.query(Usuario)
                                .filter(
                                    Usuario.username ==
                                    usuario_local.username.lower()
                                )
                                .first()
                            )

                            if not usuario_nuvem:
                                raise Exception(
                                    f"Usuário '{usuario_local.username}' "
                                    f"não encontrado no Supabase para a venda "
                                    f"{v_local.uuid}."
                                )

                            # --------------------------------------------------
                            # RESOLVE OS PRODUTOS LOCAL → SUPABASE PELO BARCODE
                            # --------------------------------------------------
                            produtos_itens_nuvem = []

                            for item in v_local.itens:

                                produto_local = (
                                    db_local.query(Produto)
                                    .filter(Produto.id == item.produto_id)
                                    .first()
                                )

                                if not produto_local:
                                    raise Exception(
                                        f"Produto local ID {item.produto_id} "
                                        f"não encontrado para o item "
                                        f"{item.uuid} da venda {v_local.uuid}."
                                    )

                                produto_nuvem = (
                                    db_supabase.query(Produto)
                                    .filter(
                                        Produto.codigo_barras ==
                                        produto_local.codigo_barras
                                    )
                                    .first()
                                )

                                if not produto_nuvem:
                                    raise Exception(
                                        f"Produto com código de barras "
                                        f"'{produto_local.codigo_barras}' "
                                        f"não encontrado no Supabase para o "
                                        f"item {item.uuid} da venda "
                                        f"{v_local.uuid}."
                                    )

                                produtos_itens_nuvem.append(
                                    (item, produto_local, produto_nuvem)
                                )

                            # --------------------------------------------------
                            # CRIA A VENDA NO SUPABASE
                            # --------------------------------------------------
                            venda_nuvem = Venda(
                                uuid=v_local.uuid,
                                data_venda=v_local.data_venda,
                                total=v_local.total,
                                forma_pagamento=v_local.forma_pagamento,
                                usuario_id=usuario_nuvem.id,
                                caixa_id=v_local.caixa_id,
                                sincronizado=True
                            )

                            # --------------------------------------------------
                            # CRIA OS ITENS USANDO O ID DO PRODUTO DO SUPABASE
                            # --------------------------------------------------
                            for item, produto_local, produto_nuvem in produtos_itens_nuvem:

                                item_nuvem = ItemVenda(
                                    uuid=item.uuid,
                                    produto_id=produto_nuvem.id,
                                    quantidade=item.quantidade,
                                    preco_estatico=item.preco_estatico
                                )

                                venda_nuvem.itens.append(item_nuvem)

                            db_supabase.add(venda_nuvem)

                            db_supabase.flush()

                            # --------------------------------------------------
                            # BUSCA AJUSTES DA VENDA LOCAL
                            # --------------------------------------------------
                            ajustes_locais = (
                                db_local.query(VendaAjuste)
                                .filter(
                                    VendaAjuste.venda_id == v_local.id
                                )
                                .all()
                            )

                            for aj in ajustes_locais:

                                ajuste_nuvem = VendaAjuste(
                                    venda_id=venda_nuvem.id,
                                    tipo=aj.tipo,
                                    forma_calculo=aj.forma_calculo,
                                    valor_informado=aj.valor_informado,
                                    valor_aplicado=aj.valor_aplicado,
                                    created_at=aj.created_at
                                )

                                db_supabase.add(ajuste_nuvem)

                        destino = (
                            venda_existente
                            if venda_existente is not None
                            else venda_nuvem
                        )

                        copiar_pagamentos_venda(
                            db_local,
                            v_local,
                            db_supabase,
                            destino,
                        )

                        db_supabase.commit()

                        # ------------------------------------------------------
                        # ATUALIZA O ESTOQUE NO SUPABASE PELO CÓDIGO DE BARRAS
                        # ------------------------------------------------------
                        for item in v_local.itens:

                            produto_local = (
                                db_local.query(Produto)
                                .filter(Produto.id == item.produto_id)
                                .first()
                            )

                            if not produto_local:
                                raise Exception(
                                    f"Produto local ID {item.produto_id} "
                                    f"não encontrado ao atualizar estoque "
                                    f"da venda {v_local.uuid}."
                                )

                            produto_nuvem = (
                                db_supabase.query(Produto)
                                .filter(
                                    Produto.codigo_barras ==
                                    produto_local.codigo_barras
                                )
                                .first()
                            )

                            if not produto_nuvem:
                                raise Exception(
                                    f"Produto com código de barras "
                                    f"'{produto_local.codigo_barras}' "
                                    f"não encontrado no Supabase ao atualizar "
                                    f"o estoque da venda {v_local.uuid}."
                                )

                            produto_nuvem.quantidade_estoque = (
                                produto_local.quantidade_estoque
                            )

                        db_supabase.commit()

                        logger.info(
                            f"📦 [SYNC] Estoque atualizado no Supabase "
                            f"para a venda {v_local.uuid}."
                        )

                        # ------------------------------------------------------
                        # MARCA A VENDA COMO SINCRONIZADA NO LOCAL
                        # ------------------------------------------------------
                        v_local.sincronizado = True
                        db_local.commit()

                        logger.info(
                            f"✅ [SYNC] Venda {v_local.uuid} "
                            f"(com itens e ajustes) enviada com sucesso!"
                        )

                    except Exception as e_venda:
                        db_supabase.rollback()
                        db_local.rollback()

                        logger.error(
                            f"❌ [SYNC] Erro ao sincronizar a venda "
                            f"{v_local.uuid}: {e_venda}"
                        )

        except Exception as e:
            logger.error(
                f"❌ [SYNC] Falha ao consultar vendas pendentes: {e}"
            )
    finally:
        db_local.close()
        db_supabase.close()