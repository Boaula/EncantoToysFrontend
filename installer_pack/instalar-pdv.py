import argparse
from datetime import datetime, timezone
import getpass
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import tarfile
import tempfile
import time
import traceback
from urllib.parse import unquote, urlsplit
from urllib.request import urlopen


BACKEND = Path("/opt/encanto-toys-backend")
SERVICO = "encanto-toys-backend.service"
UNIDADE = Path("/etc/systemd/system") / SERVICO
PG_BIN = Path("/usr/lib/postgresql/17/bin")
BACKUPS = Path("/var/backups/encanto-toys")

PROJETO_DEV = "iscguilmcghkhgqsrolu"


def executar(comando, *, capturar=False, entrada=None, ambiente=None):
    resultado = subprocess.run(
        [str(item) for item in comando],
        input=entrada,
        text=True,
        capture_output=capturar,
        env=ambiente,
    )

    if resultado.returncode != 0:
        raise RuntimeError(
            f"Falha ao executar {Path(str(comando[0])).name}. "
            "Confira a etapa antes de repetir."
        )

    return resultado.stdout.strip() if capturar else ""

def selecionar_pg_local():
    if shutil.which("pg_lsclusters"):
        linhas = executar(
            ["pg_lsclusters", "--no-header"],
            capturar=True,
        ).splitlines()

        for linha in linhas:
            campos = linha.split()

            if len(campos) >= 3 and campos[2] == "5433":
                versao = campos[0]

                if versao not in ("16", "17"):
                    raise RuntimeError(
                        "Versão local do PostgreSQL não validada."
                    )

                pasta = Path(
                    f"/usr/lib/postgresql/{versao}/bin"
                )

                for nome in (
                    "psql", "pg_dump", "pg_restore", "pg_dumpall"
                ):
                    if not (pasta / nome).is_file():
                        raise RuntimeError(
                            f"Executável PostgreSQL ausente: {nome}"
                        )

                return pasta

    return Path("/usr/lib/postgresql/17/bin")

def ambiente_sem_pg():
    return {
        chave: valor
        for chave, valor in os.environ.items()
        if not chave.startswith("PG")
    }


def sql_local(sql):
    return executar(
        [
            "runuser", "-u", "postgres", "--",
            PG_BIN / "psql",
            "-X", "-qAt",
            "-v", "ON_ERROR_STOP=1",
            "-h", "/var/run/postgresql",
            "-p", "5433",
            "-d", "postgres",
        ],
        capturar=True,
        entrada="SET lock_timeout = '5s';\n" + sql,
        ambiente=ambiente_sem_pg(),
    )


def existe_banco(nome):
    return sql_local(
        f"SELECT 1 FROM pg_database WHERE datname = '{nome}';"
    ) == "1"


def dump_local(nome, pasta, prefixo):
    arquivo = pasta / f"{prefixo}.backup"
    parcial = pasta / f"{prefixo}.backup.partial"

    if arquivo.exists() or parcial.exists():
        raise RuntimeError("O arquivo de backup já existe.")

    with parcial.open("xb") as saida:
        subprocess.run(
            [
                "runuser", "-u", "postgres", "--",
                str(PG_BIN / "pg_dump"),
                "-h", "/var/run/postgresql",
                "-p", "5433",
                "-d", nome,
                "--format=custom",
                "--no-owner",
                "--no-acl",
            ],
            stdout=saida,
            env=ambiente_sem_pg(),
            check=True,
        )

    subprocess.run(
        [
            str(PG_BIN / "pg_restore"),
            "--no-owner",
            "--no-acl",
            f"--file={os.devnull}",
            str(parcial),
        ],
        stdout=subprocess.DEVNULL,
        check=True,
    )

    parcial.rename(arquivo)
    arquivo.chmod(0o600)
    return arquivo


def arquivar(origem, destino):
    with tarfile.open(destino, "w:gz") as arquivo:
        arquivo.add(origem, arcname=origem.name)

    with tarfile.open(destino, "r:gz") as arquivo:
        for membro in arquivo:
            if membro.isfile():
                conteudo = arquivo.extractfile(membro)
                if conteudo is None:
                    raise RuntimeError("Falha na leitura do arquivo compactado.")
                with conteudo:
                    while conteudo.read(1024 * 1024):
                        pass


