import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Users,
} from "lucide-react";
import {
  clienteService,
  type Cliente,
  type ClientePayload,
} from "../../services/api";
import { toast } from "sonner";

function formatarCPF(valor: string) {
  return valor
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatarDataNascimento(valor: string) {
  return valor
    .replace(/\D/g, "")
    .slice(0, 8)
    .replace(/(\d{2})(\d)/, "$1/$2")
    .replace(/(\d{2})(\d)/, "$1/$2");
}

function converterDataParaTela(valor?: string | null) {
  if (!valor) return "";

  const partes = valor.split("-");

  if (partes.length !== 3) return valor;

  const [ano, mes, dia] = partes;

  return `${dia}/${mes}/${ano}`;
}

function formatarTelefone(valor: string) {
  const numeros = valor.replace(/\D/g, "").slice(0, 11);

  if (numeros.length <= 10) {
    return numeros
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }



  return numeros
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

export function Clientes() {
  // ==========================================
  // ESTADOS
  // ==========================================

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);

  const [form, setForm] = useState<ClientePayload>({
    nome: "",
    cpf: "",
    telefone: "",
    email: "",
    data_nascimento: "",
    observacoes: "",
    ativo: true,
  });

  // ==========================================
  // CARREGAR CLIENTES
  // ==========================================

  const carregarClientes = async () => {
    setLoading(true);

    try {
      const dados = await clienteService.listar(searchTerm);
      setClientes(dados);
    } catch (error: any) {
      toast.error(error.message || "Erro ao carregar clientes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      carregarClientes();
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // ==========================================
  // ABRIR CADASTRO
  // ==========================================

  const handleNovoCliente = () => {
    setEditingCliente(null);

    setForm({
      nome: "",
      cpf: "",
      telefone: "",
      email: "",
      data_nascimento: "",
      observacoes: "",
      ativo: true,
    });

    setDialogOpen(true);
  };

  // ==========================================
  // ABRIR EDIÇÃO
  // ==========================================

  const handleEditar = (cliente: Cliente) => {
    setEditingCliente(cliente);

    setForm({
      nome: cliente.nome,
      cpf: cliente.cpf ?? "",
      telefone: cliente.telefone ?? "",
      email: cliente.email ?? "",
      data_nascimento: converterDataParaTela(cliente.data_nascimento),
      observacoes: cliente.observacoes ?? "",
      ativo: cliente.ativo,
    });

    setDialogOpen(true);
  };
  // ==========================================
  // SALVAR CLIENTE
  // ==========================================

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.nome.trim()) {
      toast.error("Informe o nome do cliente.");
      return;
    }

    const dadosCliente: ClientePayload = {
        ...form,
        cpf: form.cpf?.replace(/\D/g, "") || "",
        telefone: form.telefone?.replace(/\D/g, "") || "",
        data_nascimento: converterDataParaAPI(form.data_nascimento),
    };

    try {
        if (editingCliente) {
            await clienteService.atualizar(editingCliente.id, dadosCliente);
            toast.success("Cliente atualizado com sucesso!");
        } else {
            await clienteService.criar(dadosCliente);
            toast.success("Cliente cadastrado com sucesso!");
        }

      setDialogOpen(false);
      await carregarClientes();
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar cliente.");
    }
  };

  // ==========================================
  // EXCLUIR / DESATIVAR CLIENTE
  // ==========================================

  const handleExcluir = async (cliente: Cliente) => {
    if (
      !confirm(
        `Tem certeza que deseja desativar o cliente "${cliente.nome}"?`
      )
    ) {
      return;
    }

    try {
      await clienteService.excluir(cliente.id);

      toast.success("Cliente desativado com sucesso!");

      await carregarClientes();
    } catch (error: any) {
      toast.error(error.message || "Erro ao desativar cliente.");
    }
  };

  // ==========================================
  function converterDataParaAPI(valor?: string) {
    if (!valor) return undefined;

    const partes = valor.split("/");

    if (partes.length !== 3) return undefined;

    const [dia, mes, ano] = partes;

    return `${ano}-${mes}-${dia}`;
  }

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div className="p-8 space-y-6">

      {/* ======================================
          CABEÇALHO
      ======================================= */}

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6" />
            Clientes
          </h1>

          <p className="text-muted-foreground">
            Cadastre e gerencie os clientes da loja
          </p>
        </div>

        <Button
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white"
          onClick={handleNovoCliente}
        >
          <Plus className="w-4 h-4" />
          Novo Cliente
        </Button>
      </div>

      {/* ======================================
          TABELA
      ======================================= */}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              Listagem de Clientes ({clientes.length})
            </CardTitle>

            <div className="relative w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />

              <Input
                placeholder="Buscar cliente..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Data de Nascimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">
                  Ações
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-6 text-muted-foreground"
                  >
                    Carregando clientes...
                  </TableCell>
                </TableRow>
              ) : clientes.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-6 text-muted-foreground"
                  >
                    Nenhum cliente encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                clientes.map((cliente) => (
                  <TableRow key={cliente.id}>

                    <TableCell className="font-medium">
                      {cliente.nome}
                    </TableCell>

                    <TableCell>
                      {cliente.cpf || "-"}
                    </TableCell>

                    <TableCell>
                      {cliente.telefone || "-"}
                    </TableCell>

                    <TableCell>
                      {converterDataParaTela(cliente.data_nascimento) || "-"}
                    </TableCell>

                    <TableCell>
                      <Badge
                        className={
                          cliente.ativo
                            ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                            : "bg-slate-500 hover:bg-slate-600 text-white"
                        }
                      >
                        {cliente.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-right space-x-1">

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditar(cliente)}
                        title="Editar Cliente"
                      >
                        <Edit className="w-4 h-4 text-slate-700" />
                      </Button>

                      {cliente.ativo && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleExcluir(cliente)}
                          title="Desativar Cliente"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}

                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ======================================
          MODAL DE CADASTRO / EDIÇÃO
      ======================================= */}

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      >
        <DialogContent className="sm:max-w-lg">

          <DialogHeader>
            <DialogTitle>
              {editingCliente
                ? "Editar Cliente"
                : "Novo Cliente"}
            </DialogTitle>
          </DialogHeader>

          <form
            onSubmit={handleSalvar}
            className="space-y-4 py-2"
          >

            {/* NOME */}

            <div className="space-y-1">
              <label className="text-xs font-semibold">
                Nome *
              </label>

              <Input
                value={form.nome}
                onChange={(e) =>
                  setForm({
                    ...form,
                    nome: e.target.value,
                  })
                }
                placeholder="Nome completo"
                required
                autoFocus
              />
            </div>

            {/* CPF + TELEFONE */}

            <div className="grid grid-cols-2 gap-3">

              <div className="space-y-1">
                <label className="text-xs font-semibold">
                  CPF
                </label>

                <Input
                    value={form.cpf || ""}
                    onChange={(e) =>
                    setForm({
                        ...form,
                        cpf: formatarCPF(e.target.value),
                    })
                    }
                  placeholder="000.000.000-00"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold">
                  Telefone
                </label>

                <Input
                    value={form.telefone || ""}
                    onChange={(e) =>
                    setForm({
                        ...form,
                        telefone: formatarTelefone(e.target.value),
                    })
                    }
                  placeholder="(66) 99999-9999"
                />
              </div>

            </div>

            {/* E-MAIL */}

            <div className="space-y-1">
              <label className="text-xs font-semibold">
                E-mail
              </label>

              <Input
                type="email"
                value={form.email || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    email: e.target.value,
                  })
                }
                placeholder="cliente@email.com"
              />
            </div>

            {/* DATA DE NASCIMENTO */}

            <div className="space-y-1">
              <label className="text-xs font-semibold">
                Data de Nascimento
              </label>

                <Input
                  value={form.data_nascimento || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      data_nascimento: formatarDataNascimento(e.target.value),
                    })
                  }
                  placeholder="DD/MM/AAAA"
                  maxLength={10}
                />
            </div>

            {/* OBSERVAÇÕES */}

            <div className="space-y-1">
              <label className="text-xs font-semibold">
                Observações
              </label>

              <Input
                value={form.observacoes || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    observacoes: e.target.value,
                  })
                }
                placeholder="Observações sobre o cliente"
              />
            </div>

            {/* RODAPÉ */}

            <DialogFooter className="pt-3">

              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>

              <Button type="submit">
                {editingCliente
                  ? "Salvar Alterações"
                  : "Cadastrar Cliente"}
              </Button>

            </DialogFooter>

          </form>

        </DialogContent>
      </Dialog>

    </div>
  );
}