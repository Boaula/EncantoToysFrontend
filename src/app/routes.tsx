import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { PDV } from "./pages/PDV";
import { Home } from "./pages/Home";
import { GestaoEstoque } from "./pages/GestaoEstoque";
import { AdminPanel } from "./pages/AdminPanel";
import { CheckoutPDV } from "./pages/CheckoutPDV";
import { CadastroProduto } from "./pages/CadastroProduto";
import { HistoricoVendas } from "./pages/HistoricoVendas";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ConfiguracaoFiscal } from "./pages/ConfiguracaoFiscal"; // import Fiscal
import { Clientes } from "./pages/Clientes";

export const router = createBrowserRouter([
  // 🔓 Rota Pública: Tela de Login
  { path: "/", Component: Home },

  // 🔒 Rotas Protegidas: Bloqueia TODAS as filhas se o usuário não estiver logado
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      // Rotas livres para qualquer operador logado
      { path: "pdv", element: <PDV /> },
      { path: "checkout", element: <CheckoutPDV /> },
      { path: "historico_vendas", element: <HistoricoVendas /> },
      { path: "dashboard", element: <Dashboard /> },

      // Rotas restritas apenas para ADMIN ou GERENTE
      {
        path: "dashboard",
        element: (
          <ProtectedRoute allowedCargos={["ADMIN", "GERENTE"]}>
            <Dashboard />
          </ProtectedRoute>
        ),
      },
      {
        path: "gestao-estoque",
        element: (
          <ProtectedRoute allowedCargos={["ADMIN", "GERENTE"]}>
            <GestaoEstoque />
          </ProtectedRoute>
        ),
      },
      {
        path: "clientes",
        element: <Clientes />,
      },
      {
        path: "cadastro_produto",
        element: (
          <ProtectedRoute allowedCargos={["ADMIN", "GERENTE"]}>
            <CadastroProduto />
          </ProtectedRoute>
        ),
      },
      //NOVA ROTA TRIBUTÁRIA / FISCAL
      {
        path: "configuracao_fiscal",
        element: (
          <ProtectedRoute allowedCargos={["ADMIN", "GERENTE"]}>
            <ConfiguracaoFiscal />
          </ProtectedRoute>
        ),
      },
      {
        path: "admin",
        element: (
          <ProtectedRoute allowedCargos={["ADMIN"]}>
            <AdminPanel />
          </ProtectedRoute>
        ),
      },
    ],
  },
]);