import { SlottingProvider, useSlotting } from "@/context/SlottingContext";
import { WizardLayout } from "@/components/WizardLayout";
import { Step1DataIngestion } from "@/components/steps/Step1DataIngestion";
import { Step2DataAudit } from "@/components/steps/Step2DataAudit";
import { Step3MacroSlotting } from "@/components/steps/Step3MacroSlotting";
import { Step4MicroSlotting } from "@/components/steps/Step4MicroSlotting";

function StepRouter() {
  const { state } = useSlotting();

  const steps = [
    <Step1DataIngestion key={0} />,
    <Step2DataAudit key={1} />,
    <Step3MacroSlotting key={2} />,
    <Step4MicroSlotting key={3} />,
  ];

  return <WizardLayout>{steps[state.currentStep]}</WizardLayout>;
}

const Index = () => {
  return (
    <SlottingProvider>
      <StepRouter />
    </SlottingProvider>
  );
};

export default Index;
