import React, { useState, useEffect } from "react";
import { pdvService } from "../../services/api";
import { invoke } from "@tauri-apps/api/core";

export function TagIdentificadoraPDV() {
  const [tagNome, setTagNome] = useState("Identificando...");
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    async function inicializarIdentificacao() {
      // 🕵️‍♂️ Verificação de ambiente (Se não houver Tauri, avisa no console)
      const isTauri = typeof window !== "undefined" && (("__TAURI_INTERNALS__" in window) || ("__TAURI__" in window));
      
      let nomeDaMaquina = "MHS_WEB"; // Fallback para ambiente web
      
      if (isTauri) {
        try {
          // 🚀 Invoca o hostname diretamente pelo core, evitando erros de undefined
          nomeDaMaquina = await invoke<string>("plugin:os|hostname");
          console.log("Nome da máquina detectado via Tauri:", nomeDaMaquina);
        } catch (tauriErr) {
          console.error("Erro ao ler o hostname do Tauri, usando fallback:", tauriErr);
          nomeDaMaquina = "MAQUINA_ERRO";
        }
      } else {
        console.warn("⚠️ Contexto do Tauri não encontrado. Rodando no navegador.");
        setTagNome("Ambiente Web (Sem OS)");
        // Se estiver no navegador, podemos ainda assim tentar checar o status usando o nome genérico
      }

      try {

        // 🔐 Verifica a licença antes de iniciar a operação do PDV
        const respostaLicenca = await fetch(
          "http://127.0.0.1:8000/licenca/status"
        );

        if (respostaLicenca.ok) {
          const licenca = await respostaLicenca.json();

          if (!licenca.ativa) {
            console.log(
              "🔒 Licença expirada. Inicialização do PDV não será executada."
            );

            setTagNome("Licença expirada");
            setAberto(false);

            return;
          }
        }

        // Pegamos o username salvo no localStorage para mandar junto, caso seu pdvService exija
        const username = localStorage.getItem("@EncantoToys:username") || "operador";

        // Primeiro identifica/cadastra o computador.
        // Se o hostname ainda não existir no banco, o backend cria o PDV.
        const dispositivo = await pdvService.identificarMaquina(nomeDaMaquina);

        console.log("PDV identificado:", dispositivo);

        // Depois inicia a operação normalmente.
        const dadosCaixa = await pdvService.iniciarOperacao(nomeDaMaquina, username);

        setTagNome(dadosCaixa.tag_nome);
        setAberto(dadosCaixa.esta_aberto);
      } catch (err: any) {
        console.error("Erro ao sincronizar máquina com o backend:", err);
        // Se estamos no navegador e o backend respondeu, mas não via Tauri:
        if (!isTauri) {
          setTagNome("Ambiente Web (Sem OS)");
        } else {
          setTagNome(`Erro API: ${err.message || String(err)}`);
        }
      }
    }

    inicializarIdentificacao();
  }, []);

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all
      ${aberto ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-100 text-gray-600 border border-gray-200"}`}
    >
      <span className={`w-2 h-2 rounded-full ${aberto ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
      <span>{tagNome} — {aberto ? "Aberto" : "Indisponível"}</span>
    </div>
  );
}