import { invoke } from '@tauri-apps/api/core';

import {
  FORMAS_PAGAMENTO,
  formatarCentavos,
  lerCentavos,
  normalizarFormaPagamento,
  totalEmCentavos,
} from "./pagamentosVenda";

export interface ItemVenda {
  nome: string;
  qtd: number;
  precoUnitario: number;
}

export interface PagamentoCupom {
  forma_pagamento: string;
  valor: string | number;
  valor_recebido: string | number | null;
  troco: string | number;
}

export interface DadosVenda {
  idVenda: string;
  data: string;
  operador: string;
  itens: ItemVenda[];
  total: number;
  formaPagamento: string;
  pagamentos?: PagamentoCupom[];
}

export function formatarPagamentosCupom(
  dados: DadosVenda,
): string[] {
  if (!dados.pagamentos?.length) {
    return [`Pagamento: ${dados.formaPagamento}`];
  }

  let soma = 0n;
  const linhas = ["PAGAMENTOS"];

  for (const pagamento of dados.pagamentos) {
    const forma = normalizarFormaPagamento(
      pagamento.forma_pagamento,
    );

    const nome = FORMAS_PAGAMENTO.find(
      (opcao) => opcao.valor === forma,
    )?.nome ?? forma;

    const valor = lerCentavos(String(pagamento.valor));
    const troco = lerCentavos(String(pagamento.troco));

    if (valor === null || valor <= 0n || troco === null) {
      throw new Error("Dados de pagamento inválidos para o cupom.");
    }

    soma += valor;

    linhas.push(nome);
    linhas.push(`  Valor: ${formatarCentavos(valor)}`);

    if (
      forma === "DINHEIRO" &&
      pagamento.valor_recebido != null
    ) {
      const recebido = lerCentavos(
        String(pagamento.valor_recebido),
      );

      if (
        recebido === null ||
        recebido < valor ||
        recebido - valor !== troco
      ) {
        throw new Error("Recebimento ou troco inconsistente no cupom.");
      }

      linhas.push(`  Recebido: ${formatarCentavos(recebido)}`);
      linhas.push(`  Troco: ${formatarCentavos(troco)}`);
    } else if (troco !== 0n) {
      throw new Error("Troco sem recebimento em dinheiro no cupom.");
    }
  }

  if (soma !== totalEmCentavos(dados.total)) {
    throw new Error("Pagamentos diferentes do total do cupom.");
  }

  return linhas;
}

function formatarLinha(esquerda: string, direita: string, larguraMax = 48): string {
  const espacosNecessarios = larguraMax - esquerda.length - direita.length;
  if (espacosNecessarios <= 0) {
    return esquerda.substring(0, larguraMax - direita.length - 1) + ' ' + direita + '\n';
  }
  return esquerda + ' '.repeat(espacosNecessarios) + direita + '\n';
}

// Remove acentos e caracteres especiais para evitar símbolos estranhos no papel
function removerAcentos(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Alterado o padrão da porta para '/dev/ttyACM0' para o seu ambiente Linux
export async function imprimirCupomVenda(dados: DadosVenda, portaCOM: string = '/dev/ttyACM0') {
  let cupom = '';

  // Cabeçalho
  cupom += '================================================\n';
  cupom += '                 ENCANTO TOYS                   \n';
  cupom += '           Sua Loja de Brinquedos               \n';
  cupom += '================================================\n';
  cupom += `Venda: #${dados.idVenda}\n`;
  cupom += `Data: ${dados.data}\n`;
  cupom += `Operador: ${dados.operador}\n`;
  cupom += '------------------------------------------------\n';
  cupom += 'QTD  PRODUTO                      VALOR(R$)\n';
  cupom += '------------------------------------------------\n';

  // Lista de Itens
  dados.itens.forEach((item) => {
    const totalItem = (item.qtd * item.precoUnitario).toFixed(2);
    const descItem = `${item.qtd}x ${item.nome}`;
    cupom += formatarLinha(descItem, `R$ ${totalItem}`);
  });

  // Totais
  cupom += '------------------------------------------------\n';
  cupom += formatarLinha('TOTAL:', `R$ ${dados.total.toFixed(2)}`);
  cupom += formatarPagamentosCupom(dados).join("\n") + "\n";
  cupom += '================================================\n';
  cupom += '          Obrigado pela preferencia!           \n';
  cupom += '            www.encantotoys.com.br              \n\n';

  // Trata acentuações antes de enviar
  cupom = removerAcentos(cupom);

  try {
    const resposta = await invoke<string>('imprimir_cupom_bematech', {
      porta: portaCOM,
      conteudo: cupom,
    });
    return { sucesso: true, mensagem: resposta };
  } catch (error) {
    console.error('Erro na impressão:', error);
    return { sucesso: false, mensagem: error as string };
  }
}