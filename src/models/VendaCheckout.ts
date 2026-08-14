export type TipoAjuste = "R$" | "%";

export interface ItemCarrinho {
  id: number;
  nome: string;
  quantidade: number;
  precoUnitario: number;
}

export class VendaCheckout {
  private itens: ItemCarrinho[];
  private descontoValor: number = 0;
  private descontoTipo: TipoAjuste = "R$";
  private acrescimoValor: number = 0;
  private acrescimoTipo: TipoAjuste = "R$";

  constructor(itensBrutos: any[]) {
    this.itens = this.normalizarItens(itensBrutos);
  }

  /**
   * Converte itens heterogêneos do estado para um formato padrão.
   */
  private normalizarItens(itensBrutos: any[]): ItemCarrinho[] {
    return itensBrutos.map((item) => ({
      id: Number(item.id ?? item.produto_id ?? item.product_id ?? item.product?.id ?? 0),
      nome: String(item.nome || item.nome_produto || item.name || "Produto"),
      quantidade: Number(item.quantity ?? item.quantidade ?? item.qtd ?? 1),
      precoUnitario: Number(item.price ?? item.preco ?? item.preco_venda ?? item.preco_unitario ?? 0),
    }));
  }

  public getItens(): ItemCarrinho[] {
    return this.itens;
  }

  // --- MÉTODOS DE DESCONTO E ACRÉSCIMO ---

  public setDesconto(valor: number, tipo: TipoAjuste) {
    this.descontoValor = Math.max(0, valor);
    this.descontoTipo = tipo;
  }

  public setAcrescimo(valor: number, tipo: TipoAjuste) {
    this.acrescimoValor = Math.max(0, valor);
    this.acrescimoTipo = tipo;
  }

  public getSubtotal(): number {
    return this.itens.reduce((acc, item) => acc + item.precoUnitario * item.quantidade, 0);
  }

  public getValorCalculadoDesconto(): number {
    const subtotal = this.getSubtotal();
    if (this.descontoTipo === "%") {
      return (subtotal * this.descontoValor) / 100;
    }
    return Math.min(subtotal, this.descontoValor); // O desconto não pode exceder o subtotal
  }

  public getValorCalculadoAcrescimo(): number {
    const subtotal = this.getSubtotal();
    if (this.acrescimoTipo === "%") {
      return (subtotal * this.acrescimoValor) / 100;
    }
    return this.acrescimoValor;
  }

  public getTotalFinal(): number {
    const total = this.getSubtotal() - this.getValorCalculadoDesconto() + this.getValorCalculadoAcrescimo();
    return Math.max(0, total);
  }

  /**
   * Exporta os itens formatados para o payload de envio da API
   */
  public toPayloadItens() {
    return this.itens.map((item) => {
      if (!item.id) {
        throw new Error(`Produto "${item.nome}" está sem ID.`);
      }
      return {
        produto_id: item.id,
        quantidade: item.quantidade,
        preco_unitario: item.precoUnitario,
      };
    });
  }

  public toPayloadCompleto(caixaId: number, usuarioId: number, formaPagamento: string, cpfCnpj?: string) {
    return {
      caixa_id: caixaId,
      usuario_id: usuarioId,
      forma_pagamento: formaPagamento,
      cpf_cnpj: cpfCnpj ? cpfCnpj.replace(/\D/g, "") : null,
      
      // 📊 Valores financeiros para persistência no Banco
      subtotal: this.getSubtotal(),
      desconto: this.getValorCalculadoDesconto(),
      desconto_tipo: this.descontoTipo,
      acrescimo: this.getValorCalculadoAcrescimo(),
      acrescimo_tipo: this.acrescimoTipo,
      valor_total: this.getTotalFinal(),

      itens: this.toPayloadItens(),
    };
  }
}