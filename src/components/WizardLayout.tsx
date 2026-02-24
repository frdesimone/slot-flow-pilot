import { ReactNode } from "react";
import { WizardSidebar } from "@/components/WizardSidebar";

export function WizardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <WizardSidebar />
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-6 lg:p-8 animate-slide-in">
          {children}
        </div>
      </main>
    </div>
  );
}
