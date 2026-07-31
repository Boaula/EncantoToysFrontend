import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  Calendar,
  Filter,
  RefreshCw,
  Receipt,
  Printer,
  Cloud,
  CloudOff,
  ShoppingBag,
  DollarSign,
  CreditCard,
  X,
  Search,
} from "lucide-react";
import { pdvService, VendaHistorico, FiltrosHistorico } from "../../services/api";

export function HistoricoVendas() {
  const navigate = useNavigate();

  // Estados principais
  const [vendas, setVendas] = useState<VendaHistorico[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendaSelecionada, setVendaSelecionada] = useState<VendaHistorico | null>(null);
  const [modalAberto, setModalAberto] = useState(false);

  // Estados de Filtro
  const hoje = new Date().toLocaleDateString("sv"); // Formato YYYY-MM-DD
  const [dataInicio, setDataInicio] = useState(hoje);
  const [dataFim, setDataFim] = useState(hoje);
  const [formaPagamento, setFormaPagamento] = useState("");
  const [buscaTexto, setBuscaTexto] = useState("");

  // 🔄 Função para buscar histórico
  const carregarHistorico = async () => {
    try {
      setLoading(true);

      const params: FiltrosHistorico = {
        limit: 100,
      };

      if (dataInicio) params.data_inicio = `${dataInicio}T00:00:00`;
      if (dataFim) params.data_fim = `${dataFim}T23:59:59`;
      if (formaPagamento) params.forma_pagamento = formaPagamento;

      const dados = await pdvService.obterHistoricoVendas(params);
      setVendas(dados);
    } catch (error) {
      console.error("Erro ao carregar histórico de vendas:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarHistorico();
  }, []);

  // 🔍 Filtro em tempo real no cliente (por ID/UUID ou Nome do Operador)
  const vendasFiltradas = vendas.filter((v) => {
    if (!buscaTexto.trim()) return true;
    const termo = buscaTexto.toLowerCase();
    return (
      v.id.toString().includes(termo) ||
      v.uuid.toLowerCase().includes(termo) ||
      (v.nome_usuario && v.nome_usuario.toLowerCase().includes(termo))
    );
  });

  // 📊 Cálculo das Métricas Rápidas
  const totalVendido = vendasFiltradas.reduce((acc, v) => acc + Number(v.total || 0), 0);
  const totalItensVendidos = vendasFiltradas.reduce(
    (acc, v) => acc + v.itens.reduce((sum, item) => sum + item.quantidade, 0),
    0
  );
  const ticketMedio = vendasFiltradas.length > 0 ? totalVendido / vendasFiltradas.length : 0;

  // 🖨️ Ação de Reimpressão de Cupom
  const handleImprimir = (venda: VendaHistorico) => {
    // Integração simples via janela de impressão do navegador ou serviço nativo Tauri
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 md:p-6 space-y-6">
      {/* 🟢 CABEÇALHO DA PÁGINA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
            title="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Receipt className="w-6 h-6 text-primary" /> Histórico de Vendas
            </h1>
            <p className="text-xs text-slate-500">
              Consulte transações, veja detalhes e reimprima cupons fiscais.
            </p>
          </div>
        </div>

        <button
          onClick={carregarHistorico}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold rounded-xl transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar Dados
        </button>
      </div>

      {/* 📊 CARDS DE MÉTRICAS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-100/80 rounded-xl text-emerald-600">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400">TOTAL VENDIDO</p>
            <p className="text-xl font-black text-slate-800">
              R$ {totalVendido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-xl text-primary">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400">TRANSAÇÕES / ITENS</p>
            <p className="text-xl font-black text-slate-800">
              {vendasFiltradas.length} <span className="text-xs text-slate-500 font-normal">({totalItensVendidos} itens)</span>
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-100/80 rounded-xl text-amber-600">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400">TICKET MÉDIO</p>
            <p className="text-xl font-black text-slate-800">
              R$ {ticketMedio.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      {/* 🔍 BARRA DE FILTROS */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
          <Filter className="w-4 h-4 text-primary" /> FILTRAR REGISTROS
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Data Início */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-500">Data Inicial</label>
            <div className="relative">
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-primary bg-slate-50/50"
              />
              <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>

          {/* Data Fim */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-500">Data Final</label>
            <div className="relative">
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-primary bg-slate-50/50"
              />
              <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>

          {/* Forma de Pagamento */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-500">Forma de Pagamento</label>
            <select
              value={formaPagamento}
              onChange={(e) => setFormaPagamento(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-primary bg-slate-50/50"
            >
              <option value="">Todas</option>
              <option value="DINHEIRO">Dinheiro</option>
              <option value="PIX">PIX</option>
              <option value="CARTAO_CREDITO">Cartão de Crédito</option>
              <option value="CARTAO_DEBITO">Cartão de Débito</option>
            </select>
          </div>

          {/* Busca por Texto */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-500">Buscar por ID ou Operador</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Ex: 102 ou Operador..."
                value={buscaTexto}
                onChange={(e) => setBuscaTexto(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-primary bg-slate-50/50"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={carregarHistorico}
            className="px-4 py-1.5 bg-primary text-white text-xs font-semibold rounded-xl hover:bg-primary/90 transition-colors shadow-sm"
          >
            Aplicar Filtros
          </button>
        </div>
      </div>

      {/* 📋 TABELA DE VENDAS */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-primary" />
            <p className="text-xs font-medium">Carregando histórico de vendas...</p>
          </div>
        ) : vendasFiltradas.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <Receipt className="w-8 h-8 mx-auto opacity-30" />
            <p className="text-xs font-semibold">Nenhuma venda encontrada para o período selecionado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="p-3 pl-4">Venda ID</th>
                  <th className="p-3">Data / Hora</th>
                  <th className="p-3">Operador</th>
                  <th className="p-3">Pagamento</th>
                  <th className="p-3">Status Sync</th>
                  <th className="p-3">Valor Total</th>
                  <th className="p-3 text-right pr-4">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {vendasFiltradas.map((venda) => {
                  const dataFormatada = new Date(venda.data_venda).toLocaleString("pt-BR");

                  return (
                    <tr key={venda.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 pl-4 font-bold text-slate-800">#{venda.id}</td>
                      <td className="p-3">{dataFormatada}</td>
                      <td className="p-3 font-medium">{venda.nome_usuario || "Operador"}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {venda.forma_pagamento.replace("_", " ")}
                        </span>
                      </td>
                      <td className="p-3">
                        {venda.sincronizado ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            <Cloud className="w-3 h-3 text-emerald-600" /> Nuvem
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            <CloudOff className="w-3 h-3 text-amber-600" /> Local
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-black text-emerald-600">
                        R$ {Number(venda.total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right pr-4 space-x-2">
                        <button
                          onClick={() => {
                            setVendaSelecionada(venda);
                            setModalAberto(true);
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
                        >
                          Ver Detalhes
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 🔍 MODAL DE DETALHES E REIMPRESSÃO */}
      {modalAberto && vendaSelecionada && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 overflow-hidden space-y-4 p-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-800">Detalhes da Venda #{vendaSelecionada.id}</h3>
                <p className="text-xs text-slate-400">
                  {new Date(vendaSelecionada.data_venda).toLocaleString("pt-BR")}
                </p>
              </div>
              <button
                onClick={() => setModalAberto(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Dados do Caixa e Operador */}
            <div className="bg-slate-50 p-3 rounded-xl text-xs space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>Operador:</span>
                <span className="font-semibold text-slate-800">{vendaSelecionada.nome_usuario || "Caixa 01"}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Forma de Pagamento:</span>
                <span className="font-semibold text-slate-800">{vendaSelecionada.forma_pagamento}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Sincronização:</span>
                <span className="font-semibold text-slate-800">
                  {vendaSelecionada.sincronizado ? "Sincronizado na Nuvem" : "Pendente na Nuvem"}
                </span>
              </div>
            </div>

            {/* Lista de Itens */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Itens Comprados</p>
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 pr-1">
                {vendaSelecionada.itens.map((item) => (
                  <div key={item.id} className="py-2 flex justify-between text-xs">
                    <div>
                      <p className="font-semibold text-slate-800">{item.nome_produto}</p>
                      <p className="text-slate-400 text-[11px]">
                        {item.quantidade}x R$ {item.preco_estatico.toFixed(2)}
                      </p>
                    </div>
                    <p className="font-bold text-slate-700">R$ {item.subtotal.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Total e Botões */}
            <div className="border-t border-slate-100 pt-3 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-slate-600">VALOR TOTAL</span>
                <span className="text-lg font-black text-emerald-600">
                  R$ {Number(vendaSelecionada.total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setModalAberto(false)}
                  className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Fechar
                </button>
                <button
                  onClick={() => handleImprimir(vendaSelecionada)}
                  className="flex-1 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Printer className="w-4 h-4" /> Reimprimir Cupom
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}