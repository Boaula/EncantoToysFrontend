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
import { invoke } from "@tauri-apps/api/core";

import { formatarPagamentosCupom } from "../../services/printerService";

import {
  FORMAS_PAGAMENTO,
  normalizarFormaPagamento,
} from "../../services/pagamentosVenda";

import { relatorioVendasService } from "../../services/api";
import { Button } from "../components/ui/button";
import { toast } from "sonner";

import { xmlCompraService } from "../../services/api";

import type {
  ListagemXmlsCompras,
  XmlCompraArquivado,
} from "../../services/api";

function nomeMetodoPagamento(valor: string): string {
  const texto = valor
    .replace(/^FormaPagamento\./i, "")
    .toUpperCase()
    .trim();

  if (texto === "MISTO") return "Pagamento dividido";

  try {
    const forma = normalizarFormaPagamento(texto);

    return FORMAS_PAGAMENTO.find(
      (opcao) => opcao.valor === forma,
    )?.nome ?? valor;
  } catch {
    return valor;
  }
}

function resumoPagamentos(venda: VendaHistorico): string {
  if (!venda.pagamentos?.length) {
    return nomeMetodoPagamento(venda.forma_pagamento);
  }

  return [
    ...new Set(
      venda.pagamentos.map((pagamento) =>
        nomeMetodoPagamento(pagamento.forma_pagamento),
      ),
    ),
  ].join(" + ");
}

