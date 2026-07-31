import { ReactNode } from "react";
import { Navigate, Outlet } from "react-router";

interface ProtectedRouteProps {
  children?: ReactNode;
  allowedCargos?: string[];
}

export function ProtectedRoute({ children, allowedCargos }: ProtectedRouteProps) {
  const token = localStorage.getItem("@EncantoToys:token");
  const cargo = localStorage.getItem("@EncantoToys:cargo");

  // 🔴 1. Sem token: Redireciona para o Login ("/")
  if (!token) {
    return <Navigate to="/" replace />;
  }

  // 🟡 2. Sem permissão de cargo: Redireciona para o PDV
  if (allowedCargos && cargo && !allowedCargos.includes(cargo.toUpperCase())) {
    return <Navigate to="/pdv" replace />;
  }

  // 🟢 3. Se tiver filhos JSX renderiza eles, senão renderiza o Outlet do Router
  return children ? <>{children}</> : <Outlet />;
}