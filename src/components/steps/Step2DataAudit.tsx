import { useState } from "react";
import { useSlotting } from "@/context/SlottingContext";
import { ArrowRight, ArrowLeft, Zap, Weight, Box, ShoppingCart, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";

type ApiAuditResult = {
  heavy_skus: number;
  bulky_skus: number;
  massive_orders: number;
  ubiquitous_skus: { id: string; description: string; appearances: number; percentage: number }[];
};

function KPICard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <Card className="kpi-card border">
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

export function Step2DataAudit() {
  const { state, updateState, completeStep, setStep } = useSlotting();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<ApiAuditResult | null>(null);

  const handleRunAudit = async () => {
    if (!state.maestroFile || !state.pedidosFile) {
      toast({
        title: "Archivos pendientes",
        description: "Por favor vuelve al Paso 1 y carga Maestro y Pedidos antes de continuar.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);

      const formData = new FormData();
      formData.append("pedidos_file", state.pedidosFile);
      formData.append("maestro_file", state.maestroFile);
      formData.append("cycle_days", "15.0");

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/outliers`, {
        method: "POST",
        headers: {
          Authorization: "Bearer token_desarrollo_local_123",
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Error al ejecutar la auditoría de datos");
      }

      const data = (await response.json()) as ApiAuditResult;
      setAuditResult(data);
      updateState({ auditRun: true });
    } catch (error) {
      console.error(error);
      toast({
        title: "No se pudo ejecutar la auditoría",
        description: "Revisa la API o los archivos cargados e inténtalo nuevamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const audit = auditResult;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Detección de Anomalías</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Identifique outliers y SKUs atípicos antes de ejecutar el slotting.
          </p>
        </div>
        {!state.auditRun && (
          <Button onClick={handleRunAudit} disabled={isLoading} className="gap-2" size="lg">
            <Zap className="w-4 h-4" />
            {isLoading ? "Analizando..." : "Ejecutar Auditoría"}
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="ml-3 text-sm text-muted-foreground">Procesando auditoría de datos...</p>
        </div>
      )}

      {audit && (
        <div className="space-y-6 animate-slide-in">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              icon={Weight}
              label="SKUs >25kg"
              value={audit.heavy_skus}
              color="bg-destructive/10 text-destructive"
            />
            <KPICard
              icon={Box}
              label="SKUs Voluminosos"
              value={audit.bulky_skus}
              color="bg-warning/10 text-warning"
            />
            <KPICard
              icon={ShoppingCart}
              label="Pedidos B2B"
              value={audit.massive_orders}
              color="bg-info/10 text-info"
            />
            <KPICard
              icon={Star}
              label="SKUs Omnipresentes"
              value={audit.ubiquitous_skus.length}
              color="bg-primary/10 text-primary"
            />
          </div>

          {/* Omnipresent SKUs table */}
          <Card>
            <div className="px-5 py-4 border-b">
              <h3 className="text-sm font-semibold">SKUs Omnipresentes</h3>
              <p className="text-xs text-muted-foreground">SKUs que aparecen en más del 60% de las órdenes</p>
            </div>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">ID</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Apariciones</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {audit.ubiquitous_skus.map((sku) => (
                    <TableRow key={sku.id}>
                      <TableCell className="font-mono text-xs">{sku.id}</TableCell>
                      <TableCell className="text-sm">{sku.description}</TableCell>
                      <TableCell className="text-right font-medium">{sku.appearances.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={sku.percentage > 85 ? "destructive" : "secondary"}>
                          {sku.percentage}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

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

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(0)} className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Anterior
            </Button>
            <Button onClick={() => { completeStep(1); setStep(2); }} className="gap-2">
              Siguiente <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
