/**
 * Helper utilities for normalising and comparing Nexus order group keys.
 */

export function normalizeMaterialComparison(material: string): string {
  return material.trim().toLowerCase();
}

export function normalizeMaterialStorage(material: string): string {
  return material.trim();
}

export function normalizeCamisa(camisa: string | number): string {
  return String(camisa).trim();
}

export function normalizeNumericString(value: number | string): string {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`Valor numérico inválido o no positivo: ${value}`);
  }
  return num.toFixed(2);
}

export interface NexusGroupAttributes {
  ancho: number | string;
  micras: number | string;
  material: string;
  camisa: string | number;
}

/**
 * Produces a canonical normalized key for concurrency locking and duplicate grouping checks.
 * Clave lógica: Bobina Madre (ancho) + Micras + Tipo Material + Camisa
 */
export function getNexusGroupKey(attrs: NexusGroupAttributes): string {
  const anchoNorm = Number(attrs.ancho).toFixed(2);
  const micrasNorm = Number(attrs.micras).toFixed(2);
  const materialNorm = normalizeMaterialComparison(attrs.material);
  const camisaNorm = normalizeCamisa(attrs.camisa);

  return `${anchoNorm}|${micrasNorm}|${materialNorm}|${camisaNorm}`;
}
