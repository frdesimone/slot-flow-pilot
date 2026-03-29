import { useState, useCallback, useEffect } from "react";
import { useSlotting } from "@/context/SlottingContext";
import type { AuditResultsRaw, OutlierSkuItem, OutlierOrderItem, OutlierUbiquitousItem, DataValidationRaw } from "@/context/SlottingContext";
import { ArrowRight, ArrowLeft, Zap, Download, ChevronDown, Plus, Trash2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { formatNum } from "@/lib/utils";

export interface OutlierRule {
  id: string;
  name: string;
  target: "sku" | "order";
  attribute: string;
  min_val: number | string;
  max_val: number | string;
  enabled: boolean;
  rule_type?: "absolute" | "percentile";
}

const SKU_ATTRIBUTES = [
  { value: "weight", label: "Peso (kg)" },
  { value: "volume", label: "Volumen (m³)" },
  { value: "height", label: "Alto (cm)" },
  { value: "width", label: "Ancho (cm)" },
  { value: "length", label: "Largo (cm)" },
  { value: "boxes_per_m3", label: "UM venta a UM repos." },
  { value: "frequency", label: "Frecuencia en pedidos (0-1)" },
];

const ORDER_ATTRIBUTES = [
  { value: "lines", label: "Líneas por pedido" },
];

const DEFAULT_RULES: OutlierRule[] = [
  { id: "heavy", name: "Pesados", target: "sku", attribute: "weight", min_val: 0, max_val: 25, enabled: true, rule_type: "absolute" },
  { id: "bulky", name: "Voluminosos", target: "sku", attribute: "volume", min_val: 0, max_val: 0.05, enabled: true, rule_type: "absolute" },
  { id: "massive", name: "Pedidos B2B", target: "order", attribute: "lines", min_val: 0, max_val: 50, enabled: true, rule_type: "absolute" },
  { id: "ubiquitous", name: "Omnipresentes", target: "sku", attribute: "frequency", min_val: 0, max_val: 0.15, enabled: true, rule_type: "absolute" },
];

function generateRuleId(): string {
  return `regla_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function ValidationColumn({ title, data }: { title: string; data: DataValidationRaw }) {
  const found = data?.found_columns ?? [];
  const missing = data?.missing_columns ?? [];
  const sample = data?.sample_data ?? [];
  const hasMissing = missing.length > 0;
  const headers = sample.length > 0 ? Object.keys(sample[0] ?? {}) : [];

  return (
    <Card className="border">
      <CardContent className="pt-4 space-y-3">
        <h4 className="text-sm font-semibold">{title}</h4>
        <div className="flex flex-wrap gap-2">
          {found.map((col) => (
            <Badge key={col} variant="secondary" className="bg-emerald-600/90 text-white border-0">
              {col}
            </Badge>
          ))}
          {missing.map((col) => (
            <Badge key={col} variant="destructive">
              {col}
            </Badge>
          ))}
        </div>
        {hasMissing && (
          <Alert variant="destructive">
            <AlertTitle>Columnas faltantes</AlertTitle>
            <AlertDescription>
              El algoritmo puede fallar o usar valores por defecto (ej: raíz cúbica para dimensiones).
            </AlertDescription>
          </Alert>
        )}
        {sample.length > 0 && headers.length > 0 && (
          <div className="overflow-auto max-h-48">
            <Table>
              <TableHeader>
                <TableRow>
                  {headers.map((h) => (
                    <TableHead key={h} className="text-xs">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sample.map((row, idx) => (
                  <TableRow key={idx}>
                    {Object.entries(row as Record<string, any>).map(([key, val], j) => {
                      const isNumericColumn = /(peso|alto|ancho|largo|volumen|cajas|um|qty|cantidad)/i.test(key);
                      return (
                        <TableCell key={j} className="text-xs">
                          {isNumericColumn ? formatNum(val) : (val != null ? String(val) : "-")}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Formatea un outlier para mostrar: "[ID] - [Descripción] (Valor)" */
function formatOutlierDisplay(
  item: OutlierSkuItem | OutlierOrderItem | OutlierUbiquitousItem | Record<string, unknown>,
  attribute: string
): string {
  const id = (item?.sku_id ?? item?.order_id ?? (item as Record<string, unknown>)?.id ?? "") as string;
  const desc = ((item as Record<string, unknown>)?.description ?? "") as string;
  const val = (item as Record<string, unknown>)?.value;
  let valStr = "";
  if (typeof val === "number") {
    if (attribute === "frequency") valStr = `${formatNum(val * 100)}%`;
    else if (attribute === "weight") valStr = `${val} kg`;
    else if (attribute === "volume") valStr = `${val} m³`;
    else if (attribute === "lines") valStr = `${val} líneas`;
    else valStr = String(val);
  } else {
    valStr = String(val ?? "");
  }
  const descPart = desc ? ` - ${desc}` : "";
  return `${id}${descPart} (${valStr})`;
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
  const { state, updateState, setStep, setAuditResults, completeStep } = useSlotting();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [rules, setRules] = useState<OutlierRule[]>(() => [...DEFAULT_RULES]);
  const [configOpen, setConfigOpen] = useState(true);
  const [selectedSkusToExclude, setSelectedSkusToExclude] = useState<Set<string>>(new Set());
  const [selectedOrdersToExclude, setSelectedOrdersToExclude] = useState<Set<string>>(new Set());

  const auditResults = state.auditResults;
  const hasResults = auditResults != null;
  const categories = auditResults?.categories ?? [];
  const validation = auditResults?.validation;
  const maestroValidation = validation?.maestro ?? null;
  const pedidosValidation = validation?.pedidos ?? null;

  const updateRule = useCallback((idx: number, updates: Partial<OutlierRule>) => {
    setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, ...updates } : r)));
  }, []);

  const addRule = useCallback(() => {
    setRules((prev) => [
      ...prev,
      { id: generateRuleId(), name: "Nueva regla", target: "sku", attribute: "weight", min_val: 0, max_val: 100, enabled: true, rule_type: "absolute" },
    ]);
  }, []);

  const removeRule = useCallback((idx: number) => {
    setRules((prev) => prev.filter((_, i) => i !== idx));
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

      const safeRules = rules.map((r) => ({
        id: r.id,
        name: r.name,
        target: r.target,
        attribute: r.attribute,
        min_val: Number(r.min_val) || 0,
        max_val: Number(r.max_val) ?? (r.attribute === "frequency" ? 0.15 : 100),
        enabled: r.enabled,
        rule_type: r.rule_type || "absolute",
      }));
      formData.append("outliers_config", JSON.stringify(safeRules));

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

  const getCategoryById = (id: string) => categories.find((c) => c.id === id);
  const getCategoryItems = (id: string) => getCategoryById(id)?.items ?? [];

  useEffect(() => {
    setSelectedSkusToExclude(new Set());
    setSelectedOrdersToExclude(new Set());
  }, [auditResults]);

  useEffect(() => {
    const ctxSkus = state.selectedSkusToExclude ?? [];
    const ctxOrders = state.selectedOrdersToExclude ?? [];
    if (ctxSkus.length > 0 || ctxOrders.length > 0) {
      setSelectedSkusToExclude(new Set(ctxSkus));
      setSelectedOrdersToExclude(new Set(ctxOrders));
    }
  }, []);

  const getItemId = (item: Record<string, unknown>, target: "sku" | "order") =>
    (target === "sku" ? (item.sku_id ?? item.id) : (item.order_id ?? item.id)) as string;

  const isItemSelected = useCallback(
    (item: Record<string, unknown>, target: "sku" | "order") => {
      const id = getItemId(item, target);
      return target === "sku" ? selectedSkusToExclude.has(id) : selectedOrdersToExclude.has(id);
    },
    [selectedSkusToExclude, selectedOrdersToExclude]
  );

  const toggleItemSelection = useCallback((item: Record<string, unknown>, target: "sku" | "order") => {
    const id = getItemId(item, target);
    if (!id) return;
    if (target === "sku") {
      setSelectedSkusToExclude((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } else {
      setSelectedOrdersToExclude((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
  }, []);

  const isCategoryFullySelected = useCallback(
    (cat: { id: string; target: string; items: unknown[] }) => {
      const items = cat.items ?? [];
      if (items.length === 0) return false;
      const set = cat.target === "sku" ? selectedSkusToExclude : selectedOrdersToExclude;
      return items.every((it) => set.has(getItemId(it as Record<string, unknown>, cat.target as "sku" | "order")));
    },
    [selectedSkusToExclude, selectedOrdersToExclude]
  );

  const toggleCategorySelection = useCallback((cat: { id: string; target: string; items: unknown[] }) => {
    const items = (cat.items ?? []) as Record<string, unknown>[];
    const fullySelected = isCategoryFullySelected(cat);
    if (cat.target === "sku") {
      setSelectedSkusToExclude((prev) => {
        const next = new Set(prev);
        items.forEach((it) => {
          const id = getItemId(it, "sku");
          if (id) (fullySelected ? next.delete(id) : next.add(id));
        });
        return next;
      });
    } else {
      setSelectedOrdersToExclude((prev) => {
        const next = new Set(prev);
        items.forEach((it) => {
          const id = getItemId(it, "order");
          if (id) (fullySelected ? next.delete(id) : next.add(id));
        });
        return next;
      });
    }
  }, [isCategoryFullySelected]);

  const handleSiguiente = useCallback(() => {
    updateState({
      selectedSkusToExclude: [...selectedSkusToExclude],
      selectedOrdersToExclude: [...selectedOrdersToExclude],
    });
    completeStep(1);
    setStep(2);
  }, [selectedSkusToExclude, selectedOrdersToExclude, updateState, completeStep, setStep]);

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Detección de Anomalías</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Identifique outliers y SKUs atípicos antes de ejecutar el slotting.
          </p>
          <Alert className="bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/50">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="font-semibold">Disclaimer de Auditoría</AlertTitle>
            <AlertDescription className="text-xs mt-1">
              Esta auditoría no garantiza la detección del 100% de las inconsistencias en la información cargada, es una guía para facilitar el análisis por parte del responsable del proceso.
            </AlertDescription>
          </Alert>
        </div>
        <Button onClick={handleRunAudit} disabled={isLoading} className="gap-2" size="lg">
          <Zap className="w-4 h-4" />
          {isLoading ? "Analizando..." : hasResults ? "Re-ejecutar Auditoría" : "Ejecutar Auditoría"}
        </Button>
      </div>

      {/* Configuración de Reglas */}
      <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
        <Card className="border-dashed">
          <CollapsibleTrigger asChild>
            <button className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-muted/30 transition-colors rounded-t-lg">
              <h3 className="text-sm font-semibold">Reglas de Anomalías</h3>
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${configOpen ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 pb-5 px-5">
              <div className="space-y-4">
                {rules.map((rule, idx) => (
                  <Card key={rule.id} className="border">
                    <CardContent className="pt-4 pb-4 space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <Switch
                          checked={rule.enabled}
                          onCheckedChange={(v) => updateRule(idx, { enabled: v })}
                        />
                        <Input
                          placeholder="Nombre de la regla"
                          value={rule.name}
                          onChange={(e) => updateRule(idx, { name: e.target.value })}
                          className="h-8 text-xs max-w-[180px]"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            value={rule.target}
                            onValueChange={(v: "sku" | "order") => updateRule(idx, { target: v, attribute: v === "order" ? "lines" : "weight" })}
                          >
                            <SelectTrigger className="h-8 w-[120px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sku">SKU</SelectItem>
                              <SelectItem value="order">Pedido</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select
                            value={rule.attribute}
                            onValueChange={(v) => updateRule(idx, { attribute: v })}
                          >
                            <SelectTrigger className="h-8 w-[160px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(rule.target === "sku" ? SKU_ATTRIBUTES : ORDER_ATTRIBUTES).map((a) => (
                                <SelectItem key={a.value} value={a.value}>
                                  {a.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={rule.rule_type || "absolute"}
                            onValueChange={(v: "absolute" | "percentile") =>
                              updateRule(idx, {
                                rule_type: v,
                                min_val: v === "percentile" ? 5 : 0,
                                max_val: v === "percentile" ? 95 : 100,
                              })
                            }
                          >
                            <SelectTrigger className="h-8 w-[140px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="absolute">Absoluto</SelectItem>
                              <SelectItem value="percentile">Percentiles (%)</SelectItem>
                            </SelectContent>
                          </Select>
                          <div className="flex gap-2 min-w-fit">
                            <div className="space-y-1">
                              <Label className="text-xs">
                                {rule.rule_type === "percentile" ? "Percentil Inf. (%)" : "Mínimo"}
                              </Label>
                              <Input
                                type="number"
                                step={rule.rule_type === "percentile" ? 1 : (rule.attribute === "frequency" || rule.attribute === "volume") ? 0.001 : 0.1}
                                value={rule.min_val}
                                onChange={(e) => updateRule(idx, { min_val: e.target.value === "" ? "" : (parseFloat(e.target.value) || 0) })}
                                className="h-8 w-28 text-xs"
                                min={rule.rule_type === "percentile" ? 0 : undefined}
                                max={rule.rule_type === "percentile" ? 100 : undefined}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">
                                {rule.rule_type === "percentile" ? "Percentil Sup. (%)" : "Máximo"}
                              </Label>
                              <Input
                                type="number"
                                step={rule.rule_type === "percentile" ? 1 : (rule.attribute === "frequency" || rule.attribute === "volume") ? 0.001 : 0.1}
                                value={rule.max_val}
                                onChange={(e) => updateRule(idx, { max_val: e.target.value === "" ? "" : (parseFloat(e.target.value) || 0) })}
                                className="h-8 w-28 text-xs"
                                min={rule.rule_type === "percentile" ? 0 : undefined}
                                max={rule.rule_type === "percentile" ? 100 : undefined}
                              />
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => removeRule(idx)}
                            disabled={rules.length <= 1}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <Button variant="outline" size="sm" onClick={addRule} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Añadir Regla
                </Button>
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

      {hasResults && auditResults?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4 animate-slide-in mb-6">
          {[
            { label: "Total SKUs", value: formatNum((auditResults.summary as Record<string, unknown>).total_skus) },
            { label: "Total Pedidos", value: formatNum((auditResults.summary as Record<string, unknown>).total_pedidos) },
            { label: "Total Unidades", value: formatNum((auditResults.summary as Record<string, unknown>).total_unidades) },
            { label: "Total Líneas", value: formatNum((auditResults.summary as Record<string, unknown>).total_lineas) },
            { label: "Líneas / Pedido", value: formatNum((auditResults.summary as Record<string, unknown>).lineas_por_pedido) },
            { label: "Total KG", value: `${formatNum((auditResults.summary as Record<string, unknown>).total_kg)} kg` },
            { label: "Total m³", value: `${formatNum((auditResults.summary as Record<string, unknown>).total_m3)} m³` },
          ].map((stat, i) => (
            <Card key={i} className="border bg-slate-50/50 dark:bg-slate-800/50">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                <p className="text-xs text-muted-foreground font-medium mb-1">{stat.label}</p>
                <p className="text-xl font-bold tracking-tight">{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {hasResults && (maestroValidation || pedidosValidation) && (
        <Accordion type="single" collapsible defaultValue="diagnostico" className="border rounded-xl bg-card/60 shadow-sm">
          <AccordionItem value="diagnostico" className="border-none">
            <AccordionTrigger className="px-5 py-4 text-sm font-semibold hover:no-underline">
              Diagnóstico de Lectura de Datos
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-5 pt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {maestroValidation && (
                  <ValidationColumn
                    title="Maestro de Códigos"
                    data={maestroValidation}
                  />
                )}
                {pedidosValidation && (
                  <ValidationColumn
                    title="Pedidos"
                    data={pedidosValidation}
                  />
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {hasResults && categories.length > 0 && (
        <div className="space-y-6 animate-slide-in">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {categories.map((cat) => (
              <Card
                key={cat.id}
                className={`border transition-colors cursor-pointer hover:bg-muted/50 hover:border-primary/50`}
                onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
              >
                <CardContent className="flex items-center gap-4 py-5 px-5">
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      id={`global-${cat.id}`}
                      checked={isCategoryFullySelected(cat)}
                      onCheckedChange={() => toggleCategorySelection(cat)}
                    />
                    <label htmlFor={`global-${cat.id}`} className="text-xs font-medium cursor-pointer">
                      Descartar todos
                    </label>
                  </div>
                  <div>
                    <p className="text-2xl font-bold tracking-tight">{cat.items?.length ?? 0}</p>
                    <p className="text-xs text-muted-foreground">{cat.name}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {selectedCategory && (() => {
            const cat = getCategoryById(selectedCategory);
            const items = getCategoryItems(selectedCategory);
            const displayItems = items.slice(0, 50) as Record<string, unknown>[];
            return (
            <Card>
              <div className="px-5 py-4 border-b flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`global-${selectedCategory}`}
                      checked={cat ? isCategoryFullySelected(cat) : false}
                      onCheckedChange={() => cat && toggleCategorySelection(cat)}
                    />
                    <label htmlFor={`global-${selectedCategory}`} className="text-sm font-medium cursor-pointer">
                      Descartar todos los {cat?.name ?? selectedCategory}
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Mostrando los primeros 50 resultados (Total: {items.length})
                  </p>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  className="gap-2"
                  onClick={() => downloadCSV(selectedCategory, getCategoryItems(selectedCategory), toast)}
                >
                  <Download className="w-4 h-4" />
                  Descargar CSV Completo
                </Button>
              </div>
              <div className="overflow-auto">
                {items.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                    No hay datos para esta categoría.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">Descartar</TableHead>
                        <TableHead className="font-semibold">Detalle</TableHead>
                        {(() => {
                          const data = displayItems;
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
                      {displayItems.map((item, idx) => {
                        const attr = cat?.attribute ?? "value";
                        const target = (cat?.target ?? "sku") as "sku" | "order";
                        return (
                          <TableRow key={idx}>
                            <TableCell className="w-10">
                              <Checkbox
                                checked={isItemSelected(item ?? {}, target)}
                                onCheckedChange={() => toggleItemSelection(item ?? {}, target)}
                              />
                            </TableCell>
                            <TableCell className="text-sm font-medium">
                              {formatOutlierDisplay(item ?? {}, attr)}
                            </TableCell>
                            {(() => {
                              const headers = [...new Set(Object.keys(item ?? {}))].filter(
                                (h) => !["sku_id", "order_id", "id", "description"].includes(h)
                              );
                              return headers.map((h) => {
                                const val = item?.[h];
                                const isNumericColumn = /(peso|alto|ancho|largo|volumen|cajas|um|qty|cantidad|value)/i.test(h);
                                return (
                                  <TableCell key={h} className={`text-sm ${isNumericColumn ? "text-right font-mono" : ""}`}>
                                    {isNumericColumn ? formatNum(val) : (val != null ? String(val) : "-")}
                                  </TableCell>
                                );
                              });
                            })()}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
              {items.length > 50 && (
                <p className="px-5 py-2 text-xs text-muted-foreground border-t">
                  Mostrando los primeros 50 resultados (Total: {items.length})
                </p>
              )}
            </Card>
            );
          })()}

          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-center justify-between py-5 px-5">
              <div>
                <h3 className="text-sm font-semibold">Tratamiento de Outliers</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {state.excludeOutliers
                    ? `Se excluirán ${selectedSkusToExclude.size} SKUs y ${selectedOrdersToExclude.size} pedidos del Macro Slotting`
                    : "Todos los datos se incluirán (no se aplicarán exclusiones)"}
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

      {hasResults && categories.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No se detectaron anomalías con las reglas configuradas.
          </CardContent>
        </Card>
      )}

      <div className="sticky bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t p-4 flex justify-end gap-4 z-50">
        <Button variant="outline" onClick={() => setStep(0)} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Anterior
        </Button>
        <Button onClick={handleSiguiente} className="gap-2">
          Siguiente <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
