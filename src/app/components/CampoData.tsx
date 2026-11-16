import { useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

type CampoDataProps = {
  id: string;
  value: string;
  onChange: (valor: string) => void;
  permitirLimpar?: boolean;
};

export function CampoData({
  id,
  value,
  onChange,
  permitirLimpar = false,
}: CampoDataProps) {
  const [aberto, setAberto] = useState(false);
  const data = value ? parseISO(value) : undefined;
  const selecionada = data && isValid(data) ? data : undefined;

  return (
    <Popover open={aberto} onOpenChange={setAberto} modal>
        <PopoverTrigger
        id={id}
        type="button"
        className="inline-flex h-8 w-auto shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
        {selecionada ? format(selecionada, "dd/MM/yyyy") : "Selecionar data"}
        </PopoverTrigger>

      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          locale={ptBR}
          selected={selecionada}
          defaultMonth={selecionada}
          onSelect={(dia) => {
            if (dia) onChange(format(dia, "yyyy-MM-dd"));
            setAberto(false);
          }}
          initialFocus
        />

        {permitirLimpar && value && (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                onChange("");
                setAberto(false);
              }}
            >
              Limpar data
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}