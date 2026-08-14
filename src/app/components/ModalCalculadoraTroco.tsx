import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Banknote, AlertCircle, CheckCircle2 } from "lucide-react";

interface ModalCalculadoraTrocoProps {
  isOpen: boolean;
  onClose: () => void;
  totalVenda: number;
  onConfirm: (valorPago: number, troco: number) => void;
}

export function ModalCalculadoraTroco({
  isOpen,
  onClose,
  totalVenda,
  onConfirm,
}: ModalCalculadoraTrocoProps) {
  const [valorPagoInput, setValorPagoInput] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reseta o campo e foca no input automaticamente ao abrir o modal
  useEffect(() => {
    if (isOpen) {
      setValorPagoInput("");
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [isOpen]);

  // Converte entrada (aceitando vírgula ou ponto)
  const valorPago = parseFloat(valorPagoInput.replace(",", ".")) || 0;
  const troco = valorPago - totalVenda;
  const estaPago = valorPago >= totalVenda && totalVenda > 0;

  // Atalhos de cédulas rápidas
  const handleQuickAdd = (valor: number) => {
    setValorPagoInput(valor.toFixed(2).replace(".", ","));
  };

  const handleValorExato = () => {
    setValorPagoInput(totalVenda.toFixed(2).replace(".", ","));
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (estaPago) {
      onConfirm(valorPago, Math.max(0, troco));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md border-2 border-emerald-500 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-800">
            <Banknote className="w-6 h-6 text-emerald-600" />
            Pagamento em Dinheiro
          </DialogTitle>
          <DialogDescription>
            Informe o valor entregue pelo cliente para calcular o troco.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Card Resumo do Total */}
          <div className="bg-slate-100 p-4 rounded-xl flex justify-between items-center border border-slate-200">
            <span className="text-sm font-semibold text-slate-600">Total da Venda:</span>
            <span className="text-2xl font-black text-slate-900 font-mono">
              R$ {totalVenda.toFixed(2).replace(".", ",")}
            </span>
          </div>

          {/* Input do Valor Pago */}
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Valor Recebido do Cliente (R$)
            </label>
            <Input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={valorPagoInput}
              onChange={(e) => setValorPagoInput(e.target.value)}
              className="h-14 text-2xl font-bold font-mono text-center border-2 focus-visible:ring-emerald-500"
            />
          </div>

          {/* Botões de Atalho Rápido de Cédulas */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-slate-500 block">Atalhos de Cédulas:</span>
            <div className="grid grid-cols-3 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleValorExato} className="font-bold border-slate-300">
                Valor Exato
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => handleQuickAdd(10)} className="font-bold">
                R$ 10,00
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => handleQuickAdd(20)} className="font-bold">
                R$ 20,00
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => handleQuickAdd(50)} className="font-bold">
                R$ 50,00
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => handleQuickAdd(100)} className="font-bold">
                R$ 100,00
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => handleQuickAdd(200)} className="font-bold">
                R$ 200,00
              </Button>
            </div>
          </div>

          {/* Painel do Troco / Pendência */}
          <div
            className={`p-4 rounded-xl border flex flex-col items-center justify-center transition-all ${
              estaPago
                ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                : "bg-amber-50 border-amber-300 text-amber-900"
            }`}
          >
            <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1">
              {estaPago ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Troco a Devolver
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  {valorPago > 0 ? "Valor Insuficiente (Falta)" : "Aguardando Valor"}
                </>
              )}
            </span>

            <div className="text-3xl font-black font-mono mt-1">
              R$ {Math.abs(troco).toFixed(2).replace(".", ",")}
            </div>
          </div>

          <DialogFooter className="pt-2 flex justify-between gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!estaPago}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black h-12 px-6 flex-1 text-base shadow-lg"
            >
              Confirmar Pagamento (Enter)
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}