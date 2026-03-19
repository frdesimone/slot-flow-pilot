import { useState, useMemo, useEffect } from "react";
import { useSlotting, type MacroResult } from "@/context/SlottingContext";
import { ArrowRight, ArrowLeft, Play, Plus, Trash2, Package, Download, ArrowUpDown, ArrowUp, ArrowDown, GripVertical, ChevronDown, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { cn, formatNum } from "@/lib/utils";

type MacroStorageType = {
  name: string;
  num_locations: number | string;
  max_w: number | string;
  max_l: number | string;
  is_variable_height: boolean;
  max_h_loc: number | string;
  max_h_storage: number | string;
  max_weight_loc: number | string;
  occupancy_pct: number | string;
  cycle_days: number | string;
  cycle_vol_limit: number | string;
  categories: string[];
  is_multiproduct: boolean;
  stackability_factor: number | string;
  enforce_integer_replenishment: boolean;
  round_to_one_threshold: number | string;
};

type MacroSkuRow = {
  sku_id: string;
  description: string;
  storage_type: string;
  vol_cycle: number;
  boxes_per_m3: number;
  weight: number;
  category: string;
  height?: number;
  width?: number;
  length?: number;
  replenishment_units?: number;
  total_vol?: number;
  total_weight?: number;
};

const defaultStorage: MacroStorageType = {
  name: "Nuevo Equipo",
  num_locations: 10,
  max_w: 1.0,
  max_l: 1.0,
  is_variable_height: false,
  max_h_loc: 0.5,
  max_h_storage: 5.0,
  max_weight_loc: 250,
  occupancy_pct: 85,
  cycle_days: 15,
  cycle_vol_limit: 100,
  categories: [],
  is_multiproduct: true,
  stackability_factor: 1,
  enforce_integer_replenishment: false,
  round_to_one_threshold: 0.25,
};

function ensureStorageType(st: Partial<MacroStorageType> | Record<string, unknown> | undefined): MacroStorageType {
  if (!st || typeof st !== "object") return { ...defaultStorage };
  const cats = st.categories;
  const categories = Array.isArray(cats) ? [...cats] : typeof st.allowed_categories === "string"
    ? (st.allowed_categories as string).split(",").map((c) => c.trim()).filter(Boolean)
    : [];
  return {
    name: String(st.name ?? defaultStorage.name),
    num_locations: st.num_locations ?? defaultStorage.num_locations,
    max_w: st.max_w ?? defaultStorage.max_w,
    max_l: st.max_l ?? defaultStorage.max_l,
    is_variable_height: Boolean(st.is_variable_height ?? defaultStorage.is_variable_height),
    max_h_loc: st.max_h_loc ?? defaultStorage.max_h_loc,
    max_h_storage: st.max_h_storage ?? defaultStorage.max_h_storage,
    max_weight_loc: st.max_weight_loc ?? defaultStorage.max_weight_loc,
    occupancy_pct: st.occupancy_pct ?? defaultStorage.occupancy_pct,
    cycle_days: st.cycle_days ?? defaultStorage.cycle_days,
    cycle_vol_limit: st.cycle_vol_limit ?? defaultStorage.cycle_vol_limit,
    categories,
    is_multiproduct: st.is_multiproduct ?? defaultStorage.is_multiproduct,
    stackability_factor: st.stackability_factor ?? defaultStorage.stackability_factor,
    enforce_integer_replenishment: Boolean(st.enforce_integer_replenishment ?? defaultStorage.enforce_integer_replenishment),
    round_to_one_threshold: (() => {
      const v = st.round_to_one_threshold ?? defaultStorage.round_to_one_threshold;
      const n = typeof v === "number" ? v : parseFloat(String(v));
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.25;
    })(),
  };
}

function extractId(obj: Record<string, unknown>): string | null {
  const keys = ["id", "sku_id", "material", "codigo"];
  for (const k of keys) {
    const v = obj[k];
    if (v != null && typeof v === "string") return v;
    if (v != null && typeof v === "number") return String(v);
  }
  return null;
}

function downloadMacroCSV(rows: MacroSkuRow[] | undefined | null) {
  const safeRows = rows ?? [];
  const headers = ["SKU", "Descripción", "Storage Type", "Categoría", "Dimensiones en cm (L x A x H)", "Unid. Reposición", "Vol. Total (m³)", "Peso Total (KG)"];
  const csvRows = safeRows.map((r) => [
    r?.sku_id ?? "",
    r?.description ?? "",
    r?.storage_type ?? "",
    r?.category ?? "",
    [r?.length, r?.width, r?.height].map((v) => (v != null ? String(v) : "-")).join(" x "),
    r?.replenishment_units != null ? Number(r.replenishment_units).toFixed(1) : "-",
    r?.total_vol != null ? Number(r.total_vol).toFixed(4) : "-",
    r?.total_weight != null ? Number(r.total_weight).toFixed(2) : "-",
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
  const { state, updateState, completeStep, setStep, macroParams, setMacroParams, isMacroRunning, setIsMacroRunning } = useSlotting();
  const auditResults = state?.auditResults ?? null;
  const { toast } = useToast();

  const [storageTypes, setStorageTypes] = useState<MacroStorageType[]>(() => {
    const saved = macroParams?.storageTypes;
    if (Array.isArray(saved) && saved.length > 0) {
      return saved.map((st) => ensureStorageType(st));
    }
    return [ensureStorageType({ ...defaultStorage })];
  });
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isDragEnabled, setIsDragEnabled] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    setMacroParams((prev) => ({ ...prev, storageTypes }));
  }, [storageTypes, setMacroParams]);

  const handleRun = async () => {
    if (!state?.dataFile) {
      toast({
        title: "Archivo pendiente",
        description: "Por favor vuelve al Paso 1 y carga el dataset Excel antes de continuar.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsMacroRunning(true);

      const formData = new FormData();
      formData.append("file", state!.dataFile);

      // Exclusiones: solo los que el usuario eligió descartar en Step2 (si el switch está activo)
      const excludeOutliers = state?.excludeOutliers ?? false;
      const selectedSkus = state?.selectedSkusToExclude ?? [];
      const selectedOrders = state?.selectedOrdersToExclude ?? [];
      const hasExclusions = excludeOutliers && (selectedSkus.length > 0 || selectedOrders.length > 0);

      formData.append("exclude_outliers", hasExclusions ? "true" : "false");
      formData.append("include_zero_rot", state.includeNoRotation ? "true" : "false");
      formData.append("excluded_skus", JSON.stringify(selectedSkus));
      formData.append("excluded_orders", JSON.stringify(selectedOrders));

      // Tipos de almacenamiento paramétricos (prioridad = índice + 1)
      const safeStorageTypes = (storageTypes ?? []).map((st, idx) => {
        const safe = ensureStorageType(st);
        return {
          name: safe.name,
          priority: idx + 1,
          num_locations: Number(safe.num_locations) || 10,
          max_w: Number(safe.max_w) || 1.0,
          max_l: Number(safe.max_l) || 1.0,
          is_variable_height: Boolean(safe.is_variable_height),
          max_h_loc: Number(safe.max_h_loc) || 0.5,
          max_h_storage: Number(safe.max_h_storage) || 5.0,
          max_weight_loc: Number(safe.max_weight_loc) || 250,
          occupancy_pct: Number(safe.occupancy_pct) || 85,
          cycle_days: Number(safe.cycle_days) || 15,
          cycle_vol_limit: Number(safe.cycle_vol_limit) || 100,
          categories: Array.isArray(safe.categories) ? safe.categories : [],
          is_multiproduct: Boolean(safe.is_multiproduct),
          stackability_factor: Number(safe.stackability_factor) || 1,
          enforce_integer_replenishment: Boolean(safe.enforce_integer_replenishment),
          round_to_one_threshold: Math.max(0, Math.min(1, Number(safe.round_to_one_threshold) || 0.25)),
        };
      });
      formData.append("storage_types", JSON.stringify(safeStorageTypes));

      Object.entries(state?.mappingConfig ?? {}).forEach(([key, value]) => {
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
      setIsMacroRunning(false);
    }
  };

  const handleRestoreParams = async () => {
    try {
      setIsRestoring(true);
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/history`, {
        headers: { Authorization: `Bearer ${import.meta.env.VITE_API_TOKEN}` },
      });
      if (!res.ok) throw new Error("Error al obtener historial");
      const data = await res.json();

      const lastMacro = data?.macro?.[0];
      const savedStorages = lastMacro?.params?.storage_types;

      if (Array.isArray(savedStorages) && savedStorages.length > 0) {
        setStorageTypes(savedStorages.map((st) => ensureStorageType(st)));
        toast({
          title: "Parámetros restaurados",
          description: "Se han cargado los parámetros de la última ejecución.",
        });
      } else {
        toast({
          title: "No hay parámetros",
          description: "No se encontraron ejecuciones anteriores de Macro-Slotting.",
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({
        title: "Error",
        description: "No se pudieron restaurar los parámetros.",
        variant: "destructive",
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const addStorageType = () => {
    setStorageTypes((prev) => [
      ...prev,
      ensureStorageType({
        ...defaultStorage,
        name: `Equipo ${(prev?.length ?? 0) + 1}`,
      }),
    ]);
  };

  const updateStorageType = (idx: number, field: keyof MacroStorageType, value: string | number | boolean | string[]) => {
    setStorageTypes((prev) => {
      const list = prev ?? [];
      const next = list.map((s) => ensureStorageType(s));
      const current = next[idx];
      if (field === "name") {
        next[idx] = { ...current, name: String(value ?? "") };
      } else if (field === "categories") {
        next[idx] = { ...current, categories: Array.isArray(value) ? value : [] };
      } else if (field === "is_variable_height") {
        next[idx] = { ...current, is_variable_height: Boolean(value) };
      } else if (field === "is_multiproduct") {
        next[idx] = { ...current, is_multiproduct: Boolean(value) };
      } else if (field === "enforce_integer_replenishment") {
        next[idx] = { ...current, enforce_integer_replenishment: Boolean(value) };
      } else if (field === "round_to_one_threshold") {
        const n = typeof value === "number" ? value : parseFloat(String(value));
        next[idx] = { ...current, round_to_one_threshold: (value === "" || !Number.isFinite(n)) ? (current.round_to_one_threshold ?? 0.25) : Math.max(0, Math.min(1, n)) };
      } else if (typeof value === "number" || value === "") {
        next[idx] = { ...current, [field]: value };
      } else {
        const num = field === "cycle_days" || field === "num_locations" || field === "stackability_factor"
          ? parseInt(String(value), 10) || (field === "stackability_factor" ? 1 : 0)
          : parseFloat(String(value)) || 0;
        next[idx] = { ...current, [field]: num };
      }
      return next;
    });
  };

  const removeStorageType = (idx: number) => {
    setStorageTypes((prev) => (prev ?? []).filter((_, i) => i !== idx));
  };

  const handleDrop = (dropIndex: number) => {
    if (draggedIndex === null || draggedIndex === dropIndex) return;
    const newStorages = [...(storageTypes ?? [])];
    const draggedItem = newStorages[draggedIndex];
    newStorages.splice(draggedIndex, 1);
    newStorages.splice(dropIndex, 0, draggedItem);
    setStorageTypes(newStorages);
    setDraggedIndex(null);
  };

  const macro = state?.macroResult ?? null;
  const kpi = macro?.kpi;
  const allocations = kpi?.allocations ?? {};
  const unassignedCount = kpi?.unassigned_count ?? 0;

  const [tableRows, setTableRows] = useState<MacroSkuRow[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(100);
  const [filterText, setFilterText] = useState("");
  const [filterStorageType, setFilterStorageType] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  type SortKey = keyof MacroSkuRow | "cajas_ciclo";
  const [sortConfig, setSortConfig] = useState<{ column: SortKey; direction: "asc" | "desc" } | null>(null);

  const storageTypeOptions = useMemo(() => {
    const base = [...(storageTypes ?? []).map((s) => s?.name).filter(Boolean), "UNASSIGNED"];
    const fromRows = [...new Set((tableRows ?? []).map((r) => r?.storage_type).filter(Boolean))];
    return [...new Set([...base, ...fromRows])];
  }, [storageTypes, tableRows]);

  const rawToRows = (raw: Array<Record<string, unknown>> | undefined | null): MacroSkuRow[] =>
    (raw ?? []).map((r) => ({
      sku_id: String(r?.sku_id ?? r?.id ?? r?.material ?? r?.codigo ?? ""),
      description: String(r?.description ?? ""),
      storage_type: String(r?.storage_type ?? ""),
      vol_cycle: Number(r?.vol_cycle ?? r?.cycle_volume ?? 0) || 0,
      boxes_per_m3: Number(r?.boxes_per_m3 ?? 0) || 0,
      weight: Number(r?.weight ?? 0) || 0,
      category: String(r?.category ?? ""),
      height: r?.height != null ? Number(r.height) : undefined,
      width: r?.width != null ? Number(r.width) : undefined,
      length: r?.length != null ? Number(r.length) : undefined,
      replenishment_units: r?.replenishment_units != null ? Number(r.replenishment_units) : undefined,
      total_vol: r?.total_vol != null ? Number(r.total_vol) : undefined,
      total_weight: r?.total_weight != null ? Number(r.total_weight) : undefined,
    }));

  useEffect(() => {
    const raw = macro?.macro_skus;
    if (Array.isArray(raw) && raw.length > 0) {
      setTableRows(rawToRows(raw as Array<Record<string, unknown>>));
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
    setCurrentPage(1);
    setSortConfig((prev) => {
      const nextDir = prev?.column === column && prev.direction === "asc" ? "desc" : "asc";
      return { column, direction: nextDir };
    });
  };

  const uniqueCategories = useMemo(() => {
    const rows = tableRows ?? [];
    const cats = new Set(rows.map((r) => (r?.category ?? "").trim()).filter(Boolean));
    return [...cats].sort();
  }, [tableRows]);

  const availableCategories = useMemo(() => {
    const fromSample = (auditResults?.validation?.maestro?.sample_data ?? []) as Record<string, unknown>[];
    const fromSampleCats = fromSample
      .map((r) => {
        const v = r?.Categoría ?? r?.categoria;
        return v != null ? String(v).trim() : "";
      })
      .filter(Boolean);
    return [...new Set([...fromSampleCats, ...uniqueCategories])].sort();
  }, [auditResults?.validation?.maestro?.sample_data, uniqueCategories]);

  const filteredSkus = useMemo(() => {
    const rows = tableRows ?? [];
    const text = (filterText ?? "").trim().toLowerCase();
    const st = (filterStorageType ?? "").trim();
    const cat = (filterCategory ?? "").trim();
    return rows.filter((r) => {
      if (text) {
        const matches = (r?.sku_id ?? "").toLowerCase().includes(text) ||
          (r?.description ?? "").toLowerCase().includes(text);
        if (!matches) return false;
      }
      if (st && (r?.storage_type ?? "").trim() !== st) return false;
      if (cat && (r?.category ?? "").trim() !== cat) return false;
      return true;
    });
  }, [tableRows, filterText, filterStorageType, filterCategory]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterText, filterStorageType, filterCategory]);

  const sortedRows = useMemo(() => {
    const rows = filteredSkus;
    if (!sortConfig) return rows;
    return [...rows].sort((a, b) => {
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
  }, [filteredSkus, sortConfig]);

  const totalPages = Math.max(1, Math.ceil((sortedRows?.length ?? 0) / itemsPerPage));
  const paginatedRows = useMemo(() => {
    const rows = sortedRows ?? [];
    const start = (currentPage - 1) * itemsPerPage;
    return rows.slice(start, start + itemsPerPage);
  }, [sortedRows, currentPage, itemsPerPage]);

  const paginationStart = (currentPage - 1) * itemsPerPage + 1;
  const paginationEnd = Math.min(currentPage * itemsPerPage, sortedRows?.length ?? 0);
  const totalItems = sortedRows?.length ?? 0;

  useEffect(() => {
    setCurrentPage(1);
  }, [tableRows.length]);

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
        <Button onClick={handleRun} disabled={isMacroRunning} className="gap-2" size="lg">
          {isMacroRunning ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Corriendo...
            </>
          ) : (
            <>
          <Play className="w-4 h-4" />
              Ejecutar Macro-Slotting
            </>
          )}
        </Button>
      </div>

      {/* Configuration */}
      <div className="grid grid-cols-1 gap-2">
        <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Tipos de Almacenamiento</h3>
              <p className="text-xs text-muted-foreground">Prioridad 1 = más prioritario. Arrastrá para reordenar.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleRestoreParams} disabled={isRestoring} className="gap-1">
                {isRestoring ? <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <History className="w-3 h-3" />}
                Restaurar
              </Button>
              <Button size="sm" variant="outline" onClick={addStorageType} className="gap-1">
                <Plus className="w-3 h-3" /> Añadir
              </Button>
            </div>
          </div>

        {(storageTypes ?? []).map((st, idx) => {
          const safe = ensureStorageType(st);
          return (
            <Card
              key={idx}
              draggable={isDragEnabled}
              onDragStart={(e) => {
                const target = e.target as HTMLElement;
                if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)) {
                  e.preventDefault();
                  return;
                }
                setDraggedIndex(idx);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(idx)}
              onDragEnd={() => setDraggedIndex(null)}
              className={cn("mb-2 transition-opacity", draggedIndex === idx ? "opacity-50" : "opacity-100")}
            >
              <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2 shrink-0">
                  <GripVertical
                    className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing shrink-0"
                    onMouseEnter={() => setIsDragEnabled(true)}
                    onMouseLeave={() => setIsDragEnabled(false)}
                  />
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    Prioridad {idx + 1}
                  </Badge>
                </div>
                <div className="flex-1 min-w-0 mx-2">
                  <Label className="text-[11px] uppercase text-muted-foreground truncate block">Nombre</Label>
                  <Input
                    value={safe.name}
                    onChange={(e) => updateStorageType(idx, "name", e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  onClick={() => removeStorageType(idx)}
                  disabled={(storageTypes ?? []).length <= 1}
                >
                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-3 gap-y-2 items-end">
                  <div className="flex flex-col gap-0.5">
                    <Label className="text-[11px] uppercase text-muted-foreground truncate">Ubicaciones</Label>
                      <Input
                        type="number"
                        min={1}
                      value={safe.num_locations}
                      onChange={(e) => updateStorageType(idx, "num_locations", e.target.value === "" ? "" : Number(e.target.value) || 0)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <Label className="text-[11px] uppercase text-muted-foreground truncate">Ancho (m)</Label>
                      <Input
                      type="number"
                      step={0.01}
                      min={0}
                      value={safe.max_w}
                      onChange={(e) => updateStorageType(idx, "max_w", e.target.value === "" ? "" : Number(e.target.value) || 0)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <Label className="text-[11px] uppercase text-muted-foreground truncate">Largo (m)</Label>
                      <Input
                        type="number"
                        step={0.01}
                      min={0}
                      value={safe.max_l}
                      onChange={(e) => updateStorageType(idx, "max_l", e.target.value === "" ? "" : Number(e.target.value) || 0)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <Label className="text-[11px] uppercase text-muted-foreground truncate">Peso máx (kg)</Label>
                    <Input
                      type="number"
                      step={0.1}
                      min={0}
                      value={safe.max_weight_loc}
                      onChange={(e) => updateStorageType(idx, "max_weight_loc", e.target.value === "" ? "" : Number(e.target.value) || 0)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <Label className="text-[11px] uppercase text-muted-foreground truncate">% Ocupación</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={safe.occupancy_pct}
                      onChange={(e) => updateStorageType(idx, "occupancy_pct", e.target.value === "" ? "" : Number(e.target.value) || 0)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <Label className="text-[11px] uppercase text-muted-foreground truncate">Cycle Days</Label>
                    <Input
                      type="number"
                      min={1}
                      value={safe.cycle_days}
                      onChange={(e) => updateStorageType(idx, "cycle_days", e.target.value === "" ? "" : Number(e.target.value) || 0)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <Label className="text-[11px] uppercase text-muted-foreground truncate">Vol límite</Label>
                      <Input
                        type="number"
                      step={0.01}
                      min={0}
                      value={safe.cycle_vol_limit}
                      onChange={(e) => updateStorageType(idx, "cycle_vol_limit", e.target.value === "" ? "" : Number(e.target.value) || 0)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="flex flex-row items-center justify-between border rounded-md px-2 h-11 col-span-2 md:col-span-1">
                    <span className="text-[11px] uppercase text-muted-foreground truncate">Altura Variable</span>
                    <Switch
                      checked={safe.is_variable_height}
                      onCheckedChange={(v) => updateStorageType(idx, "is_variable_height", v)}
                    />
                  </div>
                  {!safe.is_variable_height ? (
                    <div className="flex flex-col gap-0.5">
                      <Label className="text-[11px] uppercase text-muted-foreground truncate">Alto Ubic. (m)</Label>
                      <Input
                        type="number"
                        step={0.01}
                        min={0}
                        value={safe.max_h_loc}
                        onChange={(e) => updateStorageType(idx, "max_h_loc", e.target.value === "" ? "" : Number(e.target.value) || 0)}
                        className="h-9 text-sm"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <Label className="text-[11px] uppercase text-muted-foreground truncate">Alto Equipo (m)</Label>
                      <Input
                        type="number"
                        step={0.01}
                        min={0}
                        value={safe.max_h_storage}
                        onChange={(e) => updateStorageType(idx, "max_h_storage", e.target.value === "" ? "" : Number(e.target.value) || 0)}
                        className="h-9 text-sm"
                      />
                    </div>
                  )}
                  <div className="flex flex-col gap-0.5">
                    <Label className="text-[11px] uppercase text-muted-foreground truncate">Mezcla</Label>
                    <Select
                      value={safe.is_multiproduct ? "multi" : "mono"}
                      onValueChange={(val) => updateStorageType(idx, "is_multiproduct", val === "multi")}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="multi">Multiproducto</SelectItem>
                        <SelectItem value="mono">Monoproducto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <Label className="text-[11px] uppercase text-muted-foreground truncate" title="Factor de Apilabilidad">
                      Apilabilidad
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={safe.stackability_factor}
                      onChange={(e) =>
                        updateStorageType(idx, "stackability_factor", e.target.value === "" ? "" : Number(e.target.value) || 1)
                      }
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="flex flex-row items-center justify-between border rounded-md px-2 h-9 col-span-2 md:col-span-1 mb-[2px]">
                    <span className="text-[11px] uppercase text-muted-foreground truncate" title="Exigir cantidades enteras de reposición">Cajas Enteras</span>
                    <Switch
                      checked={safe.enforce_integer_replenishment}
                      onCheckedChange={(v) => updateStorageType(idx, "enforce_integer_replenishment", v)}
                    />
                  </div>
                  <div className={cn("flex flex-col gap-0.5", !safe.enforce_integer_replenishment && "opacity-50 pointer-events-none")}>
                    <Label className="text-[11px] uppercase text-muted-foreground truncate" title="Límite para redondear hacia 1 (ej: 0.25)">
                      Límite Redondeo
                    </Label>
                    <Input
                      type="number"
                      step={0.01}
                      min={0}
                      max={1}
                      value={safe.round_to_one_threshold}
                      onChange={(e) =>
                        updateStorageType(idx, "round_to_one_threshold", e.target.value === "" ? "" : Number(e.target.value))
                      }
                      disabled={!safe.enforce_integer_replenishment}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5 col-span-2 md:col-span-2 lg:col-span-1">
                    <Label className="text-[11px] uppercase text-muted-foreground truncate">Categorías</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="h-9 justify-between text-left font-normal text-sm">
                          <span className="truncate">
                            {safe.categories && safe.categories.length > 0
                              ? safe.categories.join(", ")
                              : "Todas"}
                          </span>
                          <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
                      </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-56 max-h-64 overflow-y-auto" align="start">
                        {availableCategories.length > 0 ? (
                          availableCategories.map((cat: string) => {
                            const currentCats = safe.categories ?? [];
                            const isSelected = currentCats.includes(cat);
                            return (
                              <DropdownMenuCheckboxItem
                                key={cat}
                                checked={isSelected}
                                onCheckedChange={(checked) => {
                                  const newCats = checked
                                    ? [...currentCats, cat]
                                    : currentCats.filter((c: string) => c !== cat);
                                  updateStorageType(idx, "categories", newCats);
                                }}
                              >
                                {cat}
                              </DropdownMenuCheckboxItem>
                            );
                          })
                        ) : (
                          <div className="p-2 text-sm text-muted-foreground">No hay categorías en auditoría</div>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
          </div>
              </CardContent>
        </Card>
          );
        })}
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
                  <div className="flex flex-wrap gap-2 mb-3">
                    <Badge variant="secondary" className="text-xs font-normal">
                      Volumen Ocupado: {formatNum((alloc as Record<string, unknown>).occupancy_pct_real ?? alloc.fill_percentage)}%
                    </Badge>
                    <Badge variant="secondary" className="text-xs font-normal">
                      Peso Total Asignado: {formatNum((alloc as Record<string, unknown>).total_weight_allocated)} KG
                    </Badge>
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
                    {tableRows.length} SKUs · Filtros · Ordenar · Paginación · Editar Storage Type manualmente
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
              <div className="px-5 py-3 border-b grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Input
                  placeholder="Buscar por Código o Descripción"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="max-w-full"
                />
                <Select value={filterStorageType || "all"} onValueChange={(v) => setFilterStorageType(v === "all" ? "" : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Filtrar por Storage Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {(storageTypeOptions ?? []).map((opt, idx) => (
                      <SelectItem key={opt ?? `st-${idx}`} value={opt ?? ""}>
                        {opt ?? ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterCategory || "all"} onValueChange={(v) => setFilterCategory(v === "all" ? "" : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Filtrar por Categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {uniqueCategories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="py-1 h-auto text-xs">
                        <button
                          type="button"
                          className="flex items-center gap-1 hover:text-foreground font-medium"
                          onClick={() => handleSort("sku_id")}
                        >
                          SKU <SortIcon col="sku_id" />
                        </button>
                      </TableHead>
                      <TableHead className="py-1 h-auto text-xs">
                        <button
                          type="button"
                          className="flex items-center gap-1 hover:text-foreground font-medium"
                          onClick={() => handleSort("description")}
                        >
                          Descripción <SortIcon col="description" />
                        </button>
                      </TableHead>
                      <TableHead className="py-1 h-auto text-xs">
                        <button
                          type="button"
                          className="flex items-center gap-1 hover:text-foreground font-medium"
                          onClick={() => handleSort("storage_type")}
                        >
                          Storage Type <SortIcon col="storage_type" />
                        </button>
                      </TableHead>
                      <TableHead className="py-1 h-auto text-xs">
                        <button
                          type="button"
                          className="flex items-center gap-1 hover:text-foreground font-medium"
                          onClick={() => handleSort("category")}
                        >
                          Categoría <SortIcon col="category" />
                        </button>
                      </TableHead>
                      <TableHead className="py-1 h-auto text-xs">Dimensiones en cm (L x A x H)</TableHead>
                      <TableHead className="py-1 h-auto text-xs">
                        <button
                          type="button"
                          className="flex items-center gap-1 hover:text-foreground font-medium"
                          onClick={() => handleSort("replenishment_units")}
                        >
                          Unid. Reposición <SortIcon col="replenishment_units" />
                        </button>
                      </TableHead>
                      <TableHead className="py-1 h-auto text-xs">Vol. Total (m³)</TableHead>
                      <TableHead className="py-1 h-auto text-xs">Peso Total (KG)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRows.map((row, rowIdx) => {
                      const skuId = row?.sku_id ?? `row-${rowIdx}`;
                      return (
                        <TableRow key={skuId}>
                          <TableCell className="py-1 h-auto text-xs font-mono">{row?.sku_id ?? "—"}</TableCell>
                          <TableCell className="py-1 h-auto text-xs max-w-[200px] truncate" title={row?.description ?? ""}>
                            {row?.description || "—"}
                          </TableCell>
                          <TableCell className="py-1 h-auto text-xs">
                            <Select value={row?.storage_type ?? ""} onValueChange={(v) => updateTableStorageType(skuId, v)}>
                              <SelectTrigger className="h-7 text-[11px] min-w-[100px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(storageTypeOptions ?? []).map((opt, optIdx) => (
                                  <SelectItem key={opt ?? `opt-${optIdx}`} value={opt ?? ""} className="text-[11px]">
                                    {opt ?? ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="py-1 h-auto text-xs">{row?.category || "—"}</TableCell>
                          <TableCell className="py-1 h-auto text-xs tabular-nums font-mono">
                            {formatNum(row?.length)} x {formatNum(row?.width)} x {formatNum(row?.height)}
                          </TableCell>
                          <TableCell className="py-1 h-auto text-xs tabular-nums text-right">{formatNum(row?.replenishment_units)}</TableCell>
                          <TableCell className="py-1 h-auto text-xs tabular-nums text-right">{formatNum(row?.total_vol)}</TableCell>
                          <TableCell className="py-1 h-auto text-xs tabular-nums text-right">{formatNum(row?.total_weight)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="px-5 py-3 border-t flex items-center justify-between gap-4 flex-wrap">
                <p className="text-sm text-muted-foreground">
                  Mostrando {totalItems === 0 ? 0 : paginationStart} a {paginationEnd} de {totalItems} SKUs
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
            </Card>
          )}
        </div>
      )}

      {!macro && !isMacroRunning && (
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
