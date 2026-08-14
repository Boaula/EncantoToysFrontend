import { useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { pdvService, VendaPayload, fiscalService } from "../../services/api";
import { imprimirCupomVenda, DadosVenda } from "../../services/printerService";
import { validarCPF } from "../../services/validators";

import { VendaCheckout, TipoAjuste } from "../../models/VendaCheckout";
import { PainelDescontoAcrescimo } from "../components/pdv/PainelDescontoAcrescimo";
import { CampoCpf } from "../components/pdv/CampoCpf";
import { ModalDanfePdf } from "../components/pdv/ModalDanfePdf";

export function CheckoutPDV() {
  const location = useLocation();
  const navigate = useNavigate();

  // Dados recebidos via Navegação
  const stateData = location.state || {};
  const paymentMethod = stateData.paymentMethod || stateData.formaPagamento || "DINHEIRO";
  const operadorAtual = localStorage.getItem("@EncantoToys:username") || "Caixa 01";
  const valorPago = stateData.valorPago || 0;
  const troco = stateData.troco || 0;

  // 🟢 Instância da Classe Orientada a Objetos para Gestão dos Itens e Valores
  const venda = useMemo(() => new VendaCheckout(stateData.cart || stateData.carrinho || []), [stateData]);

  // Estados de Desconto e Acréscimo
  const [descontoVal, setDescontoVal] = useState(0);
  const [descontoTipo, setDescontoTipo] = useState<TipoAjuste>("R$");
  const [acrescimoVal, setAcrescimoVal] = useState(0);
  const [acrescimoTipo, setAcrescimoTipo] = useState<TipoAjuste>("R$");

  // Estados de Interface e Processamento
  const [cpfCliente, setCpfCliente] = useState("");
  const [erroCpf, setErroCpf] = useState("");
  const [salvandoVenda, setSalvandoVenda] = useState(false);
  const [imprimindo, setImprimindo] = useState(false);
  const [emitindoNfce, setEmitindoNfce] = useState(false);
  
  // Estados do Modal Pós-Venda
  const [modalAberto, setModalAberto] = useState(false);
  const [dadosVendaFinal, setDadosVendaFinal] = useState<DadosVenda | null>(null);
  const [vendaIdReal, setVendaIdReal] = useState<number | null>(null);
  const [urlDanfeModal, setUrlDanfeModal] = useState<string | null>(null);

  // Aplica alterações nos cálculos do modelo OO
  venda.setDesconto(descontoVal, descontoTipo);
  venda.setAcrescimo(acrescimoVal, acrescimoTipo);

  // --- HANDLERS DA APLICAÇÃO ---

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (erroCpf) setErroCpf("");
    let value = e.target.value.replace(/\D/g, "").slice(0, 14);

    if (value.length <= 11) {
      value = value.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    } else {
      value = value.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
    }
    setCpfCliente(value);
  };

  const handleFinalizarVenda = async () => {
    setErroCpf("");

    if (cpfCliente.trim() !== "") {
      const docLimpo = cpfCliente.replace(/\D/g, "");
      if (docLimpo.length === 11 && !validarCPF(docLimpo)) {
        setErroCpf("CPF inválido. Verifique os números digitados.");
        return;
      } else if (docLimpo.length !== 11 && docLimpo.length !== 14) {
        setErroCpf("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.");
        return;
      }
    }

    setSalvandoVenda(true);

    try {
      const caixaIdLocal = Number(localStorage.getItem("@EncantoToys:caixa_id")) || 1;
      
      // 🟢 Payload unificado direto da classe de modelo
      const payloadVenda = venda.toPayloadCompleto(
        caixaIdLocal,
        1, // usuario_id
        String(paymentMethod),
        cpfCliente
      );

      // 🟢 AQUI: Adicionado "as any" para destravar a validação do TypeScript
      const resposta = await pdvService.registrarVenda(payloadVenda as any);
      const idVendaReal = resposta.venda_id || resposta.id;

      setVendaIdReal(Number(idVendaReal));

      // 🟢 Dispara o evento exato com a estrutura que o CardHistoricoFlutuante lê
      window.dispatchEvent(
        new CustomEvent("venda-realizada", {
          detail: {
            venda: {
              total: venda.getTotalFinal(),
              qtdVendas: 1,
            },
          },
        })
      );

      setDadosVendaFinal({
        idVenda: idVendaReal.toString(),
        data: new Date().toLocaleString("pt-BR", { timeZone: "America/Cuiaba" }),
        operador: operadorAtual,
        itens: venda.getItens().map((i) => ({ nome: i.nome, qtd: i.quantidade, precoUnitario: i.precoUnitario })),
        total: venda.getTotalFinal(),
        formaPagamento: paymentMethod,
      });

      setModalAberto(true);
    } catch (error: any) {
      alert(`Erro ao finalizar venda:\n${error.message || "Erro de comunicação."}`);
    } finally {
      setSalvandoVenda(false);
    }
  };

  const handleEmitirNfce = async () => {
    if (!vendaIdReal) return;
    setEmitindoNfce(true);

    try {
      const resultado = await fiscalService.emitirNfce(vendaIdReal, cpfCliente.trim() || undefined);
      if (!resultado.sucesso || !resultado.caminho_danfe) {
        throw new Error(resultado.mensagem || "A SEFAZ não autorizou a nota fiscal.");
      }

      const BASE_FOCUS = "https://homologacao.focusnfe.com.br";
      const urlDanfePdf = resultado.caminho_danfe.startsWith("http")
        ? resultado.caminho_danfe
        : `${BASE_FOCUS}${resultado.caminho_danfe}`;

      const portaImpressora = localStorage.getItem("@EncantoToys:printer_port") || "/dev/ttyACM0";
      let impressaoComSucesso = false;

      try {
        if (dadosVendaFinal) {
          const resultadoImpressao = await imprimirCupomVenda(dadosVendaFinal, portaImpressora);
          impressaoComSucesso = Boolean(resultadoImpressao?.sucesso);
        }
      } catch (err) {
        impressaoComSucesso = false;
      }

      if (!impressaoComSucesso) {
        setUrlDanfeModal(urlDanfePdf);
        return;
      }

      alert(`✅ NFC-e Autorizada e impressa com sucesso!`);
      setModalAberto(false);
      navigate("/pdv");
    } catch (err: any) {
      alert(`❌ Falha ao emitir NFC-e:\n\n${err.message || "Erro de comunicação com a SEFAZ."}`);
    } finally {
      setEmitindoNfce(false);
    }
  };

  const handleBaixarEConcluir = async () => {
    if (!urlDanfeModal) return;
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(urlDanfeModal);
    } catch {
      window.open(urlDanfeModal, "_blank");
    } finally {
      setUrlDanfeModal(null);
      setModalAberto(false);
      navigate("/pdv");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-100 via-sky-50 to-orange-100 p-4 md:p-8 flex items-center justify-center">
      <div className="w-full max-w-2xl bg-gray-400 rounded-3xl border-4 border-orange-400 shadow-2xl overflow-hidden">
        {/* CABEÇALHO */}
        <div className="bg-cyan-400 p-5 px-6 flex items-center justify-between border-b-4 border-cyan-500">
          <div>
            <span className="text-[11px] uppercase font-black text-amber-950 bg-amber-300/90 px-2.5 py-0.5 rounded-md inline-block">
              ★ ENCANTO TOYS
            </span>
            <h1 className="text-xl font-black text-slate-900 mt-1">Confirmação de Venda</h1>
          </div>
          <div className="text-right">
            <span className="text-xs font-black text-cyan-950 bg-white/90 px-3 py-1 rounded-full shadow-xs">
              👤 {operadorAtual}
            </span>
          </div>
        </div>

        <div className="p-6 md:p-8 space-y-5">
          {/* PAINEL DE TOTAL FINAL */}
          <div className="bg-white rounded-2xl p-6 text-center shadow-xl border-2 border-cyan-400 space-y-2">
            <span className="text-xs font-black uppercase text-slate-500 block">Valor Total a Pagar</span>
            <div className="text-5xl font-black text-slate-900 font-mono">
              {venda.getTotalFinal().toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </div>

            {/* Subdetalhamento se houver acréscimo/desconto */}
            {(venda.getValorCalculadoDesconto() > 0 || venda.getValorCalculadoAcrescimo() > 0) && (
              <div className="flex justify-center gap-4 text-xs font-bold pt-1">
                <span className="text-slate-500">Subtotal: R$ {venda.getSubtotal().toFixed(2)}</span>
                {venda.getValorCalculadoDesconto() > 0 && (
                  <span className="text-rose-600">- Desconto: R$ {venda.getValorCalculadoDesconto().toFixed(2)}</span>
                )}
                {venda.getValorCalculadoAcrescimo() > 0 && (
                  <span className="text-emerald-600">+ Acréscimo: R$ {venda.getValorCalculadoAcrescimo().toFixed(2)}</span>
                )}
              </div>
            )}
          </div>

          {/* PAINEL DE DESCONTO E ACRÉSCIMO */}
          <PainelDescontoAcrescimo
            descontoVal={descontoVal}
            descontoTipo={descontoTipo}
            acrescimoVal={acrescimoVal}
            acrescimoTipo={acrescimoTipo}
            onDescontoChange={(val, tipo) => { setDescontoVal(val); setDescontoTipo(tipo); }}
            onAcrescimoChange={(val, tipo) => { setAcrescimoVal(val); setAcrescimoTipo(tipo); }}
          />

          {/* CAMPO DE CPF / CNPJ */}
          <CampoCpf value={cpfCliente} erro={erroCpf} onChange={handleCpfChange} />

          {/* LISTA DE ITENS */}
          <div className="bg-white rounded-2xl p-4 shadow-lg space-y-2">
            <h3 className="font-extrabold text-xs uppercase text-slate-800 flex items-center gap-1.5">
              🛍️ Itens no Carrinho ({venda.getItens().length})
            </h3>
            <div className="max-h-40 overflow-y-auto divide-y divide-slate-100">
              {venda.getItens().map((item, idx) => (
                <div key={idx} className="py-2 flex justify-between text-xs">
                  <span className="font-extrabold text-slate-800">{item.quantidade}x {item.nome}</span>
                  <span className="font-black font-mono">
                    {(item.quantidade * item.precoUnitario).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* BOTÕES DE AÇÃO */}
          <div className="pt-2 flex gap-3">
            <Button onClick={() => navigate("/pdv")} disabled={salvandoVenda} className="w-1/3 bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs rounded-xl">
              ← Voltar
            </Button>
            <Button onClick={handleFinalizarVenda} disabled={salvandoVenda || venda.getItens().length === 0} className="w-2/3 bg-cyan-300 hover:bg-cyan-200 text-slate-950 font-black text-sm uppercase rounded-xl">
              {salvandoVenda ? "⏳ Gravando Venda..." : "✓ Concluir e Gravar Venda"}
            </Button>
          </div>
        </div>
      </div>

      {/* MODAIS COMPONENTIZADOS */}
      {modalAberto && dadosVendaFinal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4 border-4 border-cyan-400">
            <h2 className="text-xl font-extrabold text-slate-900 text-center">Venda #{dadosVendaFinal.idVenda} Concluída!</h2>
            <div className="flex flex-col gap-2.5">
              <Button onClick={() => navigate("/pdv")} className="w-full bg-cyan-500 text-slate-950 font-black text-xs rounded-xl">🖨️ Imprimir Cupom</Button>
              <Button onClick={handleEmitirNfce} disabled={emitindoNfce} className="w-full bg-emerald-500 text-white font-black text-xs uppercase rounded-xl">
                {emitindoNfce ? "⚙️ Processando..." : "🧾 Emitir Nota Fiscal (NFC-e)"}
              </Button>
              <Button variant="outline" onClick={() => navigate("/pdv")} className="w-full text-emerald-700 border-2 border-emerald-300 rounded-xl">🌱 Concluir sem Imprimir</Button>
            </div>
          </div>
        </div>
      )}

      <ModalDanfePdf url={urlDanfeModal} onConfirmarEFechar={handleBaixarEConcluir} />
    </div>
  );
}