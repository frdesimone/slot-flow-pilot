import { useState, useMemo, useEffect } from "react";
import { useSlotting, type MacroResult } from "@/context/SlottingContext";
import { ArrowRight, ArrowLeft, Play, Plus, Trash2, Package, Download, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

type MacroStorageType = {
  name: string;
  priority: number;
  cycle_days: number;
  max_volume: number;
  max_weight: number;
  capacity: number;
  occupancy: number;
  max_cycle_volume_limit: number;
  allowed_categories: string;
};

type MacroSkuRow = {
  sku_id: string;
  description: string;
  storage_type: string;
  vol_cycle: number;
  boxes_per_m3: number;
  category: string;
};

const DEFAULT_STORAGE: MacroStorageType = {
  name: "VLM",
  priority: 1,
  cycle_days: 15,
  max_volume: 0.1,
  max_weight: 25,
  capacity: 60,
  occupancy: 0.85,
  max_cycle_volume_limit: 100,
  allowed_categories: "",
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

function downloadMacroCSV(rows: MacroSkuRow[]) {
  const headers = ["SKU", "Descripción", "Storage Type", "Vol. Ciclo", "Cajas de Ciclo", "Categoría"];
  const csvRows = rows.map((r) => [
    r.sku_id,
    r.description,
    r.storage_type,
    r.vol_cycle.toFixed(4),
    (r.vol_cycle * (r.boxes_per_m3 || 0)).toFixed(2),
    r.category,
  ]);
  const csv = [headers.join(","), ...csvRows.map((r) => r.map((c) => (String(c).includes(",") || String(c).includes('"') ? `"${String(c).replace(/"/g, '""')}"` : c)).join(","))].join("\n");
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
      const parsed = (field === "allowed_categories" || field === "name")
        ? String(value)
        : (field === "cycle_days" || field === "priority" || field === "max_weight")
          ? (typeof value === "number" ? value : parseInt(String(value), 10) || 0)
          : (typeof value === "number" ? value : parseFloat(String(value)) || 0);
      next[idx] = { ...next[idx], [field]: parsed };
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
  const macroSkusRaw = macro?.macro_skus ?? [];

  const storageTypeOptions = useMemo(() => {
    const base = [...storageTypes.map((s) => s.name), "UNASSIGNED"];
    const fromRows = [...new Set(tableRows.map((r) => r.storage_type).filter(Boolean))];
    return [...new Set([...base, ...fromRows])];
  }, [storageTypes, tableRows]);

  const rawToRows = (raw: Array<Record<string, unknown>>): MacroSkuRow[] =>
    raw.map((r) => ({
      sku_id: String(r.sku_id ?? r.id ?? r.material ?? r.codigo ?? ""),
      description: String(r.description ?? ""),
      storage_type: String(r.storage_type ?? ""),
      vol_cycle: Number(r.vol_cycle ?? r.cycle_volume ?? 0),
      boxes_per_m3: Number(r.boxes_per_m3 ?? 0),
      category: String(r.category ?? ""),
    }));

  const [tableRows, setTableRows] = useState<MacroSkuRow[]>([]);
  type SortKey = keyof MacroSkuRow | "cajas_ciclo";
  const [sortConfig, setSortConfig] = useState<{ column: SortKey; direction: "asc" | "desc" } | null>(null);

  useEffect(() => {
    if (macro?.macro_skus?.length) {
      setTableRows(rawToRows(macro.macro_skus as Array<Record<string, unknown>>));
    } else {
      setTableRows([]);
    }
  }, [macro]);

  const updateTableStorageType = (skuId: string, newStorageType: string) => {
    setTableRows((prev) =>
      prev.map((r) => (r.sku_id === skuId ? { ...r, storage_type: newStorageType } : r))
    );
  };

  const handleSort = (column: SortKey) => {
    setSortConfig((prev) => {
      const nextDir = prev?.column === column && prev.direction === "asc" ? "desc" : "asc";
      return { column, direction: nextDir };
    });
  };

  const sortedRows = useMemo(() => {
    if (!sortConfig) return tableRows;
    return [...tableRows].sort((a, b) => {
      const aVal = sortConfig.column === "cajas_ciclo"
        ? a.vol_cycle * (a.boxes_per_m3 || 0)
        : a[sortConfig.column as keyof MacroSkuRow];
      const bVal = sortConfig.column === "cajas_ciclo"
        ? b.vol_cycle * (b.boxes_per_m3 || 0)
        : b[sortConfig.column as keyof MacroSkuRow];
      const cmp = typeof aVal === "string" && typeof bVal === "string"
        ? aVal.localeCompare(bVal)
        : (Number(aVal) - Number(bVal));
      return sortConfig.direction === "asc" ? cmp : -cmp;
    });
  }, [tableRows, sortConfig]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortConfig?.column !== col) return <ArrowUpDown className="w-3.5 h-3.5 opacity-50" />;
    return sortConfig.direction === "asc" ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />;
  };

  return (
    <div className="space-y-8 pb-20">
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
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Tipos de Almacenamiento</h3>
              <p className="text-xs text-muted-foreground">Prioridad 1 = más prioritario. Cycle Days, Vol. Límite y Categorías por tipo.</p>
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
                  <TableHead className="w-24">Cycle Days</TableHead>
                  <TableHead className="w-24">Vol/SKU (m³)</TableHead>
                  <TableHead className="w-24">Peso/SKU (kg)</TableHead>
                  <TableHead className="w-24">Capacidad (m³)</TableHead>
                  <TableHead className="w-28">Ocupación (0.01-1)</TableHead>
                  <TableHead className="w-28">Vol. Límite Ciclo</TableHead>
                  <TableHead className="min-w-[140px]">Categorías Permitidas</TableHead>
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
                        min={1}
                        value={st.cycle_days}
                        onChange={(e) => updateStorageType(idx, "cycle_days", parseInt(e.target.value) || 15)}
                        className="h-8 w-20 text-xs"
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
                      <Input
                        type="number"
                        step={0.01}
                        value={st.max_cycle_volume_limit}
                        onChange={(e) => updateStorageType(idx, "max_cycle_volume_limit", parseFloat(e.target.value) || 0)}
                        className="h-8 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        placeholder="A, B, C (comas)"
                        value={st.allowed_categories}
                        onChange={(e) => updateStorageType(idx, "allowed_categories", e.target.value)}
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

          {/* Tabla interactiva macro_skus */}
          {tableRows.length > 0 && (
            <Card>
              <div className="px-5 py-4 border-b flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">SKUs Asignados</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {tableRows.length} SKUs · Ordenar por columna · Editar Storage Type manualmente
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => downloadMacroCSV(sortedRows)}
                >
                  <Download className="w-4 h-4" />
                  Exportar a CSV
                </Button>
              </div>
              <div className="overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <button
                          type="button"
                          className="flex items-center gap-1 hover:text-foreground font-medium"
                          onClick={() => handleSort("sku_id")}
                        >
                          SKU <SortIcon col="sku_id" />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          className="flex items-center gap-1 hover:text-foreground font-medium"
                          onClick={() => handleSort("description")}
                        >
                          Descripción <SortIcon col="description" />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          className="flex items-center gap-1 hover:text-foreground font-medium"
                          onClick={() => handleSort("storage_type")}
                        >
                          Storage Type <SortIcon col="storage_type" />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          className="flex items-center gap-1 hover:text-foreground font-medium"
                          onClick={() => handleSort("vol_cycle")}
                        >
                          Vol. Ciclo <SortIcon col="vol_cycle" />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          className="flex items-center gap-1 hover:text-foreground font-medium"
                          onClick={() => handleSort("cajas_ciclo")}
                        >
                          Cajas de Ciclo <SortIcon col="cajas_ciclo" />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          type="button"
                          className="flex items-center gap-1 hover:text-foreground font-medium"
                          onClick={() => handleSort("category")}
                        >
                          Categoría <SortIcon col="category" />
                        </button>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRows.map((row) => (
                      <TableRow key={row.sku_id}>
                        <TableCell className="font-mono text-sm">{row.sku_id}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate" title={row.description}>
                          {row.description || "—"}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={row.storage_type}
                            onValueChange={(v) => updateTableStorageType(row.sku_id, v)}
                          >
                            <SelectTrigger className="h-8 text-xs min-w-[100px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {storageTypeOptions.map((opt) => (
                                <SelectItem key={opt} value={opt} className="text-xs">
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {row.vol_cycle.toFixed(4)}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {(row.vol_cycle * (row.boxes_per_m3 || 0)).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-sm">{row.category || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
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
      <div className="sticky bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t p-4 flex justify-end gap-4 z-50">
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
