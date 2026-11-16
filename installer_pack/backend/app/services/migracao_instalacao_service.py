from sqlalchemy import inspect, text

from app import models
from app.database import Base


# Estruturas compartilhadas com o Supabase.
TABELAS_NUVEM = {
    "usuarios",
    "produtos",
    "clientes",
    "caixas_dispositivos",
    "vendas",
    "itens_venda",
    "venda_ajustes",
    "licencas",
    "venda_pagamentos",
}


# Somente estas colunas podem ser acrescentadas a tabelas existentes
# nesta versão da migração.
COLUNAS_NOVAS = {
    "produtos": {
        "quantidade_compra":
            "INTEGER CHECK (quantidade_compra > 0)",
        "valor_compra_total":
            "NUMERIC(14,2) CHECK (valor_compra_total >= 0)",
        "frete_total":
            "NUMERIC(14,2) CHECK (frete_total >= 0)",
        "imposto_total":
            "NUMERIC(14,2) CHECK (imposto_total >= 0)",
        "outras_despesas_total":
            "NUMERIC(14,2) CHECK (outras_despesas_total >= 0)",
        "custo_unitario":
            "NUMERIC(14,4)",
        "fornecedor":
            "VARCHAR(150)",
        "data_validade":
            "DATE",
        "dados_produto_atualizados_em":
            "TIMESTAMP WITH TIME ZONE",
    },
    "caixas_dispositivos": {
        "operador_atual":
            "VARCHAR(150)",
        "aberto_em":
            "TIMESTAMP WITH TIME ZONE",
        "fechado_em":
            "TIMESTAMP WITH TIME ZONE",
        "ultima_atividade_em":
            "TIMESTAMP WITH TIME ZONE",
    },
}


def _tipo_normalizado(tipo, dialect):
    return "".join(
        tipo.compile(dialect=dialect).upper().split()
    )


def _validar_estrutura(conexao, tabelas, permitir_novos):
    inspetor = inspect(conexao)
    existentes = set(
        inspetor.get_table_names(schema="public")
    )

    for tabela in tabelas:
        if tabela.name not in existentes:
            if permitir_novos:
                continue

            raise RuntimeError(
                f"Tabela ausente após migração: {tabela.name}"
            )

        colunas = {
            coluna["name"]: coluna
            for coluna in inspetor.get_columns(
                tabela.name,
                schema="public",
            )
        }

        faltando = set(tabela.columns.keys()) - set(colunas)
        previstas = set(COLUNAS_NOVAS.get(tabela.name, {}))

        nao_previstas = (
            faltando - previstas
            if permitir_novos
            else faltando
        )

        if nao_previstas:
            raise RuntimeError(
                f"Estrutura antiga exige revisão em {tabela.name}: "
                + ", ".join(sorted(nao_previstas))
            )

        for nome in previstas & set(colunas):
            atual = _tipo_normalizado(
                colunas[nome]["type"],
                conexao.dialect,
            )

            esperado = _tipo_normalizado(
                tabela.columns[nome].type,
                conexao.dialect,
            )

            if atual != esperado:
                raise RuntimeError(
                    f"Tipo incompatível em {tabela.name}.{nome}: "
                    f"{atual}; esperado {esperado}."
                )


def migrar_estrutura(engine, destino):
    if destino not in ("local", "nuvem"):
        raise ValueError("Destino deve ser local ou nuvem.")

    if engine.dialect.name != "postgresql":
        raise ValueError("Esta migração exige PostgreSQL.")

    tabelas = [
        tabela
        for tabela in Base.metadata.sorted_tables
        if destino == "local" or tabela.name in TABELAS_NUVEM
    ]

    # Primeiro: conferir a estrutura antes de aplicar alterações.
    # A inclusão do valor no enum é confirmada separadamente,
    # antes de qualquer uso desse valor.
    with engine.begin() as conexao:
        conexao.execute(text("SET LOCAL search_path TO public"))
        conexao.execute(text("SET LOCAL lock_timeout = '5s'"))
        conexao.execute(text("SET LOCAL statement_timeout = '60s'"))

        _validar_estrutura(
            conexao,
            tabelas,
            permitir_novos=True,
        )

        enums = {
            item["name"]: item
            for item in inspect(conexao).get_enums(schema="public")
        }

        pagamento = enums.get("formapagamento")

        if pagamento is not None:
            existentes = set(pagamento["labels"])
            obrigatorios = {"CREDITO", "DEBITO", "PIX", "DINHEIRO"}
            permitidos = obrigatorios | {"MISTO"}

            if (
                not obrigatorios.issubset(existentes)
                or existentes - permitidos
            ):
                raise RuntimeError(
                    "Enum formapagamento diferente do esperado. "
                    "Migração interrompida para revisão."
                )

            conexao.execute(text(
                "ALTER TYPE public.formapagamento "
                "ADD VALUE IF NOT EXISTS 'MISTO'"
            ))

    # Segundo: criação de tabelas ausentes e inclusão de colunas.
    with engine.begin() as conexao:
        conexao.execute(text("SET LOCAL search_path TO public"))
        conexao.execute(text("SET LOCAL lock_timeout = '5s'"))
        conexao.execute(text("SET LOCAL statement_timeout = '60s'"))

        tabelas_anteriores = set(
            inspect(conexao).get_table_names(schema="public")
        )

        Base.metadata.create_all(
            bind=conexao,
            tables=tabelas,
            checkfirst=True,
        )

        if destino == "nuvem":
            for tabela in tabelas:
                if tabela.name not in tabelas_anteriores:
                    conexao.execute(text(
                        f'ALTER TABLE public."{tabela.name}" '
                        "ENABLE ROW LEVEL SECURITY"
                    ))        

        for tabela in tabelas:
            colunas = {
                coluna["name"]
                for coluna in inspect(conexao).get_columns(
                    tabela.name,
                    schema="public",
                )
            }

            for nome, definicao in COLUNAS_NOVAS.get(
                tabela.name, {}
            ).items():
                if nome not in colunas:
                    conexao.execute(text(
                        f'ALTER TABLE public."{tabela.name}" '
                        f'ADD COLUMN "{nome}" {definicao}'
                    ))

        _validar_estrutura(
            conexao,
            tabelas,
            permitir_novos=False,
        )

        regras_esperadas = {
            "ck_venda_pagamentos_valor_positivo",
            "ck_venda_pagamentos_recebido",
            "ck_venda_pagamentos_troco",
            "ck_venda_pagamentos_conferencia_troco",
        }

        regras_existentes = {
            regra["name"]
            for regra in inspect(conexao).get_check_constraints(
                "venda_pagamentos",
                schema="public",
            )
        }

        if not regras_esperadas.issubset(regras_existentes):
            raise RuntimeError(
                "Regras da tabela de pagamentos incompletas. "
                "Migração interrompida para revisão."
            )

    return [tabela.name for tabela in tabelas]