def validar_caminho_xml(valor):
    caminho = Path(valor).expanduser()

    if not caminho.is_absolute():
        raise RuntimeError("A pasta de XMLs deve ser absoluta.")

    caminho = caminho.resolve()

    proibidos = {
        Path("/"), Path("/home"), Path("/opt"),
        Path("/var"), Path("/var/lib"), BACKEND,
    }

    if caminho in proibidos or BACKEND in caminho.parents:
        raise RuntimeError(
            "Escolha uma pasta específica de XMLs, fora do backend."
        )

    if caminho.exists() and not caminho.is_dir():
        raise RuntimeError("O caminho de XMLs não é uma pasta.")

    return caminho


def preservar_xmls(origem, destino, pasta_backup):
    if not origem:
        return

    origem = Path(origem).expanduser().resolve()

    if not origem.is_dir():
        return

    if origem in {
        Path("/"), Path("/home"), Path("/opt"),
        Path("/var"), Path("/var/lib"), BACKEND,
    }:
        raise RuntimeError("Pasta antiga de XMLs ampla demais.")

    arquivar(origem, pasta_backup / "xmls_anteriores.tar.gz")

    if origem == destino:
        return

    destino.mkdir(parents=True, exist_ok=True)

    # Não sobrescrever arquivos com conteúdo diferente.
    for arquivo in origem.rglob("*"):
        if arquivo.is_symlink():
            raise RuntimeError(
                "A pasta de XMLs contém links. Revise antes de copiar."
            )

        if not arquivo.is_file():
            continue

        relativo = arquivo.relative_to(origem)
        novo = destino / relativo

        if novo.exists():
            if not novo.is_file() or novo.read_bytes() != arquivo.read_bytes():
                raise RuntimeError(
                    "Existe um arquivo diferente no destino dos XMLs."
                )

    for arquivo in origem.rglob("*"):
        if arquivo.is_file():
            novo = destino / arquivo.relative_to(origem)
            novo.parent.mkdir(parents=True, exist_ok=True)

            if not novo.exists():
                shutil.copy2(arquivo, novo)


def gravar_env(caminho, configuracao):
    linhas = []

    for chave, valor in configuracao.items():
        if valor is None:
            continue

        valor = str(valor)

        if "\n" in valor or "\r" in valor:
            raise RuntimeError(
                "Configuração com várias linhas exige revisão."
            )

        linhas.append(
            f"{chave}={json.dumps(valor, ensure_ascii=False)}"
        )

    caminho.write_text(
        "\n".join(linhas) + "\n",
        encoding="utf-8",
    )
    caminho.chmod(0o600)


def contar(engine):
    from sqlalchemy import inspect, text

    resultado = {}

    with engine.begin() as conexao:
        conexao.execute(text("SET TRANSACTION READ ONLY"))
        conexao.execute(text("SET LOCAL statement_timeout = '30s'"))

        inspetor = inspect(conexao)
        preparar = conexao.dialect.identifier_preparer.quote_identifier

        for tabela in inspetor.get_table_names(schema="public"):
            resultado[tabela] = conexao.execute(text(
                f"SELECT COUNT(*) FROM public.{preparar(tabela)}"
            )).scalar_one()

    return resultado


def conferir_contagens(antes, depois, nome):
    for tabela, quantidade in antes.items():
        if depois.get(tabela) != quantidade:
            raise RuntimeError(
                f"Contagem alterada em {nome}.{tabela}. "
                "Interrompa e revise os backups."
            )


def migrar(python, etapa, env, destino, url, backup):
    executar([
        python,
        etapa / "migrar-banco.py",
        "--env-file", env,
        "--destino", destino,
        "--confirmar-host", url.host,
        "--confirmar-usuario", url.username,
        "--confirmar-banco", url.database,
        "--backup", backup,
        "--aplicar",
    ])


