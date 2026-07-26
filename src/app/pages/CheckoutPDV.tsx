import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { imprimirCupomVenda } from "../../services/printerService";
import { Button } from "../components/ui/button";

export function CheckoutPDV() {
  const location = useLocation();
  const navigate = useNavigate();
  const [imprimindo, setImprimindo] = useState(false);

  // Pega o estado enviado pela página do PDV
  const { cart = [], total = 0, paymentMethod = "Dinheiro" } = location.state || {};

  const handleFinalizarEImprimir = async () => {
    setImprimindo(true);

    const operadorAtual = localStorage.getItem("@EncantoToys:username") || "Caixa 01";

    const dadosVenda = {
      idVenda: Math.floor(1000 + Math.random() * 9000).toString(),
      data: new Date().toLocaleString("pt-BR"),
      operador: operadorAtual,
      itens: cart.map((item: any) => ({
        nome: item.name,
        qtd: item.quantity,
        precoUnitario: item.price,
      })),
      total: total,
      formaPagamento: paymentMethod,
    };

    // Manda imprimir na Bematech MP-4200 TH
    const resultado = await imprimirCupomVenda(dadosVenda, "/dev/ttyACM0");

    if (resultado.sucesso) {
      alert("Venda concluída e cupom impresso com sucesso!");
      navigate("/pdv"); // Volta para a tela principal do PDV
    } else {
      alert(`Erro ao imprimir cupom: ${resultado.mensagem}`);
    }

    setImprimindo(false);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-primary">Checkout e Impressão</h1>

      <div className="bg-white p-6 rounded-lg border shadow-sm space-y-3">
        <p className="text-lg"><strong>Forma de Pagamento:</strong> {paymentMethod}</p>
        <p className="text-lg"><strong>Total da Venda:</strong> R$ {total.toFixed(2).replace('.', ',')}</p>
        <p className="text-sm text-muted-foreground">Itens no carrinho: {cart.length}</p>
      </div>

      <div className="flex gap-4">
        <Button 
          variant="outline" 
          onClick={() => navigate("/pdv")}
          disabled={imprimindo}
        >
          Voltar ao PDV
        </Button>

        <Button 
          size="lg" 
          className="flex-1" 
          onClick={handleFinalizarEImprimir} 
          disabled={imprimindo || cart.length === 0}
        >
          {imprimindo ? "Imprimindo Cupom..." : "Confirmar e Imprimir Cupom"}
        </Button>
      </div>
    </div>
  );
}