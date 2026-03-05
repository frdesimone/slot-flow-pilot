import { useState, useMemo, useEffect } from "react";
import { useSlotting } from "@/context/SlottingContext";
import type { BestTrayItem } from "@/context/SlottingContext";
import { ArrowLeft, Play, Settings2, Download, AlertTriangle, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";

type SortOption = "occupancy_desc" | "occupancy_asc" | "items_desc";

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

function extractSkuId(obj: Record<string, unknown>): string | null {
  const keys = ["id", "sku_id", "material", "codigo"];
  for (const k of keys) {
    const v = obj[k];
    if (v != null && typeof v === "string") return v;
    if (v != null && typeof v === "number") return String(v);
  }
  return null;
}

function getVlmSkusIds(macroResult: { macro_skus?: Array<Record<string, unknown>>; kpi?: { allocations?: Record<string, unknown> } } | null): string[] {
  if (!macroResult?.macro_skus?.length) return [];
  const allocations = macroResult.kpi?.allocations ?? {};
  const targetType = (Object.keys(allocations)[0] ?? "VLM").toUpperCase();
  return (macroResult.macro_skus as Array<Record<string, unknown>>)
    .filter((row) => {
      const st = row.storage_type ?? row.storageType;
      return st != null && String(st).toUpperCase() === targetType;
    })
    .map(extractSkuId)
    .filter((id): id is string => id != null);
}

function getUniqueStorageTypes(macroResult: { macro_skus?: Array<Record<string, unknown>> } | null): string[] {
  if (!macroResult?.macro_skus?.length) return [];
  const seen = new Set<string>();
  for (const row of macroResult.macro_skus as Array<Record<string, unknown>>) {
    const st = String(row.storage_type ?? row.storageType ?? "").trim();
    if (st && st.toUpperCase() !== "UNASSIGNED") {
      seen.add(st);
    }
  }
  return Array.from(seen).sort();
}

type StorageConfigForm = {
  maxTrays: string;
  maxWeight: string;
  trayLength: string;
  trayWidth: string;
  isFixedHeight: boolean;
};

const DEFAULT_STORAGE_CONFIG: StorageConfigForm = {
  maxTrays: "100",
  maxWeight: "250",
  trayLength: "2400",
  trayWidth: "800",
  isFixedHeight: false,
};

function downloadMicroCSV(bestTrays: BestTrayItem[] | undefined | null) {
  const trays = bestTrays ?? [];
  const rows: string[][] = [["Tray ID", "Occupancy %", "Item Count", "SKU", "Vol"]];
  trays.forEach((tray) => {
    const items = tray?.items ?? [];
    if (items.length === 0) {
      rows.push([
        String(tray?.tray_id ?? ""),
        String(tray?.occupancy_pct ?? 0),
        String(tray?.item_count ?? 0),
        "",
        "",
      ]);
    } else {
      items.forEach((item, idx) => {
        rows.push([
          idx === 0 ? String(tray?.tray_id ?? "") : "",
          idx === 0 ? String(tray?.occupancy_pct ?? 0) : "",
          idx === 0 ? String(tray?.item_count ?? 0) : "",
          String(item?.sku ?? ""),
          String(item?.vol ?? 0),
        ]);
      });
    }
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

function getOccupancyBadgeClass(pct: number): string {
  if (pct > 80) return "bg-emerald-500/90 text-white border-emerald-600";
  if (pct > 50) return "bg-amber-500/90 text-white border-amber-600";
  return "bg-red-500/90 text-white border-red-600";
}

export function Step4MicroSlotting() {
  const { state, updateState, completeStep, setStep } = useSlotting();
  const [running, setRunning] = useState(false);
  const [weights, setWeights] = useState({ affinity: 75, rotation: 15, height: 10 });
  const [storageConfigs, setStorageConfigs] = useState<Record<string, StorageConfigForm>>({});
  const { toast } = useToast();

  const weightsSum = weights.affinity + weights.rotation + weights.height;
  const weightsValid = weightsSum === 100;

  const macroResult = state.macroResult;
  const storageTypeList = useMemo(() => getUniqueStorageTypes(macroResult), [macroResult]);
  const vlmSkusIds = getVlmSkusIds(macroResult);
  const hasMacroResults = (macroResult?.macro_skus?.length ?? 0) > 0;

  useEffect(() => {
    if (storageTypeList.length === 0) return;
    setStorageConfigs((prev) => {
      const next = { ...prev };
      for (const st of storageTypeList) {
        if (!(st in next)) {
          next[st] = { ...DEFAULT_STORAGE_CONFIG };
        }
      }
      return next;
    });
  }, [storageTypeList.join(",")]);

  const handleRun = async () => {
    if (!state.dataFile) {
      toast({
        title: "Archivo pendiente",
        description: "Por favor vuelve al Paso 1 y carga el dataset Excel antes de continuar.",
        variant: "destructive",
      });
      return;
    }

    if (!hasMacroResults) {
      toast({
        title: "Macro Slotting pendiente",
        description: "Debes ejecutar el Macro Slotting primero para identificar qué SKUs irán al VLM.",
        variant: "destructive",
      });
      return;
    }

    try {
      setRunning(true);

      const storages = storageTypeList.map((st) => {
        const cfg = storageConfigs[st] ?? DEFAULT_STORAGE_CONFIG;
        const lenNum = parseFloat(cfg.trayLength) || 2400;
        const widthNum = parseFloat(cfg.trayWidth) || 800;
        return {
          storage_type: st,
          max_trays: Math.max(1, parseInt(cfg.maxTrays, 10) || 100),
          max_weight: Math.max(0, parseFloat(cfg.maxWeight) || 250),
          tray_length: lenNum > 100 ? lenNum / 1000 : lenNum,
          tray_width: widthNum > 100 ? widthNum / 1000 : widthNum,
          is_fixed_height: cfg.isFixedHeight,
        };
      });

      const sku_storage_mapping: Record<string, string> = {};
      if (macroResult?.macro_skus) {
        (macroResult.macro_skus as Array<Record<string, unknown>>).forEach((s) => {
          const id = extractSkuId(s);
          const st = s.storage_type ?? s.storageType;
          if (id && st) {
            sku_storage_mapping[id] = String(st).trim();
          }
        });
      }

      const payload = {
        storages,
        sku_storage_mapping,
        weights: {
          affinity: weights.affinity / 100,
          rotation: weights.rotation / 100,
          height: weights.height / 100,
        },
        cycle_days: Number(state.coverageDays) || 15,
        include_zero_rot: state.includeNoRotation,
        optimize_trays: true,
        opt_time_ms: 2000,
        mapping: state.mappingConfig as Record<string, unknown>,
        period_days: Number(state.mappingConfig?.period_days) || 180,
        vlm_skus_ids: vlmSkusIds,
      };

      const formData = new FormData();
      formData.append("file", state.dataFile);
      formData.append("payload", JSON.stringify(payload));

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
        const dataObj = raw?.data ?? raw;
        const resultsByStorage = raw?.results_by_storage ?? dataObj?.results_by_storage ?? {};
        let bestTrays: import("@/context/SlottingContext").BestTrayItem[] = [];
        let totalTrays = 0;
        let skusPlaced = 0;
        const occList: number[] = [];
        for (const st of Object.keys(resultsByStorage)) {
          const r = resultsByStorage[st];
          const trays = Array.isArray(r?.best_trays) ? r.best_trays : [];
          bestTrays = bestTrays.concat(trays);
          if (r?.kpi) {
            totalTrays += r.kpi.total_trays ?? 0;
            skusPlaced += r.kpi.skus_placed ?? 0;
            if ((r.kpi.total_trays ?? 0) > 0) occList.push(r.kpi.avg_area_occupancy_pct ?? 0);
          }
        }
        if (bestTrays.length === 0 && Array.isArray(dataObj?.best_trays)) {
          bestTrays = dataObj.best_trays;
        }
        const kpi = raw?.kpi ?? dataObj?.kpi ?? {};
        data = {
          best_trays: bestTrays,
          results_by_storage: resultsByStorage,
          kpi: {
            total_trays: totalTrays || (typeof kpi?.total_trays === "number" ? kpi.total_trays : 0),
            skus_placed: skusPlaced || (typeof kpi?.skus_placed === "number" ? kpi.skus_placed : 0),
            avg_area_occupancy_pct: occList.length ? occList.reduce((a, b) => a + b, 0) / occList.length : (typeof kpi?.avg_area_occupancy_pct === "number" ? kpi.avg_area_occupancy_pct : 0),
            optimized: Boolean(kpi?.optimized),
          },
          heightEfficiency: typeof raw?.heightEfficiency === "number" ? raw.heightEfficiency : (occList.length ? occList.reduce((a, b) => a + b, 0) / occList.length : 0),
          areaEfficiency: typeof raw?.areaEfficiency === "number" ? raw.areaEfficiency : (occList.length ? occList.reduce((a, b) => a + b, 0) / occList.length : 0),
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
      const err = error instanceof Error ? error : new Error(String(error));
      const isNetworkError =
        (error instanceof TypeError && error.message === "Failed to fetch") ||
        err.name === "AbortError" ||
        (err.message?.toLowerCase?.() ?? "").includes("network");
      toast({
        title: "No se pudo ejecutar Micro-Slotting",
        description: isNetworkError
          ? "La conexión se interrumpió o el servidor tardó demasiado. Los resultados anteriores se mantienen. Intenta ejecutar de nuevo."
          : err.message || "Revisa la API o los parámetros de entrada e inténtalo nuevamente.",
        variant: "destructive",
      });
      // No actualizamos microResult en error: los resultados previos se preservan
    } finally {
      setRunning(false);
    }
  };

  const micro = state.microResult;

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("occupancy_desc");
  const [activeStorageTab, setActiveStorageTab] = useState("");

  const resultsByStorage = useMemo(() => {
    const rbs = micro?.results_by_storage;
    if (rbs && Object.keys(rbs).length > 0) return rbs;
    if (micro?.best_trays?.length) {
      return {
        Todos: {
          kpi: micro.kpi ?? {},
          best_trays: micro.best_trays,
        },
      };
    }
    return {};
  }, [micro]);

  const storageTabKeys = Object.keys(resultsByStorage);
  const effectiveActiveTab = activeStorageTab && storageTabKeys.includes(activeStorageTab)
    ? activeStorageTab
    : storageTabKeys[0] ?? "";

  useEffect(() => {
    if (storageTabKeys.length > 0 && !storageTabKeys.includes(activeStorageTab)) {
      setActiveStorageTab(storageTabKeys[0]);
    }
  }, [storageTabKeys.join(","), activeStorageTab]);

  const traysForActiveTab = resultsByStorage[effectiveActiveTab]?.best_trays ?? [];

  const filteredAndSortedTrays = useMemo(() => {
    let list = [...traysForActiveTab];
    const term = (searchTerm ?? "").trim().toLowerCase();
    if (term) {
      list = list.filter((t) => {
        const trayId = String(t?.tray_id ?? "").toLowerCase();
        if (trayId.includes(term)) return true;
        const items = t?.items ?? [];
        return items.some((it) => {
          const sku = String(it?.sku ?? "").toLowerCase();
          const desc = String(it?.description ?? "").toLowerCase();
          return sku.includes(term) || desc.includes(term);
        });
      });
    }
    if (sortBy === "occupancy_desc") {
      list.sort((a, b) => (Number(b?.occupancy_pct ?? 0) - Number(a?.occupancy_pct ?? 0)));
    } else if (sortBy === "occupancy_asc") {
      list.sort((a, b) => (Number(a?.occupancy_pct ?? 0) - Number(b?.occupancy_pct ?? 0)));
    } else if (sortBy === "items_desc") {
      list.sort((a, b) => (Number(b?.item_count ?? 0) - Number(a?.item_count ?? 0)));
    }
    return list;
  }, [traysForActiveTab, searchTerm, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedTrays.length / itemsPerPage));
  const paginatedTrays = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedTrays.slice(start, start + itemsPerPage);
  }, [filteredAndSortedTrays, currentPage, itemsPerPage]);

  const paginationStart = (currentPage - 1) * itemsPerPage + 1;
  const paginationEnd = Math.min(currentPage * itemsPerPage, filteredAndSortedTrays.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy, effectiveActiveTab]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Micro-Slotting: Distribución Física</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure el hardware y algoritmos de clustering para la asignación física de bandejas.
          </p>
          {hasMacroResults && (
            <p className="text-xs text-muted-foreground mt-1">
              {storageTypeList.length} tipo(s) de almacenamiento: {storageTypeList.join(", ")}. {vlmSkusIds.length} SKUs para VLM.
            </p>
          )}
          {!weightsValid && (
            <p className="text-sm text-red-600 font-medium mt-2">
              La suma debe ser 100%. Actual: {weightsSum}%
            </p>
          )}
        </div>
        <Button onClick={handleRun} disabled={running || !hasMacroResults || !weightsValid} className="gap-2" size="lg">
          <Play className="w-4 h-4" />
          {running ? "Optimizando..." : "Ejecutar Micro-Slotting"}
        </Button>
      </div>

      {/* Advertencia si no hay resultados del Macro */}
      {!hasMacroResults && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Debes ejecutar el Macro Slotting primero</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                El Micro Slotting necesita los resultados del Paso 3 para identificar qué SKUs irán al VLM. Ve al Paso 3 y haz clic en &quot;Ejecutar Macro-Slotting&quot;.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Parámetros principales */}
      <Card>
        <div className="px-5 py-4 border-b">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-kpi-icon" /> Parámetros
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Días de cobertura, hardware y dimensiones</p>
        </div>
        <CardContent className="py-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Días de Cobertura (cycle days)</Label>
              <Input type="number" value={state.coverageDays} onChange={(e) => updateState({ coverageDays: e.target.value === "" ? "" : (parseInt(e.target.value, 10) || 15) })} className="h-9" />
            </div>
          </div>

          {storageTypeList.length === 0 && hasMacroResults && (
            <p className="text-xs text-amber-600 mt-3">No se detectaron tipos de almacenamiento en macro_skus.</p>
          )}

          {storageTypeList.length > 0 && (
            <Accordion type="single" collapsible defaultValue="storage-0" className="mt-5 border rounded-lg bg-muted/30">
              {storageTypeList.map((st, idx) => {
                const cfg = storageConfigs[st] ?? DEFAULT_STORAGE_CONFIG;
                return (
                  <AccordionItem key={st} value={`storage-${idx}`} className="border-none">
                    <AccordionTrigger className="px-4 py-3 text-sm font-semibold hover:no-underline">
                      Configuración: {st}
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 pt-0">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Bandejas máx</Label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={cfg.maxTrays}
                            onChange={(e) =>
                              setStorageConfigs((prev) => ({
                                ...prev,
                                [st]: { ...prev[st], maxTrays: e.target.value },
                              }))
                            }
                            className="h-9"
                            placeholder="100"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Peso Máximo (kg)</Label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={cfg.maxWeight}
                            onChange={(e) =>
                              setStorageConfigs((prev) => ({
                                ...prev,
                                [st]: { ...prev[st], maxWeight: e.target.value },
                              }))
                            }
                            className="h-9"
                            placeholder="250"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Largo (mm)</Label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={cfg.trayLength}
                            onChange={(e) =>
                              setStorageConfigs((prev) => ({
                                ...prev,
                                [st]: { ...prev[st], trayLength: e.target.value },
                              }))
                            }
                            className="h-9"
                            placeholder="2400"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Ancho (mm)</Label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={cfg.trayWidth}
                            onChange={(e) =>
                              setStorageConfigs((prev) => ({
                                ...prev,
                                [st]: { ...prev[st], trayWidth: e.target.value },
                              }))
                            }
                            className="h-9"
                            placeholder="800"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-4">
                        <Switch
                          id={`fixed-height-${st}`}
                          checked={cfg.isFixedHeight}
                          onCheckedChange={(checked) =>
                            setStorageConfigs((prev) => ({
                              ...prev,
                              [st]: { ...prev[st], isFixedHeight: checked },
                            }))
                          }
                        />
                        <Label htmlFor={`fixed-height-${st}`} className="text-xs cursor-pointer">
                          ¿Altura Fija? (Ignorar optimización de alturas)
                        </Label>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}

          <Accordion type="single" collapsible className="mt-5 border rounded-lg bg-muted/30">
            <AccordionItem value="weights" className="border-none">
              <AccordionTrigger className="px-4 py-3 text-sm font-semibold hover:no-underline">
                Configuración Avanzada de Pesos
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 pt-0">
                <p className="text-xs text-muted-foreground mb-4">
                  Los pesos definen cómo el algoritmo prioriza Afinidad, Rotación y Altura al agrupar SKUs en bandejas. La suma debe ser exactamente 100%.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Afinidad (%) — Co-ocurrencia en pedidos</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={weights.affinity}
                      onChange={(e) => setWeights((w) => ({ ...w, affinity: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) }))}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Rotación (%) — Frecuencia de venta</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={weights.rotation}
                      onChange={(e) => setWeights((w) => ({ ...w, rotation: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) }))}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Altura (%) — Compatibilidad dimensional</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={weights.height}
                      onChange={(e) => setWeights((w) => ({ ...w, height: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) }))}
                      className="h-9"
                    />
                  </div>
                </div>
                {!weightsValid && (
                  <p className="text-sm text-red-600 font-medium mt-3">
                    La suma debe ser 100%. Actual: {weightsSum}%
                  </p>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {running && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">Analizando afinidades y optimizando bandejas...</p>
              <p className="text-xs text-muted-foreground max-w-md">
                Procesando {vlmSkusIds.length} SKUs seleccionados por el Macro Slotting.
              </p>
              <p className="text-xs text-muted-foreground max-w-md">
                Esto puede demorar un par de minutos. No cierres esta ventana ni recargues la página.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results: data.results_by_storage con Tabs por tipo de almacenamiento */}
      {micro && storageTabKeys.length > 0 && (
        <div className="space-y-6 animate-slide-in">
          <Tabs value={effectiveActiveTab} onValueChange={setActiveStorageTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 max-w-md lg:grid-cols-4">
              {storageTabKeys.map((st) => (
                <TabsTrigger key={st} value={st} className="gap-1">
                  {st}
                  <Badge variant="secondary" className="text-[10px]">
                    {resultsByStorage[st]?.best_trays?.length ?? 0}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>

            {storageTabKeys.map((st) => (
              <TabsContent key={st} value={st} className="mt-6 space-y-4">
                {/* KPIs por Tab */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <KPIMini label="Bandejas usadas" value={resultsByStorage[st]?.kpi?.total_trays ?? 0} />
                  <KPIMini label="Ocupación %" value={resultsByStorage[st]?.kpi?.avg_area_occupancy_pct ?? 0} unit="%" />
                  <KPIMini label="SKUs Colocados" value={resultsByStorage[st]?.kpi?.skus_placed ?? 0} />
                  <KPIMini label="Optimizado" value={resultsByStorage[st]?.kpi?.optimized ? "Sí" : "No"} />
                  <div className="col-span-2 lg:col-span-4 flex items-center gap-2">
                    <Badge variant="destructive" className="text-orange-600 bg-orange-100 border-orange-300 dark:bg-orange-950/50 dark:text-orange-400 dark:border-orange-800">
                      Aire Desperdiciado Total: {(resultsByStorage[st]?.kpi?.total_wasted_vol ?? 0).toFixed(2)} m³
                    </Badge>
                  </div>
                </div>

                {/* Grilla de bandejas */}
                <Card>
                  <div className="px-5 py-3 border-b flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Package className="w-4 h-4" /> Bandejas Asignadas — {st}
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => downloadMicroCSV(resultsByStorage[st]?.best_trays)}
                    >
                      <Download className="w-4 h-4" />
                      Exportar a CSV
                    </Button>
                  </div>
                  <div className="px-5 py-3 border-b flex flex-wrap items-center gap-3">
                    <Input
                      placeholder="Buscar por ID de bandeja o SKU"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-9 max-w-[280px] text-sm"
                    />
                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                      <SelectTrigger className="h-9 w-[200px] text-sm">
                        <SelectValue placeholder="Ordenar por" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="occupancy_desc">Mayor Ocupación</SelectItem>
                        <SelectItem value="occupancy_asc">Menor Ocupación</SelectItem>
                        <SelectItem value="items_desc">Más Items</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <CardContent className="p-5">
                    {st !== effectiveActiveTab ? null : (resultsByStorage[st]?.best_trays?.length ?? 0) === 0 ? (
                      <div className="py-12 text-center text-muted-foreground">
                        <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p className="text-sm font-medium">No hay bandejas para mostrar</p>
                        <p className="text-xs mt-1">El backend no devolvió bandejas o la lista está vacía.</p>
                      </div>
                    ) : filteredAndSortedTrays.length === 0 ? (
                      <div className="py-12 text-center text-muted-foreground">
                        <p className="text-sm font-medium">Sin resultados para la búsqueda</p>
                        <p className="text-xs mt-1">Prueba con otro término o limpia el filtro.</p>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {paginatedTrays.map((tray, idx) => {
                            const pct = Number(tray?.occupancy_pct ?? 0);
                            const itemCount = Number(tray?.item_count ?? 0);
                            const items = tray?.items ?? [];
                            return (
                              <Card key={tray?.tray_id ?? idx} className="overflow-hidden border shadow-sm hover:shadow-md transition-shadow">
                                <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
                                  <span className="font-mono text-sm font-semibold truncate" title={tray?.tray_id}>
                                    {tray?.tray_id ?? `Bandeja ${idx + 1}`}
                                  </span>
                                  <Badge className={`shrink-0 text-[10px] font-medium ${getOccupancyBadgeClass(pct)}`}>
                                    {pct.toFixed(1)}%
                                  </Badge>
                                </CardHeader>
                                <CardContent className="px-4 pb-4 pt-0">
                                  <p className="text-xs text-muted-foreground mb-1">
                                    Altura Estante: {((tray?.max_height ?? 0) * 1000).toFixed(0)} mm | Aire: {(tray?.wasted_vol ?? 0).toFixed(4)} m³
                                  </p>
                                  <p className="text-xs text-muted-foreground mb-2">
                                    Items en bandeja: <strong>{itemCount}</strong>
                                  </p>
                                  <ScrollArea className="h-32 rounded-md border">
                                    <ul className="p-2 space-y-1.5 text-xs">
                                      {items.map((item, i) => {
                                        const sku = item?.sku ?? "-";
                                        const desc = item?.description ?? "";
                                        const vol = Number(item?.vol ?? 0);
                                        const boxes = Number(item?.boxes ?? 0);
                                        const mainText = desc ? `${sku} - ${desc}` : sku;
                                        return (
                                          <li key={`${item?.sku ?? i}-${i}`} className="truncate">
                                            <span className="font-mono block truncate" title={mainText}>
                                              {mainText}
                                            </span>
                                            <span className="text-muted-foreground text-[10px] block truncate">
                                              Vol: {vol.toFixed(4)} m³ | Cajas: {boxes.toFixed(2)}
                                              {typeof item?.height === "number" ? ` | Alto: ${(item.height * 1000).toFixed(0)} mm` : ""}
                                            </span>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </ScrollArea>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                        <div className="mt-5 pt-4 border-t flex items-center justify-between gap-4 flex-wrap">
                          <p className="text-sm text-muted-foreground">
                            Mostrando {paginationStart} a {paginationEnd} de {filteredAndSortedTrays.length} bandejas
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                              disabled={currentPage <= 1}
                            >
                              Anterior
                            </Button>
                            <span className="text-sm tabular-nums px-2">
                              Página {currentPage} de {totalPages}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                              disabled={currentPage >= totalPages}
                            >
                              Siguiente
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
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
      <div className="sticky bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t p-4 flex justify-end gap-4 z-50">
        <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Anterior
        </Button>
      </div>
    </div>
  );
}