def instalar(estado):
    global PG_BIN
    PG_BIN = selecionar_pg_local()

    from dotenv import dotenv_values
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import make_url, URL

    pacote = Path(estado["pacote"])
    etapa = Path(estado["etapa"])
    pasta_backup = Path(estado["backup"])
    python = Path(estado["python"])
    deb = pacote / "encanto-toys.deb"

    nome = estado["banco"]
    usuario = estado["usuario"]

    anterior = estado["config_anterior"]
    senha_nova = secrets.token_hex(24)

    remoto = make_url(estado["url_supabase"]).set(
        drivername="postgresql"
    )

    if set(remoto.query) - {"sslmode", "connect_timeout"}:
        raise RuntimeError("A URL Supabase tem opções não previstas.")

    remoto = remoto.update_query_dict({"sslmode": "require"})

    if remoto.database != "postgres" or not remoto.password:
        raise RuntimeError("URL Supabase incompleta.")

    if estado["ambiente"] == "development":
        if not (
            remoto.host == "aws-1-sa-east-1.pooler.supabase.com"
            and remoto.username == f"postgres.{PROJETO_DEV}"
        ):
            raise RuntimeError("O teste exige o Supabase DEV conhecido.")
    else:
        if (
            remoto.username == f"postgres.{PROJETO_DEV}"
            or remoto.host == f"db.{PROJETO_DEV}.supabase.co"
        ):
            raise RuntimeError("Supabase DEV informado no modo produção.")

    if anterior.get("DATABASE_URL"):
        antigo = make_url(anterior["DATABASE_URL"])

        if (
            antigo.host != remoto.host
            or antigo.username != remoto.username
            or antigo.database != remoto.database
        ):
            raise RuntimeError(
                "O Supabase informado difere da instalação anterior. "
                "A troca de projeto exige procedimento separado."
            )

    papel_existia = sql_local(
        f"SELECT 1 FROM pg_roles WHERE rolname = '{usuario}';"
    ) == "1"

    verificador_anterior = None

    if papel_existia:
        verificador_anterior = sql_local(
            f"SELECT rolpassword FROM pg_authid "
            f"WHERE rolname = '{usuario}';"
        )

    banco_existia = existe_banco(nome)

    if anterior.get("LOCAL_DATABASE_URL"):
        local_antigo = make_url(anterior["LOCAL_DATABASE_URL"])

        if not (
            local_antigo.host in ("127.0.0.1", "localhost")
            and local_antigo.port == 5433
            and local_antigo.database == nome
            and local_antigo.username == usuario
            and not (
                set(local_antigo.query)
                - {"sslmode", "connect_timeout"}
            )
        ):
            raise RuntimeError("Conexão local anterior diferente da esperada.")

        senha_atual = local_antigo.password
    elif papel_existia:
        senha_atual = estado["senha_local_anterior"]
    else:
        senha_atual = senha_nova

    local = URL.create(
        "postgresql",
        username=usuario,
        password=senha_atual,
        host="127.0.0.1",
        port=5433,
        database=nome,
    )

    if papel_existia:
        verificar = create_engine(
            local if banco_existia else local.set(database="postgres")
        )
        try:
            with verificar.connect() as conexao:
                conexao.execute(text("SELECT 1"))
        finally:
            verificar.dispose()

    xml_destino = validar_caminho_xml(estado["pasta_xml"])

    configuracao = dict(anterior)
    configuracao.update({
        "APP_ENV": estado["ambiente"],
        "LOCAL_DATABASE_URL":
            local.render_as_string(hide_password=False),
        "DATABASE_URL":
            remoto.render_as_string(hide_password=False),
        "EXPECTED_SUPABASE_HOST": remoto.host,
        "EXPECTED_SUPABASE_USER": remoto.username,
        "COMPRAS_XML_DIR": str(xml_destino),
        "JWT_SECRET_KEY": secrets.token_hex(32),
        "DEVELOPER_TOKEN": secrets.token_hex(32),
        "HOST": "127.0.0.1",
        "PORT": "8000",
    })

    env = etapa / ".env"
    gravar_env(env, configuracao)

    engine_remoto = create_engine(remoto)
    engine_local = None
    backend_anterior = BACKEND.parent / (
        ".encanto-toys-backend.anterior_" + secrets.token_hex(6)
    )

    substituiu_backend = False
    mudou_senha = False
    tentou_deb = False

    unidade_anterior = (
        UNIDADE.read_bytes() if UNIDADE.is_file() else None
    )

    try:
        print("Validando conexão e fazendo backup do Supabase...", flush=True)

        with engine_remoto.connect() as conexao:
            if conexao.execute(
                text("SELECT current_database()")
            ).scalar_one() != "postgres":
                raise RuntimeError("Banco remoto diferente de postgres.")

        backup_remoto = executar(
            [
                python, etapa / "backup-banco.py",
                "--env-file", env,
                "--destino", "nuvem",
                "--confirmar-host", remoto.host,
                "--confirmar-usuario", remoto.username,
                "--confirmar-banco", remoto.database,
                "--pasta", pasta_backup,
            ],
            capturar=True,
        )

        antes_remoto = contar(engine_remoto)

        preservar_xmls(
            anterior.get("COMPRAS_XML_DIR"),
            xml_destino,
            pasta_backup,
        )

        if not papel_existia:
            sql_local(
                f"CREATE ROLE {usuario} LOGIN PASSWORD '{senha_nova}';"
            )

        if not banco_existia:
            sql_local(f"CREATE DATABASE {nome} OWNER {usuario};")

        # Backup local imediatamente antes da migração.
        backup_local = dump_local(
            nome,
            pasta_backup,
            "local_antes_migracao",
        )

        engine_local = create_engine(local)
        antes_local = contar(engine_local)

        print("Aplicando migração local...", flush=True)
        migrar(python, etapa, env, "local", local, backup_local)
        conferir_contagens(antes_local, contar(engine_local), "local")

        print("Aplicando migração no Supabase...", flush=True)
        migrar(python, etapa, env, "nuvem", remoto, backup_remoto)
        conferir_contagens(antes_remoto, contar(engine_remoto), "nuvem")

        # A senha só muda depois dos backups e das migrações.
        mudou_senha = papel_existia

        sql_local(
            f"ALTER ROLE {usuario} PASSWORD '{senha_nova}';"
        )

        local_novo = local.set(password=senha_nova)

        configuracao["LOCAL_DATABASE_URL"] = (
            local_novo.render_as_string(hide_password=False)
        )
        gravar_env(env, configuracao)

        teste = create_engine(local_novo)
        try:
            with teste.connect() as conexao:
                conexao.execute(text("SELECT 1"))
        finally:
            teste.dispose()

        if BACKEND.exists():
            BACKEND.rename(backend_anterior)

        # A recuperação deve tratar também uma cópia parcialmente criada.
        substituiu_backend = True
        shutil.copytree(etapa, BACKEND, symlinks=True)

        # O ambiente Python tem caminho permanente.
        # O link .venv mantém compatibilidade com os outros scripts.
        (BACKEND / ".venv").symlink_to(python.parent.parent)

        UNIDADE.write_text(
            "[Unit]\n"
            "Description=Encanto Toys Backend\n"
            "After=network-online.target postgresql.service\n"
            "Wants=network-online.target\n\n"
            "[Service]\n"
            "Type=simple\n"
            "User=root\n"
            "Group=root\n"
            f"WorkingDirectory={BACKEND}\n"
            f"EnvironmentFile={BACKEND / '.env'}\n"
            f"ExecStart={python} -m uvicorn app.main:app "
            "--host 127.0.0.1 --port 8000\n"
            "Restart=always\n"
            "RestartSec=5\n"
            "NoNewPrivileges=true\n\n"
            "[Install]\n"
            "WantedBy=multi-user.target\n",
            encoding="utf-8",
        )
        UNIDADE.chmod(0o644)

        tentou_deb = True
        executar(["dpkg", "--install", deb])

        executar(["usermod", "-aG", "dialout", estado["operador_linux"]])
        executar(["systemctl", "daemon-reload"])
        executar(["systemctl", "enable", SERVICO])
        executar(["systemctl", "start", SERVICO])

        obrigatorias = {
            "/pdv/atividade",
            "/compras/xml/arquivos/{arquivo_id}",
            "/relatorios/vendas/exportar",
        }

        saudavel = False

        for _ in range(30):
            time.sleep(1)

            try:
                with urlopen(
                    "http://127.0.0.1:8000/openapi.json",
                    timeout=2,
                ) as resposta:
                    documento = json.load(resposta)

                if obrigatorias.issubset(documento.get("paths", {})):
                    saudavel = True
                    break
            except Exception:
                pass

        if not saudavel:
            raise RuntimeError("A API nova não passou na verificação inicial.")

        print("\nINSTALAÇÃO CONCLUÍDA.")
        print(f"Backups protegidos: {pasta_backup}")
        print(f"XMLs deste computador: {xml_destino}")

        if backend_anterior.exists():
            print(f"Backend anterior preservado: {backend_anterior}")

        print("Senha local e chaves de segurança renovadas.")
        print("Entre novamente no aplicativo.")
        print("Impressão, licença e sincronização ainda exigem teste funcional.")

    except Exception:
        executar_sem_falhar(["systemctl", "stop", SERVICO])

        recuperacao_ok = True

        try:
            if mudou_senha:
                if verificador_anterior:
                    seguro = verificador_anterior.replace("'", "''")
                    sql_local(
                        f"ALTER ROLE {usuario} PASSWORD '{seguro}';"
                    )
                else:
                    sql_local(f"ALTER ROLE {usuario} PASSWORD NULL;")

            if substituiu_backend and BACKEND.exists():
                falhou = BACKEND.parent / (
                    ".encanto-toys-backend.falhou_" + secrets.token_hex(6)
                )
                BACKEND.rename(falhou)

            if backend_anterior.exists():
                backend_anterior.rename(BACKEND)

            if unidade_anterior is not None:
                UNIDADE.write_bytes(unidade_anterior)
                UNIDADE.chmod(0o644)
            elif UNIDADE.exists():
                executar_sem_falhar(["systemctl", "disable", SERVICO])
                UNIDADE.unlink()

            if tentou_deb:
                if estado.get("deb_anterior"):
                    executar([
                        "dpkg", "--install", estado["deb_anterior"]
                    ])
                else:
                    executar_sem_falhar([
                        "dpkg", "--remove", "encanto-toys"
                    ])

            executar(["systemctl", "daemon-reload"])

        except Exception:
            recuperacao_ok = False

        if recuperacao_ok and estado["servico_ativo"]:
            executar_sem_falhar(["systemctl", "start", SERVICO])

        print("\nINSTALAÇÃO INTERROMPIDA.", file=sys.stderr)
        print(f"Backups: {pasta_backup}", file=sys.stderr)

        if not recuperacao_ok:
            print(
                "A recuperação do programa anterior exige intervenção manual.",
                file=sys.stderr,
            )

        print(
            "Os bancos não foram restaurados nem apagados automaticamente. "
            "Alterações aditivas de estrutura podem permanecer.",
            file=sys.stderr,
        )
        raise

    finally:
        engine_remoto.dispose()
        if engine_local is not None:
            engine_local.dispose()


