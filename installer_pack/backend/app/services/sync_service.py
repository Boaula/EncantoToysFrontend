import logging
from sqlalchemy.orm import joinedload
from app.database import SessionLocal, SessionSupabase
# 🟢 1. Adicionado modelo 'VendaAjuste' no import
from app.models import (
    Usuario,
    Produto,
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
        # --- 2. SINCRONIZAR USUÁRIOS (Supabase ➔ Local) ---
        try:
            usuarios_nuvem = db_supabase.query(Usuario).all()
            for u in usuarios_nuvem:
                db_local.merge(Usuario(
                    id=u.id,
                    username=u.username,
                    senha_hash=u.senha_hash,
                    cargo=u.cargo
                ))
            db_local.commit()
            logger.info("✅ [SYNC] Usuários baixados do Supabase para o banco local.")
        except Exception as e:
            db_local.rollback()
            logger.error(f"❌ [SYNC] Falha ao sincronizar Usuários: {e}")

        # --- 3. SINCRONIZAR PRODUTOS (Supabase ➔ Local) ---
        try:
            produtos_nuvem = db_supabase.query(Produto).all()
            for p in produtos_nuvem:
                db_local.merge(Produto(
                    id=p.id,
                    codigo_barras=p.codigo_barras,
                    tipo_codigo=p.tipo_codigo,
                    nome_produto=p.nome_produto,
                    categoria=p.categoria,
                    preco_venda=p.preco_venda,
                    quantidade_estoque=p.quantidade_estoque,
                    ativo=p.ativo
                ))
            db_local.commit()
            logger.info("✅ [SYNC] Produtos baixados do Supabase para o banco local.")
        except Exception as e:
            db_local.rollback()
            logger.error(f"❌ [SYNC] Falha ao sincronizar Produtos: {e}")

        # --- 4. SINCRONIZAR CAIXAS (Supabase ➔ Local) ---
        try:
            dispositivos_nuvem = db_supabase.query(CaixaDispositivo).all()
            for d in dispositivos_nuvem:
                db_local.merge(CaixaDispositivo(
                    id=d.id,
                    hostname=d.hostname,
                    tag_nome=d.tag_nome,
                    esta_aberto=d.esta_aberto
                ))
            db_local.commit()
            logger.info("✅ [SYNC] CaixasDispositivos baixados do Supabase para o banco local.")
        except Exception as e:
            db_local.rollback()
            logger.error(f"❌ [SYNC] Falha ao sincronizar CaixasDispositivos: {e}")

        # --- 5. RECUPERAR VENDAS DO SUPABASE ➔ LOCAL ---
        try:
            vendas_nuvem = (
                db_supabase.query(Venda)
                .options(joinedload(Venda.itens))
                .all()
            )

            recuperadas = 0
            existentes = 0

            for v_nuvem in vendas_nuvem:

                # Procura a venda pelo UUID para evitar duplicação
                venda_local = (
                    db_local.query(Venda)
                    .filter(Venda.uuid == v_nuvem.uuid)
                    .first()
                )

                # Venda já existe localmente
                if venda_local:
                    existentes += 1
                    continue

                # Cria a venda local sem alterar estoque
                venda_local = Venda(
                    uuid=v_nuvem.uuid,
                    data_venda=v_nuvem.data_venda,
                    total=v_nuvem.total,
                    forma_pagamento=v_nuvem.forma_pagamento,
                    usuario_id=v_nuvem.usuario_id,
                    caixa_id=v_nuvem.caixa_id,
                    sincronizado=True
                )

                db_local.add(venda_local)
                db_local.flush()

                # Recupera os itens da venda
                for item_nuvem in v_nuvem.itens:

                    item_local = ItemVenda(
                        uuid=item_nuvem.uuid,
                        venda_id=venda_local.id,
                        produto_id=item_nuvem.produto_id,
                        quantidade=item_nuvem.quantidade,
                        preco_estatico=item_nuvem.preco_estatico
                    )

                    db_local.add(item_local)

                recuperadas += 1

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

        # --- 6. SINCRONIZAR VENDAS, ITENS E AJUSTES PENDENTES ---
        try:
            vendas_pendentes = (
                db_local.query(Venda)
                .options(joinedload(Venda.itens))
                .filter(Venda.sincronizado == False)
                .all()
            )

            if vendas_pendentes:
                logger.info(f"🔄 [SYNC] Sincronizando {len(vendas_pendentes)} venda(s) pendente(s)...")

                for v_local in vendas_pendentes:
                    try:
                        venda_existente = db_supabase.query(Venda).filter(Venda.uuid == v_local.uuid).first()

                        if not venda_existente:
                            venda_nuvem = Venda(
                                uuid=v_local.uuid,
                                data_venda=v_local.data_venda,
                                total=v_local.total,
                                forma_pagamento=v_local.forma_pagamento,
                                usuario_id=v_local.usuario_id,
                                caixa_id=v_local.caixa_id,
                                sincronizado=True
                            )

                            for item in v_local.itens:
                                item_nuvem = ItemVenda(
                                    uuid=item.uuid,
                                    produto_id=item.produto_id,
                                    quantidade=item.quantidade,
                                    preco_estatico=item.preco_estatico
                                )
                                venda_nuvem.itens.append(item_nuvem)

                            db_supabase.add(venda_nuvem)
                            db_supabase.flush()  # 🟢 Gera o ID da nova venda no Supabase para podermos vincular os ajustes

                            # 🟢 Busca se existem ajustes para esta venda no banco local
                            ajustes_locais = db_local.query(VendaAjuste).filter(VendaAjuste.venda_id == v_local.id).all()
                            
                            for aj in ajustes_locais:
                                ajuste_nuvem = VendaAjuste(
                                    venda_id=venda_nuvem.id, # ID vinculado da venda na nuvem
                                    tipo=aj.tipo,
                                    forma_calculo=aj.forma_calculo,
                                    valor_informado=aj.valor_informado,
                                    valor_aplicado=aj.valor_aplicado,
                                    created_at=aj.created_at
                                )
                                db_supabase.add(ajuste_nuvem)

                            db_supabase.commit()

                        # Marca como sincronizado localmente apenas se enviou tudo com sucesso
                        v_local.sincronizado = True
                        db_local.commit()
                        logger.info(f"✅ [SYNC] Venda {v_local.uuid} (com itens e ajustes) enviada com sucesso!")

                    except Exception as e_venda:
                        db_supabase.rollback()
                        db_local.rollback()
                        logger.error(f"❌ [SYNC] Erro ao sincronizar a venda {v_local.uuid}: {e_venda}")

        except Exception as e:
            logger.error(f"❌ [SYNC] Falha ao consultar vendas pendentes: {e}")

    finally:
        db_local.close()
        db_supabase.close()