async function salvarDocumento(
  conteudo: Blob,
  nome: string
): Promise<string> {
  const executandoNoTauri =
    "__TAURI_INTERNALS__" in window ||
    "__TAURI__" in window;

  if (executandoNoTauri) {
    const bytes = new Uint8Array(await conteudo.arrayBuffer());

    const caminho = await invoke<string>("salvar_documento", {
      nome,
      conteudo: Array.from(bytes),
    });

    return `Arquivo salvo em: ${caminho}`;
  }

  const endereco = URL.createObjectURL(conteudo);
  const link = document.createElement("a");

  link.href = endereco;
  link.download = nome;
  document.body.appendChild(link);

  try {
    link.click();
  } finally {
    link.remove();

    window.setTimeout(
      () => URL.revokeObjectURL(endereco),
      60_000
    );
  }

  return "Download solicitado ao navegador.";
}

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

  const [exportando, setExportando] =
    useState<"pdf" | "xml" | null>(null);

  const [filtrosAplicados, setFiltrosAplicados] = useState<{
    dataInicio: string;
    dataFim: string;
    formaPagamento: string;
  } | null>(null);

  const filtrosAlterados =
    !filtrosAplicados ||
    filtrosAplicados.dataInicio !== dataInicio ||
    filtrosAplicados.dataFim !== dataFim ||
    filtrosAplicados.formaPagamento !== formaPagamento;

  const podeExportar =
    localStorage.getItem("@EncantoToys:cargo")?.toUpperCase() ===
    "ADMIN";

  // 🔄 Função para buscar histórico
  const carregarHistorico = async () => {
    if (!dataInicio || !dataFim || dataFim < dataInicio) {
      toast.error("Informe um intervalo de datas válido.");
      return;
    }

    const filtrosDaConsulta = {
      dataInicio,
      dataFim,
      formaPagamento,
    };

    setLoading(true);
    setFiltrosAplicados(null);

    try {
      const params: FiltrosHistorico = {
        data_inicio: `${filtrosDaConsulta.dataInicio}T00:00:00`,
        data_fim: `${filtrosDaConsulta.dataFim}T23:59:59.999999`,
        completo: true,
      };

      if (filtrosDaConsulta.formaPagamento) {
        params.forma_pagamento =
          filtrosDaConsulta.formaPagamento;
      }

      const dados = await pdvService.obterHistoricoVendas(params);

      setVendas(dados);
      setFiltrosAplicados(filtrosDaConsulta);
    } catch (erro) {
      setVendas([]);

      toast.error(
        erro instanceof Error
          ? erro.message
          : "Erro ao carregar o histórico."
      );
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
    const termo = buscaTexto.trim().toLowerCase();
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

  const exportarRelatorio = async (formato: "pdf" | "xml") => {
    if (
      !podeExportar ||
      !filtrosAplicados ||
      filtrosAlterados ||
      loading ||
      exportando
    ) {
      return;
    }

    setExportando(formato);

    try {
      const arquivo = await relatorioVendasService.baixar(
        formato,
        {
          data_inicio: filtrosAplicados.dataInicio,
          data_fim: filtrosAplicados.dataFim,
          forma_pagamento: filtrosAplicados.formaPagamento,
          busca: buscaTexto.trim(),
        }
      );

      const mensagem = await salvarDocumento(
        arquivo.conteudo,
        arquivo.nome
      );

      toast.success(mensagem, { duration: 10_000 });
    } catch (erro: unknown) {
      toast.error(
        erro instanceof Error
          ? erro.message
          : String(erro || "Falha ao salvar o relatório.")
      );
    } finally {
      setExportando(null);
    }
  };

function XmlsComprasHistorico() {
  const [listagem, setListagem] =
    useState<ListagemXmlsCompras | null>(null);

  const [deslocamento, setDeslocamento] = useState(0);
  const [atualizacao, setAtualizacao] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [baixandoId, setBaixandoId] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    const carregar = async () => {
      setCarregando(true);
      setErro("");
      setListagem(null);

      try {
        const dados = await xmlCompraService.listar(deslocamento);

        if (ativo) setListagem(dados);
      } catch (falha: unknown) {
        if (!ativo) return;

        setErro(
          falha instanceof Error
            ? falha.message
            : "Não foi possível consultar os XMLs."
        );
      } finally {
        if (ativo) setCarregando(false);
      }
    };

    void carregar();

    return () => {
      ativo = false;
    };
  }, [deslocamento, atualizacao]);

  const baixarOriginal = async (arquivo: XmlCompraArquivado) => {
    if (baixandoId !== null) return;

    setBaixandoId(arquivo.id);

    try {
      const conteudo = await xmlCompraService.baixar(arquivo.id);

      const mensagem = await salvarDocumento(
        conteudo,
        `compra_${arquivo.id}.xml`
      );

      toast.success(mensagem, { duration: 10_000 });
    } catch (falha: unknown) {
      toast.error(
        falha instanceof Error
          ? falha.message
          : String(falha || "Não foi possível salvar o XML original.")
      );
    } finally {
      setBaixandoId(null);
    }
  };

  const formatarArquivamento = (valor: string) => {
    const data = new Date(valor);

    if (Number.isNaN(data.getTime())) return "Não informado";

    return data.toLocaleString("pt-BR", {
      timeZone: "America/Cuiaba",
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-800">
            XMLs de compras importadas
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            Baixe o arquivo original guardado neste computador.
            Os filtros de vendas acima não se aplicam a esta lista.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          disabled={carregando}
          onClick={() => setAtualizacao((valor) => valor + 1)}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${
              carregando ? "animate-spin" : ""
            }`}
          />
          Atualizar XMLs
        </Button>
      </div>

      {erro && (
        <p
          role="alert"
          className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800"
        >
          {erro}
        </p>
      )}

      {carregando ? (
        <p className="py-4 text-sm text-slate-500">
          Consultando XMLs arquivados...
        </p>
      ) : listagem && listagem.arquivos.length === 0 ? (
        <p className="py-4 text-sm text-slate-500">
          Nenhum XML encontrado nesta página.
        </p>
      ) : (
        <div className="space-y-3">
          {listagem?.arquivos.map((arquivo) => (
            <article
              key={arquivo.id}
              className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <h3 className="text-sm font-semibold text-slate-800 break-words">
                  {arquivo.fornecedor || "Fornecedor não identificado"}
                </h3>

                <p className="text-xs text-slate-600">
                  Nota: {arquivo.numero_nota || "Não informado"}
                  {" · "}
                  Itens: {arquivo.quantidade_itens ?? "Não informado"}
                </p>

                <p className="text-xs text-slate-500">
                  Arquivado em:{" "}
                  {formatarArquivamento(arquivo.arquivado_em)}
                </p>

                <p className="text-xs text-slate-400 break-all">
                  {arquivo.nome}
                </p>

                {arquivo.erro && (
                  <p className="text-xs text-amber-800">
                    Não foi possível apresentar todos os dados da nota.
                    Você ainda pode tentar baixar o original.
                  </p>
                )}
              </div>

              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={baixandoId !== null}
                aria-label={`Baixar XML original da nota ${
                  arquivo.numero_nota || arquivo.nome
                }`}
                onClick={() => void baixarOriginal(arquivo)}
              >
                {baixandoId === arquivo.id
                  ? "Baixando..."
                  : "Baixar XML original"}
              </Button>
            </article>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <p className="text-xs text-slate-500">
          {listagem
            ? `${listagem.total} XML(s) arquivado(s)`
            : "Consulta de XMLs de compras"}
        </p>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={carregando || deslocamento === 0}
            onClick={() =>
              setDeslocamento((valor) =>
                Math.max(0, valor - (listagem?.limite ?? 20))
              )
            }
          >
            Anterior
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={
              carregando ||
              !listagem ||
              deslocamento + listagem.limite >= listagem.total
            }
            onClick={() => {
              if (listagem) {
                setDeslocamento(
                  (valor) => valor + listagem.limite
                );
              }
            }}
          >
            Próxima
          </Button>
        </div>
      </div>
    </section>
  );
}

  // 🖨️ Ação de Reimpressão de Cupom
// 🖨️ Ação de Reimpressão de Cupom
const handleImprimir = async (venda: VendaHistorico) => {
  try {
    // Busca os detalhes atuais antes de reimprimir.
    venda = await pdvService.obterDetalhesVenda(venda.id);

    const linhasPagamentos = formatarPagamentosCupom({
      idVenda: String(venda.id),
      data: new Date(venda.data_venda).toLocaleString("pt-BR"),
      operador: venda.nome_usuario || "Operador",
      itens: venda.itens.map((item) => ({
        nome: item.nome_produto,
        qtd: item.quantidade,
        precoUnitario: Number(item.preco_estatico),
      })),
      total: Number(venda.total),
      formaPagamento: venda.forma_pagamento,
      pagamentos: venda.pagamentos,
    });

    let cupom = "";

    cupom += "        ENCANTO TOYS\n";
    cupom += "      REIMPRESSAO CUPOM\n";
    cupom += "--------------------------------\n";

    cupom += `Venda: #${venda.id}\n`;
    cupom += `Data: ${new Date(venda.data_venda).toLocaleString("pt-BR")}\n`;
    cupom += `Operador: ${venda.nome_usuario || "Operador"}\n`;
    cupom += `Pagamento: ${resumoPagamentos(venda)}\n`;

    cupom += "--------------------------------\n";

    for (const item of venda.itens) {
      cupom += `${item.nome_produto}\n`;
      cupom += `${item.quantidade}x R$ ${Number(item.preco_estatico).toFixed(2)}    R$ ${Number(item.subtotal).toFixed(2)}\n`;
    }

    cupom += "--------------------------------\n";

    if (venda.ajustes && venda.ajustes.length > 0) {
      for (const aj of venda.ajustes) {
        const descricao =
          aj.tipo === "DESCONTO"
            ? "Desconto"
            : "Acrescimo";

        const sinal =
          aj.tipo === "DESCONTO"
            ? "- "
            : "+ ";

        cupom += `${descricao}: ${sinal}R$ ${Number(aj.valor_aplicado).toFixed(2)}\n`;
      }

      cupom += "--------------------------------\n";
    }

    cupom += `TOTAL: R$ ${Number(venda.total).toFixed(2)}\n`;

    cupom += "--------------------------------\n";
    cupom += linhasPagamentos.join("\n") + "\n";

    cupom += "--------------------------------\n";
    cupom += "       *** REIMPRESSAO ***\n";
    cupom += "\n";

    await invoke<string>("imprimir_cupom", {
      conteudo: cupom,
    });

    console.log(`Cupom da venda #${venda.id} reimpresso com sucesso.`);

  } catch (error) {
    console.error("Erro ao reimprimir cupom:", error);
    alert(`Erro ao imprimir cupom: ${error}`);
  }
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
          disabled={loading || exportando !== null}
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
                maxLength={120}
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
            disabled={loading || exportando !== null}
            onClick={carregarHistorico}
            className="px-4 py-1.5 bg-primary text-white text-xs font-semibold rounded-xl hover:bg-primary/90 transition-colors shadow-sm"
          >
            Aplicar Filtros
          </button>
        </div>
      </div>

            {podeExportar && (
        <div className="rounded-2xl border bg-white p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold">
              Baixar relatório de vendas
            </h2>

            {filtrosAlterados ? (
              <p className="mt-1 text-xs text-amber-800">
                Clique em Aplicar Filtros para atualizar a consulta
                antes de exportar.
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Período:{" "}
                {filtrosAplicados?.dataInicio
                  .split("-")
                  .reverse()
                  .join("/")}{" "}
                a{" "}
                {filtrosAplicados?.dataFim
                  .split("-")
                  .reverse()
                  .join("/")}
                . A busca por ID ou operador também será considerada.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={
                loading || filtrosAlterados || exportando !== null
              }
              onClick={() => exportarRelatorio("pdf")}
            >
              {exportando === "pdf"
                ? "Gerando PDF..."
                : "Baixar PDF"}
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={
                loading || filtrosAlterados || exportando !== null
              }
              onClick={() => exportarRelatorio("xml")}
            >
              {exportando === "xml"
                ? "Gerando XML..."
                : "Baixar XML"}
            </Button>
          </div>
        </div>
      )}

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

      {podeExportar && <XmlsComprasHistorico />}

      {/* 🔍 MODAL DE DETALHES E REIMPRESSÃO */}
      {modalAberto && vendaSelecionada && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto space-y-4 p-5 animate-in fade-in zoom-in-95 duration-150">
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
                <span className="font-semibold text-slate-800">{resumoPagamentos(vendaSelecionada)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Sincronização:</span>
                <span className="font-semibold text-slate-800">
                  {vendaSelecionada.sincronizado ? "Sincronizado na Nuvem" : "Pendente na Nuvem"}
                </span>
              </div>
            </div>

            {Boolean(vendaSelecionada.pagamentos?.length) && (
              <div className="rounded-xl border p-3 space-y-3">
                <h4 className="text-xs font-bold uppercase text-slate-600">
                  Pagamentos
                </h4>

                {vendaSelecionada.pagamentos?.map((pagamento, indice) => (
                  <div
                    key={`${pagamento.uuid ?? "legado"}-${indice}`}
                    className="text-sm space-y-1"
                  >
                    <div className="flex justify-between gap-3">
                      <span>
                        {nomeMetodoPagamento(pagamento.forma_pagamento)}
                      </span>

                      <strong>
                        {Number(pagamento.valor).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </strong>
                    </div>

                    {pagamento.valor_recebido != null && (
                      <div className="text-xs text-slate-500 space-y-1">
                        <p>
                          Recebido:{" "}
                          {Number(pagamento.valor_recebido).toLocaleString(
                            "pt-BR",
                            { style: "currency", currency: "BRL" },
                          )}
                        </p>

                        <p>
                          Troco:{" "}
                          {Number(pagamento.troco).toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}            

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
              
              {/* 🟢 NOVO: EXIBIÇÃO DOS AJUSTES FINANCEIROS (DESCONTO / ACRÉSCIMO) */}
              {vendaSelecionada.ajustes && vendaSelecionada.ajustes.length > 0 && (
                <div className="bg-slate-50 p-2.5 rounded-xl space-y-1.5 text-xs">
                  {vendaSelecionada.ajustes.map((aj) => (
                    <div key={aj.id} className="flex justify-between items-center">
                      <span className="text-slate-600 font-medium flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            aj.tipo === "DESCONTO" ? "bg-red-500" : "bg-emerald-500"
                          }`}
                        />
                        {aj.tipo === "DESCONTO" ? "Desconto Aplicado" : "Acréscimo Aplicado"}
                        <span className="text-[10px] text-slate-400 font-normal">
                          ({aj.forma_calculo === "%" ? `${aj.valor_informado}%` : "Valor Fixo"})
                        </span>
                      </span>
                      <span
                        className={`font-bold ${
                          aj.tipo === "DESCONTO" ? "text-red-600" : "text-emerald-600"
                        }`}
                      >
                        {aj.tipo === "DESCONTO" ? "- " : "+ "}
                        R$ {Number(aj.valor_aplicado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
              )}

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