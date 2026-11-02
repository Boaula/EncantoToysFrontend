import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { UserPlus, Shield, AlertCircle, CheckCircle2, Monitor, Edit2, Check, RefreshCw } from "lucide-react";
import { adminService } from "../../services/api"; // 👈 Garanta o import correto do seu cliente Axios/Fetch

// 1. Definição da Interface
interface Caixa {
  id: number;
  hostname: string;
  tag_nome: string;
  esta_aberto: boolean;
  operador_atual: string | null;
  aberto_em: string | null;
  fechado_em: string | null;
  ultima_atividade_em: string | null;
  status_atividade: string | null;
  referencia_em: string | null;
}

// 2. Componente Principal (AdminPanel)
export function AdminPanel() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [cargo, setCargo] = useState("OPERADOR");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleCadastro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      await adminService.cadastrarOperador(
          username.trim().toLowerCase(), 
          password, 
          cargo
      );

      setSuccess(`Usuário ${username} cadastrado com sucesso como ${cargo}!`);
      setUsername("");
      setPassword("");
      setCargo("OPERADOR");
    } catch (err: any) {
      setError(err.message || "Erro ao cadastrar usuário.");
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Painel de Controle</h1>
        <p className="text-sm text-muted-foreground">Gerenciamento de acessos e equipe da Encanto Toys.</p>
      </div>

      {/* Bloco de Cadastro */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-border p-6 shadow-sm"
      >
        <div className="flex items-center gap-2 mb-6 border-b border-gray-100 pb-4">
          <UserPlus className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Cadastrar Novo Funcionário</h2>
        </div>

        <form onSubmit={handleCadastro} className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-gray-700">Nome de Usuário (Login)</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ex: marcos.caixa"
              className="w-full rounded-xl border border-input px-4 py-2.5 text-sm outline-none focus:border-primary bg-background"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-gray-700">Senha Inicial</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-input px-4 py-2.5 text-sm outline-none focus:border-primary bg-background"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-gray-700">Cargo / Nível de Acesso</label>
            <select
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              className="w-full rounded-xl border border-input px-4 py-2.5 text-sm outline-none focus:border-primary bg-background"
            >
              <option value="OPERADOR">OPERADOR (Acesso apenas ao Caixa/Vendas)</option>
              <option value="ADMIN">ADMIN (Acesso total ao sistema)</option>
            </select>
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-50 text-green-600 rounded-xl text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-xl transition disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <span className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <>
                <Shield className="w-4 h-4" />
                Concluir Cadastro
              </>
            )}
          </button>
        </form>
      </motion.div>

      {/* Tabela de gerenciamento de computadores renderizada logo abaixo */}
      <GerenciarCaixasAdmin />
    </div>
  );
}

