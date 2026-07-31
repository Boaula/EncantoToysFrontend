import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { History, GripHorizontal, ArrowRight, RefreshCw } from "lucide-react";
import { pdvService } from "../../services/api";
const CHAVE_RESUMO_LOCAL = "@EncantoToys:resumoVendasHoje";

export function CardHistoricoFlutuante() {
  const navigate = useNavigate();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [resumo, setResumo] = useState<{ qtdVendas: number; totalDia: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  // 🔄 Carrega o resumo das vendas do dia ao montar o componente
  useEffect(() => {
    async function carregarResumo() {
      try {
        setLoading(true);
        // 🟢 Gera YYYY-MM-DD no fuso horário LOCAL do caixa (evita bug de UTC após as 21h)
        const hojeIso = new Date().toLocaleDateString('sv'); // 'sv' gera o formato YYYY-MM-DD

        const vendas = await pdvService.obterHistoricoVendas({
          data_inicio: `${hojeIso}T00:00:00`,
          data_fim: `${hojeIso}T23:59:59`,
        });

        const total = vendas.reduce((acc, v) => acc + Number(v.total || 0), 0);
        const novoResumo = {
          qtdVendas: vendas.length,
          totalDia: total,
        };

        setResumo(novoResumo);
        localStorage.setItem(CHAVE_RESUMO_LOCAL, JSON.stringify(novoResumo));
      } catch (error) {
        console.error("Erro ao carregar resumo de vendas no card:", error);

        const resumoSalvo = localStorage.getItem(CHAVE_RESUMO_LOCAL);
        if (resumoSalvo) {
          try {
            setResumo(JSON.parse(resumoSalvo));
          } catch {
            setResumo({ qtdVendas: 0, totalDia: 0 });
          }
        } else {
          setResumo({ qtdVendas: 0, totalDia: 0 });
        }
      } finally {
        setLoading(false);
      }
    }

    carregarResumo();

    const handleVendaRealizada = (event?: Event) => {
      const customEvent = event as CustomEvent<{ venda?: { total?: number; qtdVendas?: number } }> | undefined;
      const valorVenda = Number(customEvent?.detail?.venda?.total || 0);
      const qtdVenda = Number(customEvent?.detail?.venda?.qtdVendas || 1);

      console.log("🔔 Venda detectada! Atualizando resumo do card...");

      setResumo((prev) => {
        const novoResumo = {
          qtdVendas: (prev?.qtdVendas || 0) + qtdVenda,
          totalDia: (prev?.totalDia || 0) + valorVenda,
        };

        localStorage.setItem(CHAVE_RESUMO_LOCAL, JSON.stringify(novoResumo));
        return novoResumo;
      });

      setLoading(false);
      void carregarResumo();
    };

    window.addEventListener("venda-realizada", handleVendaRealizada);

    return () => {
      window.removeEventListener("venda-realizada", handleVendaRealizada);
    };
  }, []);

  // 🖱️ Início do Arrasto
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    hasMoved.current = false;
    dragStart.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  // 🖱️ Movimentação do Card
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    hasMoved.current = true;
    setPosition({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  };

  // 🖱️ Fim do Arrasto
  const handleMouseUp = () => {
    isDragging.current = false;
  };

  // 🚪 Ação do Clique (Só navega se não esteve arrastando)
  const handleClick = () => {
    if (!hasMoved.current) {
      navigate("/historico_vendas");
    }
  };

  return (
    <div
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleClick}
      title="Clique para abrir o Histórico ou arraste para mover"
      className="fixed top-3 left-1/2 -translate-x-1/2 ml-40 z-50 cursor-grab 
        active:cursor-grabbing select-none bg-white/95 backdrop-blur-md border
        border-primary/30 hover:border-primary shadow-md hover:shadow-xl transition-all
        rounded-xl p-2 flex items-center gap-2 group max-w-xs"
    >
      <div className="bg-primary/10 p-2.5 rounded-lg text-primary group-hover:bg-primary group-hover:text-white transition-colors">
        <History className="w-5 h-5" />
      </div>

      <div className="text-left flex-1">
        <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
          <span>VENDAS HOJE</span>
          <GripHorizontal className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <RefreshCw className="w-3 h-3 animate-spin text-primary" /> Carregando...
          </p>
        ) : (
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <span className="text-xs font-bold text-foreground">
              {resumo?.qtdVendas || 0} {resumo?.qtdVendas === 1 ? "venda" : "vendas"} |{" "}
              <span className="text-emerald-600 font-extrabold">
                R$ {(resumo?.totalDia || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </span>
            <ArrowRight className="w-3.5 h-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-primary" />
          </div>
        )}
      </div>
    </div>
  );
}