def executar_sem_falhar(comando):
    subprocess.run(
        [str(item) for item in comando],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def preparar(args):
    global PG_BIN
    PG_BIN = selecionar_pg_local()
        
    pacote = Path(args.pacote).resolve()

    deb_atual = pacote / "encanto-toys.deb"

    if not deb_atual.is_file():
        raise RuntimeError("Pacote encanto-toys.deb não encontrado.")

    versao_do_pacote = executar(
        ["dpkg-deb", "-f", deb_atual, "Version"],
        capturar=True,
    )

    if args.versao != versao_do_pacote:
        raise RuntimeError(
            "A versão informada não corresponde ao pacote."
        )

    if BACKEND.is_symlink():
        raise RuntimeError("Backend instalado é um link. Revise manualmente.")

    operador_linux = os.environ.get("SUDO_USER", "")

    if not operador_linux or operador_linux == "root":
        raise RuntimeError("Execute com sudo a partir do usuário do PDV.")

    executar(["id", operador_linux], capturar=True)
    executar(["bash", pacote / "preparar-sistema.sh", "--verificar"])

    if subprocess.run(
        ["pgrep", "-x", "encanto-toys"],
        stdout=subprocess.DEVNULL,
    ).returncode == 0:
        raise RuntimeError("Feche o aplicativo antes de instalar.")

    servico_ativo = subprocess.run(
        ["systemctl", "is-active", "--quiet", SERVICO]
    ).returncode == 0

    with socket.socket() as teste:
        porta_ocupada = teste.connect_ex(("127.0.0.1", 8000)) == 0

    if porta_ocupada and not servico_ativo:
        raise RuntimeError(
            "A porta 8000 está ocupada por outro processo. "
            "Pode ser o backend de desenvolvimento."
        )

    escolha = input(
        "Ambiente: digite TESTE ou PRODUCAO: "
    ).strip()

    if escolha not in ("TESTE", "PRODUCAO"):
        raise RuntimeError("Ambiente não confirmado.")

    desenvolvimento = escolha == "TESTE"
    nome = "encanto_toys_dev" if desenvolvimento else "encanto_toys"
    usuario = "encantotoys_dev_user" if desenvolvimento else "encantotoys_user"

    print("TESTE deve ser usado somente em computador ou VM de laboratório.")
    print("Feche os aplicativos e pare os backends dos demais PDVs")
    print("após conferir que as vendas pendentes foram sincronizadas.")

    if input("Digite VENDAS_PAUSADAS para continuar: ").strip() != "VENDAS_PAUSADAS":
        raise RuntimeError("Pausa das operações não confirmada.")

    url_supabase = getpass.getpass("Cole a URL PostgreSQL do Supabase: ").strip()
    partes = urlsplit(url_supabase)

    if (
        partes.scheme not in ("postgresql", "postgresql+psycopg2")
        or not partes.hostname
        or not partes.username
        or not partes.password
        or unquote(partes.path.lstrip("/")) != "postgres"
    ):
        raise RuntimeError("URL Supabase inválida ou incompleta.")

    usuario_remoto = unquote(partes.username)
    print(f"Servidor Supabase: {partes.hostname}")
    print(f"Usuário Supabase: {usuario_remoto}")

    if input("Digite novamente o usuário Supabase para confirmar: ").strip() != usuario_remoto:
        raise RuntimeError("Usuário Supabase não confirmado.")

    anterior = {}

    if (BACKEND / ".env").is_file():
        python_antigo = BACKEND / ".venv/bin/python"

        if not python_antigo.is_file():
            raise RuntimeError("Python da instalação anterior ausente.")

        bruto = executar(
            [
                python_antigo, "-c",
                "import json,sys; "
                "from dotenv import dotenv_values; "
                "print(json.dumps(dotenv_values(sys.argv[1], interpolate=False)))",
                BACKEND / ".env",
            ],
            capturar=True,
        )
        anterior = json.loads(bruto)

        local_anterior = urlsplit(
            anterior.get("LOCAL_DATABASE_URL") or ""
        )

        if not (
            local_anterior.hostname in ("127.0.0.1", "localhost")
            and local_anterior.port == 5433
            and unquote(local_anterior.path.lstrip("/")) == nome
            and unquote(local_anterior.username or "") == usuario
        ):
            raise RuntimeError(
                "A instalação anterior pertence a outro banco ou ambiente."
            )

    sugestao_xml = anterior.get("COMPRAS_XML_DIR") or \
        "/var/lib/encanto-toys/compras_xml"

    antigo_xml = Path(sugestao_xml).expanduser().resolve()

    if antigo_xml == BACKEND or BACKEND in antigo_xml.parents:
        sugestao_xml = "/var/lib/encanto-toys/compras_xml"

    pasta_xml = input(
        f"Pasta local dos XMLs [{sugestao_xml}]: "
    ).strip() or sugestao_xml

    validar_caminho_xml(pasta_xml)

    senha_anterior = ""

    if not anterior:
        senha_anterior = getpass.getpass(
            "Senha atual do usuário PostgreSQL local, se já existir "
            "(Enter se ainda não existe): "
        )

    BACKUPS.mkdir(parents=True, exist_ok=True)
    BACKUPS.chmod(0o700)

    pasta_backup = Path(tempfile.mkdtemp(
        prefix="instalacao_" + datetime.now(timezone.utc).strftime(
            "%Y-%m-%d_%H-%M-%S_UTC_"
        ),
        dir=BACKUPS,
    ))

    deb_anterior = ""
    versao_anterior = subprocess.run(
        ["dpkg-query", "-W", "-f=${Version}", "encanto-toys"],
        text=True,
        capture_output=True,
    )

    if versao_anterior.returncode == 0 and versao_anterior.stdout.strip():
        versao = versao_anterior.stdout.strip()
        original = pacote / f"encanto-toys_{versao}_amd64.deb"

        if not original.is_file():
            raise RuntimeError(
                "Coloque no pacote o .deb da versão instalada "
                "para permitir recuperação."
            )

        destino = pasta_backup / original.name
        shutil.copy2(original, destino)
        deb_anterior = str(destino)

    try:
        if servico_ativo:
            executar(["systemctl", "stop", SERVICO])

        if BACKEND.is_dir():
            arquivar(BACKEND, pasta_backup / "backend_anterior.tar.gz")

        if UNIDADE.is_file():
            shutil.copy2(UNIDADE, pasta_backup / UNIDADE.name)

        # Se já há cluster, o comando de verificação anterior
        # exigiu PostgreSQL 17 na porta 5433.
        clusters = ""

        if shutil.which("pg_lsclusters"):
            clusters = executar(
                ["pg_lsclusters", "--no-header"],
                capturar=True,
            )

        if clusters:
            if existe_banco(nome):
                dump_local(nome, pasta_backup, "local_antes_preparacao")

            with (pasta_backup / "roles_anteriores.sql").open("xb") as saida:
                subprocess.run(
                    [
                        "runuser", "-u", "postgres", "--",
                        str(PG_BIN / "pg_dumpall"),
                        "-h", "/var/run/postgresql",
                        "-p", "5433",
                        "--globals-only",
                    ],
                    stdout=saida,
                    env=ambiente_sem_pg(),
                    check=True,
                )

        ambiente = os.environ.copy()
        ambiente["PDV_PREPARACAO_AUTORIZADA"] = "SIM"

        executar(
            ["bash", pacote / "preparar-sistema.sh", "--aplicar"],
            ambiente=ambiente,
        )

        # Garantir que uma atualização de pacote não reativou o backend.
        if servico_ativo:
            executar(["systemctl", "stop", SERVICO])

        pasta_venvs = Path("/opt/encanto-toys-venvs")
        pasta_venvs.mkdir(parents=True, exist_ok=True)

        # O caminho do venv permanece fixo mesmo após a troca do backend.
        permissao_anterior = os.umask(0o022)

        try:
            venv = Path(tempfile.mkdtemp(
                prefix=f"v{args.versao}_",
                dir=pasta_venvs,
            ))
            venv.chmod(0o755)

            executar([sys.executable, "-m", "venv", venv])
        finally:
            os.umask(permissao_anterior)

        python = venv / "bin/python"

        executar([
            python, "-m", "pip", "install",
            "-r", pacote / "backend/requirements.txt",
        ])

        etapa = Path(tempfile.mkdtemp(
            prefix=".encanto-toys-preparacao_",
            dir="/opt",
        ))

        shutil.copytree(
            pacote / "backend",
            etapa,
            dirs_exist_ok=True,
            ignore=shutil.ignore_patterns(
                ".env", ".venv", "venv", "__pycache__", "*.pyc"
            ),
        )

        estado = {
            "pacote": str(pacote),
            "versao": args.versao,
            "etapa": str(etapa),
            "backup": str(pasta_backup),
            "python": str(python),
            "ambiente":
                "development" if desenvolvimento else "production",
            "banco": nome,
            "usuario": usuario,
            "url_supabase": url_supabase,
            "config_anterior": anterior,
            "senha_local_anterior": senha_anterior,
            "pasta_xml": pasta_xml,
            "operador_linux": operador_linux,
            "servico_ativo": servico_ativo,
            "deb_anterior": deb_anterior,
        }

        executar(
            [
                python, Path(__file__).resolve(),
                "--pacote", pacote,
                "--versao", args.versao,
                "--interno",
            ],
            entrada=json.dumps(estado),
        )

    except Exception:
        with (pasta_backup / "erro_instalacao.log").open(
            "a", encoding="utf-8"
        ) as arquivo:
            traceback.print_exc(file=arquivo)

        # Só tentar reativar se a configuração anterior foi preservada.
        if servico_ativo and BACKEND.is_dir() and UNIDADE.is_file():
            try:
                bruto = executar(
                    [
                        BACKEND / ".venv/bin/python", "-c",
                        "import json,sys; "
                        "from dotenv import dotenv_values; "
                        "print(json.dumps(dotenv_values(sys.argv[1], interpolate=False)))",
                        BACKEND / ".env",
                    ],
                    capturar=True,
                )

                if json.loads(bruto) == anterior:
                    executar_sem_falhar(["systemctl", "start", SERVICO])
            except Exception:
                pass

        print(f"Procedimento interrompido. Backups: {pasta_backup}", file=sys.stderr)
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pacote", required=True)
    parser.add_argument("--versao", required=True)
    parser.add_argument("--interno", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()

    if os.geteuid() != 0:
        raise RuntimeError("A instalação exige sudo.")

    os.umask(0o077)

    if args.interno:
        instalar(json.load(sys.stdin))
    else:
        preparar(args)


if __name__ == "__main__":
    try:
        main()
    except Exception as erro:
        print(
            f"Instalação não concluída: {type(erro).__name__}. "
            "Confira o registro protegido de erro e não retome as vendas "
            "antes de revisar o estado do sistema.",
            file=sys.stderr,
        )
        sys.exit(1)