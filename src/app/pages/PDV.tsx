import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import { TagIdentificadoraPDV } from "../components/TagIdentificadoraPDV";
import { pdvService, clienteService, caixaFinanceiroService, type Product, type CartItem } from "../../services/api";
import { Search, X, CreditCard, Banknote, Smartphone, Trash2, Plus, Minus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { ModalCalculadoraTroco } from "../components/ModalCalculadoraTroco";
import { obterAlertaValidade } from "../../services/validators";

import {
  lerCentavos,
  textoMonetario,
} from "../../services/pagamentosVenda";


export function PDV() {
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [productsList, setProductsList] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [mostrarCadastroRapido, setMostrarCadastroRapido] = useState(false);
const [nomeCliente, setNomeCliente] = useState("");
const [telefoneCliente, setTelefoneCliente] = useState("");
const [salvandoCliente, setSalvandoCliente] = useState(false);

const seguirParaPagamento = () => {
  setMostrarCadastroRapido(false);
  setNomeCliente("");
  setTelefoneCliente("");
  setShowPaymentDialog(true);};

  const searchInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Novo estado para controlar o modal de troco:
  const [showCashModal, setShowCashModal] = useState(false);


  // Focus search on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Busca produtos na API FastAPI
  useEffect(() => {
    const carregarProdutos = async () => {
      try {
        const dados = await pdvService.buscarProdutos(search);
        if (search.trim()) {
          setFilteredProducts(dados);
        } else {
          setProductsList(dados);
        }
      } catch (error) {
        console.error("Erro ao carregar produtos:", error);
      }
    };

    const timer = setTimeout(carregarProdutos, 300);
    return () => clearTimeout(timer);
  }, [search]);


  // ⌨️ Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {

      if (e.target instanceof HTMLElement && e.target.closest('[role="dialog"]')) return;    

      if (mostrarCadastroRapido || showPaymentDialog || showCashModal) return;

      // 🟢 F2: Focar na busca
      if (e.key === "F2" || e.code === "F2") {
        e.preventDefault();
        
        if (searchInputRef.current) {
          searchInputRef.current.focus();
          searchInputRef.current.select();
        }
      }

      // 🟢 F3: Limpar carrinho
      if (e.key === "F3" || e.code === "F3") {
        e.preventDefault();
        handleClearCart();
      }

      // 🟢 F4: Abrir pagamento
      if ((e.key === "F4" || e.code === "F4") && cart.length > 0) {
        e.preventDefault();
        setMostrarCadastroRapido(true);
      }

      // 🟢 ESC: Limpar busca
      if (e.key === "Escape" && search) {
        e.preventDefault();
        setSearch("");
      }
    };
    // 🔴 O segredo está no parâmetro 'true' no final:
    // Ele faz o evento ser interceptado ANTES de qualquer outro elemento da tela
    window.addEventListener("keydown", handleKeyPress, true);
    return () => window.removeEventListener("keydown", handleKeyPress, true);
  }, [search, cart, mostrarCadastroRapido, showPaymentDialog, showCashModal]);

  // ⏰ Relógio ao vivo
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer); // Limpa o timer quando o componente desmonta
  }, []);

  const addToCart = (product: Product) => {
    // Bloqueia imediatamente produtos sem estoque.
    if (product.stock <= 0) {
      toast.error(`${product.name} está sem estoque`);
      setSearch("");
      searchInputRef.current?.focus();
      return;
    }

    const alertaValidade = obterAlertaValidade(product.data_validade);

      if (alertaValidade) {
        toast.warning(`${product.name}: ${alertaValidade}`, {
          duration: 8000,
        });
      }

    const existing = cart.find((item) => item.id === product.id);

    if (existing) {
      if (existing.quantity < product.stock) {
        setCart(cart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        ));

        toast.success(`${product.name} - Quantidade atualizada`);
      } else {
        toast.error("Estoque insuficiente");
      }
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
      toast.success(`${product.name} adicionado ao carrinho`);
    }

    setSearch("");
    searchInputRef.current?.focus();
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart(cart.map((item) => {
      if (item.id === productId) {
        const newQuantity = item.quantity + delta;
        if (newQuantity <= 0) return item;
        if (newQuantity > item.stock) {
          toast.error("Estoque insuficiente");
          return item;
        }
        return { ...item, quantity: newQuantity };
      }
      return item;
    }));
  };

  const removeFromCart = (productId: number) => {
    setCart(cart.filter((item) => item.id !== productId));
    toast.info("Item removido");
  };

  const handleClearCart = () => {
    if (cart.length > 0) {
      setCart([]);
      toast.info("Carrinho limpo");
    }
  };

  const handlePayment = (method: string) => {
    if (cart.length === 0) return;

    setShowPaymentDialog(false);
    navigate("/checkout", {
      state: {
        cart,
        total: getTotal(),
        paymentMethod: method,
      },
    });
  };

  const getTotal = () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const getItemsCount = () => cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="h-screen flex flex-col bg-accent/20">
      {/* Header */}
      <div className="bg-white border-b border-border p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl text-primary font-bold">Ponto de Venda</h1>
            <p className="text-sm text-muted-foreground">
              Use F2 para buscar, F3 para limpar, F4 para finalizar
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground capitalize">
                {currentTime.toLocaleDateString('pt-BR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
            </p>
            <p className="text-lg font-medium font-mono">
                {currentTime.toLocaleTimeString('pt-BR')}
            </p>
          </div>
        </div>
        <TagIdentificadoraPDV />
        <CaixaFinanceiro />
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 overflow-hidden">
        {/* Left Column - Product Search */}
        <div className="lg:col-span-2 space-y-4 flex flex-col overflow-hidden">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="w-5 h-5" />
                Buscar Produto
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  placeholder="Digite o nome, código de barras ou categoria..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 pr-10 h-12 text-lg"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Product Results */}
          <Card className="flex-1 shadow-lg overflow-hidden flex flex-col">
            <CardHeader>
              <CardTitle>
                {search ? `Resultados (${filteredProducts.length})` : "Produtos Disponíveis"}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(search ? filteredProducts : productsList).map((product) => (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className="p-4 bg-accent/40 hover:bg-accent border border-border rounded-lg text-left transition-all hover:shadow-md group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium text-foreground group-hover:text-primary transition-colors">
                        {product.name}
                      </h4>
                      <Badge
                        className={`ml-2 ${
                          product.stock <= 2
                            ? "bg-rose-600 text-white"
                            : product.stock <= 4
                            ? "bg-amber-500 text-white"
                            : "bg-emerald-500 text-white"
                        }`}
                      >
                        {product.stock} un
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{product.category}</p>

                    {obterAlertaValidade(product.data_validade, currentTime) && (
                      <p className="mb-2 text-xs font-semibold text-red-700">
                        {obterAlertaValidade(product.data_validade, currentTime)}
                      </p>
                    )}
                    
                    <div className="flex justify-between items-center">
                      <span className="text-xl font-bold text-primary">
                        R$ {product.price.toFixed(2).replace('.', ',')}
                      </span>
                      <span className="text-xs text-muted-foreground">{product.barcode}</span>
                    </div>
                  </button>
                ))}
              </div>
              {search && filteredProducts.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Search className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>Nenhum produto encontrado</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Cart */}
        <div className="space-y-4 flex flex-col overflow-hidden">
          <Card className="flex-1 shadow-lg flex flex-col overflow-hidden">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Carrinho ({getItemsCount()} itens)</CardTitle>
                {cart.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={handleClearCart}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Limpar
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              {cart.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ShoppingCart className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>Carrinho vazio</p>
                  <p className="text-sm mt-2">Adicione produtos para iniciar a venda</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map((item) => (
                    <div key={item.id} className="p-3 bg-accent/60 rounded-lg border border-border">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <h4 className="font-medium text-sm">
                            {item.name}
                          </h4>

                          {obterAlertaValidade(item.data_validade, currentTime) && (
                            <p className="mt-1 text-xs font-semibold text-red-700">
                              {obterAlertaValidade(item.data_validade, currentTime)}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="text-muted-foreground hover:text-destructive ml-2"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateQuantity(item.id, -1)}
                            disabled={item.quantity <= 1}
                            className="h-7 w-7 p-0"
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="w-8 text-center font-medium">{item.quantity}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateQuantity(item.id, 1)}
                            disabled={item.quantity >= item.stock}
                            className="h-7 w-7 p-0"
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">
                            R$ {item.price.toFixed(2)} × {item.quantity}
                          </p>
                          <p className="font-bold text-primary">
                            R$ {(item.price * item.quantity).toFixed(2).replace('.', ',')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Total and Payment */}
          <Card className="shadow-lg bg-gradient-to-br from-primary/5 to-secondary/5 border-2">
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>R$ {getTotal().toFixed(2).replace('.', ',')}</span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-lg">Total</span>
                  <span className="text-3xl font-bold text-primary">
                    R$ {getTotal().toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>
              <Button
                size="lg"
                className="w-full h-14 text-lg"
                onClick={() => setMostrarCadastroRapido(true)}
                disabled={cart.length === 0}
              >
                Finalizar Venda (F4)
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={mostrarCadastroRapido}
        onOpenChange={(aberto) => {
          if (!aberto && !salvandoCliente) seguirParaPagamento();
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          onInteractOutside={(evento) => evento.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Cadastrar cliente</DialogTitle>
            <DialogDescription>
              Informe o nome e o telefone ou feche no X para seguir ao pagamento.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={async (evento) => {
              evento.preventDefault();
              if (salvandoCliente) return;

              const nome = nomeCliente.trim();
              const telefone = telefoneCliente.replace(/\D/g, "");

              if (!nome || !telefone) {
                toast.error("Informe o nome e o telefone do cliente.");
                return;
              }

              setSalvandoCliente(true);

              try {
                await clienteService.criar({ nome, telefone });
                toast.success("Cliente cadastrado com sucesso!");
                seguirParaPagamento();
              } catch (erro) {
                toast.error(
                  erro instanceof Error && erro.message !== "[object Object]"
                    ? erro.message
                    : "Não foi possível cadastrar o cliente. Confira os dados ou feche no X."
                );
              } finally {
                setSalvandoCliente(false);
              }
            }}
          >
            <div className="space-y-1">
              <label htmlFor="pdv-cliente-nome" className="text-sm font-medium">
                Nome
              </label>
              <Input
                id="pdv-cliente-nome"
                value={nomeCliente}
                onChange={(evento) => setNomeCliente(evento.target.value)}
                autoComplete="name"
                maxLength={150}
                disabled={salvandoCliente}
                required
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="pdv-cliente-telefone" className="text-sm font-medium">
                Telefone
              </label>
              <Input
                id="pdv-cliente-telefone"
                type="tel"
                value={telefoneCliente}
                onChange={(evento) => setTelefoneCliente(evento.target.value)}
                autoComplete="tel"
                maxLength={20}
                disabled={salvandoCliente}
                required
              />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={salvandoCliente}>
                {salvandoCliente ? "Salvando..." : "Salvar cliente e continuar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>      

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Finalizar Pagamento</DialogTitle>
            <DialogDescription>
              Escolha a forma de pagamento para concluir a venda
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="text-center p-4 bg-accent/70 rounded-lg border border-border">
              <p className="text-sm text-muted-foreground mb-1">Total a pagar</p>
              <p className="text-3xl font-bold text-primary">
                R$ {getTotal().toFixed(2).replace('.', ',')}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button
                size="lg"
                variant="outline"
                className="h-24 flex-col gap-2"
                onClick={() => handlePayment("Dinheiro")}
              >
                <Banknote className="w-8 h-8" />
                Dinheiro
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-24 flex-col gap-2"
                onClick={() => handlePayment("Cartão Crédito")}
              >
                <CreditCard className="w-8 h-8" />
                Crédito
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-24 flex-col gap-2"
                onClick={() => handlePayment("Cartão Débito")}
              >
                <CreditCard className="w-8 h-8" />
                Débito
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-24 flex-col gap-2"
                onClick={() => handlePayment("PIX")}
              >
                <Smartphone className="w-8 h-8" />
                PIX
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowPaymentDialog(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CaixaFinanceiro() {
  const [sessao, setSessao] = useState<{ id: number; saldo_caixa: string } | null>(null);
  const [carregado, setCarregado] = useState(false);
  const [ocupado, setOcupado] = useState(true);
  const [janelaAberta, setJanelaAberta] = useState(false);
  const [valor, setValor] = useState("");
  const [erroConsulta, setErroConsulta] = useState("");
  const [erroFormulario, setErroFormulario] = useState("");
  const [aberturaNoLogin, setAberturaNoLogin] = useState(false);
  const [resumo, setResumo] = useState<{
    esperado: string;
    contado: string;
    diferenca: string;
  } | null>(null);

  const consultar = useCallback(async () => {
    setOcupado(true);
    setErroConsulta("");

    try {
      const resultado = await caixaFinanceiroService.consultar();
      setSessao(resultado.sessao);
      setCarregado(true);

      if (sessionStorage.getItem("@EncantoToys:avisarAberturaCaixa") === "1") {
        sessionStorage.removeItem("@EncantoToys:avisarAberturaCaixa");

        if (resultado.sessao === null) {
          setAberturaNoLogin(true);
          setJanelaAberta(true);
        }
      }      
    } catch (erro) {
      setErroConsulta(erro instanceof Error ? erro.message : "Erro ao consultar o caixa.");
    } finally {
      setOcupado(false);
    }
  }, []);

  useEffect(() => {
    void consultar();
  }, [consultar]);

  const rotulo = sessao ? "Dinheiro contado" : "Troco inicial";
  const acao = sessao ? "Fechar caixa" : "Abrir caixa";
  const reais = (quantia: string) => `R$ ${quantia.replace(".", ",")}`;

  function abrirJanela() {
    setValor("");
    setErroFormulario("");
    setResumo(null);
    setJanelaAberta(true);
    setAberturaNoLogin(false);
  }

  async function confirmar() {
    if (ocupado) return;

    const centavos = lerCentavos(valor);
    if (centavos === null) {
      setErroFormulario("Digite um valor válido, como 50,00.");
      return;
    }

    const quantia = textoMonetario(centavos);
    setOcupado(true);
    setErroFormulario("");

    try {
      if (sessao) {
        const resultado = await caixaFinanceiroService.fechar(sessao.id, quantia);
        setResumo({
          esperado: resultado.dinheiro_esperado,
          contado: quantia,
          diferenca: resultado.diferenca,
        });
        setSessao(null);
      } else {
        setSessao(await caixaFinanceiroService.abrir(quantia));
        setJanelaAberta(false);
      }
    } catch (erro) {
      setErroFormulario(erro instanceof Error ? erro.message : "Erro ao atualizar o caixa.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {carregado ? (
        <>
          <span className="text-sm">
            {sessao ? `Valor em caixa: ${reais(sessao.saldo_caixa)}` : "Caixa financeiro fechado"}
          </span>
          <Button type="button" size="sm" onClick={abrirJanela} disabled={ocupado}>
            {acao}
          </Button>
          {resumo && (
            <span role="status" className="text-sm text-gray-500">
              Diferença: {reais(resumo.diferenca)}
            </span>
          )}          
        </>
      ) : (
        <Button type="button" size="sm" onClick={consultar} disabled={ocupado}>
          {ocupado ? "Consultando…" : "Consultar caixa"}
        </Button>
      )}

      {erroConsulta && <span role="alert" className="text-sm">{erroConsulta}</span>}

      <Dialog
        open={janelaAberta}
        onOpenChange={(aberta) => {
          if (!ocupado) setJanelaAberta(aberta);
        }}
      >
        <DialogContent
          onInteractOutside={(evento) => {
            if (aberturaNoLogin) evento.preventDefault();
          }}
          onEscapeKeyDown={(evento) => {
            if (aberturaNoLogin) evento.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>{resumo ? "Caixa fechado" : acao}</DialogTitle>
            <DialogDescription>
              {resumo
                ? "Confira o resultado do fechamento."
                : sessao
                  ? "Conte o dinheiro da gaveta e informe o total."
                  : "Informe o dinheiro colocado na gaveta para iniciar."}
            </DialogDescription>
          </DialogHeader>

          {resumo ? (
            <>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt>Valor esperado</dt>
                  <dd>{reais(resumo.esperado)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Valor contado</dt>
                  <dd>{reais(resumo.contado)}</dd>
                </div>
                <div className="flex justify-between gap-4 font-semibold">
                  <dt>Diferença</dt>
                  <dd>{reais(resumo.diferenca)}</dd>
                </div>
              </dl>
              <DialogFooter>
                <Button type="button" onClick={() => setJanelaAberta(false)}>
                  Concluir
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(evento) => {
                evento.preventDefault();
                void confirmar();
              }}
            >
              <div className="space-y-2">
                <label htmlFor="valor-caixa-financeiro" className="text-sm font-medium">
                  {rotulo}
                </label>
                <Input
                  id="valor-caixa-financeiro"
                  inputMode="decimal"
                  value={valor}
                  onChange={(evento) => setValor(evento.target.value)}
                  disabled={ocupado}
                  placeholder="0,00"
                  autoFocus
                />
              </div>

              {erroFormulario && (
                <p role="alert" className="text-sm text-red-700">{erroFormulario}</p>
              )}

              <DialogFooter>
                {!aberturaNoLogin && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={ocupado}
                    onClick={() => setJanelaAberta(false)}
                  >
                    Cancelar
                  </Button>
                )}
                <Button type="submit" disabled={ocupado}>
                  {ocupado ? "Salvando…" : sessao ? "Confirmar fechamento" : "Confirmar abertura"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}