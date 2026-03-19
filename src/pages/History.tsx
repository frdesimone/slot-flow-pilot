import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, ArrowLeft, Layers3, LayoutGrid, ExternalLink, Download, FileText, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";

function formatNum(val: unknown): string {
  if (val == null || isNaN(Number(val))) return "0";
  return Number(val).toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

type MacroExecution = {
  execution_id: string;
  created_at: string | null;
  params: Record<string, unknown> | null;
  kpi_results: {
    total_skus?: number;
    vlm_skus_count?: number;
    rack_skus_count?: number;
    vlm_fill_percentage?: number;
  };
  output_data: unknown[] | null;
};

type MicroExecution = {
  execution_id: string;
  created_at: string | null;
  params: Record<string, unknown> | null;
  kpi_results: {
    total_trays?: number;
    avg_area_occupancy_pct?: number;
    optimized?: boolean;
  };
  output_data: unknown[] | null;
};

type HistoryResponse = {
  status: string;
  macro: MacroExecution[];
  micro: MicroExecution[];
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-AR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function truncateId(id: string): string {
  if (!id) return "—";
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function getMacroUnassigned(output: unknown[] | null): number {
  if (!Array.isArray(output)) return 0;
  return output.filter((r: Record<string, unknown>) => r?.storage_type === "UNASSIGNED").length;
}

function getMacroVlmVolume(output: unknown[] | null): number {
  if (!Array.isArray(output)) return 0;
  return output
    .filter((r: Record<string, unknown>) => r?.storage_type !== "UNASSIGNED")
    .reduce((sum, r) => sum + (Number((r as Record<string, unknown>)?.vol_cycle) || 0), 0);
}

function downloadMacroCSV(outputData: unknown[] | null, dateStr: string) {
  const safeRows = (outputData ?? []) as Record<string, unknown>[];
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
  a.download = `macro_history_${dateStr}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadMicroCSV(outputData: unknown[] | null, dateStr: string) {
  const locs = (outputData ?? []) as Record<string, unknown>[];
  const rows: string[][] = [
    ["Location ID", "Peso (kg)", "Superficie (m²)", "Volumen (m³)", "SKU", "Descripción", "Peso (KG)", "Superficie (m²)", "Volumen (m³)", "Unid. Reposición"],
  ];
  locs.forEach((loc) => {
    const items = (loc?.items ?? []) as Record<string, unknown>[];
    const m = (loc?.metrics ?? { used_weight: 0, max_weight: 0, used_surface: 0, max_surface: 0, used_volume: 0, max_volume: 0 }) as Record<string, number>;
    if (items.length === 0) {
      rows.push([
        String(loc?.location_id ?? ""),
        `${formatNum(m.used_weight)}/${formatNum(m.max_weight)}`,
        `${formatNum(m.used_surface)}/${formatNum(m.max_surface)}`,
        `${formatNum(m.used_volume)}/${formatNum(m.max_volume)}`,
        "",
        "",
        "",
        "",
        "",
        "",
      ]);
    } else {
      items.forEach((item: Record<string, unknown>) => {
        rows.push([
          String(loc?.location_id ?? ""),
          `${formatNum(m.used_weight)}/${formatNum(m.max_weight)}`,
          `${formatNum(m.used_surface)}/${formatNum(m.max_surface)}`,
          `${formatNum(m.used_volume)}/${formatNum(m.max_volume)}`,
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
  a.download = `micro_history_${dateStr}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function History() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [selectedExec, setSelectedExec] = useState<{ type: "macro" | "micro"; data: MacroExecution | MicroExecution } | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/history`, {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_API_TOKEN}`,
          },
        });
        if (!res.ok) {
          throw new Error(res.statusText || "Error al cargar historial");
        }
        const json = (await res.json()) as HistoryResponse;
        setData(json);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error desconocido";
        setError(msg);
        toast({
          title: "Error al cargar historial",
          description: msg,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [toast]);

  const handleVerDetalles = (type: "macro" | "micro", exec: MacroExecution | MicroExecution) => {
    setSelectedExec({ type, data: exec });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 lg:p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Clock className="w-7 h-7" />
              Historial de Ejecuciones
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Consulta las ejecuciones anteriores de Macro y Micro Slotting.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/")} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Volver al Wizard
          </Button>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="mt-4 text-sm text-muted-foreground">Cargando historial...</p>
          </div>
        )}

        {error && !loading && (
          <Card className="border-destructive/50">
            <CardContent className="py-10 text-center">
              <p className="text-destructive font-medium">No se pudo cargar el historial</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </CardContent>
          </Card>
        )}

        {!loading && !error && data && (
          <Tabs defaultValue="macro" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 max-w-md">
              <TabsTrigger value="macro" className="gap-2">
                <Layers3 className="w-4 h-4" />
                Macro Slotting
              </TabsTrigger>
              <TabsTrigger value="micro" className="gap-2">
                <LayoutGrid className="w-4 h-4" />
                Micro Slotting
              </TabsTrigger>
            </TabsList>

            <TabsContent value="macro" className="space-y-4">
              {data.macro.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    No hay ejecuciones de Macro Slotting registradas.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {data.macro.map((exec) => {
                    const unassigned = getMacroUnassigned(exec.output_data);
                    const vlmVol = getMacroVlmVolume(exec.output_data);
                    return (
                      <Card key={exec.execution_id}>
                        <CardContent className="pt-5 pb-5 px-5">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">
                                {formatDate(exec.created_at)}
                              </p>
                              <p className="text-xs font-mono text-muted-foreground mt-0.5">
                                ID: {truncateId(exec.execution_id)}
                              </p>
                              <div className="flex flex-wrap gap-4 mt-3 text-sm">
                                <span>
                                  <strong>Total SKUs:</strong> {exec.kpi_results.total_skus ?? 0}
                                </span>
                                <span>
                                  <strong>Vol. VLM:</strong> {vlmVol.toFixed(2)} m³
                                </span>
                                <span>
                                  <strong>No asignados:</strong> {unassigned}
                                </span>
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              onClick={() => handleVerDetalles("macro", exec)}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Ver Detalles
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="micro" className="space-y-4">
              {data.micro.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    No hay ejecuciones de Micro Slotting registradas.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {data.micro.map((exec) => (
                    <Card key={exec.execution_id}>
                      <CardContent className="pt-5 pb-5 px-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">
                              {formatDate(exec.created_at)}
                            </p>
                            <p className="text-xs font-mono text-muted-foreground mt-0.5">
                              ID: {truncateId(exec.execution_id)}
                            </p>
                            <div className="flex flex-wrap gap-4 mt-3 text-sm">
                              <span>
                                <strong>Bandejas:</strong> {exec.kpi_results.total_trays ?? 0}
                              </span>
                              <span>
                                <strong>Ocupación promedio:</strong>{" "}
                                {(exec.kpi_results.avg_area_occupancy_pct ?? 0).toFixed(1)}%
                              </span>
                              {exec.kpi_results.optimized && (
                                <span className="text-primary font-medium">Optimizado</span>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            onClick={() => handleVerDetalles("micro", exec)}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Ver Detalles
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}

      <Dialog open={!!selectedExec} onOpenChange={(open) => !open && setSelectedExec(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Detalles de Ejecución ({selectedExec?.type?.toUpperCase()})
            </DialogTitle>
            <DialogDescription>
              ID: {selectedExec?.data.execution_id} • Fecha: {formatDate(selectedExec?.data.created_at)}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto mt-4 pr-2 space-y-4">
            <h4 className="text-sm font-semibold flex items-center gap-2 border-b pb-2">
              <Settings2 className="w-4 h-4" />
              Parámetros Utilizados
            </h4>
            <div className="bg-muted/50 p-4 rounded-md text-xs font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(selectedExec?.data.params, null, 2)}
            </div>
            <h4 className="text-sm font-semibold flex items-center gap-2 border-b pb-2 mt-6">
              <Layers3 className="w-4 h-4" />
              Resultados y Exportación
            </h4>
            <p className="text-xs text-muted-foreground">
              {selectedExec?.type === "macro"
                ? `Se procesaron y asignaron ${selectedExec?.data.output_data?.length ?? 0} SKUs en esta ejecución.`
                : `Se generaron ${selectedExec?.data.output_data?.length ?? 0} ubicaciones/bandejas físicas.`}
              <br />
              Haz clic en el botón de abajo para obtener el detalle minucioso completo.
            </p>
          </div>
          <DialogFooter className="mt-4 border-t pt-4 flex sm:justify-between items-center">
            <Button variant="outline" onClick={() => setSelectedExec(null)}>
              Cerrar
            </Button>
            <Button
              className="gap-2"
              onClick={() => {
                const dStr = (selectedExec?.data.created_at || new Date().toISOString()).slice(0, 10);
                if (selectedExec?.type === "macro") {
                  downloadMacroCSV(selectedExec.data.output_data, dStr);
                } else {
                  downloadMicroCSV(selectedExec.data.output_data, dStr);
                }
              }}
            >
              <Download className="w-4 h-4" />
              Descargar CSV Completo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
