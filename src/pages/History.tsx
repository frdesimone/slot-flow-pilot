import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, ArrowLeft, Layers3, LayoutGrid, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";

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

export default function History() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HistoryResponse | null>(null);

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

  const handleVerDetalles = (exec: MacroExecution | MicroExecution) => {
    console.log("output_data:", exec.output_data);
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
                              onClick={() => handleVerDetalles(exec)}
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
                            onClick={() => handleVerDetalles(exec)}
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
      </div>
    </div>
  );
}
