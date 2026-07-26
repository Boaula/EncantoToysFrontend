import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import logoEncanto from "../../assets/EncantoToys.png";
import { authService, pdvService } from "../../services/api";
import { invoke } from "@tauri-apps/api/core";
import {
  Sparkles,
  Eye,
  EyeOff,
  LogIn,
  TrendingUp,
  Package,
  ShoppingCart,
  AlertTriangle,
  Clock,
  BarChart2,
} from "lucide-react";
import {
  getTodayTotal,
  getTodayItemsCount,
  getLowStockProducts,
  todaySales,
} from "../data/mockData";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";

const chartData = todaySales.map((s) => ({
  hora: new Date(s.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  valor: s.total,
}));

const lowStock    = getLowStockProducts().slice(0, 4);
const todayTotal  = getTodayTotal();
const todayItems  = getTodayItemsCount();

/* ── tokens for the orange login panel ── */
const P = {
  bg:          "#FFCC9F",
  heading:     "#4A2C10",
  label:       "#4A2C10",
  muted:       "#333333",
  inputBg:     "rgba(255,255,255,0.15)",
  inputBorder: "#333333",
  inputFocus:  "rgba(255,255,255,0.85)",
  btnBg:       "#FFFFFF",
  btnHover:    "#FFF0E8",
  footerBorder:"rgba(255,255,255,0.20)",
};

export function Home() {
  const navigate = useNavigate();
  const [login, setLogin]       = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const loginRef = useRef<HTMLInputElement>(null);

  // Se o usuário já tiver um token válido guardado, redireciona direto
  useEffect(() => {
    const token = localStorage.getItem("@EncantoToys:token");
    if (token) {
      navigate("/pdv");
    }
    loginRef.current?.focus();
  }, [navigate]);

  // 🔐 Envio Real para o Backend FastAPI
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login || !password) return;

    setError("");
    setLoading(true);

    try {
      // 1. Faz a chamada HTTP real para o endpoint /login
      const dados = await authService.login(login.trim(), password);
      
      // 2. Salva os dados de sessão no localStorage de forma definitiva
      localStorage.setItem("@EncantoToys:token", dados.access_token);
      localStorage.setItem("@EncantoToys:cargo", dados.cargo);
      localStorage.setItem("@EncantoToys:username", login.trim().toLowerCase());

      // 3. ABERTURA AUTOMÁTICA DO CAIXA
      try {
        let nomeDaMaquina = "MAQUINA_DESCONHECIDA";
        
        // Verifica se a propriedade global do Tauri existe na janela do app
        if ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__) {
          nomeDaMaquina = await invoke<string>("plugin:os|hostname");
        } else {
          console.warn("Ambiente Tauri não detectado (Rodando no Navegador). Usando máquina padrão MHS.");
          nomeDaMaquina = "MHS_WEB"; // Nome temporário para testes no navegador
        }
        
        await pdvService.iniciarOperacao(nomeDaMaquina, login.trim().toLowerCase());
        console.log("Caixa iniciado automaticamente para:", nomeDaMaquina);

      } catch (err) {
        console.error("Erro interno ao invocar hostname:", err);
        console.warn("Não foi possível iniciar o caixa automaticamente, mas o login ocorreu.");
      }

      // 4. Redireciona o fluxo para o PDV
      navigate("/pdv");
    } catch (err: any) {
      // 5. Captura o erro real retornado (ex: 401 do FastAPI) e renderiza na UI
      setError(err.message || "Erro ao conectar com o servidor.");
      setLoading(false);
    }
  };

  const now     = new Date();
  const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="min-h-screen flex overflow-hidden" style={{ background: "#f0f0f4" }}>

      {/* ══ LEFT: Login Panel (golden) ══════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.45 }}
        className="relative flex flex-col w-full max-w-[420px] min-h-screen shadow-2xl z-10"
        style={{ background: P.bg }}
      >
        {/* top stripe */}
        <div className="h-1 w-full bg-gradient-to-r from-[#C47A00] via-[#FF6B35] to-[#00C9A7]" />

        <div className="flex flex-col flex-1 px-10 py-10">

          {/* Logo */}
          <div className="flex items-center gap-3 mb-12">
            <div className="w-11 h-11 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center shadow-lg">
            <img 
                  src={logoEncanto} 
                  alt="Logo Encanto Toys" 
                  className="w-full h-full object-contain aspect-square" 
                />
            </div>
            <div>
              <p className="text-base font-bold leading-none" style={{ color: P.heading }}>
                Encanto Toys
              </p>
              <p className="text-xs" style={{ color: P.muted }}>Sistema de PDV</p>
            </div>
          </div>

          {/* Heading */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.06 }}
            className="mb-8"
          >
            <h1 className="text-3xl font-extrabold tracking-tight leading-tight mb-1"
                style={{ color: P.heading }}>
              Olá, bem-vindo!
            </h1>
            <p className="text-sm" style={{ color: P.muted }}>
              Identifique-se para acessar o sistema.
            </p>
          </motion.div>

          {/* Form */}
          <motion.form
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.12 }}
            onSubmit={handleSubmit}
            className="flex flex-col gap-5"
          >
            {/* Usuário */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold" style={{ color: P.label }}>Usuário</label>
              <input
                ref={loginRef}
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="Ex: jessica"
                autoComplete="username"
                className="w-full rounded-xl px-4 py-3 text-sm outline-none transition placeholder:text-black/50"
                style={{
                  background: P.inputBg,
                  border: `1.5px solid ${P.inputBorder}`,
                  color: P.heading,
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = P.inputFocus)}
                onBlur={(e)  => (e.currentTarget.style.borderColor = P.inputBorder)}
              />
            </div>

            {/* Senha */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold" style={{ color: P.label }}>Senha</label>
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full rounded-xl px-4 py-3 pr-12 text-sm outline-none transition placeholder:text-black/50"
                  style={{
                    background: P.inputBg,
                    border: `1.5px solid ${P.inputBorder}`,
                    color: P.heading,
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = P.inputFocus)}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = P.inputBorder)}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition"
                  style={{ color: P.muted }}
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Erro */}
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs font-medium flex items-center gap-1.5 text-red-700"
              >
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                {error}
              </motion.p>
            )}

            {/* Botão */}
            <button
              type="submit"
              disabled={loading || !login || !password}
              className="mt-1 w-full rounded-xl font-bold py-3 flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: P.btnBg, color: "#F05A1A" }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = P.btnHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = P.btnBg; }}
            >
              {loading ? (
                <span className="w-4 h-4 rounded-full border-2 border-[#F05A1A]/30 border-t-[#F05A1A] animate-spin" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Entrar no Sistema
                </>
              )}
            </button>
          </motion.form>
        </div>

        {/* Footer */}
        <div
          className="px-10 py-5 flex items-center justify-between text-[11px]"
          style={{ borderTop: `1px solid ${P.footerBorder}`, color: P.muted }}
        >
          <span>PDV v1.0</span>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            <span className="font-mono">{timeStr}</span>
            <span className="mx-1 opacity-40">·</span>
            <span className="capitalize">{dateStr}</span>
          </div>
        </div>
      </motion.div>

      {/* ══ RIGHT: Dashboard Preview ════════════════════════════ */}
      <div className="flex flex-1 flex-col p-8 gap-5 overflow-auto">
         {/* Toda a parte direita se mantém exatamente igual ao seu código original */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.18 }}
          className="flex items-center gap-2 text-muted-foreground"
        >
          <BarChart2 className="w-4 h-4" />
          <span className="text-sm font-medium capitalize">Resumo do dia — {dateStr}</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.22 }}
          className="grid grid-cols-3 gap-4"
        >
          {[
            { label: "Faturamento",    value: `R$ ${todayTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: TrendingUp, color: "bg-[#FF6B35]" },
            { label: "Itens vendidos", value: todayItems.toString(),                                                      icon: ShoppingCart, color: "bg-[#00C9A7]" },
            { label: "Estoque crítico",value: getLowStockProducts().length.toString(),                                    icon: Package,     color: "bg-[#FFB84D]" },
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

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.28 }}
          className="bg-white rounded-2xl border border-border p-6 shadow-sm flex-shrink-0"
        >
          <p className="text-sm font-semibold text-foreground mb-4">Vendas por horário</p>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#FF6B35" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#FF6B35" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
              />
              <Area type="monotone" dataKey="valor" stroke="#FF6B35" strokeWidth={2} fill="url(#grad1)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

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
          <div className="space-y-3">
            {lowStock.map((p) => (
              <div key={p.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground leading-none">{p.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.category}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#FFB84D]"
                      style={{ width: `${Math.min((p.stock / 15) * 100, 100)}%` }}
                    />
                  </div>
                  <span className={`text-xs font-bold w-12 text-right ${p.stock <= 5 ? "text-red-500" : "text-[#FFB84D]"}`}>
                    {p.stock} un.
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.4 }}
          className="bg-white rounded-2xl border border-border p-6 shadow-sm"
        >
          <p className="text-sm font-semibold text-foreground mb-4">Últimas vendas</p>
          <div className="space-y-2">
            {todaySales.slice(-4).reverse().map((s) => (
              <div key={s.id} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#00C9A7]/10 flex items-center justify-center">
                    <ShoppingCart className="w-4 h-4 text-[#00C9A7]" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">{s.paymentMethod}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(s.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      {" · "}{s.items} {s.items === 1 ? "item" : "itens"}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-bold text-foreground">
                  R$ {s.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}