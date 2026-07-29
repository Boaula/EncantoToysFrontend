import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { PDV } from "./pages/PDV";
import { Home } from "./pages/Home";
import { GestaoEstoque } from "./pages/GestaoEstoque";
import { AdminPanel } from "./pages/AdminPanel";
import { CheckoutPDV } from "./pages/CheckoutPDV";
import { CadastroProduto } from "./pages/CadastroProduto";

export const router = createBrowserRouter([
  { path: "/", Component: Home },
  {
    path: "/",
    Component: Layout,
    children: [
      { path: "pdv", Component: PDV },
      { path: "dashboard", Component: Dashboard },
      { path: "gestao-estoque", Component: GestaoEstoque },
      { path: "admin", Component: AdminPanel },
      { path: "checkout", Component: CheckoutPDV },
      { path: "cadastro_produto", Component: CadastroProduto },
    ],
  },
]);
