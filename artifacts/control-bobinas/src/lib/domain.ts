import type { Camisa, Material, Coil, ProductionOrder } from '@workspace/api-client-react';

export const CAMISAS: Camisa[] = [
  400, 475, 520, '22-6-22', '21-8-21', '40-6-40', '40-8-40',
  '47-5-47', '47-8-47', '52-8-52',
];

export const MATERIALES: Material[] = ['OPP', 'OPP RECICLADO'];

export const formatMeters = (value: number) =>
  new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(value);

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

export const characteristicsLabel = (item: Coil | ProductionOrder) =>
  `${item.ancho} mm · ${item.micras} µ · camisa ${item.camisa} · ${item.material}`;

export const groupInventory = (items: Coil[]) => {
  const groups = new Map<string, Coil & { count: number; total: number }>();
  items.forEach((item) => {
    const key = `${item.ancho}-${item.micras}-${item.camisa}-${item.material}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.total += item.metros;
    } else {
      groups.set(key, { ...item, count: 1, total: item.metros });
    }
  });
  return Array.from(groups.values()).sort((a, b) => b.total - a.total);
};

export const parseCamisa = (value: string): Camisa =>
  /^\d+$/.test(value) ? Number(value) as Camisa : value as Camisa;