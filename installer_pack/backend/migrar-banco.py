import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(
        description="Verificação e migração do banco Encanto Toys."
    )

    parser.add_argument("--env-file", required=True)
    parser.add_argument(
        "--destino",
        required=True,
        choices=("local", "nuvem"),
    )
    parser.add_argument("--confirmar-host", required=True)
    parser.add_argument("--confirmar-usuario", required=True)
    parser.add_argument("--confirmar-banco", required=True)
    parser.add_argument("--backup")

    operacao = parser.add_mutually_exclusive_group(required=True)
    operacao.add_argument("--verificar", action="store_true")
    operacao.add_argument("--aplicar", action="store_true")

    args = parser.parse_args()

    arquivo_env = Path(args.env_file).resolve()

    if not arquivo_env.is_file():
        raise RuntimeError("Arquivo de configuração não encontrado.")

    from dotenv import load_dotenv

    # Carrega a configuração somente neste processo.
    # Não modifica o arquivo .env.
    load_dotenv(arquivo_env, override=True)

    from sqlalchemy import create_engine, inspect, text
    from sqlalchemy.engine import make_url

    from app import models
    from app.database import Base
    from app.services.migracao_instalacao_service import (
        TABELAS_NUVEM,
        migrar_estrutura,
    )

    chave = (
        "LOCAL_DATABASE_URL"
        if args.destino == "local"
        else "DATABASE_URL"
    )

    configurada = os.getenv(chave)

    if not configurada:
        raise RuntimeError(f"{chave} não configurada.")

    url = make_url(configurada)

    if not (
        url.host == args.confirmar_host
        and url.username == args.confirmar_usuario
        and url.database == args.confirmar_banco
    ):
        raise RuntimeError(
            "Host, usuário ou banco não correspondem "
            "às confirmações informadas."
        )

    if url.get_backend_name() != "postgresql":
        raise RuntimeError("Somente PostgreSQL é permitido.")

    engine = create_engine(url)

    try:
        with engine.begin() as conexao:
            conexao.execute(text("SET TRANSACTION READ ONLY"))
            conexao.execute(text("SET LOCAL statement_timeout = '15s'"))

            banco_real = conexao.execute(
                text("SELECT current_database()")
            ).scalar_one()

            if banco_real != args.confirmar_banco:
                raise RuntimeError(
                    "O servidor respondeu com outro banco."
                )

            inspetor = inspect(conexao)
            existentes = set(
                inspetor.get_table_names(schema="public")
            )

            tabelas = [
                tabela
                for tabela in Base.metadata.sorted_tables
                if (
                    args.destino == "local"
                    or tabela.name in TABELAS_NUVEM
                )
            ]

            print("OK: conexão e identificação do destino conferidas.")

            for tabela in tabelas:
                if tabela.name not in existentes:
                    print(f"Tabela a criar: {tabela.name}")
                    continue

                colunas = {
                    coluna["name"]
                    for coluna in inspetor.get_columns(
                        tabela.name,
                        schema="public",
                    )
                }

                faltando = set(tabela.columns.keys()) - colunas

                if faltando:
                    print(
                        f"Colunas ausentes em {tabela.name}: "
                        + ", ".join(sorted(faltando))
                    )

        if args.verificar:
            print("VERIFICAÇÃO CONCLUÍDA.")
            print("Nenhuma estrutura ou registro foi alterado.")
            return 0

        if not args.backup:
            raise RuntimeError(
                "A aplicação da migração exige --backup."
            )

        backup = Path(args.backup).resolve()

        if not backup.is_file() or backup.stat().st_size == 0:
            raise RuntimeError("Backup ausente ou vazio.")

        with backup.open("rb") as arquivo:
            if arquivo.read(5) != b"PGDMP":
                raise RuntimeError(
                    "O backup deve estar no formato custom do PostgreSQL."
                )

        pg_restore = Path(
            "/usr/lib/postgresql/17/bin/pg_restore"
        )

        executavel = (
            str(pg_restore)
            if pg_restore.is_file()
            else shutil.which("pg_restore")
        )

        if not executavel:
            raise RuntimeError(
                "pg_restore não encontrado para verificar o backup."
            )

        subprocess.run(
            [
                executavel,
                "--no-owner",
                "--no-acl",
                "--file=/dev/null",
                str(backup),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
        )

        print("OK: backup lido sem erro.")

        migrar_estrutura(engine, args.destino)

        print("MIGRAÇÃO CONCLUÍDA.")
        return 0

    finally:
        engine.dispose()


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as erro:
        if isinstance(erro, RuntimeError):
            print(f"INTERROMPIDO: {erro}", file=sys.stderr)
        else:
            print(
                "INTERROMPIDO: "
                f"{type(erro).__name__}. "
                "Não repita a instalação sem conferir a falha.",
                file=sys.stderr,
            )

        sys.exit(1)