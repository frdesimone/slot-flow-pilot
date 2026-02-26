import { useState } from "react";
import { useSlotting, type MacroResult } from "@/context/SlottingContext";
import { ArrowRight, ArrowLeft, Play, Plus, Trash2, Package, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";

type MacroStorageType = {
  name: string;
  priority: number;
  max_volume: number;
  max_weight: number;
  capacity: number;
  occupancy: number;
};

const DEFAULT_STORAGE: MacroStorageType = {
  name: "VLM",
  priority: 1,
  max_volume: 0.1,
  max_weight: 25,
  capacity: 60,
  occupancy: 0.85,
};

function extractId(obj: Record<string, unknown>): string | null {
  const keys = ["id", "sku_id", "material", "codigo"];
  for (const k of keys) {
    const v = obj[k];
    if (v != null && typeof v === "string") return v;
    if (v != null && typeof v === "number") return String(v);
  }
  return null;
}

function downloadMacroCSV(macroSkus: Array<Record<string, unknown>>) {
  const getVal = (row: Record<string, unknown>, ...keys: string[]) => {
    for (const k of keys) {
      const v = row[k];
      if (v != null) return String(v);
    }
    return "";
  };
  const rows: string[][] = [["SKU ID", "Storage Type", "Volume Cycle", "ABC Class"]];
  macroSkus.forEach((row) => {
    rows.push([
      getVal(row, "id", "sku_id", "material", "codigo"),
      getVal(row, "storage_type"),
      getVal(row, "volume_cycle", "cycle_volume"),
      getVal(row, "abc_class"),
    ]);
  });
  const csv = rows.map((r) => r.map((c) => (c.includes(",") || c.includes('"') ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `macro_slotting_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function extractOrderId(obj: Record<string, unknown>): string | null {
  const keys = ["id", "order_id", "pedido_id", "nro_pedido"];
  for (const k of keys) {
    const v = obj[k];
    if (v != null && typeof v === "string") return v;
    if (v != null && typeof v === "number") return String(v);
  }
  return null;
}

export function Step3MacroSlotting() {
  const { state, updateState, completeStep, setStep } = useSlotting();
  const [running, setRunning] = useState(false);
  const { toast } = useToast();

  const [storageTypes, setStorageTypes] = useState<MacroStorageType[]>([{ ...DEFAULT_STORAGE }]);

  const auditResults = state.auditResults;
  const excludeOutliers = state.excludeOutliers;

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
      formData.append("cycle_days", String(state.coverageDays));

      // Exclusiones de auditoría
      formData.append("exclude_outliers", excludeOutliers ? "true" : "false");

      let excluded_skus: string[] = [];
      let excluded_orders: string[] = [];

      if (excludeOutliers && auditResults) {
        const heavy = (auditResults.heavy_skus ?? []) as Record<string, unknown>[];
        const bulky = (auditResults.bulky_skus ?? []) as Record<string, unknown>[];
        const massive = (auditResults.massive_orders ?? []) as Record<string, unknown>[];

        excluded_skus = [...heavy, ...bulky]
          .map(extractId)
          .filter((id): id is string => id != null);

        excluded_orders = massive
          .map(extractOrderId)
          .filter((id): id is string => id != null);
      }

      formData.append("excluded_skus", JSON.stringify(excluded_skus));
      formData.append("excluded_orders", JSON.stringify(excluded_orders));

      // Tipos de almacenamiento dinámicos
      formData.append("storage_types", JSON.stringify(storageTypes));

      Object.entries(state.mappingConfig).forEach(([key, value]) => {
        formData.append(key, value);
      });

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/macro`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_API_TOKEN}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || "Error al ejecutar Macro-Slotting");
      }

      let data: MacroResult;
      try {
        data = (await response.json()) as MacroResult;
      } catch (parseError) {
        console.error(parseError);
        toast({
          title: "Error al interpretar la respuesta",
          description: parseError instanceof Error ? parseError.message : "La API devolvió datos no válidos.",
          variant: "destructive",
        });
        return;
      }

      updateState({ macroResult: data });
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Revisa la API o los parámetros de entrada e inténtalo nuevamente.";
      toast({
        title: "No se pudo ejecutar Macro-Slotting",
        description: message,
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  const addStorageType = () => {
    setStorageTypes((prev) => [
      ...prev,
      {
        ...DEFAULT_STORAGE,
        name: `Storage ${prev.length + 1}`,
        priority: prev.length + 1,
      },
    ]);
  };

  const updateStorageType = (idx: number, field: keyof MacroStorageType, value: string | number) => {
    setStorageTypes((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: typeof value === "string" && field !== "name" ? parseFloat(value) || 0 : value };
      return next;
    });
  };

  const removeStorageType = (idx: number) => {
    setStorageTypes((prev) => prev.filter((_, i) => i !== idx));
  };

  const macro = state.macroResult;
  const kpi = macro?.kpi;
  const allocations = kpi?.allocations ?? {};
  const unassignedCount = kpi?.unassigned_count ?? 0;
  const macroSkus = macro?.macro_skus ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Macro-Slotting: Perfilado y Asignación</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure los tipos de almacenamiento y ejecute la asignación ABC de SKUs.
          </p>
        </div>
        <Button onClick={handleRun} disabled={running} className="gap-2" size="lg">
          <Play className="w-4 h-4" />
          {running ? "Ejecutando..." : "Ejecutar Macro-Slotting"}
        </Button>
      </div>

      {/* Configuration */}
      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardContent className="py-5 px-5 space-y-3">
            <Label className="text-sm font-medium">Días de Cobertura de Stock</Label>
            <Input
              type="number"
              value={state.coverageDays}
              onChange={(e) => updateState({ coverageDays: parseInt(e.target.value) || 15 })}
              className="text-lg font-semibold max-w-[140px]"
            />
            <p className="text-[11px] text-muted-foreground">Período de reabastecimiento en días</p>
          </CardContent>
        </Card>

        <Card>
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Tipos de Almacenamiento</h3>
              <p className="text-xs text-muted-foreground">Prioridad 1 = más prioritario. Ocupación: 0.01 a 1.00</p>
            </div>
            <Button size="sm" variant="outline" onClick={addStorageType} className="gap-1">
              <Plus className="w-3 h-3" /> Añadir
            </Button>
          </div>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Prioridad</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="w-24">Vol/SKU (m³)</TableHead>
                  <TableHead className="w-24">Peso/SKU (kg)</TableHead>
                  <TableHead className="w-24">Capacidad (m³)</TableHead>
                  <TableHead className="w-28">Ocupación (0.01-1)</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {storageTypes.map((st, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        value={st.priority}
                        onChange={(e) => updateStorageType(idx, "priority", parseInt(e.target.value) || 1)}
                        className="h-8 w-16 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={st.name}
                        onChange={(e) => updateStorageType(idx, "name", e.target.value)}
                        className="h-8 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step={0.01}
                        value={st.max_volume}
                        onChange={(e) => updateStorageType(idx, "max_volume", parseFloat(e.target.value) || 0)}
                        className="h-8 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={st.max_weight}
                        onChange={(e) => updateStorageType(idx, "max_weight", parseFloat(e.target.value) || 0)}
                        className="h-8 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={st.capacity}
                        onChange={(e) => updateStorageType(idx, "capacity", parseFloat(e.target.value) || 0)}
                        className="h-8 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0.01}
                        max={1}
                        step={0.01}
                        value={st.occupancy}
                        onChange={(e) => updateStorageType(idx, "occupancy", parseFloat(e.target.value) || 0.85)}
                        className="h-8 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => removeStorageType(idx)}
                        disabled={storageTypes.length <= 1}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* Results */}
      {macro && (
        <div className="space-y-6 animate-slide-in">
          {/* KPIs por tipo de almacenamiento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(allocations).map(([storageName, alloc]) => (
              <Card key={storageName}>
                <CardContent className="py-5 px-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Package className="w-5 h-5 text-primary" />
                    </div>
                    <span className="font-semibold">{storageName}</span>
                  </div>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-muted-foreground">SKUs:</span> <strong>{alloc.skus_count}</strong></p>
                    <p><span className="text-muted-foreground">Vol. usado:</span> <strong>{alloc.volume_used?.toFixed(1) ?? alloc.volume_used}</strong> m³</p>
                    <p><span className="text-muted-foreground">Vol. objetivo:</span> <strong>{alloc.volume_target?.toFixed(1) ?? alloc.volume_target}</strong> m³</p>
                    <div className="pt-2">
                      <Progress value={Math.min(alloc.fill_percentage ?? 0, 100)} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-1">{alloc.fill_percentage?.toFixed(1) ?? alloc.fill_percentage}% llenado</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {unassignedCount > 0 && (
              <Card className="border-dashed">
                <CardContent className="py-5 px-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <Package className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <span className="font-semibold">Sin asignar</span>
                  </div>
                  <p className="text-2xl font-bold">{unassignedCount}</p>
                  <p className="text-xs text-muted-foreground">SKUs no asignados</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Tabla macro_skus */}
          {macroSkus.length > 0 && (
            <Card>
              <div className="px-5 py-4 border-b flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">SKUs Asignados (macro_skus)</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Mostrando los primeros 50 resultados (Total: {macroSkus.length})
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => downloadMacroCSV(macroSkus)}
                >
                  <Download className="w-4 h-4" />
                  Exportar a CSV
                </Button>
              </div>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {(() => {
                        const allKeys = [...new Set(macroSkus.flatMap((r) => Object.keys(r)))];
                        const ordered = allKeys.includes("storage_type")
                          ? ["storage_type", ...allKeys.filter((k) => k !== "storage_type")]
                          : allKeys;
                        return ordered.map((h) => (
                          <TableHead key={h} className="capitalize">
                            {h.replace(/_/g, " ")}
                          </TableHead>
                        ));
                      })()}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {macroSkus.slice(0, 50).map((row, idx) => {
                      const allKeys = [...new Set(macroSkus.flatMap((r) => Object.keys(r)))];
                      const ordered = allKeys.includes("storage_type")
                        ? ["storage_type", ...allKeys.filter((k) => k !== "storage_type")]
                        : allKeys;
                      return (
                        <TableRow key={idx}>
                          {ordered.map((h) => (
                            <TableCell key={h} className="text-sm">
                              {typeof row[h] === "number" ? (row[h] as number).toLocaleString() : String(row[h] ?? "")}
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {macroSkus.length > 50 && (
                <p className="px-5 py-2 text-xs text-muted-foreground border-t">
                  Mostrando los primeros 50 resultados (Total: {macroSkus.length})
                </p>
              )}
            </Card>
          )}
        </div>
      )}

      {!macro && !running && (
        <Card className="border-dashed bg-muted/30">
          <CardContent className="py-10 px-6 text-center">
            <p className="text-sm text-muted-foreground">
              Aún no hay resultados. Configura los parámetros arriba y haz clic en <strong>Ejecutar Macro-Slotting</strong> para ver la distribución.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Anterior
        </Button>
        <Button onClick={() => { completeStep(2); setStep(3); }} className="gap-2">
          Siguiente <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
