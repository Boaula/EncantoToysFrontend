import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import { products, type Product, type CartItem } from "../data/mockData";
import { Search, X, CreditCard, Banknote, Smartphone, Trash2, Plus, Minus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";

export function PDV() {
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Filter products based on search
  useEffect(() => {
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      const filtered = products.filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.barcode.includes(search) ||
          p.category.toLowerCase().includes(searchLower)
      );
      setFilteredProducts(filtered.slice(0, 8));
    } else {
      setFilteredProducts([]);
    }
  }, [search]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // F2: Focus search
      if (e.key === "F2") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      // F3: Clear cart
      if (e.key === "F3") {
        e.preventDefault();
        handleClearCart();
      }
      // F4: Open payment
      if (e.key === "F4" && cart.length > 0) {
        e.preventDefault();
        setShowPaymentDialog(true);
      }
      // ESC: Clear search
      if (e.key === "Escape" && search) {
        e.preventDefault();
        setSearch("");
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [search, cart]);

  const addToCart = (product: Product) => {
    const existing = cart.find((item) => item.id === product.id);
    if (existing) {
      if (existing.quantity < product.stock) {
        setCart(cart.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
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

  const updateQuantity = (productId: string, delta: number) => {
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

  const removeFromCart = (productId: string) => {
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
    toast.success(`Venda finalizada - ${method}`, {
      description: `Total: R$ ${getTotal().toFixed(2).replace('.', ',')}`,
    });
    setCart([]);
    setShowPaymentDialog(false);
    searchInputRef.current?.focus();
  };

  const getTotal = () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const getItemsCount = () => cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="h-screen flex flex-col bg-accent/20">
      {/* Header */}
      <div className="bg-white border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl text-primary">Ponto de Venda</h1>
            <p className="text-sm text-muted-foreground">Use F2 para buscar, F3 para limpar, F4 para finalizar</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Sábado, 20 de Junho de 2026</p>
            <p className="text-lg font-medium">{new Date().toLocaleTimeString('pt-BR')}</p>
          </div>
        </div>
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
                {(search ? filteredProducts : products.slice(0, 12)).map((product) => (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className="p-4 bg-accent/50 hover:bg-accent border border-border rounded-lg text-left transition-all hover:shadow-md group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium text-foreground group-hover:text-primary transition-colors">
                        {product.name}
                      </h4>
                      <Badge variant={product.stock <= 10 ? "destructive" : "secondary"} className="ml-2">
                        {product.stock} un
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{product.category}</p>
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
                    <div key={item.id} className="p-3 bg-accent/50 rounded-lg border border-border">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium text-sm flex-1">{item.name}</h4>
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
                onClick={() => setShowPaymentDialog(true)}
                disabled={cart.length === 0}
              >
                Finalizar Venda (F4)
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

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
            <div className="text-center p-4 bg-accent/50 rounded-lg border border-border">
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