import React, { useState, useEffect } from "react";
import { Building2, FileText, MapPin, ShieldAlert, Save } from "lucide-react";
import { fiscalService, EmpresaFiscalPayload } from "../../services/api"; // Ajuste o caminho se necessário
import { UploadCertificado } from "../components/UploadCertificado"; // Componente de upload do certificado

const INITIAL_STATE: EmpresaFiscalPayload = {
  cnpj: "",
  razao_social: "",
  nome_fantasia: "",
  inscricao_estadual: "",
  crt: 1, // 1 = Simples Nacional
  cnae_principal: "",
  email: "",
  telefone: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  municipio: "",
  codigo_ibge: "",
  uf: "",
  cep: "",
  ambiente: 2, // 2 = Homologação (Testes)
  serie_nfce: 1,
  proxima_nota_nfce: 1,
  csc_id: "",
  csc_token: "",
};

export const ConfiguracaoFiscal: React.FC = () => {
  const [formData, setFormData] = useState<EmpresaFiscalPayload>(INITIAL_STATE);
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);

useEffect(() => {
    setLoading(true);

    fiscalService
      .obterConfiguracoes()
      .then((data) => {
        if (data) {
          // Se veio a empresa do banco, preenche o formulário
          setFormData(data);
        } else {
          // Se veio null (banco vazio), o formulário continua limpo para o primeiro cadastro
          console.log("Banco de dados vazio. Pronto para o primeiro cadastro.");
        }
      })
      .catch((error) => {
        // Só vai cair aqui se houver um erro real de conexão (ex: backend desligado)
        console.error("Erro ao conectar com o servidor:", error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: ["crt", "ambiente", "serie_nfce", "proxima_nota_nfce"].includes(name)
        ? Number(value)
        : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMensagem(null);

    // Limpa caracteres especiais (máscaras) antes de enviar ao Pydantic
    const payloadFormatado: EmpresaFiscalPayload = {
      ...formData,
      cnpj: formData.cnpj.replace(/\D/g, ""),
      cep: formData.cep.replace(/\D/g, ""),
      telefone: formData.telefone.replace(/\D/g, ""),
      codigo_ibge: formData.codigo_ibge.replace(/\D/g, ""),
      uf: formData.uf.toUpperCase().trim(),
    };

    try {
      const dadosSalvos = await fiscalService.salvarConfiguracoes(payloadFormatado);
      
      if (dadosSalvos) {
        setFormData((prev) => ({ ...prev, ...dadosSalvos }));
      }
      
      setMensagem({ tipo: "sucesso", texto: "Configurações fiscais salvas com sucesso!" });
    } catch (error: any) {
      setMensagem({ tipo: "erro", texto: error.message || "Falha ao salvar configurações." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 bg-white rounded-xl shadow-sm border border-gray-100 my-6">
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200">
        <Building2 className="w-8 h-8 text-orange-500" />
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Parametrização Fiscal (Emitente)</h2>
          <p className="text-sm text-gray-500">Dados da loja para emissão de NFC-e / NF-e</p>
        </div>
      </div>

      {mensagem && (
        <div
          className={`p-4 mb-6 rounded-lg font-medium text-sm ${
            mensagem.tipo === "sucesso"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {mensagem.texto}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* DADOS DA EMPRESA */}
        <div>
          <h3 className="text-lg font-semibold text-gray-700 flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-cyan-500" /> Dados do Estabelecimento
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">CNPJ</label>
              <input
                type="text"
                name="cnpj"
                placeholder="Ex: 00.000.000/0001-00"
                value={formData.cnpj}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Inscrição Estadual (IE)</label>
              <input
                type="text"
                name="inscricao_estadual"
                placeholder="Ex: 000000000"
                value={formData.inscricao_estadual}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Regime Tributário (CRT)</label>
              <select
                name="crt"
                value={formData.crt}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
              >
                <option value={1}>1 - Simples Nacional</option>
                <option value={2}>2 - Simples Nacional (Excesso sublimite)</option>
                <option value={3}>3 - Regime Normal</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Razão Social</label>
              <input
                type="text"
                name="razao_social"
                placeholder="Ex: Minha Empresa LTDA"
                value={formData.razao_social}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Nome Fantasia</label>
              <input
                type="text"
                name="nome_fantasia"
                placeholder="Ex: Minha Loja"
                value={formData.nome_fantasia || ""}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">CNAE Principal</label>
              <input
                type="text"
                name="cnae_principal"
                placeholder="Ex: 4763601"
                value={formData.cnae_principal}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">E-mail Fiscal</label>
              <input
                type="email"
                name="email"
                placeholder="Ex: contato@suaempresa.com"
                value={formData.email}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Telefone</label>
              <input
                type="text"
                name="telefone"
                placeholder="Ex: 66999999999"
                value={formData.telefone}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* ENDEREÇO */}
        <div>
          <h3 className="text-lg font-semibold text-gray-700 flex items-center gap-2 mb-4">
            <MapPin className="w-5 h-5 text-cyan-500" /> Endereço
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Logradouro</label>
              <input
                type="text"
                name="logradouro"
                placeholder="Ex: Avenida Brasil"
                value={formData.logradouro}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Número</label>
              <input
                type="text"
                name="numero"
                placeholder="Ex: 100"
                value={formData.numero}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Complemento</label>
              <input
                type="text"
                name="complemento"
                placeholder="Ex: Sala 02 / Apto 101"
                value={formData.complemento || ""}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Bairro</label>
              <input
                type="text"
                name="bairro"
                placeholder="Ex: Centro"
                value={formData.bairro}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Município</label>
              <input
                type="text"
                name="municipio"
                placeholder="Ex: Campo Verde"
                value={formData.municipio}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Código IBGE</label>
              <input
                type="text"
                name="codigo_ibge"
                placeholder="Ex: 5102678"
                value={formData.codigo_ibge}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">UF / CEP</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  name="uf"
                  placeholder="MT"
                  value={formData.uf}
                  onChange={handleChange}
                  className="w-16 p-2.5 border border-gray-300 rounded-lg text-sm uppercase text-center focus:ring-2 focus:ring-orange-500 outline-none"
                />
                <input
                  type="text"
                  name="cep"
                  placeholder="Ex: 78840-000"
                  value={formData.cep}
                  onChange={handleChange}
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* AMBIENTE E CSC SEFAZ */}
        <div>
          <h3 className="text-lg font-semibold text-gray-700 flex items-center gap-2 mb-4">
            <ShieldAlert className="w-5 h-5 text-cyan-500" /> Parâmetros de Emissão SEFAZ
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Ambiente SEFAZ</label>
              <select
                name="ambiente"
                value={formData.ambiente}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-orange-600 focus:ring-2 focus:ring-orange-500 outline-none"
              >
                <option value={2}>2 - Homologação (Ambiente de Testes)</option>
                <option value={1}>1 - Produção (Validade Jurídica)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">ID do CSC</label>
              <input
                type="text"
                name="csc_id"
                placeholder="Ex: 000001"
                value={formData.csc_id || ""}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Token CSC</label>
              <input
                type="text"
                name="csc_token"
                placeholder="Cole o token da SEFAZ aqui"
                value={formData.csc_token || ""}
                onChange={handleChange}
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-100">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-3 rounded-lg shadow-sm transition-colors disabled:opacity-50"
          >
            <Save className="w-5 h-5" />
            {loading ? "Salvando..." : "Salvar Configurações Fiscais"}
          </button>
        </div>
      </form>
      {/* BLOCO 2: Upload do Certificado A1 */}
      <section>
        <UploadCertificado />
      </section>
    </div>
  );
};