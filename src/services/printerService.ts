import { invoke } from '@tauri-apps/api/core';

export interface ItemVenda {
  nome: string;
  qtd: number;
  precoUnitario: number;
}

export interface DadosVenda {
  idVenda: string;
  data: string;
  operador: string;
  itens: ItemVenda[];
  total: number;
  formaPagamento: string;
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
  cupom += formatarLinha('FORMA PAGTO:', dados.formaPagamento);
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