import { useState, useCallback } from "react";
import { useSlotting } from "@/context/SlottingContext";
import type { AuditResultsRaw, OutlierSkuItem, OutlierOrderItem, OutlierUbiquitousItem } from "@/context/SlottingContext";
import { ArrowRight, ArrowLeft, Zap, Weight, Box, ShoppingCart, Star, Download, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/components/ui/use-toast";

export interface OutliersConfig {
  heavy: { enabled: boolean; weight_min: number | string; weight_max: number | string };
  bulky: { enabled: boolean; volume_min: number | string; volume_max: number | string };
  massive: { enabled: boolean; lines_threshold: number | string };
  ubiquitous: { enabled: boolean; frequency_threshold: number | string };
}

const DEFAULT_OUTLIERS_CONFIG: OutliersConfig = {
  heavy: { enabled: true, weight_min: 0, weight_max: 25 },
  bulky: { enabled: true, volume_min: 0, volume_max: 0.05 },
  massive: { enabled: true, lines_threshold: 50 },
  ubiquitous: { enabled: true, frequency_threshold: 0.15 },
};

/** Formatea un outlier para mostrar: "[ID] - [Descripción] (Valor)" */
function formatOutlierDisplay(
  item: OutlierSkuItem | OutlierOrderItem | OutlierUbiquitousItem | Record<string, unknown>,
  category: string
): string {
  const id = (item?.sku_id ?? item?.order_id ?? (item as Record<string, unknown>)?.id ?? "") as string;
  const desc = ((item as Record<string, unknown>)?.description ?? "") as string;
  const val = (item as Record<string, unknown>)?.value;
  let valStr = "";
  if (typeof val === "number") {
    if (category === "ubiquitous_skus") valStr = `${(val * 100).toFixed(2)}%`;
    else if (category === "heavy_skus") valStr = `${val} kg`;
    else if (category === "bulky_skus") valStr = `${val} m³`;
    else valStr = String(val);
  } else {
    valStr = String(val ?? "");
  }
  const descPart = desc ? ` - ${desc}` : "";
  return `${id}${descPart} (${valStr})`;
}

const CATEGORY_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  heavy_skus: { label: "SKUs >25kg", icon: Weight },
  bulky_skus: { label: "SKUs Voluminosos", icon: Box },
  massive_orders: { label: "Pedidos B2B", icon: ShoppingCart },
  ubiquitous_skus: { label: "SKUs Omnipresentes", icon: Star },
};

