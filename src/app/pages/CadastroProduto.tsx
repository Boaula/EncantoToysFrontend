import React, { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";

import {
  pdvService,
  xmlCompraService,
  type ProdutoPayload,
  type ImportacaoCompraXml,
  type ItemCompraXml,
} from "../../services/api";

import { XmlsComprasArquivados } from "../components/XmlsComprasArquivados";

import { PackagePlus, Barcode, Tag, DollarSign, Layers, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

  const criarFormularioVazio = (): ProdutoPayload => ({
    codigo_barras: "",
    tipo_codigo: "FABRICA",
    nome_produto: "",
    preco_venda: 0,
    quantidade_estoque: 0,
    categoria: "Brinquedos",
  });

  function converterParaCentavos(
  valor: string | number | null | undefined
): bigint | null {
  if (valor == null || valor === "") return 0n;

  const texto = String(valor).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(texto)) return null;

  const [inteiro, decimal = ""] = texto.split(".");

  return (
    BigInt(inteiro) * 100n +
    BigInt(decimal.padEnd(2, "0"))
  );
}

function sugerirPrecoVenda(
  dados: ProdutoPayload,
  multiplicador: string
): string | null {
  const quantidade = dados.quantidade_compra;

  if (
    quantidade == null ||
    !Number.isInteger(quantidade) ||
    quantidade <= 0 ||
    quantidade > 2_147_483_647 ||
    dados.valor_compra_total == null ||
    dados.valor_compra_total === "" ||
    multiplicador === ""
  ) {
    return null;
  }

  // Representa o multiplicador com duas casas: 2,50 → 250.
  const fator = converterParaCentavos(multiplicador);

  if (fator === null || fator <= 0n || fator > 100_000n) {
    return null;
  }

  const valores = [
    dados.valor_compra_total,
    dados.frete_total,
    dados.imposto_total,
    dados.outras_despesas_total,
  ].map(converterParaCentavos);

  if (valores.some((valor) => valor === null)) return null;

  const total = valores.reduce<bigint>(
    (soma, valor) => soma + (valor ?? 0n),
    0n
  );

  const unidades = BigInt(quantidade);

  // Custo unitário com quatro casas, como no backend.
  const custoUnitario =
    (total * 100n + unidades / 2n) / unidades;

  // Custo × multiplicador, arredondado para centavos.
  const precoCentavos =
    (custoUnitario * fator + 5_000n) / 10_000n;

  return (
    `${precoCentavos / 100n}.` +
    String(precoCentavos % 100n).padStart(2, "0")
  );
}

function calcularImpostoTotal(
  valorCompra: string | number | null | undefined,
  percentual: string
): string | null {
  if (valorCompra == null || valorCompra === "" || percentual === "") {
    return null;
  }

  const compraCentavos = converterParaCentavos(valorCompra);
  const taxa = converterParaCentavos(percentual);

  if (
    compraCentavos === null ||
    taxa === null ||
    taxa > 10_000n
  ) {
    return null;
  }

  // Percentual sobre o valor total dos produtos.
  // Arredondamento para duas casas decimais.
  const impostoCentavos =
    (compraCentavos * taxa + 5_000n) / 10_000n;

  return (
    `${impostoCentavos / 100n}.` +
    String(impostoCentavos % 100n).padStart(2, "0")
  );
}

export function CadastroProduto() {
  const navigate = useNavigate();
  const [salvando, setSalvando] = useState(false);

  // Estado do formulário
  const [formData, setFormData] =
    useState<ProdutoPayload>(criarFormularioVazio);

    const arquivoXmlRef = useRef<HTMLInputElement>(null);
    const [importandoXml, setImportandoXml] = useState(false);
    const [xmlImportado, setXmlImportado] = useState<ImportacaoCompraXml | null>(null);
    const [itemSelecionado, setItemSelecionado] = useState("");
    const [itemAplicado, setItemAplicado] = useState<ItemCompraXml | null>(null);
    const [dadosXmlConferidos, setDadosXmlConferidos] = useState(false);
    const [impostoPercentual, setImpostoPercentual] = useState("");

  const [multiplicadorCusto, setMultiplicadorCusto] = useState(() => {
    try {
      return (
        localStorage.getItem("@EncantoToys:multiplicador-custo") ?? ""
      );
    } catch {
      return "";
    }
  });

  const precoSugerido = sugerirPrecoVenda(
    formData,
    multiplicadorCusto
  );

  const importarXml = async (
      e: React.ChangeEvent<HTMLInputElement>
    ) => {
      const arquivo = e.currentTarget.files?.[0];
      e.currentTarget.value = "";

      if (!arquivo) return;

      if (arquivo.size > 2 * 1024 * 1024) {
        toast.error("O XML deve ter no máximo 2 MB.");
        return;
      }

      const temPreenchimento =
        formData.nome_produto.trim() !== "" ||
        formData.codigo_barras.trim() !== "" ||
        formData.quantidade_compra != null ||
        formData.fornecedor != null ||
        formData.preco_venda !== 0 ||
        formData.quantidade_estoque !== 0;

      if (
        temPreenchimento &&
        !window.confirm(
          "Importar este XML limpará os campos do formulário. Continuar?"
        )
      ) {
        return;
      }

      setImportandoXml(true);

      try {
        const resultado = await xmlCompraService.importar(arquivo);

        setXmlImportado(resultado);
        setItemSelecionado("");
        setItemAplicado(null);
        setDadosXmlConferidos(false);
        setFormData(criarFormularioVazio());
        setImpostoPercentual("");

        toast.success(
          resultado.arquivo.ja_arquivado
            ? "XML já arquivado. Selecione um item para preencher."
            : "XML guardado no computador. Selecione um item para preencher."
        );
      } catch (erro) {
        toast.error(
          erro instanceof Error ? erro.message : "Falha ao importar XML."
        );
      } finally {
        setImportandoXml(false);
      }
    };

    const preencherComItemXml = () => {
      const item = xmlImportado?.nota.itens.find(
        (produto) => produto.numero_item === itemSelecionado
      );

      if (!item || !xmlImportado) return;

      if (
        (formData.nome_produto.trim() || formData.codigo_barras.trim()) &&
        !window.confirm(
          "Substituir os campos atuais pelos dados deste item?"
        )
      ) {
        return;
      }

      setImpostoPercentual("");

      setFormData({
        ...criarFormularioVazio(),
        codigo_barras: item.codigo_barras ?? "",
        nome_produto: item.nome_produto,
        quantidade_compra: item.quantidade_compra,
        valor_compra_total: item.valor_compra_total,
        frete_total: item.frete_total,
        imposto_total: item.ipi_total,
        outras_despesas_total: item.outras_despesas_total,
        fornecedor: xmlImportado.nota.fornecedor,
        data_validade: item.data_validade,
      });

      setItemAplicado(item);
      setDadosXmlConferidos(false);

      toast.info(
        "Confira os dados e preencha o preço de venda e o estoque inicial."
      );
  };  

  const handleChange = (
      e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
      const { name, value } = e.target;

      setDadosXmlConferidos(false);

      let novoValor: string | number | null = value;

      if (name === "preco_venda" || name === "quantidade_estoque") {
        novoValor = Number(value);
      } else if (name === "quantidade_compra") {
        novoValor = value === "" ? null : Number(value);
      } else if (
        [
          "valor_compra_total",
          "frete_total",
          "imposto_total",
          "outras_despesas_total",
          "data_validade",
          "fornecedor",
        ].includes(name)
      ) {
        novoValor = value === "" ? null : value;
      }

      setFormData((prev) => {
        const atualizado = {
          ...prev,
          [name]: novoValor,
        };

        if (
          name === "valor_compra_total" &&
          impostoPercentual !== ""
        ) {
          atualizado.imposto_total = calcularImpostoTotal(
            atualizado.valor_compra_total,
            impostoPercentual
          );
        }

        return atualizado;
      });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (importandoXml || salvando) return;

    if (itemAplicado && !dadosXmlConferidos) {
      toast.error("Confira os dados do XML e marque a confirmação.");
      return;
    }

    if (!formData.nome_produto.trim()) {
      toast.error("O nome do produto é obrigatório.");
      return;
    }

    if (!formData.codigo_barras.trim()) {
      toast.error("O código de barras é obrigatório.");
      return;
    }

        const temDadosCompra = [
        formData.quantidade_compra,
        formData.valor_compra_total,
        formData.frete_total,
        formData.imposto_total,
        formData.outras_despesas_total,
      ].some((valor) => valor !== undefined && valor !== null && valor !== "");

      if (
        temDadosCompra &&
        (
          formData.quantidade_compra == null ||
          formData.valor_compra_total == null ||
          formData.valor_compra_total === ""
        )
      ) {
        toast.error(
          "Preencha a quantidade comprada e o valor total dos produtos."
        );
        return;
      }

    setSalvando(true);

    try {
      await pdvService.cadastrarProduto(formData);
      toast.success("Produto cadastrado com sucesso!");
      
      // Limpa o formulário
      setImpostoPercentual("");
      setFormData(criarFormularioVazio());
      setItemAplicado(null);
      setItemSelecionado("");
      setDadosXmlConferidos(false);

    } catch (error: any) {
      toast.error(error.message || "Falha ao cadastrar produto.");
    } finally {
      setSalvando(false);
    }
  };

  // Função para auto-gerar um código de barras interno único (Inicia com '200' + 10 dígitos)
  const gerarCodigoInterno = () => {
      const prefixo = "200";
      // Pega os últimos 9 dígitos do timestamp atual (em milissegundos)
      const timestamp = Date.now().toString().slice(-9); 
      const codigoGerado = `${prefixo}${timestamp}`;

      setFormData((prev) => ({
          ...prev,
          codigo_barras: codigoGerado,
          tipo_codigo: "INTERNO",
      }));

      toast.info("Código interno único gerado!");
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

            <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">
                Preencher a partir de uma compra
              </h2>
              <p className="text-xs text-muted-foreground">
                Guarda o XML original e permite escolher um produto da nota.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={importandoXml || salvando}
              onClick={() => arquivoXmlRef.current?.click()}
            >
              {importandoXml
                ? "Importando..."
                : "Importar e guardar XML"}
            </Button>
          </div>

          <input
            ref={arquivoXmlRef}
            type="file"
            accept=".xml,application/xml,text/xml"
            className="hidden"
            disabled={importandoXml || salvando}
            onChange={importarXml}
          />

          {xmlImportado && (
            <div className="space-y-3 border-t pt-3">
              <div className="text-sm">
                <p className="font-medium">
                  {xmlImportado.nota.fornecedor}
                </p>
                <p className="text-xs text-muted-foreground">
                  Nota {xmlImportado.nota.numero_nota} —{" "}
                  {xmlImportado.nota.itens.length} itens
                </p>
              </div>

              <ul className="space-y-1 text-xs text-amber-800">
                {xmlImportado.nota.avisos.map((aviso, indice) => (
                  <li key={indice}>{aviso}</li>
                ))}
              </ul>

              <div className="space-y-1">
                <label
                  htmlFor="item_compra_xml"
                  className="text-xs font-semibold"
                >
                  Produto da nota
                </label>

                <select
                  id="item_compra_xml"
                  value={itemSelecionado}
                  onChange={(e) => setItemSelecionado(e.target.value)}
                  disabled={importandoXml || salvando}
                  className="
                    w-full rounded-md border border-input
                    bg-background px-3 py-2 text-sm
                  "
                >
                  <option value="">Selecione um item</option>
                  {xmlImportado.nota.itens.map((item) => (
                    <option
                      key={item.numero_item}
                      value={item.numero_item}
                    >
                      {item.numero_item} — {item.nome_produto} —{" "}
                      {item.quantidade_xml} {item.unidade_xml}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                type="button"
                variant="outline"
                disabled={!itemSelecionado || importandoXml || salvando}
                onClick={preencherComItemXml}
              >
                Preencher formulário com este item
              </Button>
            </div>
          )}

          {itemAplicado && (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">
                Dados preenchidos: {itemAplicado.nome_produto}
              </p>

              <ul className="space-y-1 text-xs text-amber-800">
                {itemAplicado.avisos.map((aviso, indice) => (
                  <li key={indice}>{aviso}</li>
                ))}
              </ul>

              <p className="text-xs text-muted-foreground">
                Os impostos sugeridos incluem somente o IPI do item.
                Confira os demais valores antes de salvar.
              </p>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={dadosXmlConferidos}
                  disabled={salvando || importandoXml}
                  onChange={(e) =>
                    setDadosXmlConferidos(e.target.checked)
                  }
                  className="mt-1"
                />
                Conferi os dados importados, incluindo quantidade em
                unidades, validade e impostos adicionais.
              </label>
            </div>
          )}
        </CardContent>
      </Card>

      <XmlsComprasArquivados />

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

                        <fieldset
              disabled={salvando}
              className="space-y-3 border-t pt-4"
            >
              <legend className="px-1 text-sm font-semibold">
                Dados da compra — opcionais
              </legend>

              <p className="text-xs text-muted-foreground">
                Informe os totais referentes à quantidade comprada deste
                produto. Exemplo: uma caixa com 20 unidades.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label
                    htmlFor="quantidade_compra"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Quantidade comprada em unidades
                  </label>
                  <Input
                    id="quantidade_compra"
                    name="quantidade_compra"
                    type="number"
                    min="1"
                    max="2147483647"
                    step="1"
                    value={formData.quantidade_compra ?? ""}
                    onChange={handleChange}
                    placeholder="Ex: 20"
                    className="h-9 text-sm"
                  />
                </div>

                {([
                  ["valor_compra_total", "Valor total dos produtos (R$)"],
                  ["frete_total", "Frete total (R$)"],
                  ["outras_despesas_total", "Outras despesas (R$)"],
                ] as const).map(([campo, rotulo]) => (
                  <div key={campo} className="space-y-1">
                    <label
                      htmlFor={campo}
                      className="text-xs font-semibold text-slate-700"
                    >
                      {rotulo}
                    </label>
                    <Input
                      id={campo}
                      name={campo}
                      type="number"
                      min="0"
                      max="999999999999.99"
                      step="0.01"
                      value={formData[campo] ?? ""}
                      onChange={handleChange}
                      placeholder="0,00"
                      className="h-9 text-sm"
                    />
                  </div>
                ))}

                <div className="space-y-1">
                  <label
                    htmlFor="imposto_percentual"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Impostos adicionais (%)
                  </label>

                  <Input
                    id="imposto_percentual"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={impostoPercentual}
                    placeholder="Ex: 6,5"
                    className="h-9 text-sm"
                    onChange={(e) => {
                      const percentual = e.target.value;

                      setImpostoPercentual(percentual);
                      setDadosXmlConferidos(false);

                      setFormData((prev) => ({
                        ...prev,
                        imposto_total: calcularImpostoTotal(
                          prev.valor_compra_total,
                          percentual
                        ),
                      }));
                    }}
                  />

                  <p className="text-xs text-muted-foreground">
                    Calculado sobre o valor total dos produtos.
                  </p>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="imposto_calculado"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Valor dos impostos (R$)
                  </label>

                  <Input
                    id="imposto_calculado"
                    readOnly
                    value={String(formData.imposto_total ?? "").replace(".", ",")}
                    placeholder="0,00"
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                O custo unitário será multiplicado pelo valor informado.
                Exemplo: R$ 10,00 × 2,5 = R$ 25,00.
                O multiplicador fica salvo neste navegador ou aplicativo.
              </p>

              <div className="rounded-xl border border-emerald-200 p-3 space-y-3">
                <p className="text-sm font-semibold">
                  Sugestão de preço de venda
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                  <label
                    htmlFor="multiplicador_custo"
                    className="text-xs font-semibold"
                  >
                    Multiplicador do custo
                  </label>

                  <Input
                    id="multiplicador_custo"
                    type="number"
                    min="0.01"
                    max="1000"
                    step="0.01"
                    value={multiplicadorCusto}
                    placeholder="Ex: 2,5"
                    onChange={(e) => {
                      const valor = e.target.value;
                      setMultiplicadorCusto(valor);

                      try {
                        localStorage.setItem(
                          "@EncantoToys:multiplicador-custo",
                          valor
                        );
                      } catch {
                        // Continua funcionando durante esta sessão.
                      }
                    }}
                  />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="preco_sugerido"
                      className="text-xs font-semibold"
                    >
                      Preço sugerido
                    </label>

                    <Input
                      id="preco_sugerido"
                      readOnly
                      value={
                        precoSugerido === null
                          ? ""
                          : `R$ ${precoSugerido.replace(".", ",")}`
                      }
                      placeholder="Preencha os custos e o percentual"
                    />
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    salvando ||
                    importandoXml ||
                    precoSugerido === null ||
                    Number(precoSugerido) <= 0
                  }
                  onClick={() => {
                    if (precoSugerido === null) return;

                    setFormData((prev) => ({
                      ...prev,
                      preco_venda: Number(precoSugerido),
                    }));

                    setDadosXmlConferidos(false);
                  }}
                >
                  Aplicar sugestão ao preço de venda
                </Button>

                <p className="text-xs text-muted-foreground">
                  O percentual fica salvo neste navegador ou aplicativo.
                  Você pode aplicar a sugestão e ajustar o preço de venda.
                </p>

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
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label
                    htmlFor="fornecedor"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Fornecedor
                  </label>
                  <Input
                    id="fornecedor"
                    name="fornecedor"
                    maxLength={150}
                    value={formData.fornecedor ?? ""}
                    onChange={handleChange}
                    placeholder="Nome do fornecedor"
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="data_validade"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Data de validade
                  </label>
                  <Input
                    id="data_validade"
                    name="data_validade"
                    type="date"
                    value={formData.data_validade ?? ""}
                    onChange={handleChange}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Produtos sem prazo de validade podem ficar com a data vazia.
              </p>
            </fieldset>

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