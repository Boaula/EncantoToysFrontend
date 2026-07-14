import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { useEffect } from "react";
import { LayoutDashboard, ShoppingCart, Sparkles, Home, Package } from "lucide-react";
import logoEncanto from "../../assets/EncantoToys.png";

import { Button } from "./ui/button";

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();

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
            <Button variant="ghost" className="w-full justify-start gap-3">
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

          <Link to="/gestao-estoque">
            <Button
              variant={isActive("/gestao-estoque") ? "default" : "ghost"}
              className="w-full justify-start gap-3"
            >
              <Package className="w-5 h-5" />
              Estoque
            </Button>
          </Link>
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Operador: Admin</p>
            <p>Caixa 01 - Aberto</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
