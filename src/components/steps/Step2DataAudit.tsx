import { useState } from "react";
import { useSlotting } from "@/context/SlottingContext";
import type { AuditResultsRaw } from "@/context/SlottingContext";
import { ArrowRight, ArrowLeft, Zap, Weight, Box, ShoppingCart, Star, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";

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

  const auditResults = state.auditResults;
  const hasResults = auditResults != null;

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
    <div className="space-y-8">
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
                        {(() => {
                          const data = getCategoryData(selectedCategory).slice(0, 50) as Record<string, unknown>[];
                          const headers = [...new Set(data.flatMap((item) => Object.keys(item)))];
                          return headers.map((h) => (
                            <TableHead key={h} className="capitalize">
                              {h.replace(/_/g, " ")}
                            </TableHead>
                          ));
                        })()}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(getCategoryData(selectedCategory).slice(0, 50) as Record<string, unknown>[]).map((item, idx) => {
                        const headers = [...new Set(Object.keys(item))];
                        return (
                          <TableRow key={idx}>
                            {headers.map((h) => (
                              <TableCell key={h} className="text-sm">
                                {typeof item[h] === "number" ? (item[h] as number).toLocaleString() : String(item[h] ?? "")}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
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
      <div className="flex justify-between pt-2">
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
