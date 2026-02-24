import { SKU, AuditResult, MacroResult, MicroResult, StorageType, TrayData } from "@/context/SlottingContext";

// Generate realistic mock SKUs
export function generateMockSKUs(count: number = 320): SKU[] {
  const prefixes = ["ELE", "MEC", "HYD", "PNE", "FAS", "LUB", "FIL", "CAB", "SEN", "VAL"];
  const descriptors = [
    "Válvula de control", "Rodamiento axial", "Filtro hidráulico", "Sensor temperatura",
    "Cable alimentación", "Bomba centrífuga", "Cilindro neumático", "Tornillo M8x40",
    "Arandela presión", "Junta tórica", "Motor paso a paso", "Relé estado sólido",
    "Fusible cerámico", "Conector rápido", "Tuerca autobloqueo", "Eje transmisión",
    "Engranaje helicoidal", "Correa dentada", "Retén de aceite", "Chumacera soporte",
    "Resistencia térmica", "Interruptor final", "Electroválvula 3/2", "Manómetro digital",
    "Perno hexagonal", "Pasador elástico", "Abrazadera inox", "Manguera reforzada",
    "Acoplamiento flex", "Guía lineal"
  ];

  const skus: SKU[] = [];
  for (let i = 0; i < count; i++) {
    const prefix = prefixes[i % prefixes.length];
    const desc = descriptors[i % descriptors.length];
    const h = 0.02 + Math.random() * 0.35;
    const w = 0.05 + Math.random() * 0.3;
    const d = 0.05 + Math.random() * 0.3;
    const weight = 0.1 + Math.random() * (i % 15 === 0 ? 40 : 15);
    const unitsPerDay = Math.max(0.1, Math.random() * 50 * (1 - i / count));

    skus.push({
      id: `${prefix}-${String(1000 + i).slice(1)}`,
      description: `${desc} ${Math.floor(Math.random() * 100)}`,
      height: parseFloat(h.toFixed(3)),
      width: parseFloat(w.toFixed(3)),
      depth: parseFloat(d.toFixed(3)),
      volume: parseFloat((h * w * d).toFixed(6)),
      weight: parseFloat(weight.toFixed(2)),
      unitsSoldTotal: Math.floor(unitsPerDay * 365),
      unitsPerDayAvg: parseFloat(unitsPerDay.toFixed(2)),
      isSensitive: Math.random() < 0.05,
      isVlmEligible: weight < 25 && h < 0.3 && w < 0.55 && d < 0.35,
    });
  }
  return skus;
}

// Run audit detection
export function runAudit(skus: SKU[]): AuditResult {
  const heavySKUs = skus.filter((s) => s.weight > 25).length;
  const bulkySKUs = skus.filter((s) => s.volume > 0.015).length;
  const b2bOrders = Math.floor(180 + Math.random() * 120);

  // Simulate omnipresent SKUs (appear in >60% orders)
  const totalOrders = 2500;
  const omnipresentSKUs = skus
    .slice(0, 20)
    .map((s) => {
      const appearances = Math.floor(totalOrders * (0.6 + Math.random() * 0.35));
      return {
        id: s.id,
        description: s.description,
        appearances,
        percentage: parseFloat(((appearances / totalOrders) * 100).toFixed(1)),
      };
    })
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 12);

  return { heavySKUs, bulkySKUs, b2bOrders, omnipresentSKUs };
}

// ABC classification
function classifyABC(skus: SKU[]): SKU[] {
  const sorted = [...skus].sort((a, b) => b.unitsSoldTotal - a.unitsSoldTotal);
  const totalUnits = sorted.reduce((s, sk) => s + sk.unitsSoldTotal, 0);
  let cumulative = 0;
  return sorted.map((sku) => {
    cumulative += sku.unitsSoldTotal;
    const pct = cumulative / totalUnits;
    return { ...sku, abcClass: pct <= 0.8 ? "A" : pct <= 0.95 ? "B" : "C" };
  });
}

