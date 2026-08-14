interface Props {
  value: string;
  erro: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function CampoCpf({ value, erro, onChange }: Props) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-lg space-y-2">
      <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
        📄 CPF / CNPJ na Nota Fiscal (Opcional)
      </label>
      <input
        type="text"
        placeholder="000.000.000-00"
        value={value}
        onChange={onChange}
        className={`w-full h-11 px-3 border-2 ${
          erro ? "border-red-500 bg-red-50" : "border-slate-200"
        } rounded-xl font-mono text-sm focus:border-cyan-400 outline-none text-slate-800 font-bold transition-colors`}
      />
      {erro ? (
        <span className="text-xs text-red-600 font-extrabold block flex items-center gap-1">
          ⚠️ {erro}
        </span>
      ) : (
        <span className="text-[10px] text-slate-400 block font-medium">
          Deixe em branco caso o cliente não queira CPF na nota.
        </span>
      )}
    </div>
  );
}