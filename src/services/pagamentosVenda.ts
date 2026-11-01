import type {
  FormaPagamentoParcela,
  PagamentoVendaPayload,
} from "./api";

export interface PagamentoFormulario {
  id: string;
  forma: FormaPagamentoParcela;
  valor: string;
  recebido: string;
}

export const FORMAS_PAGAMENTO: {
  valor: FormaPagamentoParcela;
  nome: string;
}[] = [
  { valor: "DINHEIRO", nome: "Dinheiro" },
  { valor: "PIX", nome: "PIX" },
  { valor: "CARTÃO CRÉDITO", nome: "Cartão de crédito" },
  { valor: "CARTÃO DÉBITO", nome: "Cartão de débito" },
];

const LIMITE_CENTAVOS = 99_999_999_999_999n;

export function lerCentavos(texto: string): bigint | null {
  const normalizado = texto.trim().replace(",", ".");

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalizado)) {
    return null;
  }

  const [inteiro, decimal = ""] = normalizado.split(".");

  const centavos =
    BigInt(inteiro) * 100n +
    BigInt(decimal.padEnd(2, "0"));

  return centavos <= LIMITE_CENTAVOS ? centavos : null;
}

export function textoMonetario(centavos: bigint): string {
  return (
    `${centavos / 100n}.` +
    String(centavos % 100n).padStart(2, "0")
  );
}

export function formatarCentavos(centavos: bigint): string {
  const negativo = centavos < 0n;
  const absoluto = negativo ? -centavos : centavos;

  const [inteiro, decimal] = textoMonetario(absoluto).split(".");
  const agrupado = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${negativo ? "-" : ""}R$ ${agrupado},${decimal}`;
}

// Arredonda a representação decimal do total para centavos.
// Também aceita números representados em notação científica.
export function totalEmCentavos(total: number): bigint {
  if (!Number.isFinite(total) || total < 0) {
    throw new Error("Total da venda inválido.");
  }

  const [coeficiente, expoente = "0"] = String(total)
    .toLowerCase()
    .split("e");

  const [inteiro, decimal = ""] = coeficiente.split(".");
  const digitos = BigInt(inteiro + decimal);
  const escala = Number(expoente) - decimal.length + 2;

  let centavos: bigint;

  if (escala >= 0) {
    centavos = digitos * 10n ** BigInt(escala);
  } else {
    const divisor = 10n ** BigInt(-escala);
    centavos = (digitos + divisor / 2n) / divisor;
  }

  if (centavos > LIMITE_CENTAVOS) {
    throw new Error("Total da venda acima do limite permitido.");
  }

  return centavos;
}

export function normalizarFormaPagamento(
  valor: string,
): FormaPagamentoParcela {
  const texto = valor
    .toUpperCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^FORMAPAGAMENTO\./, "")
    .replace(/\s+/g, "_");

  switch (texto) {
    case "DINHEIRO":
      return "DINHEIRO";
    case "PIX":
      return "PIX";
    case "CREDITO":
    case "CARTAO_CREDITO":
      return "CARTÃO CRÉDITO";
    case "DEBITO":
    case "CARTAO_DEBITO":
      return "CARTÃO DÉBITO";
    default:
      throw new Error("Forma de pagamento não reconhecida.");
  }
}

export function prepararPagamentos(
  total: number,
  linhas: PagamentoFormulario[],
): PagamentoVendaPayload[] {
  const totalCentavos = totalEmCentavos(total);

  if (totalCentavos <= 0n) {
    throw new Error("O total da venda deve ser maior que zero.");
  }

  if (linhas.length === 0 || linhas.length > 20) {
    throw new Error("Informe de 1 a 20 pagamentos.");
  }

  let soma = 0n;

  const pagamentos = linhas.map((linha, indice) => {
    if (!FORMAS_PAGAMENTO.some((opcao) => opcao.valor === linha.forma)) {
      throw new Error(`Escolha a forma do pagamento ${indice + 1}.`);
    }

    // Um pagamento único acompanha automaticamente o total final.
    const valor = linhas.length === 1
      ? totalCentavos
      : lerCentavos(linha.valor);

    if (valor === null || valor <= 0n) {
      throw new Error(
        `Informe um valor válido para o pagamento ${indice + 1}.`,
      );
    }

    soma += valor;

    let recebido: bigint | null = null;

    if (linha.forma === "DINHEIRO" && linha.recebido.trim() !== "") {
      recebido = lerCentavos(linha.recebido);

      if (recebido === null || recebido < valor) {
        throw new Error(
          `O dinheiro recebido no pagamento ${indice + 1} é insuficiente.`,
        );
      }
    }

    return {
      forma_pagamento: linha.forma,
      valor: textoMonetario(valor),
      valor_recebido:
        recebido === null ? null : textoMonetario(recebido),
    };
  });

  if (soma !== totalCentavos) {
    throw new Error(
      soma < totalCentavos
        ? `Falta pagar ${formatarCentavos(totalCentavos - soma)}.`
        : `Os pagamentos excedem o total em ${
            formatarCentavos(soma - totalCentavos)
          }.`,
    );
  }

  return pagamentos;
}