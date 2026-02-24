import { useState } from "react";
import { useSlotting } from "@/context/SlottingContext";
import { Check, Database, Search, Layers3, LayoutGrid } from "lucide-react";

const steps = [
  { label: "Ingesta de Datos", sublabel: "Carga de Maestro y Transacciones", icon: Database },
  { label: "Auditoría de Datos", sublabel: "Detección de Anomalías", icon: Search },
  { label: "Macro-Slotting", sublabel: "Perfilado y Asignación", icon: Layers3 },
  { label: "Micro-Slotting", sublabel: "Distribución Física", icon: LayoutGrid },
];

export function WizardSidebar() {
  const { state, setStep } = useSlotting();

  return (
    <aside className="w-72 min-h-screen flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* Header */}
      <div className="px-5 py-6 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-sidebar-primary flex items-center justify-center">
            <Layers3 className="w-4 h-4 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-sidebar-accent-foreground">Slotting Optimizer</h1>
            <p className="text-[11px] text-sidebar-foreground/60">Warehouse Management</p>
          </div>
        </div>
      </div>

      {/* Steps */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {steps.map((step, idx) => {
          const isActive = state.currentStep === idx;
          const isCompleted = state.completedSteps.includes(idx);
          const isAccessible = idx === 0 || state.completedSteps.includes(idx - 1);
          const Icon = step.icon;

          return (
            <button
              key={idx}
              onClick={() => isAccessible && setStep(idx)}
              disabled={!isAccessible}
              className={`w-full flex items-start gap-3 px-3 py-3 rounded-lg text-left transition-all duration-200 group
                ${isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50"}
                ${!isAccessible ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
              `}
            >
              {/* Step indicator */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-semibold transition-colors
                  ${isCompleted ? "wizard-step-completed" : isActive ? "wizard-step-active" : "wizard-step-pending"}
                `}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : idx + 1}
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-medium truncate ${isActive ? "text-sidebar-accent-foreground" : ""}`}>
                  {step.label}
                </p>
                <p className="text-[11px] text-sidebar-foreground/50 truncate">{step.sublabel}</p>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-sidebar-border">
        <p className="text-[10px] text-sidebar-foreground/40 uppercase tracking-wider">
          Paso {state.currentStep + 1} de {steps.length}
        </p>
      </div>
    </aside>
  );
}
