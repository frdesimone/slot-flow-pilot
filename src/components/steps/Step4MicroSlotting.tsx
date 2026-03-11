import { useState, useMemo, useEffect } from "react";
import { useSlotting } from "@/context/SlottingContext";
import type { MicroLocation } from "@/context/SlottingContext";
import { ArrowLeft, Play, Settings2, Download, AlertTriangle, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNum } from "@/lib/utils";

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

function downloadMicroCSV(locations: MicroLocation[] | undefined | null) {
  const locs = locations ?? [];
  const rows: string[][] = [
    ["Location ID", "Peso (kg)", "Superficie (m²)", "Volumen (m³)", "SKU", "Descripción", "Peso (KG)", "Superficie (m²)", "Volumen (m³)", "Unid. Reposición"],
  ];
  locs.forEach((loc) => {
    const items = loc?.items ?? [];
    const m = loc?.metrics ?? { used_weight: 0, max_weight: 0, used_surface: 0, max_surface: 0, used_volume: 0, max_volume: 0 };
    if (items.length === 0) {
      rows.push([
        String(loc?.location_id ?? ""),
        `${m.used_weight}/${m.max_weight}`,
        `${m.used_surface}/${m.max_surface}`,
        `${m.used_volume}/${m.max_volume}`,
        "",
        "",
        "",
        "",
        "",
        "",
      ]);
    } else {
      items.forEach((item, idx) => {
        rows.push([
          idx === 0 ? String(loc?.location_id ?? "") : "",
          idx === 0 ? `${m.used_weight}/${m.max_weight}` : "",
          idx === 0 ? `${m.used_surface}/${m.max_surface}` : "",
          idx === 0 ? `${m.used_volume}/${m.max_volume}` : "",
          String(item?.sku ?? ""),
          String(item?.description ?? ""),
          String(item?.weight ?? ""),
          String(item?.surface ?? ""),
          String(item?.volume ?? ""),
          String(item?.replenishment_units ?? ""),
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

export function Step4MicroSlotting() {
  const { state, updateState, completeStep, setStep, macroParams, microParams, setMicroParams, isMicroRunning, setIsMicroRunning } = useSlotting();
  const { toast } = useToast();

  const [weights, setWeights] = useState(() => {
    const saved = microParams?.weights;
    if (saved && typeof saved === "object" && "affinity" in saved && "rotation" in saved && "height" in saved) {
      return {
        affinity: Number(saved.affinity) || 75,
        rotation: Number(saved.rotation) || 15,
        height: Number(saved.height) || 10,
      };
    }
    return { affinity: 75, rotation: 15, height: 10 };
  });

  const weightsSum = weights.affinity + weights.rotation + weights.height;
  const weightsValid = weightsSum === 100;

  const macroResult = state.macroResult;
  const storageTypeList = useMemo(() => getUniqueStorageTypes(macroResult), [macroResult]);
  const vlmSkusIds = getVlmSkusIds(macroResult);
  const hasMacroResults = (macroResult?.macro_skus?.length ?? 0) > 0;

  useEffect(() => {
    setMicroParams((prev) => ({ ...prev, weights }));
  }, [weights, setMicroParams]);

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
      setIsMicroRunning(true);

      const macroStorageTypes = (macroParams?.storageTypes ?? []) as Array<{
        name?: string;
        num_locations?: number;
        max_w?: number;
        max_l?: number;
        is_variable_height?: boolean;
        max_h_loc?: number;
        max_h_storage?: number;
        max_weight_loc?: number;
        occupancy_pct?: number;
        cycle_days?: number;
        cycle_vol_limit?: number;
        categories?: string[];
      }>;

      type StoragePayload = {
        storage_type: string;
        max_trays: number;
        max_weight: number;
        tray_length: number;
        tray_width: number;
        is_fixed_height: boolean;
        max_w?: number;
        max_l?: number;
        max_weight_loc?: number;
        max_h_loc?: number;
        max_h_storage?: number;
        is_variable_height?: boolean;
        is_multiproduct?: boolean;
        stackability_factor?: number;
      };

      const storages: StoragePayload[] =
        macroStorageTypes.length > 0
          ? macroStorageTypes.map((st) => {
              const name = String(st?.name ?? "").trim() || "VLM";
              const maxW = Number(st?.max_w ?? 1) || 1;
              const maxL = Number(st?.max_l ?? 1) || 1;
              const maxWeight = Number(st?.max_weight_loc ?? 250) || 250;
              const numLoc = Math.max(1, Number(st?.num_locations ?? 100) || 100);
              const isVarH = Boolean(st?.is_variable_height ?? false);
              return {
                storage_type: name,
                max_trays: numLoc,
                max_weight: maxWeight,
                tray_length: maxL,
                tray_width: maxW,
                is_fixed_height: !isVarH,
                max_w: maxW,
                max_l: maxL,
                max_weight_loc: maxWeight,
                max_h_loc: Number(st?.max_h_loc ?? 0.5) || 0.5,
                max_h_storage: Number(st?.max_h_storage ?? 5) || 5,
                is_variable_height: isVarH,
                is_multiproduct: Boolean(st?.is_multiproduct ?? true),
                stackability_factor: Number(st?.stackability_factor ?? 1) || 1,
              };
            })
          : storageTypeList.map((st) => ({
              storage_type: st,
              max_trays: 100,
              max_weight: 250,
              tray_length: 1,
              tray_width: 1,
              is_fixed_height: false,
            }));

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

      const firstMacroStorage = macroStorageTypes[0];
      const cycleDays = firstMacroStorage?.cycle_days != null
        ? Number(firstMacroStorage.cycle_days)
        : Number(state.coverageDays) || 15;

      const payload = {
        storages,
        sku_storage_mapping,
        weights: {
          affinity: weights.affinity / 100,
          rotation: weights.rotation / 100,
          height: weights.height / 100,
        },
        cycle_days: cycleDays,
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
      setIsMicroRunning(false);
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

  const locationsForActiveTab: MicroLocation[] = useMemo(() => {
    const r = resultsByStorage[effectiveActiveTab];
    const locs = r?.locations ?? r?.best_trays;
    if (Array.isArray(locs) && locs.length > 0) {
      return locs as MicroLocation[];
    }
    return [];
  }, [resultsByStorage, effectiveActiveTab]);

  const filteredAndSortedLocations = useMemo(() => {
    let list = [...locationsForActiveTab];
    const term = (searchTerm ?? "").trim().toLowerCase();
    if (term) {
      list = list.filter((loc) => {
        const locId = String(loc?.location_id ?? "").toLowerCase();
        if (locId.includes(term)) return true;
        const items = loc?.items ?? [];
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
      list.sort((a, b) => ((b?.items?.length ?? 0) - (a?.items?.length ?? 0)));
    }
    return list;
  }, [locationsForActiveTab, searchTerm, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedLocations.length / itemsPerPage));
  const paginatedLocations = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedLocations.slice(start, start + itemsPerPage);
  }, [filteredAndSortedLocations, currentPage, itemsPerPage]);

  const paginationStart = (currentPage - 1) * itemsPerPage + 1;
  const paginationEnd = Math.min(currentPage * itemsPerPage, filteredAndSortedLocations.length);

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
        <Button onClick={handleRun} disabled={isMicroRunning || !hasMacroResults || !weightsValid} className="gap-2" size="lg">
          {isMicroRunning ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Corriendo...
            </>
          ) : (
            <>
          <Play className="w-4 h-4" />
              Ejecutar Micro-Slotting
            </>
          )}
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

      {/* Configuración Avanzada de Pesos */}
      <Card>
        <div className="px-5 py-4 border-b">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-kpi-icon" /> Configuración Avanzada de Pesos
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Los pesos definen cómo el algoritmo prioriza Afinidad, Rotación y Altura al agrupar SKUs en bandejas. La suma debe ser exactamente 100%.
          </p>
        </div>
        <CardContent className="py-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            <div className="space-y-1.5">
                    <Label className="text-xs">Afinidad (%) — Co-ocurrencia en pedidos</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={weights.affinity}
                      onChange={(e) => setWeights((w) => ({ ...w, affinity: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) }))}
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
                    />
            </div>
          </div>
          {!weightsValid && (
            <p className="text-sm text-red-600 font-medium mt-3 col-span-full">
              La suma debe ser 100%. Actual: {weightsSum}%
            </p>
          )}
        </CardContent>
      </Card>

      {isMicroRunning && (
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
                    {(resultsByStorage[st]?.locations ?? resultsByStorage[st]?.best_trays ?? []).length}
                  </Badge>
                    </TabsTrigger>
                  ))}
                </TabsList>

            {storageTabKeys.map((st) => (
              <TabsContent key={st} value={st} className="mt-6 space-y-4">
                {/* KPIs por Tab */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  <KPIMini label="Bandejas usadas" value={resultsByStorage[st]?.kpi?.total_trays ?? 0} />
                  <KPIMini label="Ocupación %" value={resultsByStorage[st]?.kpi?.avg_area_occupancy_pct ?? 0} unit="%" />
                  <KPIMini label="SKUs Colocados" value={resultsByStorage[st]?.kpi?.skus_placed ?? 0} />
                  <KPIMini label="Optimizado" value={resultsByStorage[st]?.kpi?.optimized ? "Sí" : "No"} />
                  <div className="col-span-2 lg:col-span-4 flex items-center gap-2">
                    <Badge variant="destructive" className="text-orange-600 bg-orange-100 border-orange-300 dark:bg-orange-950/50 dark:text-orange-400 dark:border-orange-800">
                      Aire Desperdiciado Total: {formatNum(resultsByStorage[st]?.kpi?.total_wasted_vol)} m³
                    </Badge>
                  </div>
                </div>

                {/* Ubicaciones y Tablas */}
                <Card>
                  <div className="px-5 py-3 border-b flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Package className="w-4 h-4" /> Ubicaciones Asignadas — {st}
                    </h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                      onClick={() =>
                        downloadMicroCSV(
                          (resultsByStorage[st]?.locations ?? resultsByStorage[st]?.best_trays ?? []) as MicroLocation[],
                        )
                      }
                >
                  <Download className="w-4 h-4" />
                  Exportar a CSV
                </Button>
              </div>
                  <div className="px-5 py-3 border-b grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                    <Input
                      placeholder="Buscar por ID de ubicación o SKU"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full"
                    />
                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                      <SelectTrigger className="w-full">
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
                    {st !== effectiveActiveTab ? null : locationsForActiveTab.length === 0 ? (
                      <div className="py-12 text-center text-muted-foreground">
                        <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
                        <p className="text-sm font-medium">No hay ubicaciones para mostrar</p>
                        <p className="text-xs mt-1">El backend no devolvió ubicaciones o la lista está vacía.</p>
                      </div>
                    ) : filteredAndSortedLocations.length === 0 ? (
                      <div className="py-12 text-center text-muted-foreground">
                        <p className="text-sm font-medium">Sin resultados para la búsqueda</p>
                        <p className="text-xs mt-1">Prueba con otro término o limpia el filtro.</p>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-6">
                          {paginatedLocations.map((location, idx) => {
                            const m = location?.metrics ?? {
                              used_weight: 0,
                              max_weight: 0,
                              used_surface: 0,
                              max_surface: 0,
                              used_volume: 0,
                              max_volume: 0,
                            };
                            const items = location?.items ?? [];
                            return (
                              <Card key={location?.location_id ?? idx} className="mb-6 overflow-hidden">
                                <CardHeader className="bg-slate-50 dark:bg-slate-900 border-b">
                                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                    <CardTitle className="text-lg">
                                      Ubicación: {location?.location_id ?? `Loc-${idx + 1}`}
                                    </CardTitle>
                                    <div className="flex flex-wrap gap-3">
                                      <Badge
                                        variant={
                                          m.used_weight > m.max_weight && m.max_weight > 0 ? "destructive" : "secondary"
                                        }
                                      >
                                        Peso: {formatNum(m.used_weight)} / {formatNum(m.max_weight)} kg
                                      </Badge>
                                      <Badge variant="secondary">
                                        Superficie: {formatNum(m.used_surface)} / {formatNum(m.max_surface)} m²
                                      </Badge>
                                      <Badge variant="secondary">
                                        Volumen: {formatNum(m.used_volume)} / {formatNum(m.max_volume)} m³
                                      </Badge>
                                    </div>
                                  </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                  <Table>
                                    <TableHeader className="bg-muted/50">
                                      <TableRow>
                                        <TableHead>SKU</TableHead>
                                        <TableHead>Descripción</TableHead>
                                        <TableHead className="text-right">Peso (KG)</TableHead>
                                        <TableHead className="text-right">Superficie (m²)</TableHead>
                                        <TableHead className="text-right">Volumen (m³)</TableHead>
                                        <TableHead className="text-right">Unid. Reposición</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {items.map((item, itemIdx) => (
                                        <TableRow key={`${item?.sku ?? ""}-${itemIdx}`}>
                                          <TableCell className="font-medium">{item?.sku ?? "-"}</TableCell>
                                          <TableCell>{item?.description ?? ""}</TableCell>
                                          <TableCell className="text-right">{formatNum(item?.weight)}</TableCell>
                                          <TableCell className="text-right">{formatNum(item?.surface)}</TableCell>
                                          <TableCell className="text-right">{formatNum(item?.volume)}</TableCell>
                                          <TableCell className="text-right">{formatNum(item?.replenishment_units)}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                        <div className="mt-5 pt-4 border-t flex items-center justify-between gap-4 flex-wrap">
                          <p className="text-sm text-muted-foreground">
                            Mostrando {paginationStart} a {paginationEnd} de {filteredAndSortedLocations.length}{" "}
                            ubicaciones
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

      {!micro && !isMicroRunning && (
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
