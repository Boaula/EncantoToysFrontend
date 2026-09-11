import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { LogoEncantoAnimada } from "../components/LogoEncantoAnimada";
import { authService, pdvService, Product, VendaHistorico } from "../../services/api";
import { invoke } from "@tauri-apps/api/core";
import {
  Eye,
  EyeOff,
  LogIn,
  TrendingUp,
  Package,
  ShoppingCart,
  AlertTriangle,
  Clock,
  BarChart2,
  RefreshCw,
  User,
  Lock,
} from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";

/* ── tokens for the orange login panel ── */
const P = {
  bg: "var(--card)",
  cardBorder: "var(--border)",
  heading: "var(--foreground)",
  label: "var(--foreground)",
  muted: "var(--muted-foreground)",
  inputBg: "var(--input-background)",
  inputBorder: "var(--border)",
  inputFocus: "var(--primary)",
  footerBorder: "var(--border)",
};

export function Home() {
  const navigate = useNavigate();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const loginRef = useRef<HTMLInputElement>(null);

  // 📊 Estados do Preview do Dashboard
  const [vendas, setVendas] = useState<VendaHistorico[]>([]);
  const [produtos, setProdutos] = useState<Product[]>([]);
  const [loadingDash, setLoadingDash] = useState(true);

  // 🔄 Carrega dados reais do Dashboard para o dia atual
  const carregarDadosDashboard = async () => {
    try {
      setLoadingDash(true);
      const hojeIso = new Date().toLocaleDateString("sv"); // Formato YYYY-MM-DD local

      const [vendasRes, produtosRes] = await Promise.all([
        pdvService.obterHistoricoVendas({
          data_inicio: `${hojeIso}T00:00:00`,
          data_fim: `${hojeIso}T23:59:59`,
          limit: 100,
        }),
        pdvService.buscarProdutos(""),
      ]);

      setVendas(vendasRes || []);
      setProdutos(produtosRes || []);
    } catch (err) {
      console.error("Erro ao carregar dados da Home:", err);
    } finally {
      setLoadingDash(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("@EncantoToys:token");
    if (token) {
      navigate("/pdv");
    }
    loginRef.current?.focus();

    // Busca os dados do dashboard em tempo real
    carregarDadosDashboard();
  }, [navigate]);

  // 🔐 Envio Real para o Backend FastAPI
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login || !password) return;

    setError("");
    setLoading(true);

    try {
      const dados = await authService.login(login.trim(), password);

        localStorage.setItem("@EncantoToys:token", dados.access_token);
        localStorage.setItem("@EncantoToys:cargo", dados.cargo);
        localStorage.setItem("@EncantoToys:username", login.trim().toLowerCase());
        localStorage.setItem("@EncantoToys:usuario_id", String(dados.usuario_id));

      try {
        let nomeDaMaquina = "MAQUINA_DESCONHECIDA";

        if ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__) {
          nomeDaMaquina = await invoke<string>("plugin:os|hostname");
        } else {
          nomeDaMaquina = "MHS_WEB";
        }

        await pdvService.iniciarOperacao(nomeDaMaquina, login.trim().toLowerCase());
      } catch (err) {
        console.warn("Não foi possível iniciar o caixa automaticamente, mas o login ocorreu.", err);
      }

      navigate("/pdv");
    } catch (err: any) {
      setError(err.message || "Erro ao conectar com o servidor.");
      setLoading(false);
    }
  };

  const now = new Date();
  const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  // 🧼 Helper para limpar "FormaPagamento.PIX" -> "PIX"
  const formatarNomePagamento = (metodo: string) => {
    if (!metodo) return "Outros";
    const chave = String(metodo).replace("FormaPagamento.", "").toUpperCase();
    const mapa: Record<string, string> = {
      DINHEIRO: "Dinheiro",
      PIX: "PIX",
      CARTAO_CREDITO: "Cartão Crédito",
      CARTAO_DEBITO: "Cartão Débito",
      CREDITO: "Cartão Crédito",
      DEBITO: "Cartão Débito",
    };
    return mapa[chave] || chave;
  };

  // 🧮 CÁLCULOS DINÂMICOS COM OS DADOS DO BANCO REAL
  const todayTotal = vendas.reduce((acc, v) => acc + Number(v.total || 0), 0);
  const todayItems = vendas.reduce(
    (acc, v) => acc + (v.itens?.reduce((sum, item) => sum + Number(item.quantidade || 0), 0) || 0),
    0
  );
  const lowStockProducts = produtos.filter((p) => p.stock <= 10);
  const lowStockList = lowStockProducts.slice(0, 4);

  // 📈 Dados do Gráfico de Área (Agrupados por hora)
  const chartData = vendas
    .reduce((acc, sale) => {
      const dateObj = new Date(sale.data_venda);
      const hora = `${dateObj.getHours()}h`;
      const existing = acc.find((item) => item.hora === hora);
      if (existing) {
        existing.valor += Number(sale.total || 0);
      } else {
        acc.push({ hora, valor: Number(sale.total || 0), sortKey: dateObj.getHours() });
      }
      return acc;
    }, [] as { hora: string; valor: number; sortKey: number }[])
    .sort((a, b) => a.sortKey - b.sortKey);

  // 🛒 Últimas Vendas (Máximo 4)
  const ultimasVendas = [...vendas].reverse().slice(0, 4);

  return (
    <div className="min-h-screen flex overflow-hidden" style={{ background: "#f0f0f4" }}>
      {/* ══ LEFT: Login Panel ════════════ */}
{/* ══ LEFT: Login Panel ══════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.45 }}
        style={{
          background: P.bg,
          borderColor: P.cardBorder
        }}
      >
        {/* Linha decorativa no topo com as cores da marca */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#FF6B35] via-[#FFB84D] to-[#00C9A7]" />

        <div className="flex flex-col flex-1 px-10 py-10 justify-center">
          {/* Badge da Marca / Logo */}
          <div className="flex items-center gap-3.5 mb-10">
            <LogoEncantoAnimada largura={200} />

            <div>
              <p
                className="text-lg font-black tracking-tight leading-none"
                style={{ color: P.heading }}
              >
                Encanto Toys
              </p>

              <p
                className="text-xs font-semibold mt-1 tracking-wide uppercase opacity-75"
                style={{ color: P.muted }}
              >
                Sistema de PDV
              </p>
            </div>
          </div>

          {/* Cabeçalho de Boas-Vindas */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.06 }}
            className="mb-8"
          >
            <h1 className="text-3xl font-extrabold tracking-tight leading-tight mb-2" style={{ color: P.heading }}>
              Olá, bem-vindo!
            </h1>
            <p className="text-sm font-medium" style={{ color: P.muted }}>
              Identifique-se para acessar o caixa.
            </p>
          </motion.div>

          {/* Form de Login */}
          <motion.form
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.12 }}
            onSubmit={handleSubmit}
            className="flex flex-col gap-5"
          >
            {/* Campo Usuário */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider" style={{ color: P.label }}>
                Usuário
              </label>
              <div className="relative flex items-center">
                <User className="w-4 h-4 absolute left-3.5 pointer-events-none transition-colors" style={{ color: P.muted }} />
                <input
                  ref={loginRef}
                  type="text"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="Ex: jessica"
                  autoComplete="username"
                  className="w-full rounded-xl pl-10 pr-4 py-3 text-sm font-medium outline-none transition-all shadow-sm placeholder:text-neutral-400"
                  style={{
                    background: P.inputBg,
                    border: `1.5px solid ${P.inputBorder}`,
                    color: P.heading,
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = P.inputFocus;
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(255, 107, 53, 0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = P.inputBorder;
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
            </div>

            {/* Campo Senha */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider" style={{ color: P.label }}>
                Senha
              </label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 absolute left-3.5 pointer-events-none transition-colors" style={{ color: P.muted }} />
                <input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full rounded-xl pl-10 pr-11 py-3 text-sm font-medium outline-none transition-all shadow-sm placeholder:text-neutral-400"
                  style={{
                    background: P.inputBg,
                    border: `1.5px solid ${P.inputBorder}`,
                    color: P.heading,
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = P.inputFocus;
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(255, 107, 53, 0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = P.inputBorder;
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3.5 hover:opacity-80 transition"
                  style={{ color: P.muted }}
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Mensagem de Erro */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold flex items-center gap-2 text-red-700"
              >
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-600" />
                <span>{error}</span>
              </motion.div>
            )}

            {/* Botão Entrar */}
            <button
              type="submit"
              disabled={loading || !login || !password}
              className="mt-2 w-full rounded-xl font-bold py-3.5 flex items-center justify-center gap-2 text-white 
                shadow-lg shadow-orange-500/20 transition-all hover:shadow-orange-500/30 hover:-translate-y-0.5 
                active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 
                disabled:shadow-none bg-primary hover:bg-primary/90"
            >
              {loading ? (
                <span className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Entrar no Sistema</span>
                </>
              )}
            </button>
          </motion.form>
        </div>

        {/* Rodapé com Horário e Versão */}
        <div
          className="px-10 py-4 flex items-center justify-between text-[11px] font-medium"
          style={{ borderTop: `1px solid ${P.footerBorder}`, color: P.muted }}
        >
          <span className="bg-white/60 px-2 py-0.5 rounded-md border border-amber-900/5">PDV v1.0</span>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span className="font-mono font-bold">{timeStr}</span>
            <span className="mx-0.5 opacity-40">·</span>
            <span className="capitalize">{dateStr}</span>
          </div>
        </div>
      </motion.div>
      {/* ══ RIGHT: Dashboard Preview ════════════════════════════ */}
      <div className="flex flex-1 flex-col p-8 gap-5 overflow-auto">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.18 }}
          className="flex items-center justify-between text-muted-foreground"
        >
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold capitalize text-slate-700">Resumo do dia — {dateStr}</span>
          </div>

          {loadingDash && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Atualizando...
            </div>
          )}
        </motion.div>

        {/* CARDS DE KPI */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.22 }}
          className="grid grid-cols-3 gap-4"
        >
          {[
            {
              label: "Faturamento",
              value: `R$ ${todayTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
              icon: TrendingUp,
              color: "bg-[#FF6B35]",
            },
            {
              label: "Itens vendidos",
              value: todayItems.toString(),
              icon: ShoppingCart,
              color: "bg-[#00C9A7]",
            },
            {
              label: "Estoque precisando atenção",
              value: lowStockProducts.length.toString(),
              icon: Package,
              color: "bg-[#FFB84D]",
            },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white rounded-2xl border border-border p-5 flex flex-col gap-3 shadow-sm">
              <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-foreground leading-none">{value}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </div>
            </div>
          ))}
        </motion.div>

        {/* GRÁFICO DE AREA (Vendas por Horário) */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.28 }}
          className="bg-white rounded-2xl border border-border p-6 shadow-sm flex-shrink-0"
        >
          <p className="text-sm font-semibold text-foreground mb-4">Vendas por horário</p>
          {chartData.length === 0 ? (
            <div className="h-[150px] flex items-center justify-center text-xs text-muted-foreground">
              Nenhuma venda realizada hoje.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FF6B35" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#FF6B35" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  formatter={(v: number) => [`R$ ${Number(v).toFixed(2)}`, "Total"]}
                />
                <Area type="monotone" dataKey="valor" stroke="#FF6B35" strokeWidth={2} fill="url(#grad1)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        {/* ESTOQUE CRÍTICO */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.34 }}
          className="bg-white rounded-2xl border border-border p-6 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-[#FFB84D]" />
            <p className="text-sm font-semibold text-foreground">Estoque crítico</p>
          </div>

          {lowStockList.length === 0 ? (
            <p className="text-xs text-emerald-600 font-medium py-2">Sem produtos com estoque crítico hoje!</p>
          ) : (
            <div className="space-y-3">
              {lowStockList.map((p) => (
                <div key={p.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground leading-none">{p.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.category || "Geral"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Barra de progresso */}
                    <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          p.stock <= 5 ? "bg-red-500" : p.stock <= 7 ? "bg-[#FFB84D]" : "bg-emerald-500"
                        }`}
                        style={{ width: `${Math.min((p.stock / 15) * 100, 100)}%` }}
                      />
                    </div>

                    {/* Texto com a cor referente ao nível do estoque */}
                    <span
                      className={`text-xs font-bold w-12 text-right ${
                        p.stock <= 5 ? "text-red-500" : p.stock <= 7 ? "text-amber-500" : "text-emerald-500"
                      }`}
                    >
                      {p.stock} un.
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* ÚLTIMAS VENDAS */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.4 }}
          className="bg-white rounded-2xl border border-border p-6 shadow-sm"
        >
          <p className="text-sm font-semibold text-foreground mb-4">Últimas vendas do dia</p>

          {ultimasVendas.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Ainda não há vendas registradas hoje.</p>
          ) : (
            <div className="space-y-2">
              {ultimasVendas.map((s) => {
                const totalItens = s.itens?.reduce((acc, item) => acc + Number(item.quantidade || 0), 0) || 0;
                const horaFormatada = new Date(s.data_venda).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <div key={s.id} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#00C9A7]/10 flex items-center justify-center">
                        <ShoppingCart className="w-4 h-4 text-[#00C9A7]" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-foreground">
                          {formatarNomePagamento(s.forma_pagamento)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {horaFormatada} · {totalItens} {totalItens === 1 ? "item" : "itens"}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-foreground">
                      R$ {Number(s.total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}