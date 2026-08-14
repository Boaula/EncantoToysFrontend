import React, { useState } from "react";
import { KeyRound, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { fiscalService } from "../../services/api"; // Seu axios configurado

export const UploadCertificado: React.FC = () => {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ tipo: "sucesso" | "erro"; msg: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!arquivo || !senha) {
      setStatus({ tipo: "erro", msg: "Selecione o arquivo .pfx e digite a senha." });
      return;
    }

    setLoading(true);
    setStatus(null);

    // Envio via FormData (obrigatório para envio de arquivos)
    const formData = new FormData();
    formData.append("arquivo", arquivo);
    formData.append("senha", senha);

    try {
      await fiscalService.enviarCertificado(arquivo, senha);
      setStatus({ tipo: "sucesso", msg: "Certificado A1 configurado com sucesso!" });
      setSenha("");
      setArquivo(null);
    } catch (err: any) {
      setStatus({
        tipo: "erro",
        msg: err.response?.data?.detail || "Falha ao enviar o certificado.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-xl border border-gray-100 shadow-sm mt-6">
      <h3 className="text-lg font-semibold text-gray-700 flex items-center gap-2 mb-4">
        <KeyRound className="w-5 h-5 text-orange-500" /> Certificado Digital A1
      </h3>

      {status && (
        <div
          className={`p-4 mb-4 rounded-lg text-sm flex items-center gap-2 ${
            status.tipo === "sucesso"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {status.tipo === "sucesso" ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {status.msg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
            Arquivo do Certificado (.pfx / .p12)
          </label>
          <input
            type="file"
            accept=".pfx,.p12"
            onChange={(e) => setArquivo(e.target.files?.[0] || null)}
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
            Senha do Certificado
          </label>
          <input
            type="password"
            placeholder="Digite a senha do arquivo .pfx"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          <Upload className="w-4 h-4" />
          {loading ? "Validando e enviando..." : "Salvar Certificado"}
        </button>
      </form>
    </div>
  );
};