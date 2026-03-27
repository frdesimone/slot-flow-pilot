import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNum(val: number | string | undefined | null, decimals = 1): string {
  if (val === null || val === undefined || val === "") return "-";

  const num = Number(val);
  if (isNaN(num)) return String(val); // Si es un string de texto, lo devuelve tal cual

  // Redondea de forma segura eliminando el bug de punto flotante
  const rounded = parseFloat(num.toFixed(decimals));

  // Retorna el formato local con coma decimal y siempre `decimals` dígitos (es-AR)
  return rounded.toLocaleString("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
