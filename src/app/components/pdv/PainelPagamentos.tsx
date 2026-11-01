import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  FORMAS_PAGAMENTO,
  formatarCentavos,
  lerCentavos,
  prepararPagamentos,
  textoMonetario,
  totalEmCentavos,
  type PagamentoFormulario,
} from "../../../services/pagamentosVenda";
import type { FormaPagamentoParcela } from "../../../services/api";

interface Props {
  total: number;
  pagamentos: PagamentoFormulario[];
  onChange: (pagamentos: PagamentoFormulario[]) => void;
  disabled?: boolean;
}

export function PainelPagamentos({
  total,
  pagamentos,
  onChange,
  disabled = false,
}: Props) {
  let totalCentavos = 0n;
  let erro = "";

  try {
    totalCentavos = totalEmCentavos(total);
    prepararPagamentos(total, pagamentos);
  } catch (falha) {
    erro = falha instanceof Error
      ? falha.message
      : "Confira os pagamentos.";
  }

  const dividido = pagamentos.length > 1;

  const soma = dividido
    ? pagamentos.reduce(
        (acumulado, pagamento) =>
          acumulado + (lerCentavos(pagamento.valor) ?? 0n),
        0n,
      )
    : totalCentavos;

  const saldo = totalCentavos - soma;

  const atualizar = (
    id: string,
    alteracao: Partial<PagamentoFormulario>,
  ) => {
    onChange(
      pagamentos.map((pagamento) =>
        pagamento.id === id
          ? { ...pagamento, ...alteracao }
          : pagamento,
      ),
    );
  };

  const adicionar = () => {
    if (pagamentos.length >= 20) return;

    const atuais = pagamentos.map((pagamento) => ({
      ...pagamento,
      valor: dividido
        ? pagamento.valor
        : textoMonetario(totalCentavos),
    }));

    onChange([
      ...atuais,
      {
        id: crypto.randomUUID(),
        forma: "PIX",
        valor: "",
        recebido: "",
      },
    ]);
  };

  return (
    <fieldset
      disabled={disabled}
      className="rounded-2xl border bg-white p-4 space-y-4"
    >
      <legend className="px-2 font-semibold">
        Pagamento
      </legend>

      <p className="text-sm text-slate-600">
        {dividido
          ? "Informe quanto será pago em cada método."
          : "Use um método ou adicione outro para dividir o pagamento."}
      </p>

      {pagamentos.map((pagamento, indice) => {
        const valor = dividido
          ? lerCentavos(pagamento.valor)
          : totalCentavos;

        const recebido = lerCentavos(pagamento.recebido);

        const troco =
          pagamento.forma === "DINHEIRO" &&
          valor !== null &&
          recebido !== null &&
          recebido >= valor
            ? recebido - valor
            : 0n;

        return (
          <div
            key={pagamento.id}
            className="rounded-xl border p-3 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                Pagamento {indice + 1}
              </h3>

              {dividido && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onChange(
                      pagamentos.filter(
                        (item) => item.id !== pagamento.id,
                      ),
                    )
                  }
                >
                  Remover
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label
                  htmlFor={`forma-${pagamento.id}`}
                  className="text-sm"
                >
                  Método
                </label>

                <select
                  id={`forma-${pagamento.id}`}
                  value={pagamento.forma}
                  onChange={(e) =>
                    atualizar(pagamento.id, {
                      forma: e.target.value as FormaPagamentoParcela,
                      recebido: "",
                    })
                  }
                  className="w-full rounded-md border bg-white px-3 py-2 text-sm"
                >
                  {FORMAS_PAGAMENTO.map((forma) => (
                    <option key={forma.valor} value={forma.valor}>
                      {forma.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor={`valor-${pagamento.id}`}
                  className="text-sm"
                >
                  Valor aplicado à venda (R$)
                </label>

                <Input
                  id={`valor-${pagamento.id}`}
                  type="text"
                  inputMode="decimal"
                  value={
                    dividido
                      ? pagamento.valor
                      : textoMonetario(totalCentavos).replace(".", ",")
                  }
                  readOnly={!dividido}
                  placeholder="0,00"
                  onChange={(e) =>
                    atualizar(pagamento.id, {
                      valor: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            {pagamento.forma === "DINHEIRO" && (
              <div className="space-y-2">
                <label
                  htmlFor={`recebido-${pagamento.id}`}
                  className="text-sm"
                >
                  Dinheiro recebido (R$)
                </label>

                <Input
                  id={`recebido-${pagamento.id}`}
                  type="text"
                  inputMode="decimal"
                  value={pagamento.recebido}
                  placeholder="Em branco: valor exato"
                  onChange={(e) =>
                    atualizar(pagamento.id, {
                      recebido: e.target.value,
                    })
                  }
                />

                <p className="text-sm">
                  Troco: <strong>{formatarCentavos(troco)}</strong>
                </p>
              </div>
            )}
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        onClick={adicionar}
        disabled={disabled || pagamentos.length >= 20}
      >
        + Adicionar pagamento
      </Button>

      {dividido && (
        <p className="text-sm font-semibold" aria-live="polite">
          {saldo > 0n
            ? `Falta pagar: ${formatarCentavos(saldo)}`
            : saldo < 0n
            ? `Valor excedente: ${formatarCentavos(-saldo)}`
            : "Total distribuído entre os pagamentos."}
        </p>
      )}

      {erro && (
        <p className="text-sm text-red-700" role="status">
          {erro}
        </p>
      )}
    </fieldset>
  );
}