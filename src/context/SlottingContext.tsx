import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";

// Types
export interface StorageType {
  id: string;
  priority: number;
  name: string;
  maxVolume: number;
  maxWeight: number;
}

export interface SKU {
  id: string;
  description: string;
  height: number;
  width: number;
  depth: number;
  volume: number;
  weight: number;
  unitsSoldTotal: number;
  unitsPerDayAvg: number;
  isSensitive: boolean;
  isVlmEligible: boolean;
  abcClass?: "A" | "B" | "C";
  assignedStorage?: string;
  cycleVolume?: number;
  cycleWeight?: number;
}

export interface AuditResult {
  heavySKUs: number;
  bulkySKUs: number;
  b2bOrders: number;
  omnipresentSKUs: { id: string; description: string; appearances: number; percentage: number }[];
}

/** Objeto SKU outlier: sku_id, description y valor de la anomalía */
export interface OutlierSkuItem {
  sku_id: string;
  description?: string;
  value: number;
}

/** Objeto pedido outlier: order_id, description y valor (líneas) */
export interface OutlierOrderItem {
  order_id: string;
  description?: string;
  value: number;
}

/** Objeto SKU omnipresente: sku_id, description, value (frecuencia), count */
export interface OutlierUbiquitousItem {
  sku_id: string;
  description?: string;
  value: number;
  count?: number;
}

/** Respuesta cruda de la API de outliers (arrays de objetos enriquecidos) */
export interface AuditResultsRaw {
  heavy_skus?: OutlierSkuItem[];
  bulky_skus?: OutlierSkuItem[];
  massive_orders?: OutlierOrderItem[];
  ubiquitous_skus?: OutlierUbiquitousItem[];
}

export interface MacroResult {
  storageDistribution?: { storage: string; count: number; percentage: number }[];
  saturation?: { zone: string; used: number; capacity: number; percentage: number }[];
  /** Nuevo formato: KPIs por tipo de almacenamiento */
  kpi?: {
    allocations?: Record<string, { skus_count: number; volume_used: number; volume_target: number; fill_percentage: number }>;
    unassigned_count?: number;
  };
  /** SKUs asignados con storage_type */
  macro_skus?: Array<Record<string, unknown> & { storage_type?: string }>;
}

export interface TrayData {
  id: string;
  vlmId: number;
  groupId: string;
  skus: { id: string; description: string; units: number }[];
  volumeFill: number;
  weightFill: number;
}

export interface MicroResult {
  vlmCount: number;
  traysPerVLM: TrayData[][];
  heightEfficiency: number;
  areaEfficiency: number;
  avgTraysPerOrder: number;
  replicationCoverage: number;
}

export interface MappingConfig {
  sheet_maestro: string;
  col_sku_maestro: string;
  col_volumen: string;
  col_peso: string;
  col_alto: string;
  col_ancho: string;
  col_largo: string;
  col_desc: string;
  col_cajas_m3: string;
  col_categoria: string;
  sheet_pedidos: string;
  col_pedido_id: string;
  col_pedido_sku: string;
  col_pedido_cant: string;
}

export interface SlottingState {
  currentStep: number;
  completedSteps: number[];
  // Step 1
  materialsUploaded: boolean;
  transactionsUploaded: boolean;
  skus: SKU[];
  dataFile: File | null;
  mappingConfig: MappingConfig;
  // Step 2
  auditRun: boolean;
  auditResult: AuditResult | null;
  auditResults: AuditResultsRaw | null;
  excludeOutliers: boolean;
  // Step 3
  coverageDays: number | string;
  storageTypes: StorageType[];
  macroResult: MacroResult | null;
  // Step 4
  vlmCount: number | string;
  traysPerVLM: number | string;
  trayWidth: number | string;
  trayDepth: number | string;
  trayMaxWeight: number | string;
  clusteringMethod: "jaccard" | "cosine";
  affinityThreshold: number;
  topK: number;
  includeNoRotation: boolean;
  replicationFactor: number;
  microResult: MicroResult | null;
}

