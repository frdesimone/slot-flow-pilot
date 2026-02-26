import { useState } from "react";
import { useSlotting } from "@/context/SlottingContext";
import { TrayData } from "@/context/SlottingContext";
import { ArrowLeft, Play, Settings2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";

function KPIMini({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="kpi-card border rounded-lg px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tracking-tight">
        {value}<span className="text-xs font-normal text-muted-foreground ml-1">{unit}</span>
      </p>
    </div>
  );
}

function downloadMicroCSV(traysPerVLM: TrayData[][]) {
  const rows: string[][] = [["SKU ID", "Tray ID", "VLM ID", "Slot/Position"]];
  traysPerVLM.forEach((trays, vlmIdx) => {
    trays.forEach((tray) => {
      (tray.skus ?? []).forEach((sku, slotIdx) => {
        rows.push([
          String(sku.id ?? ""),
          String(tray.id ?? ""),
          String(tray.vlmId ?? vlmIdx + 1),
          String(tray.groupId ?? slotIdx + 1),
        ]);
      });
    });
  });
  const csv = rows.map((r) => r.map((c) => (c.includes(",") || c.includes('"') ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `micro_slotting_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function getHeatColor(fill: number): string {
  if (fill > 85) return "bg-red-500/80";
  if (fill > 60) return "bg-orange-400/80";
  if (fill > 35) return "bg-yellow-400/80";
  if (fill > 10) return "bg-emerald-400/80";
  return "bg-emerald-200/50";
}

function TrayGrid({ trays, vlmIndex }: { trays: TrayData[]; vlmIndex: number }) {
  const [selected, setSelected] = useState<TrayData | null>(null);
  const cols = 6;

  return (
    <>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {trays.map((tray, idx) => (
          <button
            key={tray.id}
            onClick={() => setSelected(tray)}
            className={`heat-cell aspect-square flex items-center justify-center text-[10px] font-mono font-medium text-foreground/80 hover:ring-2 hover:ring-primary ${getHeatColor(tray.volumeFill)}`}
            title={`${tray.volumeFill}% vol · ${tray.skus.length} SKUs`}
          >
            {idx + 1}
          </button>
        ))}
        {/* Empty slots */}
        {Array.from({ length: Math.max(0, 50 - trays.length) }).map((_, i) => (
          <div key={`empty-${i}`} className="heat-cell aspect-square bg-muted/40 rounded" />
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-200/50" /> &lt;10%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-400/80" /> 10-35%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-400/80" /> 35-60%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-400/80" /> 60-85%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/80" /> &gt;85%</span>
      </div>

      {/* Tray detail dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Bandeja {selected?.id} — VLM {vlmIndex + 1}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <KPIMini label="Llenado Volumen" value={selected?.volumeFill || 0} unit="%" />
            <KPIMini label="Llenado Peso" value={selected?.weightFill || 0} unit="%" />
          </div>
          <div className="text-xs font-medium mb-2">SKUs Contenidos ({selected?.skus?.length ?? 0})</div>
          <div className="max-h-48 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">ID</TableHead>
                  <TableHead className="text-xs">Descripción</TableHead>
                  <TableHead className="text-xs text-right">Uds</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(selected?.skus ?? []).slice(0, 50).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-[11px]">{s.id}</TableCell>
                    <TableCell className="text-[11px]">{s.description}</TableCell>
                    <TableCell className="text-right text-[11px]">{s.units}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {(selected?.skus?.length ?? 0) > 50 && (
            <p className="text-xs text-muted-foreground mt-2">
              Mostrando los primeros 50 resultados (Total: {selected?.skus?.length ?? 0})
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function Step4MicroSlotting() {
  const { state, updateState, completeStep, setStep } = useSlotting();
  const [running, setRunning] = useState(false);
  const { toast } = useToast();

  const handleRun = async () => {
    if (!state.dataFile) {
      toast({
        title: "Archivo pendiente",
        description: "Por favor vuelve al Paso 1 y carga el dataset Excel antes de continuar.",
        variant: "destructive",
      });
      return;
    }

    try {
      setRunning(true);

      const formData = new FormData();
      formData.append("file", state.dataFile);

      // Parámetros propios de Micro-Slotting
      formData.append("cycle_days", String(state.coverageDays));
      formData.append("n_vlms", String(state.vlmCount));
      formData.append("n_trays_per_vlm", String(state.traysPerVLM));
      formData.append("include_zero_rot", String(state.includeNoRotation));
      formData.append("optimize_trays", "true");
      formData.append("opt_time_ms", "2000");

      // Mapping de columnas y hojas
      Object.entries(state.mappingConfig).forEach(([key, value]) => {
        formData.append(key, value);
      });

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/micro`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_API_TOKEN}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || "Error al ejecutar Micro-Slotting");
      }

      let data: import("@/context/SlottingContext").MicroResult;
      try {
        const raw = await response.json();
        const traysPerVLM = Array.isArray(raw?.traysPerVLM) ? raw.traysPerVLM : [];
        data = {
          vlmCount: typeof raw?.vlmCount === "number" ? raw.vlmCount : 0,
          traysPerVLM,
          heightEfficiency: typeof raw?.heightEfficiency === "number" ? raw.heightEfficiency : 0,
          areaEfficiency: typeof raw?.areaEfficiency === "number" ? raw.areaEfficiency : 0,
          avgTraysPerOrder: typeof raw?.avgTraysPerOrder === "number" ? raw.avgTraysPerOrder : 0,
          replicationCoverage: typeof raw?.replicationCoverage === "number" ? raw.replicationCoverage : 0,
        };
      } catch (parseError) {
        console.error(parseError);
        toast({
          title: "Error al interpretar la respuesta",
          description: parseError instanceof Error ? parseError.message : "La API devolvió datos no válidos.",
          variant: "destructive",
        });
        return;
      }

      updateState({ microResult: data });
      completeStep(3);
    } catch (error) {
      console.error(error);
      toast({
        title: "No se pudo ejecutar Micro-Slotting",
        description: "Revisa la API o los parámetros de entrada e inténtalo nuevamente.",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  const micro = state.microResult;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Micro-Slotting: Distribución Física</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure el hardware y algoritmos de clustering para la asignación física de bandejas.
          </p>
        </div>
        <Button onClick={handleRun} disabled={running} className="gap-2" size="lg">
          <Play className="w-4 h-4" />
          {running ? "Optimizando..." : "Ejecutar Micro-Slotting"}
        </Button>
      </div>

      {/* Parámetros principales (Clustering y Replicación usan valores por defecto del contexto) */}
      <Card>
        <div className="px-5 py-4 border-b">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-kpi-icon" /> Parámetros de Hardware
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Cantidad de VLMs, bandejas y dimensiones</p>
        </div>
        <CardContent className="py-5">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Cantidad VLMs</Label>
              <Input type="number" value={state.vlmCount} onChange={(e) => updateState({ vlmCount: parseInt(e.target.value) || 4 })} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bandejas/VLM</Label>
              <Input type="number" value={state.traysPerVLM} onChange={(e) => updateState({ traysPerVLM: parseInt(e.target.value) || 50 })} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ancho (m)</Label>
              <Input type="number" step="0.1" value={state.trayWidth} onChange={(e) => updateState({ trayWidth: parseFloat(e.target.value) || 0.6 })} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Profundidad (m)</Label>
              <Input type="number" step="0.1" value={state.trayDepth} onChange={(e) => updateState({ trayDepth: parseFloat(e.target.value) || 0.4 })} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Carga Máx (kg)</Label>
              <Input type="number" value={state.trayMaxWeight} onChange={(e) => updateState({ trayMaxWeight: parseFloat(e.target.value) || 80 })} className="h-9" />
            </div>
          </div>
        </CardContent>
      </Card>

      {running && (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="ml-3 text-sm text-muted-foreground">Optimizando distribución física...</p>
        </div>
      )}

      {/* Results */}
      {micro && (
        <div className="space-y-6 animate-slide-in">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPIMini label="Eficiencia Altura" value={micro.heightEfficiency} unit="%" />
            <KPIMini label="Eficiencia Área" value={micro.areaEfficiency} unit="%" />
            <KPIMini label="Bandejas/Orden" value={micro.avgTraysPerOrder} />
            <KPIMini label="Cobertura Replicación" value={micro.replicationCoverage} unit="%" />
          </div>

          {/* Tabs per VLM */}
          <Card>
            <Tabs defaultValue="vlm-0">
              <div className="px-5 py-3 border-b flex items-center justify-between">
                <TabsList className="h-9">
                  {(micro.traysPerVLM ?? []).map((_, i) => (
                    <TabsTrigger key={i} value={`vlm-${i}`} className="text-xs px-4">
                      VLM {i + 1}
                      <Badge variant="secondary" className="ml-2 text-[10px]">{(micro.traysPerVLM ?? [])[i]?.length ?? 0}</Badge>
                    </TabsTrigger>
                  ))}
                </TabsList>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => downloadMicroCSV(micro.traysPerVLM ?? [])}
                >
                  <Download className="w-4 h-4" />
                  Exportar a CSV
                </Button>
              </div>
              {(micro.traysPerVLM ?? []).map((trays, i) => (
                <TabsContent key={i} value={`vlm-${i}`} className="p-5">
                  <div className="mb-3">
                    <p className="text-xs text-muted-foreground">
                      {trays.length} bandejas ocupadas · Click en una bandeja para ver SKUs contenidos
                    </p>
                  </div>
                  <TrayGrid trays={trays ?? []} vlmIndex={i} />
                </TabsContent>
              ))}
            </Tabs>
          </Card>
        </div>
      )}

      {!micro && !running && (
        <Card className="border-dashed bg-muted/30">
          <CardContent className="py-10 px-6 text-center">
            <p className="text-sm text-muted-foreground">
              Aún no hay resultados. Configura los parámetros arriba y haz clic en <strong>Ejecutar Micro-Slotting</strong> para ver la distribución de bandejas.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Anterior
        </Button>
      </div>
    </div>
  );
}
