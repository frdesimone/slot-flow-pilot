import { useState, useCallback, useRef } from "react";
import { useSlotting } from "@/context/SlottingContext";
import { FileSpreadsheet, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

function DropZone({
  title,
  subtitle,
  formats,
  icon: Icon,
  file,
  onFileSelect,
  large,
  accept = ".csv,.xlsx,.xls",
}: {
  title: string;
  subtitle: string;
  formats: string;
  icon: React.ElementType;
  file: File | null;
  onFileSelect: (file: File) => void;
  large?: boolean;
  accept?: string;
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
      <CardContent className={`flex flex-col items-center justify-center text-center ${large ? "py-16 px-8" : "py-12 px-6"}`}>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
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
  const { state, updateState, completeStep, setStep, setDataFile, setMappingConfig } = useSlotting();

  const handleFileSelect = useCallback(
    (file: File) => {
      setDataFile(file);
      updateState({ materialsUploaded: true, transactionsUploaded: true });
    },
    [setDataFile, updateState],
  );

  const canProceed = !!state.dataFile;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Carga de Dataset de Slotting</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Suba un único archivo Excel con las hojas de Maestro y Pedidos para iniciar el análisis.
        </p>
      </div>

      <DropZone
        title="Dataset de Slotting (Excel único)"
        subtitle="Un libro Excel con hojas de Maestro de Materiales e Historial de Pedidos"
        formats="Excel (.xlsx, .xls)"
        icon={FileSpreadsheet}
        file={state.dataFile}
        onFileSelect={handleFileSelect}
        accept=".xlsx,.xls"
        large
      />

      <Accordion type="single" collapsible className="border rounded-xl bg-card/60 shadow-sm">
        <AccordionItem value="mapping" className="border-none">
          <AccordionTrigger className="px-4 py-3 text-sm font-semibold">
            Configuración avanzada de mapeo de columnas
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 pt-0">
            <p className="text-xs text-muted-foreground mb-4">
              Ajusta los nombres de hojas y columnas exactamente como aparecen en tus archivos Excel/CSV.
              La coincidencia será case-insensitive en el backend.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Card className="border-dashed">
                <CardContent className="pt-4 space-y-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Maestro de Materiales
                  </h3>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Hoja de Excel (sheet_maestro)</Label>
                    <Input
                      value={state.mappingConfig.sheet_maestro}
                      onChange={(e) => setMappingConfig({ sheet_maestro: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Columna SKU (col_sku_maestro)</Label>
                    <Input
                      value={state.mappingConfig.col_sku_maestro}
                      onChange={(e) => setMappingConfig({ col_sku_maestro: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Volumen (col_volumen)</Label>
                      <Input
                        value={state.mappingConfig.col_volumen}
                        onChange={(e) => setMappingConfig({ col_volumen: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Peso (col_peso)</Label>
                      <Input
                        value={state.mappingConfig.col_peso}
                        onChange={(e) => setMappingConfig({ col_peso: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Alto (col_alto)</Label>
                      <Input
                        value={state.mappingConfig.col_alto}
                        onChange={(e) => setMappingConfig({ col_alto: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Ancho (col_ancho)</Label>
                      <Input
                        value={state.mappingConfig.col_ancho}
                        onChange={(e) => setMappingConfig({ col_ancho: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Largo (col_largo)</Label>
                      <Input
                        value={state.mappingConfig.col_largo}
                        onChange={(e) => setMappingConfig({ col_largo: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-dashed">
                <CardContent className="pt-4 space-y-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Historial de Pedidos
                  </h3>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Hoja de Excel (sheet_pedidos)</Label>
                    <Input
                      value={state.mappingConfig.sheet_pedidos}
                      onChange={(e) => setMappingConfig({ sheet_pedidos: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Columna ID Pedido (col_pedido_id)</Label>
                    <Input
                      value={state.mappingConfig.col_pedido_id}
                      onChange={(e) => setMappingConfig({ col_pedido_id: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Columna SKU Pedido (col_pedido_sku)</Label>
                    <Input
                      value={state.mappingConfig.col_pedido_sku}
                      onChange={(e) => setMappingConfig({ col_pedido_sku: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Columna Cantidad (col_pedido_cant)</Label>
                    <Input
                      value={state.mappingConfig.col_pedido_cant}
                      onChange={(e) => setMappingConfig({ col_pedido_cant: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {canProceed && (
        <div className="flex items-center gap-4 pt-2 animate-slide-in">
          <div className="flex-1 bg-success/10 border border-success/30 rounded-lg px-4 py-3">
            <p className="text-sm text-success font-medium">
              Dataset cargado · Listo para auditoría
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
