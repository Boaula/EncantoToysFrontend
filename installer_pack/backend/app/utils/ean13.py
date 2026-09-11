def calcular_digito_verificador_ean13(codigo_12_digitos: str) -> int:
    """
    Calcula o 13º dígito (verificador) de um código EAN-13 usando Módulo 10.
    """
    if len(codigo_12_digitos) != 12 or not codigo_12_digitos.isdigit():
        # Corrigido: Este bloco precisa de 4 espaços a mais que o 'if'
        raise ValueError("O código base precisa ter exatamente 12 dígitos numéricos.")
    
    soma = 0
    for i, digito in enumerate(codigo_12_digitos):
        # Corrigido: Estas linhas precisam de 4 espaços a mais que o 'for'
        num = int(digito)
        # Posições ímpares (0, 2, 4...) peso 1. Posições pares (1, 3, 5...) peso 3.
        soma += num * 3 if i % 2 != 0 else num * 1
            
    proximo_multiplo_10 = ((soma + 9) // 10) * 10
    digito = proximo_multiplo_10 - soma
    return 0 if digito == 10 else digito

def gerar_codigo_interno_ean13(sequencial: int, prefixo: str = "20") -> str:
    """
    Gera um código EAN-13 interno completo com prefixo privado (ex: 2000000000018).
    """
    # Garante que o corpo tenha exatamente 12 dígitos juntando o prefixo e o sequencial com zeros à esquerda
    corpo = f"{prefixo}{str(sequencial).zfill(10)}"
    digito = calcular_digito_verificador_ean13(corpo)
    return f"{corpo}{digito}"