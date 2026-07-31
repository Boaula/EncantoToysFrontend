import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Plus, Search, Edit, Trash2, Tag, Barcode, DollarSign, Layers } from "lucide-react";
import { pdvService, type Product, type ProdutoPayload } from "../../services/api";
import { toast } from "sonner";

export function GestaoEstoque() {
  const navigate = useNavigate();

  // Estados de dados
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);

  // Estados para Modal de Edição
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState<ProdutoPayload>({
    codigo_barras: "",
    tipo_codigo: "FABRICA",
    nome_produto: "",
    preco_venda: 0,
    quantidade_estoque: 0,
    categoria: "",
  });

  // 1️⃣ BUSCAR PRODUTOS DO BANCO
  const carregarProdutos = async () => {
    setLoading(true);
    try {
      const dados = await pdvService.buscarProdutos(searchTerm);
      setProducts(dados);
    } catch (error) {
      toast.error("Erro ao carregar lista de produtos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(carregarProdutos, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // 2️⃣ ABRIR MODAL DE EDIÇÃO
  const handleOpenEdit = (product: Product) => {
    setEditingProduct(product);
    setEditForm({
      codigo_barras: product.barcode || "",
      tipo_codigo: "FABRICA",
      nome_produto: product.name,
      preco_venda: product.price,
      quantidade_estoque: product.stock,
      categoria: product.category || "Geral",
    });
    setEditDialogOpen(true);
  };

  // 3️⃣ SALVAR ALTERAÇÕES (UPDATE)
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    try {
      await pdvService.atualizarProduto(editingProduct.id, editForm);
      toast.success("Produto atualizado com sucesso!");
      setEditDialogOpen(false);
      carregarProdutos(); // Recarrega a tabela
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar produto.");
    }
  };

  // 4️⃣ EXCLUIR PRODUTO (DELETE)
  const handleDelete = async (id: number, nome: string) => {
    if (!confirm(`Tem certeza que deseja excluir o produto "${nome}"?`)) return;

    try {
      await pdvService.deletarProduto(id);
      toast.success("Produto excluído!");
      carregarProdutos(); // Recarrega a tabela
    } catch (error) {
      toast.error("Não foi possível excluir o produto.");
    }
  };

  return (
    <div className="p-8 space-y-6">
      {/* Topo */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Gestão de Estoque</h1>
          <p className="text-muted-foreground">Controle seus produtos e níveis de estoque</p>
        </div>
        <Button 
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white"
          onClick={() => navigate("/cadastro_produto")}
        >
          <Plus className="w-4 h-4" /> Novo Produto
        </Button>
      </div>

      {/* Tabela de Produtos */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Listagem de Produtos ({products.length})</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar produto..."
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
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Estoque</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                    Carregando estoque...
                  </TableCell>
                </TableRow>
              ) : products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                    Nenhum produto encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                products.map((product) => {
                  const isCritico = product.stock < 6; // 🔴 Regra: Menor que 6 = Crítico

                  return (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>{product.category}</TableCell>
                      <TableCell>R$ {product.price.toFixed(2).replace('.', ',')}</TableCell>
                      <TableCell>{product.stock} un</TableCell>
                      <TableCell>
                      <Badge 
                        className={
                          product.stock <= 5
                            ? "bg-rose-600 hover:bg-rose-700 text-white"
                            : product.stock <= 7
                            ? "bg-amber-500 hover:bg-amber-600 text-white"
                            : "bg-emerald-500 hover:bg-emerald-600 text-white"
                        }
                      >
                        {product.stock <= 5 ? "Crítico" : product.stock <= 7 ? "Atenção" : "Normal"}
                      </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleOpenEdit(product)}
                          title="Editar Produto"
                        >
                          <Edit className="w-4 h-4 text-slate-700" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(product.id, product.name)}
                          title="Excluir Produto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 🟢 MODAL DE EDIÇÃO DE PRODUTO */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Produto</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSaveEdit} className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold">Nome do Produto</label>
              <Input
                value={editForm.nome_produto}
                onChange={(e) => setEditForm({ ...editForm, nome_produto: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold">Código de Barras</label>
                <Input
                  value={editForm.codigo_barras}
                  onChange={(e) => setEditForm({ ...editForm, codigo_barras: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Categoria</label>
                <Input
                  value={editForm.categoria}
                  onChange={(e) => setEditForm({ ...editForm, categoria: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold">Preço (R$)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.preco_venda || ""}
                  onChange={(e) => setEditForm({ ...editForm, preco_venda: Number(e.target.value) })}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">Estoque (un)</label>
                <Input
                  type="number"
                  value={editForm.quantidade_estoque || ""}
                  onChange={(e) => setEditForm({ ...editForm, quantidade_estoque: Number(e.target.value) })}
                  required
                />
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar Alterações</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}