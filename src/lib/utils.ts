import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNum(val: number | string | undefined | null, decimals = 3): string {
  if (val === null || val === undefined || val === "") return "-";

  const num = Number(val);
  if (isNaN(num)) return String(val); // Si es un string de texto, lo devuelve tal cual

  // Redondea de forma segura eliminando el bug de punto flotante y quita ceros a la derecha
  const rounded = parseFloat(num.toFixed(decimals));

  // Retorna el formato local (con puntos para miles y coma para decimales en es-AR)
  return rounded.toLocaleString("es-AR", { maximumFractionDigits: decimals });
}
