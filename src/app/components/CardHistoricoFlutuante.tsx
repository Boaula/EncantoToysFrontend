import { useState, useRef } from "react";
import { useNavigate } from "react-router";
import { History, GripHorizontal, ArrowRight } from "lucide-react";

export function CardHistoricoFlutuante() {
  const navigate = useNavigate();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

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
    
    // Se moveu mais de 3px, consideramos que é um arrasto e não um clique
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

  // 🚪 Ação do Clique (Navega apenas se NÃO esteve arrastando)
  const handleClick = () => {
    if (!hasMoved.current) {
      navigate("/historico-vendas"); // 👈 Altere para a sua rota de histórico
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
      className="cursor-grab active:cursor-grabbing select-none bg-white/95 backdrop-blur-md border border-primary/30 hover:border-primary shadow-md hover:shadow-xl transition-all rounded-xl p-2.5 flex items-center gap-3 z-50 group max-w-xs"
    >
      <div className="bg-primary/10 p-2 rounded-lg text-primary group-hover:bg-primary group-hover:text-white transition-colors">
        <History className="w-5 h-5" />
      </div>

      <div className="text-left flex-1">
        <div className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
          <span>HISTÓRICO</span>
          <GripHorizontal className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
        </div>
        <p className="text-xs font-bold text-foreground flex items-center gap-1">
          Histórico de Vendas
          <ArrowRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-primary" />
        </p>
      </div>
    </div>
  );
}