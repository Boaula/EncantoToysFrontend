import { TipoAjuste } from "../../../models/VendaCheckout";

interface Props {
  descontoVal: number;
  descontoTipo: TipoAjuste;
  acrescimoVal: number;
  acrescimoTipo: TipoAjuste;
  onDescontoChange: (val: number, tipo: TipoAjuste) => void;
  onAcrescimoChange: (val: number, tipo: TipoAjuste) => void;
}

export function PainelDescontoAcrescimo({
  descontoVal,
  descontoTipo,
  acrescimoVal,
  acrescimoTipo,
  onDescontoChange,
  onAcrescimoChange,
}: Props) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-lg grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* PAINEL DE DESCONTO */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-rose-600 block flex items-center gap-1">
          🏷️ Desconto
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            step="0.01"
            value={descontoVal || ""}
            onChange={(e) => onDescontoChange(Number(e.target.value), descontoTipo)}
            placeholder="0.00"
            className="w-full h-10 px-3 border-2 border-slate-200 rounded-xl font-mono text-sm focus:border-rose-400 outline-none font-bold"
          />
          <button
            type="button"
            onClick={() => onDescontoChange(descontoVal, descontoTipo === "R$" ? "%" : "R$")}
            className="px-3 bg-rose-100 text-rose-700 font-black text-xs rounded-xl border border-rose-300 hover:bg-rose-200 transition-colors"
          >
            {descontoTipo}
          </button>
        </div>
      </div>

      {/* PAINEL DE ACRÉSCIMO */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-emerald-600 block flex items-center gap-1">
          📈 Acréscimo
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            step="0.01"
            value={acrescimoVal || ""}
            onChange={(e) => onAcrescimoChange(Number(e.target.value), acrescimoTipo)}
            placeholder="0.00"
            className="w-full h-10 px-3 border-2 border-slate-200 rounded-xl font-mono text-sm focus:border-emerald-400 outline-none font-bold"
          />
          <button
            type="button"
            onClick={() => onAcrescimoChange(acrescimoVal, acrescimoTipo === "R$" ? "%" : "R$")}
            className="px-3 bg-emerald-100 text-emerald-700 font-black text-xs rounded-xl border border-emerald-300 hover:bg-emerald-200 transition-colors"
          >
            {acrescimoTipo}
          </button>
        </div>
      </div>
    </div>
  );
}