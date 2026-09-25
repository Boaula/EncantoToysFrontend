import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LayoutDashboard, ShoppingCart, Home, Package, LogOut, Users, FileText } from "lucide-react";
import logoEncanto from "../../assets/EncantoToys.png";
import { LogoEncantoAnimada } from "./LogoEncantoAnimada";
import logoMHS from "../../assets/LogoMHS.png";
import { pdvService } from "../../services/api";
import { CardHistoricoFlutuante } from "./CardHistoricoFlutuante";


import { Button } from "./ui/button";

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();

  const username = localStorage.getItem("@EncantoToys:username") || "Admin";
  const cargo = localStorage.getItem("@EncantoToys:cargo") || "OPERADOR";

// ============================================================
// LICENÇA DO SISTEMA
// ============================================================
const [licenca, setLicenca] = useState<any>(null);
const [tempoRestante, setTempoRestante] = useState({
  dias: 0,
  horas: 0,
  minutos: 0,
  segundos: 0,
});  

  const handleLogout = async () => {
    try {
      // 1. Descobre o nome da máquina atual usando o método nativo/core do Tauri
      let nomeDaMaquina = "MHS_WEB"; // Fallback padrão caso esteja no navegador
      
      const isTauri = typeof window !== "undefined" && (("__TAURI_INTERNALS__" in window) || ("__TAURI__" in window));
      
      if (isTauri) {
        const { invoke } = await import("@tauri-apps/api/core");
        nomeDaMaquina = await invoke<string>("plugin:os|hostname");
      }

      // 2. Avisa o backend (FastAPI) para mudar o status do caixa para FECHADO
      await pdvService.fecharOperacao(nomeDaMaquina);
      console.log(`Caixa fechado com sucesso para a máquina: ${nomeDaMaquina}`);

    } catch (err) {
      // Se a rede falhar ou der erro, logamos no console para não travar a UI do usuário
      console.error("Erro ao fechar o caixa automaticamente no logout:", err);
    } finally {
      // 3. Independentemente de ter dado certo ou errado a API, limpa os dados locais e desloga
      localStorage.removeItem("@EncantoToys:token");
      localStorage.removeItem("@EncantoToys:cargo");
      localStorage.removeItem("@EncantoToys:username");
      
      navigate("/"); // Redireciona para a tela de login
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") navigate("/");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);

// ============================================================
// VERIFICAR LICENÇA
// ============================================================
useEffect(() => {
  let intervalo: ReturnType<typeof setInterval>;

  const verificarLicenca = async () => {
    try {
      const resposta = await fetch("http://127.0.0.1:8000/licenca/status");

      if (!resposta.ok) {
        console.error("Erro ao consultar licença:", resposta.status);
        return;
      }

      const dados = await resposta.json();

      setLicenca(dados);

      if (dados.vencimento) {
        const atualizarContador = () => {
          const agora = new Date();
          const vencimento = new Date(dados.vencimento);

          const diferenca = vencimento.getTime() - agora.getTime();

          if (diferenca <= 0) {
            setTempoRestante({
              dias: 0,
              horas: 0,
              minutos: 0,
              segundos: 0,
            });
            return;
          }

          const totalSegundos = Math.floor(diferenca / 1000);

          const dias = Math.floor(totalSegundos / 86400);
          const horas = Math.floor((totalSegundos % 86400) / 3600);
          const minutos = Math.floor((totalSegundos % 3600) / 60);
          const segundos = totalSegundos % 60;

          setTempoRestante({
            dias,
            horas,
            minutos,
            segundos,
          });
        };

        atualizarContador();

        intervalo = setInterval(atualizarContador, 1000);
      }
    } catch (erro) {
      console.error("❌ Não foi possível consultar a licença:", erro);
    }
  };

  verificarLicenca();

  return () => {
    if (intervalo) {
      clearInterval(intervalo);
    }
  };
}, []);

// ============================================================

  const isActive = (path: string) => {
    if (path === "/" && location.pathname === "/") return true;
    if (path !== "/" && location.pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <div className="flex h-screen bg-background">
      <CardHistoricoFlutuante />
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex flex-col items-center justify-center">
            <LogoEncantoAnimada largura={150} />

            <p className="mt-1 text-xs text-muted-foreground">
              Sistema PDV
            </p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <Link to="/">
            <Button variant={isActive("/") ? "default" : "ghost"} className="w-full justify-start gap-3">
              <Home className="w-5 h-5" />
              Início
            </Button>
          </Link>
          <Link to="/pdv">
            <Button
              variant={isActive("/pdv") ? "default" : "ghost"}
              className="w-full justify-start gap-3"
            >
              <ShoppingCart className="w-5 h-5" />
              PDV - Caixa
            </Button>
          </Link>
          <Link to="/dashboard">
            <Button
              variant={isActive("/dashboard") ? "default" : "ghost"}
              className="w-full justify-start gap-3"
            >
              <LayoutDashboard className="w-5 h-5" />
              Dashboard
            </Button>
          </Link>

          <Link to="/clientes">
            <Button
              variant={isActive("/clientes") ? "default" : "ghost"}
              className="w-full justify-start gap-3"
            >
              <Users className="w-5 h-5" />
              Clientes
            </Button>
          </Link>

          {cargo === "ADMIN" && (
            <Link to="/gestao-estoque">
              <Button
                variant={isActive("/gestao-estoque") ? "default" : "ghost"}
                className="w-full justify-start gap-3 border border-dashed border-primary/70 bg-primary/5 hover:bg-primary/20"
              >
                <Users className="w-5 h-5 text-primary" />
                <span className="font-bold text-primary">Estoque</span>
              </Button>
            </Link>
          )}

          {cargo === "ADMIN" && (
            <Link to="/admin">
              <Button
                variant={isActive("/admin") ? "default" : "ghost"}
                className="w-full justify-start gap-3 border border-dashed border-primary/50 bg-primary/5 hover:bg-primary/20"
              >
                <Users className="w-5 h-5 text-primary" />
                <span className="font-bold text-primary">Painel Admin</span>
              </Button>
            </Link>
          )}

          {(cargo === "ADMIN" || cargo === "GERENTE") && (
            <Link to="/configuracao_fiscal">
              <Button
                variant={isActive("/configuracao_fiscal") ? "default" : "ghost"}
                className="w-full justify-start gap-3 border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/20"
              >
                <FileText className="w-5 h-5 text-orange-500" />
                <span className="font-bold text-primary">Configuração Fiscal</span>
              </Button>
            </Link>
          )}
        </nav>

        <div className="p-4 border-t border-sidebar-border flex flex-col gap-3">
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              Operador: <span className="capitalize font-semibold text-foreground">{username}</span>
            </p>
            <p className="text-[10px] tracking-wider uppercase font-medium text-muted-foreground/70">
              Nível: {cargo}
            </p>
            <p>Caixa 01 - Aberto</p>
          </div>

          <Button 
            variant="ghost" 
            onClick={handleLogout}
            className="w-full justify-start gap-3 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 font-semibold cursor-pointer"
          >
            <LogOut className="w-5 h-5 text-red-500" />
            Sair do Sistema
          </Button>

          {/* [RODAPÉ 1] Direitos Autorais no final do Menu Lateral */}
          <div className="pt-2 text-[10px] text-center text-sidebar-foreground/80 border-t border-sidebar-border/50 flex flex-col items-center justify-center gap-1">
            <img 
              src={logoMHS} 
              alt="Logo MHS" 
              className="w-6 h-6 object-contain" 
            />

            <span>© {new Date().getFullYear()} Desenvolvido por</span>
            <div className="inline-flex items-center justify-center gap-1.5">
              <strong className="font-semibold text-muted-foreground">
                Natanael Figueiredo / MHS - Math High Speed
              </strong>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
<main className="flex-1 overflow-auto flex flex-col justify-between">

{/* ============================================================
    LICENÇA DEMO / BLOQUEIO
    ============================================================ */}

{licenca?.ativa === false ? (
  // 🔒 SISTEMA BLOQUEADO
  <div className="flex-1 flex items-center justify-center p-8">
    <div className="max-w-lg w-full text-center border rounded-xl p-8 shadow-sm bg-background">

      <div className="text-5xl mb-4">
        🔒
      </div>

      <h1 className="text-2xl font-bold mb-3">
        Período de avaliação encerrado
      </h1>

      <p className="text-muted-foreground mb-6">
        O período de avaliação deste sistema chegou ao fim.
      </p>

      <p className="font-medium">
        Entre em contato com o desenvolvedor para realizar
        a ativação permanente.
      </p>

    </div>
  </div>
) : (
  // 🟢 SISTEMA LIBERADO
  <>
    {/* Aviso da licença DEMO */}
    {licenca?.tipo === "DEMO" && (
      <div className="bg-orange-100 border-b border-orange-300 text-orange-900 px-4 py-3 text-sm">
        <div className="flex items-center justify-center gap-6 text-center">

          <span className="font-semibold">
            ⚠️ Período de avaliação
          </span>

          <span>
            Este sistema está utilizando uma licença DEMO.
          </span>

          <span className="font-mono font-bold">
            Tempo restante:<br />
            {String(tempoRestante.dias).padStart(2, "0")}d{" "}
            {String(tempoRestante.horas).padStart(2, "0")}h{" "}
            {String(tempoRestante.minutos).padStart(2, "0")}m{" "}
            {String(tempoRestante.segundos).padStart(2, "0")}s
          </span>

        </div>
      </div>
    )}

    {/* Conteúdo das páginas */}
    <div className="flex-1">
      <Outlet />
    </div>
  </>
)}

        {/* [RODAPÉ 2] Rodapé de Direitos Autorais na área principal */}
        <footer className="py-2.5 px-6 border-t border-border bg-white text-xs text-muted-foreground flex items-center justify-end select-none">
          {/* Agrupa o Texto + Logo (posicionado à direita do texto) */}
          <div className="flex items-center gap-2">
            <p>
              © {new Date().getFullYear()}{" "}
              <strong className="font-semibold text-foreground">
                Natanael Figueiredo / MHS - Math High Speed
              </strong>
              . Todos os direitos reservados.
            </p>
            <img 
              src={logoMHS} 
              alt="Logo MHS" 
              className="w-6 h-6 object-contain" 
            />
          </div>

          {/* Versão alinhada na extrema direita do rodapé */}
          <p className="text-[11px] font-mono">
            Encanto Toys PDV v1.0.0
          </p>
        </footer>
      </main>



    </div>
  );
}
