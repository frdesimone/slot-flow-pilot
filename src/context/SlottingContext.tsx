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

export interface MacroResult {
  storageDistribution: { storage: string; count: number; percentage: number }[];
  saturation: { zone: string; used: number; capacity: number; percentage: number }[];
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
  excludeOutliers: boolean;
  // Step 3
  coverageDays: number;
  storageTypes: StorageType[];
  macroResult: MacroResult | null;
  // Step 4
  vlmCount: number;
  traysPerVLM: number;
  trayWidth: number;
  trayDepth: number;
  trayMaxWeight: number;
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

  return (
    <SlottingContext.Provider
      value={{ state, setStep, completeStep, updateState, setDataFile, setMappingConfig }}
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
