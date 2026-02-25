import { useState } from "react";
import { useSlotting } from "@/context/SlottingContext";
import { StorageType } from "@/context/SlottingContext";
import { ArrowRight, ArrowLeft, Play, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useToast } from "@/components/ui/use-toast";

export function Step3MacroSlotting() {
  const { state, updateState, completeStep, setStep } = useSlotting();
  const [running, setRunning] = useState(false);
  const { toast } = useToast();

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

      // Macro-specific params
      formData.append("cycle_days", String(state.coverageDays));
      const vlmStorage =
        state.storageTypes.find((st) => st.id === "vlm") ?? state.storageTypes[0] ?? null;
      if (vlmStorage) {
        formData.append("vlm_volume", String(vlmStorage.maxVolume));
      }
      // Valor por defecto razonable de ocupación objetivo
      formData.append("vlm_occupancy", "0.85");

      // Mapping de columnas y hojas
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
        throw new Error("Error al ejecutar Macro-Slotting");
      }

      const data = await response.json();
      updateState({ macroResult: data });
    } catch (error) {
      console.error(error);
      toast({
        title: "No se pudo ejecutar Macro-Slotting",
        description: "Revisa la API o los parámetros de entrada e inténtalo nuevamente.",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  const addStorageType = () => {
    const newSt: StorageType = {
      id: `custom-${Date.now()}`,
      priority: state.storageTypes.length + 1,
      name: "Nuevo Storage",
      maxVolume: 10,
      maxWeight: 500,
    };
    updateState({ storageTypes: [...state.storageTypes, newSt] });
  };

  const updateStorageType = (idx: number, field: keyof StorageType, value: string | number) => {
    const updated = [...state.storageTypes];
    updated[idx] = { ...updated[idx], [field]: value };
    updateState({ storageTypes: updated });
  };

  const removeStorageType = (idx: number) => {
    const updated = state.storageTypes.filter((_, i) => i !== idx);
    updateState({ storageTypes: updated });
  };

  const macro = state.macroResult;

  return (
    <div className="space-y-8">
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardContent className="py-5 px-5 space-y-3">
            <Label className="text-sm font-medium">Días de Cobertura de Stock</Label>
            <Input
              type="number"
              value={state.coverageDays}
              onChange={(e) => updateState({ coverageDays: parseInt(e.target.value) || 15 })}
              className="text-lg font-semibold"
            />
            <p className="text-[11px] text-muted-foreground">Período de reabastecimiento en días</p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Tipos de Almacenamiento</h3>
              <p className="text-xs text-muted-foreground">Ordene por prioridad (menor = más prioritario)</p>
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
                  <TableHead className="w-28">Vol Máx (m³)</TableHead>
                  <TableHead className="w-28">Peso Máx (kg)</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.storageTypes.map((st, idx) => (
                  <TableRow key={st.id}>
                    <TableCell>
                      <Input
                        type="number"
                        value={st.priority}
                        onChange={(e) => updateStorageType(idx, "priority", parseInt(e.target.value))}
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
                        value={st.maxVolume}
                        onChange={(e) => updateStorageType(idx, "maxVolume", parseFloat(e.target.value))}
                        className="h-8 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={st.maxWeight}
                        onChange={(e) => updateStorageType(idx, "maxWeight", parseFloat(e.target.value))}
                        className="h-8 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeStorageType(idx)}>
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
          {/* Stacked bar chart */}
          <Card>
            <div className="px-5 py-4 border-b">
              <h3 className="text-sm font-semibold">Distribución de SKUs por Tipo de Almacenamiento</h3>
            </div>
            <CardContent className="py-6">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={macro.storageDistribution} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="storage" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="percentage" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="% SKUs" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Saturation table */}
          <Card>
            <div className="px-5 py-4 border-b">
              <h3 className="text-sm font-semibold">Saturación por Zona</h3>
            </div>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zona</TableHead>
                    <TableHead>Usado (m³)</TableHead>
                    <TableHead>Capacidad (m³)</TableHead>
                    <TableHead className="w-64">Ocupación</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {macro.saturation.map((s) => (
                    <TableRow key={s.zone}>
                      <TableCell className="font-medium">{s.zone}</TableCell>
                      <TableCell>{s.used}</TableCell>
                      <TableCell>{s.capacity}</TableCell>
                      <TableCell>
                        <Progress
                          value={Math.min(s.percentage, 100)}
                          className={`h-2 ${s.percentage > 90 ? "[&>div]:bg-destructive" : s.percentage > 70 ? "[&>div]:bg-warning" : "[&>div]:bg-success"}`}
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {Math.min(s.percentage, 100).toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Anterior
        </Button>
        {macro && (
          <Button onClick={() => { completeStep(2); setStep(3); }} className="gap-2">
            Siguiente <ArrowRight className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
