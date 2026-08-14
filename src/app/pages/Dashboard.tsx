import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { DollarSign, Package, ShoppingBag, TrendingUp, AlertTriangle, RefreshCw, Calendar, Filter } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { pdvService, Product, VendaHistorico } from "../../services/api";

export function Dashboard() {
  const hoje = new Date().toLocaleDateString("sv"); // Formato YYYY-MM-DD local

  // 📅 Estados de Data
  const [dataInicio, setDataInicio] = useState(hoje);
  const [dataFim, setDataFim] = useState(hoje);

  const [loading, setLoading] = useState(true);
  const [vendas, setVendas] = useState<VendaHistorico[]>([]);
  const [produtos, setProdutos] = useState<Product[]>([]);

  // 🔄 Carrega as vendas do período e a lista de produtos
  const carregarDadosDashboard = async () => {
    try {
      setLoading(true);

      const [vendasRes, produtosRes] = await Promise.all([
        pdvService.obterHistoricoVendas({
          data_inicio: `${dataInicio}T00:00:00`,
          data_fim: `${dataFim}T23:59:59`,
          limit: 100,
        }),
        pdvService.buscarProdutos(""),
      ]);

      setVendas(vendasRes || []);
      setProdutos(produtosRes || []);
    } catch (error) {
      console.error("Erro ao carregar dados do Dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDadosDashboard();

    const handleVendaRealizada = () => carregarDadosDashboard();
    window.addEventListener("venda-realizada", handleVendaRealizada);

    return () => {
      window.removeEventListener("venda-realizada", handleVendaRealizada);
    };
  }, [dataInicio, dataFim]); // Recarrega ao alterar as datas

  // ⏱️ Atalhos Rápidos de Filtro
  const aplicarAtalhosData = (tipo: "hoje" | "7dias" | "30dias" | "mes") => {
    const hojeObj = new Date();
    const isoHoje = hojeObj.toLocaleDateString("sv");

    if (tipo === "hoje") {
      setDataInicio(isoHoje);
      setDataFim(isoHoje);
    } else if (tipo === "7dias") {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      setDataInicio(d.toLocaleDateString("sv"));
      setDataFim(isoHoje);
    } else if (tipo === "30dias") {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      setDataInicio(d.toLocaleDateString("sv"));
      setDataFim(isoHoje);
    } else if (tipo === "mes") {
      const primeiroDia = new Date(hojeObj.getFullYear(), hojeObj.getMonth(), 1);
      setDataInicio(primeiroDia.toLocaleDateString("sv"));
      setDataFim(isoHoje);
    }
  };

  // 📊 1. CÁLCULO DOS CARDS DE KPI
  const periodTotal = vendas.reduce((acc, v) => acc + Number(v.total || 0), 0);
  const periodTransactions = vendas.length;
  const periodItems = vendas.reduce(
    (acc, v) => acc + (v.itens?.reduce((sum, item) => sum + Number(item.quantidade || 0), 0) || 0),
    0
  );
  const ticketMedio = periodTransactions > 0 ? periodTotal / periodTransactions : 0;

  // 📦 2. PRODUTOS COM ESTOQUE CRÍTICO (<= 10 unidades)
  const lowStockProducts = produtos.filter((p) => p.stock <= 5);

  // 📈 3. GRÁFICO INTELIGENTE: VENDAS POR HORA OU POR DATA
  const isSingleDay = dataInicio === dataFim;

  const timelineData = vendas
    .reduce((acc, sale) => {
      const dateObj = new Date(sale.data_venda);
      const label = isSingleDay
        ? `${dateObj.getHours()}h`
        : dateObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

      const existing = acc.find((item) => item.label === label);
      if (existing) {
        existing.total += Number(sale.total || 0);
        existing.count += 1;
      } else {
        acc.push({
          label,
          total: Number(sale.total || 0),
          count: 1,
          sortKey: isSingleDay ? dateObj.getHours() : dateObj.getTime(),
        });
      }
      return acc;
    }, [] as { label: string; total: number; count: number; sortKey: number }[])
    .sort((a, b) => a.sortKey - b.sortKey);

  // 💳 4. GRÁFICO: FORMAS DE PAGAMENTO
  const formatarNomePagamento = (metodo: string) => {
    if (!metodo) return "Outros";

    // 🧼 Limpa o prefixo "FormaPagamento." vindo do backend Python
    const chaveLimpa = String(metodo).replace("FormaPagamento.", "").toUpperCase();

    const mapa: Record<string, string> = {
      DINHEIRO: "Dinheiro",
      PIX: "PIX",
      CARTAO_CREDITO: "Cartão Crédito",
      CARTAO_DEBITO: "Cartão Débito",
      CREDITO: "Cartão Crédito",
      DEBITO: "Cartão Débito",
    };

    return mapa[chaveLimpa] || chaveLimpa;
  };

  const paymentMethods = vendas.reduce((acc, sale) => {
    const nomeFormatado = formatarNomePagamento(sale.forma_pagamento);
    const existing = acc.find((item) => item.method === nomeFormatado);
    if (existing) {
      existing.count += 1;
      existing.total += Number(sale.total || 0);
    } else {
      acc.push({ method: nomeFormatado, count: 1, total: Number(sale.total || 0) });
    }
    return acc;
  }, [] as { method: string; count: number; total: number }[]);

  return (
    <div className="p-8 space-y-6">
      {/* CABEÇALHO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Análise de desempenho do negócio e estoque</p>
        </div>

        <button
          onClick={carregarDadosDashboard}
          disabled={loading}
          className="self-start md:self-auto flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors bg-white shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-primary ${loading ? "animate-spin" : ""}`} /> Atualizar Dados
        </button>
      </div>

      {/* 🔍 BARRA DE FILTROS DE DATA */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <Filter className="w-4 h-4 text-primary" />
            PERÍODO:
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-primary bg-slate-50/50"
              />
              <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
            <span className="text-xs text-slate-400">até</span>
            <div className="relative">
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-primary bg-slate-50/50"
              />
              <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>
        </div>

        {/* ATALHOS RÁPIDOS */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => aplicarAtalhosData("hoje")}
            className={`px-3 py-1 text-xs font-semibold rounded-xl transition-colors ${
              dataInicio === hoje && dataFim === hoje
                ? "bg-primary text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Hoje
          </button>
          <button
            onClick={() => aplicarAtalhosData("7dias")}
            className="px-3 py-1 text-xs font-semibold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          >
            Últimos 7 dias
          </button>
          <button
            onClick={() => aplicarAtalhosData("30dias")}
            className="px-3 py-1 text-xs font-semibold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          >
            Últimos 30 dias
          </button>
          <button
            onClick={() => aplicarAtalhosData("mes")}
            className="px-3 py-1 text-xs font-semibold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          >
            Este Mês
          </button>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Faturamento Total</CardTitle>
            <DollarSign className="w-5 h-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              R$ {periodTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {periodTransactions} {periodTransactions === 1 ? "transação realizada" : "transações realizadas"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Itens Vendidos</CardTitle>
            <ShoppingBag className="w-5 h-5 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{periodItems}</div>
            <p className="text-xs text-muted-foreground mt-1">Produtos saídos no período</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
            <TrendingUp className="w-5 h-5 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">
              R$ {ticketMedio.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Média por transação</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Estoque Crítico</CardTitle>
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{lowStockProducts.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Produtos com 5 ou menos un.</p>
          </CardContent>
        </Card>
      </div>

      {/* CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Desempenho */}
        <Card>
          <CardHeader>
            <CardTitle>{isSingleDay ? "Vendas por Hora" : "Evolução do Faturamento"}</CardTitle>
            <CardDescription>
              {isSingleDay ? "Faturamento ao longo do dia" : "Faturamento agrupado por data"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[250px] flex items-center justify-center text-xs text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mr-2 text-primary" /> Carregando gráfico...
              </div>
            ) : timelineData.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-xs text-slate-400">
                Nenhuma venda encontrada no período selecionado.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" />
                  <Tooltip
                    formatter={(value: number) => [`R$ ${Number(value).toFixed(2)}`, "Total"]}
                    contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px" }}
                  />
                  <Line type="monotone" dataKey="total" stroke="#FF6B35" strokeWidth={3} dot={{ fill: "#FF6B35", r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Gráfico de Formas de Pagamento */}
        <Card>
          <CardHeader>
            <CardTitle>Formas de Pagamento</CardTitle>
            <CardDescription>Distribuição de métodos no período</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[250px] flex items-center justify-center text-xs text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mr-2 text-primary" /> Carregando gráfico...
              </div>
            ) : paymentMethods.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-xs text-slate-400">
                Nenhuma venda encontrada no período selecionado.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={paymentMethods}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="method" 
                          stroke="#6b7280" 
                          tick={{ fontSize: 10 }}/>
                  <YAxis stroke="#6b7280" />
                  <Tooltip
                    formatter={(value: number) => [`${value} vendas`, "Quantidade"]}
                    contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px" }}
                  />
                  <Bar dataKey="count" fill="#00C9A7" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ESTOQUE CRÍTICO */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Produtos com Estoque Crítico
          </CardTitle>
          <CardDescription>Produtos cadastrados que possuem 5 unidades ou menos</CardDescription>
        </CardHeader>
        <CardContent>
          {lowStockProducts.length === 0 ? (
            <p className="text-xs text-emerald-600 font-medium text-center py-6">
              Todos os produtos cadastrados estão com estoque saudável!
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Estoque Atual</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStockProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium text-slate-800">{product.name}</TableCell>
                    <TableCell className="text-muted-foreground">{product.category || "Geral"}</TableCell>
                    <TableCell className="text-right font-medium">{product.stock} un</TableCell>
                    <TableCell className="text-right font-semibold">
                      R$ {Number(product.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={product.stock <= 5 ? "destructive" : "secondary"}>
                        {product.stock <= 5 ? "Crítico" : "Baixo"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}