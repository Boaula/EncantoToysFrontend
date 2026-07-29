import React, { useState } from "react";
import { useNavigate } from "react-router";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { pdvService, ProdutoPayload } from "../../services/api";
import { PackagePlus, Barcode, Tag, DollarSign, Layers, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export function CadastroProduto() {
  const navigate = useNavigate();
  const [salvando, setSalvando] = useState(false);

  // Estado do formulário
  const [formData, setFormData] = useState<ProdutoPayload>({
    codigo_barras: "",
    tipo_codigo: "FABRICA",
    nome_produto: "",
    preco_venda: 0,
    quantidade_estoque: 1,
    categoria: "Brinquedos",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "preco_venda" || name === "quantidade_estoque" ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nome_produto.trim()) {
      toast.error("O nome do produto é obrigatório.");
      return;
    }

    if (!formData.codigo_barras.trim()) {
      toast.error("O código de barras é obrigatório.");
      return;
    }

    setSalvando(true);

    try {
      await pdvService.cadastrarProduto(formData);
      toast.success("Produto cadastrado com sucesso!");
      
      // Limpa o formulário
      setFormData({
        codigo_barras: "",
        tipo_codigo: "FABRICA",
        nome_produto: "",
        preco_venda: 0,
        quantidade_estoque: 1,
        categoria: "Brinquedos",
      });

    } catch (error: any) {
      toast.error(error.message || "Falha ao cadastrar produto.");
    } finally {
      setSalvando(false);
    }
  };

  // Função para auto-gerar um código de barras interno único (Inicia com '200' + 10 dígitos)
const gerarCodigoInterno = () => {
    const prefixo = "200";
    const aleatorio = Math.floor(Math.random() * 1000000000).toString().padStart(9, "0");
    const codigoGerado = `${prefixo}${aleatorio}`;

    setFormData((prev) => ({
        ...prev,
        codigo_barras: codigoGerado,
        tipo_codigo: "INTERNO", // Já muda o tipo automaticamente para INTERNO
    }));

    toast.info("Código interno gerado!");
};

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-3">
      {/* Topo Compacto */}
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/pdv")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <h1 className="text-lg font-bold text-primary flex items-center gap-2">
            <PackagePlus className="w-5 h-5" /> Cadastrar Novo Produto
          </h1>
        </div>
      </div>

      <Card className="shadow-md">
        <CardContent className="p-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Linha 1: Nome do Produto */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Nome do Produto *</label>
              <div className="relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  name="nome_produto"
                  value={formData.nome_produto}
                  onChange={handleChange}
                  placeholder="Ex: Carrinho Controle Remoto"
                  className="pl-9 h-9 text-sm"
                  required
                />
              </div>
            </div>

            {/* Linha 2: Código de Barras e Tipo de Código */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-slate-700">Código de Barras *</label>
                <div className="flex gap-2">
                <div className="relative flex-1">
                    <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                    name="codigo_barras"
                    value={formData.codigo_barras}
                    onChange={handleChange}
                    placeholder="Bipa o código ou clique em Gerar"
                    className="pl-9 h-9 text-sm"
                    required
                    />
                </div>
                {/* 🟢 BOTÃO DE AUTO-GERAR CÓDIGO */}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={gerarCodigoInterno}
                    className="h-9 px-3 text-xs bg-slate-50 hover:bg-slate-100 whitespace-nowrap"
                    title="Gerar código interno automático para produtos sem etiqueta de fábrica"
                >
                    ⚡ Gerar
                </Button>
                </div>
            </div>

            <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Tipo Código</label>
                <select
                name="tipo_codigo"
                value={formData.tipo_codigo}
                onChange={handleChange}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                <option value="FABRICA">FÁBRICA</option>
                <option value="INTERNO">INTERNO</option>
                </select>
            </div>
            </div>
            {/* Linha 3: Preço, Estoque e Categoria alinhados lado a lado */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Preço de Venda (R$) *</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="number"
                    step="0.01"
                    name="preco_venda"
                    value={formData.preco_venda || ""}
                    onChange={handleChange}
                    placeholder="0.00"
                    className="pl-9 h-9 text-sm"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Estoque Inicial *</label>
                <div className="relative">
                  <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="number"
                    name="quantidade_estoque"
                    value={formData.quantidade_estoque || ""}
                    onChange={handleChange}
                    placeholder="10"
                    className="pl-9 h-9 text-sm"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Categoria</label>
                <Input
                  name="categoria"
                  value={formData.categoria}
                  onChange={handleChange}
                  placeholder="Ex: Brinquedos"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* Linha 4: Botões de Ação Justificados no Canto Direito */}
            <div className="flex justify-end gap-3 pt-3 border-t mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate("/pdv")}
                disabled={salvando}
                className="px-5"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                size="sm" 
                disabled={salvando}
                className="px-6"
              >
                {salvando ? "Salvando..." : "Salvar Produto"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}