import { useState, useCallback, useRef } from "react";
import { useSlotting } from "@/context/SlottingContext";
import { generateMockSKUs } from "@/lib/slottingEngine";
import { Upload, FileSpreadsheet, FileText, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

function DropZone({
  title,
  subtitle,
  formats,
  icon: Icon,
  file,
  onFileSelect,
}: {
  title: string;
  subtitle: string;
  formats: string;
  icon: React.ElementType;
  file: File | null;
  onFileSelect: (file: File) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = event.target.files?.[0];
      if (selectedFile) {
        onFileSelect(selectedFile);
      }
    },
    [onFileSelect],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      const droppedFile = event.dataTransfer.files?.[0];
      if (droppedFile) {
        onFileSelect(droppedFile);
      }
    },
    [onFileSelect],
  );

  return (
    <Card
      onClick={handleClick}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`relative overflow-hidden transition-all duration-200 cursor-pointer border-2 border-dashed
        ${
          file
            ? "border-success/50 bg-success/5"
            : dragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-primary/5"
        }
      `}
    >
      <CardContent className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <input
          ref={inputRef}
          type="file"
          accept=".csv, .xlsx, .xls"
          className="hidden"
          onChange={handleFileChange}
        />
        <div
          className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 ${
            file ? "bg-success/10" : "bg-kpi-bg"
          }`}
        >
          {file ? (
            <CheckCircle2 className="w-7 h-7 text-success" />
          ) : (
            <Icon className="w-7 h-7 text-kpi-icon" />
          )}
        </div>
        <h3 className="text-sm font-semibold mb-1">{title}</h3>
        <p className="text-xs text-muted-foreground mb-3">
          {file ? file.name : subtitle}
        </p>
        <p className="text-[11px] text-muted-foreground/70">{formats}</p>

        {file && (
          <p className="text-xs text-success font-medium mt-3">✓ Cargado exitosamente</p>
        )}
      </CardContent>
    </Card>
  );
}

export function Step1DataIngestion() {
  const { state, updateState, completeStep, setStep, setMaestroFile, setPedidosFile } = useSlotting();

  const handleMaterials = useCallback(
    (file: File) => {
      setMaestroFile(file);
    const skus = generateMockSKUs(320);
    updateState({ materialsUploaded: true, skus });
    },
    [setMaestroFile, updateState],
  );

  const handleTransactions = useCallback(
    (file: File) => {
      setPedidosFile(file);
      updateState({ transactionsUploaded: true });
    },
    [setPedidosFile, updateState],
  );

  const canProceed = state.materialsUploaded && state.transactionsUploaded;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Carga de Maestro y Transacciones</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Suba los archivos de datos maestros y transacciones para iniciar el análisis de slotting.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <DropZone
          title="Maestro de Materiales"
          subtitle="Catálogo de SKUs con dimensiones, peso y atributos"
          formats="Excel (.xlsx) o JSON"
          icon={FileSpreadsheet}
          file={state.maestroFile}
          onFileSelect={handleMaterials}
        />
        <DropZone
          title="Base de Pedidos y Transacciones"
          subtitle="Historial de órdenes y líneas de pedido"
          formats="CSV o Excel (.xlsx)"
          icon={FileText}
          file={state.pedidosFile}
          onFileSelect={handleTransactions}
        />
      </div>

      {canProceed && (
        <div className="flex items-center gap-4 pt-2 animate-slide-in">
          <div className="flex-1 bg-success/10 border border-success/30 rounded-lg px-4 py-3">
            <p className="text-sm text-success font-medium">
              {state.skus.length} SKUs cargados · Transacciones listas
            </p>
          </div>
          <Button
            onClick={() => { completeStep(0); setStep(1); }}
            className="gap-2"
          >
            Siguiente <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
