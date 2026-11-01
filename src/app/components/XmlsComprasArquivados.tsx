import { useState } from "react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Download, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import {
  xmlCompraService,
  type ListagemXmlsCompras,
  type XmlCompraArquivado,
} from "../../services/api";

export function XmlsComprasArquivados() {
  const [listagem, setListagem] =
    useState<ListagemXmlsCompras | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [baixandoId, setBaixandoId] = useState<string | null>(null);

  const carregar = async (deslocamento = 0) => {
    setCarregando(true);

    try {
      const dados = await xmlCompraService.listar(deslocamento);
      setListagem(dados);
    } catch (erro) {
      toast.error(
        erro instanceof Error
          ? erro.message
          : "Falha ao consultar os XMLs."
      );
    } finally {
      setCarregando(false);
    }
  };

  const baixar = async (arquivo: XmlCompraArquivado) => {
    setBaixandoId(arquivo.id);
    let endereco: string | null = null;

    try {
      const conteudo = await xmlCompraService.baixar(arquivo.id);
      endereco = URL.createObjectURL(conteudo);

      const link = document.createElement("a");
      link.href = endereco;
      link.download = `compra_${arquivo.id}.xml`;

      document.body.appendChild(link);

      try {
        link.click();
      } finally {
        link.remove();
      }

      toast.info("Download solicitado.");
    } catch (erro) {
      toast.error(
        erro instanceof Error
          ? erro.message
          : "Falha ao baixar o XML."
      );
    } finally {
      if (endereco) {
        const enderecoParaLiberar = endereco;
        window.setTimeout(
          () => URL.revokeObjectURL(enderecoParaLiberar),
          60_000
        );
      }

      setBaixandoId(null);
    }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <FolderOpen className="h-4 w-4" />
              XMLs de compras arquivados
            </h2>
            <p className="text-xs text-muted-foreground">
              Consulte e baixe os documentos guardados neste computador.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={carregando || baixandoId !== null}
            onClick={() => carregar()}
          >
            {carregando
              ? "Consultando..."
              : listagem
                ? "Atualizar lista"
                : "Consultar XMLs"}
          </Button>
        </div>

        {listagem && (
          <>
            <p className="text-xs text-muted-foreground">
              Total de arquivos: {listagem.total}
            </p>

            {listagem.arquivos.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">
                Nenhum XML encontrado nesta página.
              </p>
            ) : (
              <ul className="max-h-96 space-y-2 overflow-y-auto">
                {listagem.arquivos.map((arquivo) => (
                  <li
                    key={arquivo.id}
                    className="
                      flex flex-wrap items-center justify-between
                      gap-3 rounded-lg border p-3
                    "
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="break-words text-sm font-medium">
                        {arquivo.fornecedor || "Fornecedor indisponível"}
                      </p>

                      <p className="text-xs text-muted-foreground">
                        Nota {arquivo.numero_nota || "—"} ·{" "}
                        {arquivo.quantidade_itens ?? "—"} itens
                      </p>

                      <p className="text-xs text-muted-foreground">
                        Arquivado em{" "}
                        {new Date(arquivo.arquivado_em).toLocaleString(
                          "pt-BR",
                          { timeZone: "America/Cuiaba" }
                        )}
                      </p>

                      {arquivo.erro && (
                        <p className="text-xs text-red-700">
                          {arquivo.erro}
                        </p>
                      )}
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        baixandoId !== null ||
                        carregando ||
                        Boolean(arquivo.erro)
                      }
                      onClick={() => baixar(arquivo)}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {baixandoId === arquivo.id
                        ? "Baixando..."
                        : "Baixar XML"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {listagem.total > listagem.limite && (
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    carregando ||
                    baixandoId !== null ||
                    listagem.deslocamento === 0
                  }
                  onClick={() =>
                    carregar(
                      Math.max(
                        0,
                        listagem.deslocamento - listagem.limite
                      )
                    )
                  }
                >
                  Anterior
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    carregando ||
                    baixandoId !== null ||
                    listagem.deslocamento + listagem.limite >=
                      listagem.total
                  }
                  onClick={() =>
                    carregar(
                      listagem.deslocamento + listagem.limite
                    )
                  }
                >
                  Próxima
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}