// 3. Componente da Tabela de Caixas
export function GerenciarCaixasAdmin() {
  const [caixas, setCaixas] = useState<Caixa[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [ultimaConsulta, setUltimaConsulta] = useState<Date | null>(null);
  const [atualizacao, setAtualizacao] = useState(0);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    let consultando = false;
    let controller: AbortController | undefined;

    const consultar = async () => {
      if (!ativo || consultando) return;

      consultando = true;
      setLoading(true);

      const requisicao = new AbortController();
      controller = requisicao;

      const limite = setTimeout(
        () => requisicao.abort(),
        10_000
      );

      try {
        const dados: Caixa[] = await adminService.listarCaixas(
          requisicao.signal
        );

        if (!ativo) return;

        setCaixas(dados);
        setUltimaConsulta(new Date());
        setErro("");
      } catch (falha: unknown) {
        if (!ativo) return;

        setErro(
          requisicao.signal.aborted
            ? "A consulta demorou mais que o esperado."
            : falha instanceof Error
              ? falha.message
              : "Não foi possível consultar os caixas."
        );
      } finally {
        clearTimeout(limite);
        consultando = false;
        controller = undefined;

        if (ativo) setLoading(false);
      }
    };

    void consultar();

    const intervalo = setInterval(() => {
      void consultar();
    }, 15_000);

    return () => {
      ativo = false;
      clearInterval(intervalo);
      controller?.abort();
    };
  }, [atualizacao]);

  const formatarData = (valor: string | null) => {
    if (!valor) return "Não informado";

    const data = new Date(valor);

    if (Number.isNaN(data.getTime())) return "Data inválida";

    return data.toLocaleString("pt-BR", {
      timeZone: "America/Cuiaba",
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  const sinalDoCaixa = (caixa: Caixa) => {
    if (!caixa.esta_aberto) {
      return {
        texto: "Caixa fechado",
        classe: "bg-gray-100 text-gray-600",
      };
    }

    switch (caixa.status_atividade) {
      case "SINAL_RECENTE":
        return {
          texto: "Sinal recente",
          classe: "bg-green-50 text-green-700",
        };
      case "SEM_SINAL_RECENTE":
        return {
          texto: "Sem sinal recente",
          classe: "bg-amber-50 text-amber-800",
        };
      case "HORARIO_INCONSISTENTE":
        return {
          texto: "Conferir relógio do computador",
          classe: "bg-amber-50 text-amber-800",
        };
      default:
        return {
          texto: "Atividade não informada",
          classe: "bg-gray-100 text-gray-600",
        };
    }
  };

  const salvarNovaTag = async (id: number) => {
    const nome = novoNome.trim();

    if (!nome || salvando) return;

    setSalvando(true);

    try {
      await adminService.atualizarTagCaixa(id, nome);

      setCaixas((atuais) =>
        atuais.map((caixa) =>
          caixa.id === id ? { ...caixa, tag_nome: nome } : caixa
        )
      );

      setEditandoId(null);
      setNovoNome("");
      setAtualizacao((valor) => valor + 1);
    } catch (falha: unknown) {
      alert(
        falha instanceof Error
          ? falha.message
          : "Não foi possível salvar o nome do caixa."
      );
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className="bg-white p-6 rounded-2xl border border-border shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Monitor className="w-5 h-5 text-primary" />
          Monitoramento dos caixas
        </h3>

        <button
          type="button"
          onClick={() => setAtualizacao((valor) => valor + 1)}
          disabled={loading}
          className="flex items-center gap-2 text-sm font-medium text-primary disabled:opacity-50"
        >
          <RefreshCw
            className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
          />
          Atualizar
        </button>
      </div>

      <p className="text-xs text-muted-foreground mb-5">
        Consulta automática a cada 15 segundos.
        {ultimaConsulta &&
          ` Última consulta concluída: ${ultimaConsulta.toLocaleTimeString("pt-BR")}.`}
      </p>

      {erro && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        >
          {erro} Nova tentativa automática em até 15 segundos.
          {ultimaConsulta &&
            " Os dados abaixo são da última consulta concluída."}
        </div>
      )}

      {!caixas.length && (
        <p className="text-sm text-muted-foreground py-6">
          {loading
            ? "Consultando caixas..."
            : erro
              ? "Aguardando uma consulta bem-sucedida."
              : "Nenhum caixa cadastrado."}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {caixas.map((caixa) => {
          const sinal = sinalDoCaixa(caixa);

          return (
            <article
              key={caixa.id}
              className="rounded-xl border border-border p-4 space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-bold text-foreground break-words">
                    {caixa.tag_nome}
                  </h4>
                  <p className="text-xs text-muted-foreground break-all">
                    Computador: {caixa.hostname}
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${
                    caixa.esta_aberto
                      ? "bg-green-50 text-green-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {caixa.esta_aberto ? "Aberto" : "Fechado"}
                </span>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {caixa.esta_aberto ? "Operador" : "Último operador"}
                  </dt>
                  <dd className="font-medium">
                    {caixa.operador_atual || "Não informado"}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs text-muted-foreground">
                    Abertura do período
                  </dt>
                  <dd>{formatarData(caixa.aberto_em)}</dd>
                </div>

                <div>
                  <dt className="text-xs text-muted-foreground">
                    Fechamento do período
                  </dt>
                  <dd>
                    {caixa.esta_aberto
                      ? "Em aberto"
                      : formatarData(caixa.fechado_em)}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs text-muted-foreground">
                    Último sinal de atividade
                  </dt>
                  <dd>{formatarData(caixa.ultima_atividade_em)}</dd>
                </div>
              </dl>

              <div>
                <span
                  className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${sinal.classe}`}
                >
                  {sinal.texto}
                </span>
              </div>

              <div className="border-t border-border pt-3">
                {editandoId === caixa.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      htmlFor={`nome-caixa-${caixa.id}`}
                      className="sr-only"
                    >
                      Nome do caixa
                    </label>

                    <input
                      id={`nome-caixa-${caixa.id}`}
                      value={novoNome}
                      onChange={(evento) => setNovoNome(evento.target.value)}
                      disabled={salvando}
                      className="min-w-0 flex-1 rounded-lg border border-input px-3 py-2 text-sm"
                      autoFocus
                    />

                    <button
                      type="button"
                      onClick={() => void salvarNovaTag(caixa.id)}
                      disabled={salvando || !novoNome.trim()}
                      className="text-sm font-semibold text-primary disabled:opacity-50"
                    >
                      {salvando ? "Salvando..." : "Salvar"}
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditandoId(null)}
                      disabled={salvando}
                      className="text-sm text-muted-foreground"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditandoId(caixa.id);
                      setNovoNome(caixa.tag_nome);
                    }}
                    className="flex items-center gap-2 text-xs font-semibold text-primary"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Editar nome do caixa
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <p className="mt-5 text-xs text-muted-foreground">
        O sinal indica que o aplicativo está respondendo, não que está
        realizando vendas. Caixas de outros computadores dependem da
        sincronização entre os bancos. A ausência de sinal não fecha
        o caixa automaticamente.
      </p>
    </section>
  );
}