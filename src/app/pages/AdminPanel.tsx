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
    <div className="p-8 max-w-2xl mx-auto space-y-6">
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
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [novoNome, setNovoNome] = useState("");

  const carregarCaixas = async () => {
    setLoading(true);
    try {
      const dados = await adminService.listarCaixas();
      setCaixas(dados);
    } catch (err) {
      console.error("Erro ao carregar caixas", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarCaixas();
  }, []);

  const salvarNovaTag = async (id: number) => {
    if (!novoNome.trim()) return;
    try {
      await adminService.atualizarTagCaixa(id, novoNome.trim());
      setEditandoId(null);
      setNovoNome("");
      carregarCaixas();
    } catch (err) {
      alert("Erro ao atualizar o nome do caixa.");
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-border shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Monitor className="w-5 h-5 text-primary" />
          Gerenciar Computadores (PDVs)
        </h3>
        <button type="button" onClick={carregarCaixas} className="text-gray-400 hover:text-gray-600 cursor-pointer">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-100 text-gray-400 text-sm">
              <th className="py-2">Nome Físico (PC)</th>
              <th className="py-2">Tag do Caixa</th>
              <th className="py-2">Status</th>
              <th className="py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {caixas.map((caixa) => (
              <tr key={caixa.id} className="border-b border-gray-50 text-gray-700 text-sm">
                <td className="py-3 font-mono text-xs text-gray-500">
                  {caixa.hostname}
                </td>
                <td className="py-3 font-medium">
                  {editandoId === caixa.id ? (
                    <input
                      type="text"
                      value={novoNome}
                      onChange={(e) => setNovoNome(e.target.value)}
                      className="border border-input rounded-xl px-3 py-1 text-sm outline-none focus:border-primary"
                      autoFocus
                    />
                  ) : (
                    caixa.tag_nome
                  )}
                </td>
                <td className="py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    caixa.esta_aberto ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-500"
                  }`}>
                    {caixa.esta_aberto ? "Aberto" : "Fechado"}
                  </span>
                </td>
                <td className="py-3 text-right">
                  {editandoId === caixa.id ? (
                    <button type="button" onClick={() => salvarNovaTag(caixa.id)} className="text-green-600 hover:text-green-700 p-1 cursor-pointer">
                      <Check className="w-4 h-4" />
                    </button>
                  ) : (
                    <button 
                      type="button"
                      onClick={() => { setEditandoId(caixa.id); setNovoNome(caixa.tag_nome); }} 
                      className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}