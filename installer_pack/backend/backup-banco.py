import argparse
from datetime import datetime, timezone
import os
from pathlib import Path
import subprocess
import sys
import uuid


def main():
    parser = argparse.ArgumentParser(
        description="Backup verificado do banco Encanto Toys."
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
    parser.add_argument("--pasta", required=True)

    parser.add_argument(
        "--pg-bin-dir",
        default="/usr/lib/postgresql/17/bin",
    )

    args = parser.parse_args()

    from dotenv import dotenv_values
    from sqlalchemy.engine import make_url

    arquivo_env = Path(args.env_file).resolve()

    if not arquivo_env.is_file():
        raise RuntimeError("Arquivo de configuração não encontrado.")

    configuracao = dotenv_values(
        arquivo_env,
        interpolate=False,
    )

    chave = (
        "LOCAL_DATABASE_URL"
        if args.destino == "local"
        else "DATABASE_URL"
    )

    valor = configuracao.get(chave)

    if not valor:
        raise RuntimeError(f"{chave} não configurada.")

    url = make_url(valor)

    if not (
        url.get_backend_name() == "postgresql"
        and url.host == args.confirmar_host
        and url.username == args.confirmar_usuario
        and url.database == args.confirmar_banco
    ):
        raise RuntimeError(
            "A conexão não corresponde ao destino confirmado."
        )

    # Recusa opções de URL que este programa ainda não trata.
    permitidas = {"sslmode", "connect_timeout"}

    if set(url.query) - permitidas:
        raise RuntimeError(
            "A URL possui opções adicionais. "
            "Revise o backup antes de continuar."
        )

    pg_dump = Path(args.pg_bin_dir) / "pg_dump"
    pg_restore = Path(args.pg_bin_dir) / "pg_restore"

    for executavel in (pg_dump, pg_restore):
        if not executavel.is_file():
            raise RuntimeError(
                f"Executável não encontrado: {executavel}"
            )

    os.umask(0o077)

    pasta = Path(args.pasta).resolve()
    pasta.mkdir(parents=True, exist_ok=True)

    instante = datetime.now(timezone.utc).strftime(
        "%Y-%m-%d_%H-%M-%S_%f_UTC"
    )

    identificador = uuid.uuid4().hex[:8]

    nome = (
        f"encanto_toys_{args.destino}_"
        f"{instante}_{identificador}.backup"
    )

    destino = pasta / nome
    parcial = pasta / (nome + ".partial")

    if destino.exists() or parcial.exists():
        raise RuntimeError("Nome de backup já existe.")

    ambiente = {
        chave: valor
        for chave, valor in os.environ.items()
        if not chave.startswith("PG")
    }

    # Credenciais fornecidas pelo ambiente do processo,
    # sem incluí-las nos argumentos visíveis do comando.
    ambiente.update({
        "PGHOST": url.host,
        "PGPORT": str(url.port or 5432),
        "PGDATABASE": url.database,
        "PGUSER": url.username,
        "PGPASSWORD": str(url.password or ""),
        "PGCONNECT_TIMEOUT": str(
            url.query.get("connect_timeout", "15")
        ),
        "PGSSLMODE": (
            "require"
            if args.destino == "nuvem"
            else str(url.query.get("sslmode", "prefer"))
        ),
    })

    subprocess.run(
        [
            str(pg_dump),
            "--format=custom",
            "--no-owner",
            "--no-acl",
            f"--file={parcial}",
        ],
        env=ambiente,
        check=True,
    )

    if not parcial.is_file() or parcial.stat().st_size == 0:
        raise RuntimeError("O backup não foi gerado corretamente.")

    subprocess.run(
        [
            str(pg_restore),
            "--no-owner",
            "--no-acl",
            f"--file={os.devnull}",
            str(parcial),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
    )

    parcial.rename(destino)
    destino.chmod(0o600)

    # Somente o caminho vai para stdout.
    # O instalador poderá capturá-lo e usar na migração.
    print(destino)

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as erro:
        if isinstance(erro, RuntimeError):
            mensagem = str(erro)
        else:
            mensagem = type(erro).__name__

        print(
            f"BACKUP INTERROMPIDO: {mensagem}. "
            "Não prossiga com alterações no banco.",
            file=sys.stderr,
        )
        sys.exit(1)