interface SlottingContextType {
  state: SlottingState;
  setStep: (step: number) => void;
  completeStep: (step: number) => void;
  updateState: (partial: Partial<SlottingState>) => void;
  setDataFile: (file: File | null) => void;
  setMappingConfig: (partial: Partial<MappingConfig>) => void;
  setAuditResults: (results: AuditResultsRaw | null) => void;
}

const defaultStorageTypes: StorageType[] = [
  { id: "vlm", priority: 1, name: "VLM", maxVolume: 12.0, maxWeight: 500 },
  { id: "jaula", priority: 2, name: "Jaula", maxVolume: 8.0, maxWeight: 1000 },
  { id: "rack-picking", priority: 3, name: "Rack Picking", maxVolume: 25.0, maxWeight: 2000 },
  { id: "rack-pallet", priority: 4, name: "Rack Pallet", maxVolume: 50.0, maxWeight: 3000 },
];

const defaultMappingConfig: MappingConfig = {
  sheet_maestro: "Base Cód.",
  col_sku_maestro: "Material",
  col_volumen: "M3/UMB",
  col_peso: "KG/UMB",
  col_alto: "Alto",
  col_ancho: "Ancho",
  col_largo: "Largo",
  col_desc: "Descripción",
  col_cajas_m3: "Cajas/M3",
  col_categoria: "Categoría",
  sheet_pedidos: "Pedidos",
  col_pedido_id: "Nro pedido",
  col_pedido_sku: "Codigo II - Producto",
  col_pedido_cant: "Cantidad unidades",
};

const initialState: SlottingState = {
  currentStep: 0,
  completedSteps: [],
  materialsUploaded: false,
  transactionsUploaded: false,
  skus: [],
  dataFile: null,
  mappingConfig: defaultMappingConfig,
  auditRun: false,
  auditResult: null,
  auditResults: null,
  excludeOutliers: true,
  coverageDays: 15,
  storageTypes: defaultStorageTypes,
  macroResult: null,
  vlmCount: 4,
  traysPerVLM: 50,
  trayWidth: 0.6,
  trayDepth: 0.4,
  trayMaxWeight: 80,
  clusteringMethod: "jaccard",
  affinityThreshold: 0.15,
  topK: 30,
  includeNoRotation: false,
  replicationFactor: 2,
  microResult: null,
};

const SlottingContext = createContext<SlottingContextType | undefined>(undefined);

export function SlottingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SlottingState>(initialState);

  const setStep = useCallback((step: number) => {
    setState((prev) => ({ ...prev, currentStep: step }));
  }, []);

  const completeStep = useCallback((step: number) => {
    setState((prev) => ({
      ...prev,
      completedSteps: prev.completedSteps.includes(step)
        ? prev.completedSteps
        : [...prev.completedSteps, step],
    }));
  }, []);

  const updateState = useCallback((partial: Partial<SlottingState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const setDataFile = useCallback((file: File | null) => {
    setState((prev) => ({ ...prev, dataFile: file }));
  }, []);

  const setMappingConfig = useCallback((partial: Partial<MappingConfig>) => {
    setState((prev) => ({
      ...prev,
      mappingConfig: {
        ...prev.mappingConfig,
        ...partial,
      },
    }));
  }, []);

  const setAuditResults = useCallback((results: AuditResultsRaw | null) => {
    setState((prev) => ({ ...prev, auditResults: results }));
  }, []);

  return (
    <SlottingContext.Provider
      value={{ state, setStep, completeStep, updateState, setDataFile, setMappingConfig, setAuditResults }}
    >
      {children}
    </SlottingContext.Provider>
  );
}

export function useSlotting() {
  const ctx = useContext(SlottingContext);
  if (!ctx) throw new Error("useSlotting must be used within SlottingProvider");
  return ctx;
}
