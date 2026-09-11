const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const FISCAL_STORAGE_KEY = "@EncantoToys:fiscal-config";

const readLocalFiscalConfig = (): EmpresaFiscalPayload | null => {
  if (typeof window === "undefined") return null;

  try {
    const saved = localStorage.getItem(FISCAL_STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};

const writeLocalFiscalConfig = (payload: EmpresaFiscalPayload) => {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(FISCAL_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignora falhas de persistência local
  }
};

// ==========================================
// CLIENTES
// ==========================================

export interface Cliente {
  id: number;
  nome: string;
  cpf?: string | null;
  telefone?: string | null;
  email?: string | null;
  data_nascimento?: string | null;
  observacoes?: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientePayload {
  nome: string;
  cpf?: string;
  telefone?: string;
  email?: string;
  data_nascimento?: string;
  observacoes?: string;
  ativo?: boolean;
}

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
  usuario_id: number;
}

// --- NOVAS INTERFACES DE HISTÓRICO ---
export interface ItemVendaHistorico {
  id: number;
  produto_id: number;
  nome_produto: string;
  quantidade: number;
  preco_estatico: number;
  subtotal: number;
}

// Ajuste financeiro
export interface VendaAjuste {
  id: number;
  tipo: "DESCONTO" | "ACRESCIMO";
  forma_calculo: "R$" | "%";
  valor_informado: number;
  valor_aplicado: number;
}


export interface VendaHistorico {
  id: number;
  uuid: string;
  total: number;
  forma_pagamento: string;
  data_venda: string;
  sincronizado: boolean;
  caixa_id?: number;
  usuario_id?: number;
  nome_usuario?: string;
  itens: ItemVendaHistorico[];
  ajustes?: VendaAjuste[];
}



export interface FiltrosHistorico {
  data_inicio?: string;
  data_fim?: string;
  forma_pagamento?: string;
  sincronizado?: boolean;
  limit?: number;
  offset?: number;
}

// --- INTERFACES FISCAIS ---
export interface EmpresaFiscalPayload {
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  inscricao_estadual: string;
  crt: number;
  cnae_principal: string;
  email: string;
  telefone: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  municipio: string;
  codigo_ibge: string;
  uf: string;
  cep: string;
  ambiente: number;
  serie_nfce: number;
  proxima_nota_nfce: number;
  csc_id?: string;
  csc_token?: string;
}

// --- INTERFACES DO CERTIFICADO DIGITAL ---
export interface CertificadoResponse {
  id?: number;
  mensagem?: string;
  vencimento?: string;
  arquivo_path?: string;
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
      ? `${API_URL}/produtos?busca=${encodeURIComponent(searchQuery)}`
      : `${API_URL}/produtos`;

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

//REGISTRAR VENDA (Com tratamento correto de erro 422)
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

  obterHistoricoVendas: async (filtros?: FiltrosHistorico): Promise<VendaHistorico[]> => {
    const token = localStorage.getItem("@EncantoToys:token");
    const params = new URLSearchParams();

    if (filtros?.data_inicio) params.append("data_inicio", filtros.data_inicio);
    if (filtros?.data_fim) params.append("data_fim", filtros.data_fim);
    if (filtros?.forma_pagamento) params.append("forma_pagamento", filtros.forma_pagamento);
    if (filtros?.sincronizado !== undefined) params.append("sincronizado", String(filtros.sincronizado));
    if (filtros?.limit) params.append("limit", String(filtros.limit));
    if (filtros?.offset) params.append("offset", String(filtros.offset));

    const url = `${API_URL}/vendas/?${params.toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Erro ao buscar histórico de vendas.");
    }

    return response.json();
  },

  obterDetalhesVenda: async (vendaId: number): Promise<VendaHistorico> => {
    const token = localStorage.getItem("@EncantoToys:token");
    const response = await fetch(`${API_URL}/vendas/${vendaId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Erro ao carregar detalhes da venda.");
    }

    return response.json();
  },
};

// ==========================================
// SERVIÇO DE CLIENTES
// ==========================================

export const clienteService = {
  listar: async (busca?: string): Promise<Cliente[]> => {
    const token = localStorage.getItem("@EncantoToys:token");
    const params = new URLSearchParams();

    if (busca?.trim()) {
      params.append("busca", busca.trim());
    }

    const url = `${API_URL}/clientes/?${params.toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      throw new Error(
        errorData.detail || "Erro ao carregar clientes."
      );
    }

    return response.json();
  },

  buscar: async (id: number): Promise<Cliente> => {
    const token = localStorage.getItem("@EncantoToys:token");

    const response = await fetch(`${API_URL}/clientes/${id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      throw new Error(
        errorData.detail || "Erro ao buscar cliente."
      );
    }

    return response.json();
  },

  criar: async (cliente: ClientePayload): Promise<Cliente> => {
    const token = localStorage.getItem("@EncantoToys:token");

    const response = await fetch(`${API_URL}/clientes/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(cliente),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      if (response.status === 409) {
        throw new Error(
          errorData.detail || "Já existe um cliente com este CPF."
        );
      }

      throw new Error(
        errorData.detail || "Erro ao cadastrar cliente."
      );
    }

    return response.json();
  },

  atualizar: async (
    id: number,
    cliente: ClientePayload
  ): Promise<Cliente> => {
    const token = localStorage.getItem("@EncantoToys:token");

    const response = await fetch(`${API_URL}/clientes/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(cliente),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      if (response.status === 409) {
        throw new Error(
          errorData.detail || "Já existe outro cliente com este CPF."
        );
      }

      throw new Error(
        errorData.detail || "Erro ao atualizar cliente."
      );
    }

    return response.json();
  },

  excluir: async (id: number): Promise<boolean> => {
    const token = localStorage.getItem("@EncantoToys:token");

    const response = await fetch(`${API_URL}/clientes/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      throw new Error(
        errorData.detail || "Erro ao excluir cliente."
      );
    }

    return true;
  },
};

// ==========================================
// SERVIÇO FISCAL
// ==========================================
export const fiscalService = {
  // Dispara a emissão na Focus/SEFAZ para uma venda já salva
  // Passa o cpfCliente opcional no body para o backend
  emitirNfce: async (vendaId: number, cpfCliente?: string) => {
    const token = localStorage.getItem("@EncantoToys:token");
    const response = await fetch(`${API_URL}/fiscal/emitir-nfce/${vendaId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        cpf_cliente: cpfCliente || null,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      if (Array.isArray(errorData.detail)) {
        const mensagens = errorData.detail
          .map((err: any) => `${err.loc.join('.')}: ${err.msg}`)
          .join(" | ");
        throw new Error(`Validação SEFAZ/Backend: ${mensagens}`);
      }

      throw new Error(errorData.detail || "Erro ao emitir NFC-e na SEFAZ.");
    }

    return response.json();
  },


  obterConfiguracoes: async (): Promise<EmpresaFiscalPayload | null> => {
    try {
      const token = localStorage.getItem("@EncantoToys:token");
      const response = await fetch(`${API_URL}/fiscal/empresa/`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 404 || response.status === 405) {
        return readLocalFiscalConfig();
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Falha ao carregar configurações fiscais.");
      }

      const data = await response.json();
      writeLocalFiscalConfig(data);
      return data;
    } catch (error: any) {
      const localData = readLocalFiscalConfig();
      if (localData) {
        return localData;
      }

      if (error instanceof Error && error.message) {
        throw error;
      }

      throw new Error("Falha ao carregar configurações fiscais.");
    }
  },

  salvarConfiguracoes: async (payload: EmpresaFiscalPayload) => {
    const token = localStorage.getItem("@EncantoToys:token");
    const response = await fetch(`${API_URL}/fiscal/empresa/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 404 || response.status === 405) {
      writeLocalFiscalConfig(payload);
      return payload;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "Erro ao salvar configurações fiscais.");
    }

    const data = await response.json();
    writeLocalFiscalConfig(data);
    return data;
  },

  // ENVIAR CERTIFICADO A1 (PFX/P12 + SENHA)
  enviarCertificado: async (arquivo: File, senha: string): Promise<CertificadoResponse> => {
    const token = localStorage.getItem("@EncantoToys:token");
    
    // Criando o FormData obrigatório para upload de arquivos
    const formData = new FormData();
    formData.append("arquivo", arquivo);
    formData.append("senha", senha);

    // NOTA: Ao enviar FormData com fetch, NÃO definimos "Content-Type".
    // O navegador define o boundary correto automaticamente!
    const response = await fetch(`${API_URL}/fiscal/empresa/certificado/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      if (Array.isArray(errorData.detail)) {
        const mensagens = errorData.detail
          .map((err: any) => `${err.loc.join('.')}: ${err.msg}`)
          .join(" | ");
        throw new Error(`Validação Backend: ${mensagens}`);
      }

      throw new Error(errorData.detail || "Erro ao enviar certificado digital.");
    }

    return response.json();
  },

  // VERIFICAR STATUS DO CERTIFICADO CADASTRADO
  obterCertificado: async (): Promise<CertificadoResponse | null> => {
    const token = localStorage.getItem("@EncantoToys:token");
    const response = await fetch(`${API_URL}/fiscal/empresa/certificado/`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error("Erro ao buscar dados do certificado.");
    }

    return response.json();
  },
};