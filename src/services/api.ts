const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

// --- INTERFACES DO PDV ---
export interface Product {
  id: number;
  name: string;
  barcode: string;
  category: string;
  price: number;
  stock: number;
}

// Objeto que o cadastro espera receber
export interface ProdutoPayload {
  codigo_barras: string;
  tipo_codigo?: string;
  nome_produto: string;
  preco_venda: number;
  quantidade_estoque: number;
  categoria?: string;
}

export interface CartItem extends Product {
  quantity: number;
}

export interface ItemVendaPayload {
  produto_id: number;
  quantidade: number;
  preco_unitario: number;
}

export interface VendaPayload {
  usuario_id?: number;
  caixa_id?: number;
  forma_pagamento: string;
  valor_total: number;
  itens: ItemVendaPayload[];
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  cargo: string;
}

// ==========================================
// SERVIÇO DE AUTENTICAÇÃO
// ==========================================
export const authService = {
  async login(username: string, senha: string): Promise<TokenResponse> {
    const url = `${API_URL}/login`;
    
    const bodyData = new URLSearchParams();
    bodyData.append("username", username);
    bodyData.append("password", senha);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: bodyData,
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Usuário ou senha incorretos.");
      }
      throw new Error(`Erro no servidor: ${response.status}`);
    }

    return response.json();
  }
};

// ==========================================
// SERVIÇO DE ADMINISTRAÇÃO
// ==========================================
export const adminService = {
  async cadastrarOperador(username: string, senha: string, cargo: string): Promise<any> {
    const url = `${API_URL}/admin/cadastrar-operador`;
    const token = localStorage.getItem("@EncantoToys:token");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`, 
      },
      body: JSON.stringify({
        username: username,
        password: senha,
        cargo: cargo,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "Falha ao cadastrar funcionário.");
    }

    return response.json();
  },

  listarCaixas: async () => {
    const token = localStorage.getItem("@EncantoToys:token");
    const response = await fetch(`${API_URL}/admin/caixas`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
      }
    });
    if (!response.ok) throw new Error("Falha ao listar caixas");
    return response.json();
  },

  atualizarTagCaixa: async (id: number, tag_nome: string) => {
    const token = localStorage.getItem("@EncantoToys:token");
    const response = await fetch(`${API_URL}/admin/caixas/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ tag_nome })
    });
    if (!response.ok) throw new Error("Falha ao atualizar tag do caixa");
    return response.json();
  }
};

// ==========================================
// SERVIÇO DO PONTO DE VENDA (PDV)
// ==========================================
export const pdvService = {
  identificarMaquina: async (hostname: string) => {
    const response = await fetch(`${API_URL}/pdv/identificar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ hostname })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "Falha na resposta do servidor.");
    }
    
    return response.json();
  },

  iniciarOperacao: async (hostname: string, username: string) => {
    const response = await fetch(`${API_URL}/pdv/iniciar-operacao`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostname, username }),
    });
    if (!response.ok) {
      throw new Error(`Erro na API: ${response.statusText}`);
    }
    return await response.json();
  },

  fecharOperacao: async (hostname: string) => {
    const response = await fetch(`${API_URL}/pdv/fechar-operacao`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostname }),
    });

    if (!response.ok) {
      throw new Error(`Erro ao fechar caixa: ${response.statusText}`);
    }

    return await response.json();
  },

  buscarProdutos: async (searchQuery: string = ""): Promise<Product[]> => {
    const token = localStorage.getItem("@EncantoToys:token");
    const url = searchQuery.trim()
      ? `${API_URL}/produtos?search=${encodeURIComponent(searchQuery)}`
      : `${API_URL}/produtos?limit=12`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Falha ao buscar produtos no servidor.");
    }

    return response.json();
  },

// 🟢 REGISTRAR VENDA (Com tratamento correto de erro 422)
  registrarVenda: async (payload: VendaPayload) => {
    const token = localStorage.getItem("@EncantoToys:token");
    const response = await fetch(`${API_URL}/vendas/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      if (Array.isArray(errorData.detail)) {
        const mensagens = errorData.detail
          .map((err: any) => `${err.loc.join('.')}: ${err.msg}`)
          .join(" | ");
        throw new Error(`Validação Backend: ${mensagens}`);
      }

      throw new Error(errorData.detail || "Erro ao registrar venda.");
    }

    return response.json();
  },

  cadastrarProduto: async (produto: ProdutoPayload) => {
    const response = await fetch("http://localhost:8000/produtos/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(produto),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "Erro ao cadastrar produto.");
    }

    return await response.json();
  },

  atualizarProduto: async (id: number, produto: ProdutoPayload) => {
    const response = await fetch(`http://localhost:8000/produtos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(produto),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || "Erro ao atualizar produto.");
    }

    return await response.json();
  },

  deletarProduto: async (id: number) => {
    const response = await fetch(`http://localhost:8000/produtos/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("Erro ao excluir produto.");
    }

    return true;
  },
};