// Macro-slotting engine
export function runMacroSlotting(
  skus: SKU[],
  coverageDays: number,
  storageTypes: StorageType[],
  excludeOutliers: boolean
): { skus: SKU[]; result: MacroResult } {
  let workingSKUs = classifyABC(skus);

  // Calculate cycle volumes
  workingSKUs = workingSKUs.map((s) => ({
    ...s,
    cycleVolume: s.unitsPerDayAvg * coverageDays * s.volume,
    cycleWeight: s.unitsPerDayAvg * coverageDays * s.weight,
  }));

  const sortedStorages = [...storageTypes].sort((a, b) => a.priority - b.priority);
  const capacityUsed: Record<string, number> = {};
  sortedStorages.forEach((st) => (capacityUsed[st.id] = 0));

  // Assign SKUs
  const assigned = workingSKUs.map((sku) => {
    // Hard blocks
    if (sku.isSensitive) return { ...sku, assignedStorage: "jaula" };

    for (const st of sortedStorages) {
      if (st.id === "vlm" && !sku.isVlmEligible) continue;
      const used = capacityUsed[st.id] || 0;
      const cycleVol = sku.cycleVolume || 0;
      if (used + cycleVol <= st.maxVolume * 0.8) {
        capacityUsed[st.id] = used + cycleVol;
        return { ...sku, assignedStorage: st.id };
      }
    }
    // Overflow to last storage
    const last = sortedStorages[sortedStorages.length - 1];
    capacityUsed[last.id] = (capacityUsed[last.id] || 0) + (sku.cycleVolume || 0);
    return { ...sku, assignedStorage: last.id };
  });

  // Build distribution
  const distribution: Record<string, number> = {};
  assigned.forEach((s) => {
    const st = s.assignedStorage || "unknown";
    distribution[st] = (distribution[st] || 0) + 1;
  });

  const total = assigned.length;
  const storageDistribution = Object.entries(distribution).map(([storage, count]) => ({
    storage: sortedStorages.find((s) => s.id === storage)?.name || storage,
    count,
    percentage: parseFloat(((count / total) * 100).toFixed(1)),
  }));

  const saturation = sortedStorages.map((st) => ({
    zone: st.name,
    used: parseFloat((capacityUsed[st.id] || 0).toFixed(2)),
    capacity: st.maxVolume,
    percentage: parseFloat((((capacityUsed[st.id] || 0) / (st.maxVolume * 0.8)) * 100).toFixed(1)),
  }));

  return { skus: assigned, result: { storageDistribution, saturation } };
}

// Micro-slotting engine (simplified simulation)
export function runMicroSlotting(
  skus: SKU[],
  vlmCount: number,
  traysPerVLM: number,
  trayWidth: number,
  trayDepth: number,
  trayMaxWeight: number,
  coverageDays: number,
  replicationFactor: number
): MicroResult {
  const vlmSKUs = skus.filter((s) => s.assignedStorage === "vlm");
  const trayVolume = trayWidth * trayDepth * 0.3; // avg height

  // Create groups (simplified clustering)
  const groups: SKU[][] = [];
  const groupSize = Math.max(3, Math.floor(vlmSKUs.length / (vlmCount * 8)));
  for (let i = 0; i < vlmSKUs.length; i += groupSize) {
    groups.push(vlmSKUs.slice(i, i + groupSize));
  }

  // Pack into trays
  const allTrays: TrayData[][] = Array.from({ length: vlmCount }, () => []);
  let trayCounter = 0;

  groups.forEach((group, gIdx) => {
    const R = Math.min(replicationFactor, vlmCount);
    // Assign to R least-loaded VLMs
    const loads = allTrays.map((t, i) => ({ idx: i, load: t.length }));
    loads.sort((a, b) => a.load - b.load);
    const targetVLMs = loads.slice(0, R).map((l) => l.idx);

    // Build trays for this group
    let currentTray: TrayData = {
      id: `T-${++trayCounter}`,
      vlmId: targetVLMs[0],
      groupId: `G-${gIdx}`,
      skus: [],
      volumeFill: 0,
      weightFill: 0,
    };

    group.forEach((sku) => {
      const units = Math.max(1, Math.ceil(sku.unitsPerDayAvg * coverageDays / R));
      const vol = units * sku.volume;
      const wt = units * sku.weight;

      if (currentTray.volumeFill + vol > trayVolume || currentTray.weightFill + wt > trayMaxWeight) {
        // Close tray, replicate to target VLMs
        targetVLMs.forEach((vIdx) => {
          allTrays[vIdx].push({ ...currentTray, vlmId: vIdx, id: `T-${++trayCounter}` });
        });
        currentTray = {
          id: `T-${++trayCounter}`,
          vlmId: targetVLMs[0],
          groupId: `G-${gIdx}`,
          skus: [],
          volumeFill: 0,
          weightFill: 0,
        };
      }

      currentTray.skus.push({ id: sku.id, description: sku.description, units });
      currentTray.volumeFill += vol;
      currentTray.weightFill += wt;
    });

    // Close last tray
    if (currentTray.skus.length > 0) {
      targetVLMs.forEach((vIdx) => {
        allTrays[vIdx].push({ ...currentTray, vlmId: vIdx, id: `T-${++trayCounter}` });
      });
    }
  });

  // Normalize fill percentages
  allTrays.forEach((vlm) => {
    vlm.forEach((tray) => {
      tray.volumeFill = parseFloat(((tray.volumeFill / trayVolume) * 100).toFixed(1));
      tray.weightFill = parseFloat(((tray.weightFill / trayMaxWeight) * 100).toFixed(1));
    });
  });

  return {
    vlmCount,
    traysPerVLM: allTrays,
    heightEfficiency: parseFloat((72 + Math.random() * 18).toFixed(1)),
    areaEfficiency: parseFloat((65 + Math.random() * 25).toFixed(1)),
    avgTraysPerOrder: parseFloat((2.1 + Math.random() * 1.5).toFixed(2)),
    replicationCoverage: parseFloat((95 + Math.random() * 5).toFixed(1)),
  };
}
