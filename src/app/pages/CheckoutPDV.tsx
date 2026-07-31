import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { imprimirCupomVenda, DadosVenda } from "../../services/printerService";
import { Button } from "../components/ui/button";
import { pdvService, VendaPayload } from "../../services/api";

export function CheckoutPDV() {
  const location = useLocation();
  const navigate = useNavigate();

  // Estados de controle
  const [salvandoVenda, setSalvandoVenda] = useState(false);
  const [imprimindo, setImprimindo] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [dadosVendaFinal, setDadosVendaFinal] = useState<DadosVenda | null>(null);

  // Dados recebidos da tela de PDV
  const stateData = location.state || {};
  const cart = stateData.cart || stateData.carrinho || [];
  const total = stateData.total || stateData.valorTotal || stateData.totalVenda || 0;
  const paymentMethod = stateData.paymentMethod || stateData.formaPagamento || "DINHEIRO";

  useEffect(() => {
    console.log("📦 Estado do PDV carregado:", stateData);
  }, []);

  // 1️⃣ GRAVA A VENDA NO BANCO LOCAL E MONTA A PRÉVIA DO CUPOM
  const handleFinalizarVenda = async () => {
    console.log("🔥 Botão Clicado! Iniciando salvamento...");
    setSalvandoVenda(true);

    try {
      const operadorAtual = localStorage.getItem("@EncantoToys:username") || "Caixa 01";
      const caixaIdLocal = Number(localStorage.getItem("@EncantoToys:caixa_id")) || 1;

      // Extrai e valida os itens
      const itensFormatados = cart.map((item: any) => {
        const idEncontrado = 
          item.id ?? item.produto_id ?? item.product_id ?? item.product?.id ?? item.produto?.id;

        if (!idEncontrado) {
          throw new Error(`Produto "${item.nome || item.name || 'Desconhecido'}" está sem ID.`);
        }

        return {
          produto_id: Number(idEncontrado),
          quantidade: Number(item.quantity ?? item.quantidade ?? item.qtd ?? 1),
          preco_unitario: Number(item.price ?? item.preco ?? item.preco_venda ?? item.preco_unitario ?? 0),
        };
      });

      const somaItens = itensFormatados.reduce(
        (acc, item) => acc + item.preco_unitario * item.quantidade,
        0
      );
      const valorTotalFinal = Number(total) > 0 ? Number(total) : somaItens;

      const payloadVenda: VendaPayload = {
        caixa_id: caixaIdLocal,
        usuario_id: 1,
        forma_pagamento: String(paymentMethod),
        valor_total: valorTotalFinal,
        itens: itensFormatados,
      };

      // Chama a API local
      const resposta = await pdvService.registrarVenda(payloadVenda);
      const idVendaReal = resposta.venda_id || resposta.id || Math.floor(1000 + Math.random() * 9000);

      window.dispatchEvent(new CustomEvent("venda-realizada", {
        detail: {
          venda: {
            total: valorTotalFinal,
            qtdVendas: 1,
            quantidadeItens: itensFormatados.length,
          },
        },
      }));

      const itensCupom = (resposta.itens && resposta.itens.length > 0)
        ? resposta.itens.map((item: any) => ({
            nome: item.nome_produto,
            qtd: item.quantidade,
            precoUnitario: item.preco_unitario,
          }))
        : cart.map((item: any) => ({
            nome: item.nome || item.nome_produto || item.name || "Produto",
            qtd: item.quantity || item.quantidade || 1,
            precoUnitario: item.price || item.preco || 0,
          }));

      // Prepara o objeto do cupom para a impressora e prévia na tela
      const dadosCupom: DadosVenda = {
        idVenda: idVendaReal.toString(),
        data: new Date().toLocaleString("pt-BR"),
        operador: operadorAtual,
        itens: itensCupom,
        total: resposta.total || payloadVenda.valor_total,
        formaPagamento: resposta.forma_pagamento || paymentMethod,
      };

      setDadosVendaFinal(dadosCupom);
      setModalAberto(true); // 🟢 ABRE O MODAL DE DECISÃO

    } catch (error: any) {
      console.error("Erro ao registrar venda:", error);
      alert(`Erro ao finalizar venda:\n${error.message || "Erro de comunicação."}`);
    } finally {
      setSalvandoVenda(false);
    }
  };

  // 2️⃣ DISPARA A IMPRESSÃO NA BEMATECH (CASO O CLIENTE QUEIRA O CUPOM)
  const handleAcaoImprimir = async () => {
    if (!dadosVendaFinal) return;

    setImprimindo(true);
    const portaImpressora = localStorage.getItem("@EncantoToys:printer_port") || "/dev/ttyACM0";

    try {
      const resultado = await imprimirCupomVenda(dadosVendaFinal, portaImpressora);
      if (resultado.sucesso) {
        alert("Cupom impresso com sucesso!");
      } else {
        alert(`Aviso da Impressora: ${resultado.mensagem}`);
      }
    } catch (err) {
      alert("Não foi possível conectar à impressora física.");
    } finally {
      setImprimindo(false);
      navigate("/pdv"); // Volta ao PDV após imprimir
    }
  };

  // 3️⃣ AÇÃO ECOLÓGICA: CONCLUI SEM IMPRIMIR
  const handleAcaoNaoImprimir = () => {
    navigate("/pdv"); // Apenas volta para o PDV economizando papel!
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-primary">Checkout e Pagamento</h1>

      <div className="bg-white p-6 rounded-lg border shadow-sm space-y-3">
        <p className="text-lg"><strong>Forma de Pagamento:</strong> {paymentMethod}</p>
        <p className="text-lg"><strong>Total da Venda:</strong> R$ {(Number(total) || 0).toFixed(2).replace('.', ',')}</p>
        <p className="text-sm text-muted-foreground">Itens no carrinho: {cart.length}</p>
      </div>

      <div className="flex gap-4">
        <Button 
          variant="outline" 
          onClick={() => navigate("/pdv")}
          disabled={salvandoVenda}
        >
          Voltar ao PDV
        </Button>

        <Button 
          size="lg" 
          className="flex-1" 
          onClick={handleFinalizarVenda} 
          disabled={salvandoVenda || cart.length === 0}
        >
          {salvandoVenda ? "Gravando Venda..." : "Finalizar Venda"}
        </Button>
      </div>

      {/* 🟢 MODAL DE COMPROVANTE E DECISÃO DE IMPRESSÃO */}
      {modalAberto && dadosVendaFinal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-md rounded-xl p-6 shadow-2xl space-y-4 border">
            <div className="text-center space-y-1">
              <span className="text-3xl">✅</span>
              <h2 className="text-xl font-bold text-emerald-600">Venda # {dadosVendaFinal.idVenda} Concluída!</h2>
              <p className="text-xs text-muted-foreground">Registrada com sucesso no banco de dados.</p>
            </div>

            {/* Prévia visual do cupom */}
            <div className="bg-slate-50 p-4 rounded-lg border font-mono text-xs space-y-2 max-h-48 overflow-y-auto">
              <p className="text-center font-bold">ENCANTO TOYS</p>
              <p className="text-center border-b pb-1">Data: {dadosVendaFinal.data}</p>
              {dadosVendaFinal.itens.map((item, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>{item.qtd}x {item.nome}</span>
                  <span>R$ {(item.qtd * item.precoUnitario).toFixed(2)}</span>
                </div>
              ))}
              <div className="border-t pt-1 font-bold flex justify-between">
                <span>TOTAL:</span>
                <span>R$ {dadosVendaFinal.total.toFixed(2)}</span>
              </div>
            </div>

            <p className="text-center text-sm font-medium text-slate-700">
              Deseja imprimir o cupom impresso para o cliente?
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <Button 
                onClick={handleAcaoImprimir} 
                disabled={imprimindo} 
                className="w-full bg-slate-900 hover:bg-slate-800 text-white"
              >
                {imprimindo ? "Imprimindo..." : "🖨️ Imprimir Cupom"}
              </Button>

              <Button 
                variant="outline" 
                onClick={handleAcaoNaoImprimir} 
                disabled={imprimindo} 
                className="w-full text-emerald-700 border-emerald-300 hover:bg-emerald-50"
              >
                🌱 Não Imprimir (Concluir & Economizar Papel)
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}