function KPICard({
  icon: Icon,
  label,
  value,
  color,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`kpi-card border transition-colors ${onClick ? "cursor-pointer hover:bg-muted/50 hover:border-primary/50" : ""}`}
      onClick={onClick}
    >
      <CardContent className="flex items-center gap-4 py-5 px-5">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function downloadCSV(
  category: string,
  data: unknown[],
  showToast: (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void
) {
  if (!data || data.length === 0) {
    showToast({ title: "No hay datos para exportar", description: "Esta categoría está vacía.", variant: "destructive" });
    return;
  }

  const items = data as Record<string, unknown>[];
  const headers = [...new Set(items.flatMap((item) => Object.keys(item)))];
  const headerRow = headers.join(",");
  const rows = items.map((item) =>
    headers
      .map((h) => {
        const val = item[h];
        const str = val == null ? "" : String(val);
        return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str;
      })
      .join(",")
  );
  const csv = [headerRow, ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `outliers_${category}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function Step2DataAudit() {
  const { state, updateState, setStep, setAuditResults } = useSlotting();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [outliersConfig, setOutliersConfig] = useState<OutliersConfig>(DEFAULT_OUTLIERS_CONFIG);
  const [configOpen, setConfigOpen] = useState(true);

  const auditResults = state.auditResults;
  const hasResults = auditResults != null;

  const updateOutliersConfig = useCallback(<K extends keyof OutliersConfig>(
    category: K,
    updates: Partial<OutliersConfig[K]>
  ) => {
    setOutliersConfig((prev) => ({
      ...prev,
      [category]: { ...prev[category], ...updates },
    }));
  }, []);

  const handleRunAudit = async () => {
    if (!state.dataFile) {
      toast({
        title: "Archivo pendiente",
        description: "Por favor vuelve al Paso 1 y carga el dataset Excel antes de continuar.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);

      const formData = new FormData();
      formData.append("file", state.dataFile);
      formData.append("cycle_days", "15.0");
      const safeNum = (v: unknown, def: number) => {
        const n = Number(v);
        return Number.isNaN(n) ? def : n;
      };
      const safeOutliersConfig = {
        heavy: {
          enabled: outliersConfig.heavy.enabled,
          weight_min: safeNum(outliersConfig.heavy.weight_min, 0),
          weight_max: safeNum(outliersConfig.heavy.weight_max, 25),
        },
        bulky: {
          enabled: outliersConfig.bulky.enabled,
          volume_min: safeNum(outliersConfig.bulky.volume_min, 0),
          volume_max: safeNum(outliersConfig.bulky.volume_max, 0.05),
        },
        massive: {
          enabled: outliersConfig.massive.enabled,
          lines_threshold: Number(outliersConfig.massive.lines_threshold) || 50,
        },
        ubiquitous: {
          enabled: outliersConfig.ubiquitous.enabled,
          frequency_threshold: Number(outliersConfig.ubiquitous.frequency_threshold) || 0.15,
        },
      };
      formData.append("outliers_config", JSON.stringify(safeOutliersConfig));

      Object.entries(state.mappingConfig).forEach(([key, value]) => {
        formData.append(key, value);
      });

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/outliers`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_API_TOKEN}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || "Error al ejecutar la auditoría de datos");
      }

      let raw: AuditResultsRaw;
      try {
        raw = (await response.json()) as AuditResultsRaw;
      } catch (parseError) {
        console.error(parseError);
        toast({
          title: "Error al interpretar la respuesta",
          description: parseError instanceof Error ? parseError.message : "La API devolvió datos no válidos.",
          variant: "destructive",
        });
        return;
      }

      setAuditResults(raw);
      updateState({ auditRun: true });
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Revisa la API o los archivos cargados e inténtalo nuevamente.";
      toast({
        title: "No se pudo ejecutar la auditoría",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getArrayLength = (key: keyof AuditResultsRaw): number => {
    const arr = auditResults?.[key];
    return Array.isArray(arr) ? arr.length : 0;
  };

  const getCategoryData = (category: string): unknown[] => {
    const arr = auditResults?.[category as keyof AuditResultsRaw];
    return Array.isArray(arr) ? arr : [];
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Detección de Anomalías</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Identifique outliers y SKUs atípicos antes de ejecutar el slotting.
          </p>
        </div>
        <Button onClick={handleRunAudit} disabled={isLoading} className="gap-2" size="lg">
          <Zap className="w-4 h-4" />
          {isLoading ? "Analizando..." : hasResults ? "Re-ejecutar Auditoría" : "Ejecutar Auditoría"}
        </Button>
      </div>

      {/* Configuración de Anomalías */}
      <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
        <Card className="border-dashed">
          <CollapsibleTrigger asChild>
            <button className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-muted/30 transition-colors rounded-t-lg">
              <h3 className="text-sm font-semibold">Configuración de Anomalías</h3>
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${configOpen ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 pb-5 px-5">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Heavy SKUs - fuera del rango normal = pesado */}
                <Card className="border">
                  <CardContent className="pt-4 pb-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold flex items-center gap-2">
                        <Weight className="w-4 h-4" /> SKUs Pesados (fuera de rango)
                      </Label>
                      <Switch
                        checked={outliersConfig.heavy.enabled}
                        onCheckedChange={(v) => updateOutliersConfig("heavy", { enabled: v })}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Rango de Peso Normal (Mínimo - Máximo). Fuera = anómalo.</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Mín. Normal (kg)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={outliersConfig.heavy.weight_min}
                          onChange={(e) => updateOutliersConfig("heavy", { weight_min: e.target.value === "" ? "" : (parseFloat(e.target.value) || 0) })}
                          className="h-8 text-xs"
                          disabled={!outliersConfig.heavy.enabled}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Máx. Normal (kg)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={outliersConfig.heavy.weight_max}
                          onChange={(e) => updateOutliersConfig("heavy", { weight_max: e.target.value === "" ? "" : (parseFloat(e.target.value) || 0) })}
                          className="h-8 text-xs"
                          disabled={!outliersConfig.heavy.enabled}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Bulky SKUs - fuera del rango normal = voluminoso */}
                <Card className="border">
                  <CardContent className="pt-4 pb-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold flex items-center gap-2">
                        <Box className="w-4 h-4" /> SKUs Voluminosos (fuera de rango)
                      </Label>
                      <Switch
                        checked={outliersConfig.bulky.enabled}
                        onCheckedChange={(v) => updateOutliersConfig("bulky", { enabled: v })}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Rango de Volumen Normal (Mínimo - Máximo). Fuera = anómalo.</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Mín. Normal (m³)</Label>
                        <Input
                          type="number"
                          step="0.001"
                          value={outliersConfig.bulky.volume_min}
                          onChange={(e) => updateOutliersConfig("bulky", { volume_min: e.target.value === "" ? "" : (parseFloat(e.target.value) || 0) })}
                          className="h-8 text-xs"
                          disabled={!outliersConfig.bulky.enabled}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Máx. Normal (m³)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={outliersConfig.bulky.volume_max}
                          onChange={(e) => updateOutliersConfig("bulky", { volume_max: e.target.value === "" ? "" : (parseFloat(e.target.value) || 0) })}
                          className="h-8 text-xs"
                          disabled={!outliersConfig.bulky.enabled}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Massive Orders - supera tope normal = B2B */}
                <Card className="border">
                  <CardContent className="pt-4 pb-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold flex items-center gap-2">
                        <ShoppingCart className="w-4 h-4" /> Pedidos B2B (superan tope)
                      </Label>
                      <Switch
                        checked={outliersConfig.massive.enabled}
                        onCheckedChange={(v) => updateOutliersConfig("massive", { enabled: v })}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Tope Normal de Líneas por Pedido. Lo que supere = B2B/Masivo.</p>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Tope Normal (líneas)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={outliersConfig.massive.lines_threshold}
                        onChange={(e) => updateOutliersConfig("massive", { lines_threshold: e.target.value === "" ? "" : (parseInt(e.target.value, 10) || 1) })}
                        className="h-8 text-xs"
                        disabled={!outliersConfig.massive.enabled}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Ubiquitous SKUs - supera tope normal = omnipresente */}
                <Card className="border">
                  <CardContent className="pt-4 pb-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold flex items-center gap-2">
                        <Star className="w-4 h-4" /> Omnipresentes (superan tope)
                      </Label>
                      <Switch
                        checked={outliersConfig.ubiquitous.enabled}
                        onCheckedChange={(v) => updateOutliersConfig("ubiquitous", { enabled: v })}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Tope Normal de Aparición de SKU (0-1). Lo que supere = Omnipresente.</p>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Tope Normal (frecuencia)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        max={1}
                        value={outliersConfig.ubiquitous.frequency_threshold}
                        onChange={(e) => updateOutliersConfig("ubiquitous", { frequency_threshold: e.target.value === "" ? "" : (parseFloat(e.target.value) || 0) })}
                        className="h-8 text-xs"
                        disabled={!outliersConfig.ubiquitous.enabled}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="ml-3 text-sm text-muted-foreground">Procesando auditoría de datos...</p>
        </div>
      )}

      {hasResults && (
        <div className="space-y-6 animate-slide-in">
          {/* KPIs clickeables */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              icon={Weight}
              label="SKUs >25kg"
              value={getArrayLength("heavy_skus")}
              color="bg-destructive/10 text-destructive"
              onClick={() => setSelectedCategory(selectedCategory === "heavy_skus" ? null : "heavy_skus")}
            />
            <KPICard
              icon={Box}
              label="SKUs Voluminosos"
              value={getArrayLength("bulky_skus")}
              color="bg-warning/10 text-warning"
              onClick={() => setSelectedCategory(selectedCategory === "bulky_skus" ? null : "bulky_skus")}
            />
            <KPICard
              icon={ShoppingCart}
              label="Pedidos B2B"
              value={getArrayLength("massive_orders")}
              color="bg-info/10 text-info"
              onClick={() => setSelectedCategory(selectedCategory === "massive_orders" ? null : "massive_orders")}
            />
            <KPICard
              icon={Star}
              label="SKUs Omnipresentes"
              value={getArrayLength("ubiquitous_skus")}
              color="bg-primary/10 text-primary"
              onClick={() => setSelectedCategory(selectedCategory === "ubiquitous_skus" ? null : "ubiquitous_skus")}
            />
          </div>

          {/* Detalle de Outliers (al hacer clic en una tarjeta) */}
          {selectedCategory && (
            <Card>
              <div className="px-5 py-4 border-b flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">
                    Detalle de Outliers — {CATEGORY_LABELS[selectedCategory]?.label ?? selectedCategory}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Mostrando los primeros 50 resultados (Total: {getCategoryData(selectedCategory).length})
                  </p>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  className="gap-2"
                  onClick={() => downloadCSV(selectedCategory, getCategoryData(selectedCategory), toast)}
                >
                  <Download className="w-4 h-4" />
                  Descargar CSV Completo
                </Button>
              </div>
              <div className="overflow-auto">
                {getCategoryData(selectedCategory).length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                    No hay datos para esta categoría.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-semibold">Detalle</TableHead>
                        {(() => {
                          const data = getCategoryData(selectedCategory).slice(0, 50) as Record<string, unknown>[];
                          const allKeys = [...new Set(data.flatMap((item) => Object.keys(item ?? {})))];
                          const extra = allKeys.filter((h) => !["sku_id", "order_id", "id", "description"].includes(h));
                          return extra.map((h) => (
                            <TableHead key={h} className="capitalize">
                              {h.replace(/_/g, " ")}
                            </TableHead>
                          ));
                        })()}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(getCategoryData(selectedCategory).slice(0, 50) as Record<string, unknown>[]).map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-sm font-medium">
                            {formatOutlierDisplay(item ?? {}, selectedCategory)}
                          </TableCell>
                          {(() => {
                            const headers = [...new Set(Object.keys(item ?? {}))].filter(
                              (h) => !["sku_id", "order_id", "id", "description"].includes(h)
                            );
                            return headers.map((h) => (
                              <TableCell key={h} className="text-sm">
                                {typeof item?.[h] === "number" ? (item[h] as number).toLocaleString() : String(item?.[h] ?? "")}
                              </TableCell>
                            ));
                          })()}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
              {getCategoryData(selectedCategory).length > 50 && (
                <p className="px-5 py-2 text-xs text-muted-foreground border-t">
                  Mostrando los primeros 50 resultados (Total: {getCategoryData(selectedCategory).length})
                </p>
              )}
            </Card>
          )}

          {/* Decision switch */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-center justify-between py-5 px-5">
              <div>
                <h3 className="text-sm font-semibold">Tratamiento de Outliers</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {state.excludeOutliers
                    ? "Los outliers serán aislados y excluidos del slotting principal"
                    : "Todos los datos se incluirán en el proceso de slotting"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Incluir todos</span>
                <Switch
                  checked={state.excludeOutliers}
                  onCheckedChange={(v) => updateState({ excludeOutliers: v })}
                />
                <span className="text-xs font-medium">Aislar outliers</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Navigation */}
      <div className="sticky bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t p-4 flex justify-end gap-4 z-50">
        <Button variant="outline" onClick={() => setStep(0)} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Anterior
        </Button>
        <Button onClick={() => setStep(2)} className="gap-2">
          Siguiente <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
