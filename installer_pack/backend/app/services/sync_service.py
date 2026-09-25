import logging
from sqlalchemy.orm import joinedload
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
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
            produtos_locais = db_local.query(Produto).all()
            produtos_nuvem = db_supabase.query(Produto).all()

            # ==============================================================
            # IDENTIDADE GLOBAL DOS PRODUTOS
            #
            # O código de barras é a identidade do produto entre os bancos.
            #
            # IMPORTANTE:
            # - ID local pertence somente ao banco local.
            # - ID do Supabase pertence somente ao Supabase.
            # - Os IDs NÃO precisam ser iguais.
            # - Nunca copiamos o ID de um banco para o outro.
            # ==============================================================

            produtos_nuvem_por_codigo = {
                produto.codigo_barras: produto
                for produto in produtos_nuvem
                if produto.codigo_barras
            }

            produtos_locais_por_codigo = {
                produto.codigo_barras: produto
                for produto in produtos_locais
                if produto.codigo_barras
            }

            enviados = 0
            baixados = 0
            atualizados_nuvem = 0
            atualizados_local = 0
            sem_alteracao = 0

            # ==============================================================
            # 1. LOCAL → SUPABASE
            #
            # O produto local é localizado no Supabase pelo código de barras.
            #
            # Se não existir:
            #   - cria no Supabase;
            #   - NÃO envia o ID local;
            #   - o Supabase gera seu próprio ID.
            #
            # Se já existir:
            #   - atualiza os dados cadastrais;
            #   - NÃO altera o estoque nesta etapa.
            # ==============================================================

            for produto_local in produtos_locais:

                if not produto_local.codigo_barras:
                    logger.warning(
                        f"⚠️ [SYNC] Produto local ID {produto_local.id} "
                        f"não possui código de barras. Ignorando."
                    )
                    continue

                produto_nuvem = produtos_nuvem_por_codigo.get(
                    produto_local.codigo_barras
                )

                # ----------------------------------------------------------
                # PRODUTO NOVO → CRIA NO SUPABASE
                # ----------------------------------------------------------
                if not produto_nuvem:

                    produto_nuvem = Produto(
                        codigo_barras=produto_local.codigo_barras,
                        tipo_codigo=produto_local.tipo_codigo,
                        nome_produto=produto_local.nome_produto,
                        categoria=produto_local.categoria,
                        preco_venda=produto_local.preco_venda,
                        quantidade_estoque=produto_local.quantidade_estoque,
                        ativo=produto_local.ativo
                    )

                    # IMPORTANTE:
                    # Não informar "id".
                    # O Supabase/PostgreSQL gera o próprio ID.
                    db_supabase.add(produto_nuvem)

                    enviados += 1

                    continue

                # ----------------------------------------------------------
                # PRODUTO JÁ EXISTE → ATUALIZA DADOS CADASTRAIS
                # ----------------------------------------------------------

                produto_nuvem.tipo_codigo = produto_local.tipo_codigo
                produto_nuvem.nome_produto = produto_local.nome_produto
                produto_nuvem.categoria = produto_local.categoria
                produto_nuvem.preco_venda = produto_local.preco_venda
                produto_nuvem.ativo = produto_local.ativo

                atualizados_nuvem += 1

            # Confirma criação/alteração dos produtos no Supabase.
            db_supabase.commit()

            # ==============================================================
            # RECONSULTA O SUPABASE
            #
            # Produtos novos acabaram de receber seus IDs no Supabase.
            # Reconsultamos para trabalhar com os registros atualizados.
            # ==============================================================

            produtos_nuvem = db_supabase.query(Produto).all()

            produtos_nuvem_por_codigo = {
                produto.codigo_barras: produto
                for produto in produtos_nuvem
                if produto.codigo_barras
            }

            # ==============================================================
            # 2. SUPABASE → LOCAL
            #
            # Produtos que existem no Supabase mas ainda não existem
            # localmente são criados no banco local.
            #
            # IMPORTANTE:
            # NÃO usamos o ID do Supabase.
            #
            # O PostgreSQL local gera um novo ID local.
            # ==============================================================

            for produto_nuvem in produtos_nuvem:

                if not produto_nuvem.codigo_barras:
                    continue

                produto_local = produtos_locais_por_codigo.get(
                    produto_nuvem.codigo_barras
                )

                # ----------------------------------------------------------
                # PRODUTO NOVO NO SUPABASE → CRIA LOCALMENTE
                # ----------------------------------------------------------
                if not produto_local:

                    produto_local = Produto(
                        codigo_barras=produto_nuvem.codigo_barras,
                        tipo_codigo=produto_nuvem.tipo_codigo,
                        nome_produto=produto_nuvem.nome_produto,
                        categoria=produto_nuvem.categoria,
                        preco_venda=produto_nuvem.preco_venda,
                        quantidade_estoque=produto_nuvem.quantidade_estoque,
                        ativo=produto_nuvem.ativo
                    )

                    # IMPORTANTE:
                    # Não informar "id".
                    # O banco local gera seu próprio ID.
                    db_local.add(produto_local)

                    baixados += 1

                    continue

                # ----------------------------------------------------------
                # PRODUTO JÁ EXISTE LOCALMENTE
                #
                # Atualiza somente os dados cadastrais.
                #
                # O estoque local permanece preservado.
                # ----------------------------------------------------------

                produto_local.tipo_codigo = produto_nuvem.tipo_codigo
                produto_local.nome_produto = produto_nuvem.nome_produto
                produto_local.categoria = produto_nuvem.categoria
                produto_local.preco_venda = produto_nuvem.preco_venda
                produto_local.ativo = produto_nuvem.ativo

                atualizados_local += 1

            # Confirma produtos novos/alterações no banco local.
            db_local.commit()

            # ==============================================================
            # 3. CORRIGE A SEQUENCE LOCAL DE PRODUTOS
            #
            # Como cada banco possui seus próprios IDs, a sequence local
            # precisa acompanhar o maior ID existente SOMENTE no banco local.
            #
            # Isso garante que novos produtos criados localmente não tentem
            # reutilizar IDs já existentes.
            # ==============================================================

            db_local.execute(text("""
                SELECT setval(
                    pg_get_serial_sequence('produtos', 'id'),
                    COALESCE((SELECT MAX(id) FROM produtos), 1),
                    (SELECT COUNT(*) > 0 FROM produtos)
                )
            """))

            db_local.commit()

            logger.info(
                f"✅ [SYNC] Produtos sincronizados: "
                f"{enviados} enviado(s), "
                f"{baixados} baixado(s), "
                f"{atualizados_nuvem} atualização(ões) no Supabase, "
                f"{atualizados_local} atualização(ões) local(is), "
                f"{sem_alteracao} sem alteração. "
                f"Identidade por código de barras. "
                f"IDs locais e Supabase independentes. "
                f"Estoque local preservado."
            )

        except Exception as e:
            db_supabase.rollback()
            db_local.rollback()

            logger.error(
                f"❌ [SYNC] Falha ao sincronizar Produtos: {e}"
            )        

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
                    # Somente o próprio computador publica seu status.
                    caixa_nuvem_atual.esta_aberto = (
                        caixa_local_atual.esta_aberto
                    )
                else:
                    # Não copia o ID local. O Supabase gera seu próprio ID.
                    caixa_nuvem_atual = CaixaDispositivo(
                        hostname=caixa_local_atual.hostname,
                        tag_nome=caixa_local_atual.tag_nome,
                        esta_aberto=caixa_local_atual.esta_aberto,
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
                        caixa_local.esta_aberto = (
                            caixa_nuvem.esta_aberto
                        )
                else:
                    # O banco local gera seu próprio ID.
                    db_local.add(
                        CaixaDispositivo(
                            hostname=caixa_nuvem.hostname,
                            tag_nome=caixa_nuvem.tag_nome,
                            esta_aberto=caixa_nuvem.esta_aberto,
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