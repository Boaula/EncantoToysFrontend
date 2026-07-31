import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LayoutDashboard, ShoppingCart, Home, Package, LogOut, Users } from "lucide-react";
import logoEncanto from "../../assets/EncantoToys.png";
import { pdvService } from "../../services/api";
import { CardHistoricoFlutuante } from "./CardHistoricoFlutuante";

import { Button } from "./ui/button";

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();

  const username = localStorage.getItem("@EncantoToys:username") || "Admin";
  const cargo = localStorage.getItem("@EncantoToys:cargo") || "OPERADOR";

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
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <img 
                src={logoEncanto} 
                alt="Logo Encanto Toys" 
                className="w-full h-full object-contain aspect-square" 
            />
            </div>
            <div>
              <h1 className="text-lg text-foreground">Encanto Toys</h1>
              <p className="text-xs text-muted-foreground">Sistema PDV</p>
            </div>
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

          {cargo === "ADMIN" && (
            <Link to="/gestao-estoque">
              <Button
                variant={isActive("/gestao-estoque") ? "default" : "ghost"}
                className="w-full justify-start gap-3 border border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10"
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
                className="w-full justify-start gap-3 border border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10"
              >
                <Users className="w-5 h-5 text-primary" />
                <span className="font-bold text-primary">Painel Admin</span>
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
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
