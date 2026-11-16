from datetime import datetime, timezone


def _instante_utc(agora=None):
    instante = agora if agora is not None else datetime.now(timezone.utc)

    if instante.tzinfo is None or instante.utcoffset() is None:
        raise ValueError("O horário precisa informar o fuso.")

    return instante.astimezone(timezone.utc)


def registrar_abertura(caixa, operador, agora=None):
    nome = operador.strip().lower()

    if not nome or len(nome) > 150:
        raise ValueError("Operador inválido.")

    instante = _instante_utc(agora)

    # Chamadas repetidas não reiniciam o horário de abertura.
    if not caixa.esta_aberto:
        caixa.aberto_em = instante
        caixa.fechado_em = None

    caixa.esta_aberto = True
    caixa.operador_atual = nome
    caixa.ultima_atividade_em = instante


def registrar_atividade(caixa, operador, agora=None):
    if not caixa.esta_aberto:
        return False

    if caixa.operador_atual != operador.strip().lower():
        raise ValueError("O operador não corresponde à operação atual.")

    caixa.ultima_atividade_em = _instante_utc(agora)
    return True


def registrar_fechamento(caixa, operador, agora=None):
    if not caixa.esta_aberto:
        return False

    if caixa.operador_atual != operador.strip().lower():
        raise ValueError("O operador não corresponde à operação atual.")

    instante = _instante_utc(agora)

    caixa.esta_aberto = False
    caixa.fechado_em = instante
    caixa.ultima_atividade_em = instante

    return True


def classificar_atividade(
    ultima_atividade,
    agora=None,
    limite_segundos=90,
):
    if ultima_atividade is None:
        return "NAO_INFORMADA"

    instante = _instante_utc(agora)
    ultima = _instante_utc(ultima_atividade)
    segundos = (instante - ultima).total_seconds()

    # Evita apresentar um relógio muito adiantado como atividade recente.
    if segundos < -30:
        return "HORARIO_INCONSISTENTE"

    if segundos <= limite_segundos:
        return "SINAL_RECENTE"

    return "SEM_SINAL_RECENTE"