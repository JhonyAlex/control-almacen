import type { Camisa, Material, Coil, ProductionOrder, RelatedPedido } from '@workspace/api-client-react';

export const CAMISAS: Camisa[] = [
  400, 475, 520, '22-6-22', '21-8-21', '40-6-40',
  '40-8-40', '47-5-47', '47-8-47', '52-8-52',
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

export const formatPedidosSummary = (pedidos?: RelatedPedido[] | null): string => {
  if (!pedidos || pedidos.length === 0) return 'Sin pedido asociado';
  if (pedidos.length === 1) {
    const p = pedidos[0];
    return `Pedido ${p.numeroPedidoCliente || p.pedidoId}`;
  }
  return `Pedidos (${pedidos.length}): ${pedidos.map((p) => p.numeroPedidoCliente || p.pedidoId).join(', ')}`;
};

export const formatOrdenLabel = (ordenId: number) =>
  `ORD-${String(ordenId).padStart(4, '0')}`;

export interface InventoryGroup extends Coil {
  count: number;
  total: number;
  items: Coil[];
}

export const groupInventory = (items: Coil[]): InventoryGroup[] => {
  const groups = new Map<string, InventoryGroup>();
  items.forEach((item) => {
    const key = `${item.ancho}-${item.micras}-${item.camisa}-${item.material}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.total += item.metros;
      existing.items.push(item);
    } else {
      groups.set(key, { ...item, count: 1, total: item.metros, items: [item] });
    }
  });
  return Array.from(groups.values()).sort((a, b) => b.total - a.total);
};

// ---------------------------------------------------------------------------
// Ordenación de grupos de bobinas
// ---------------------------------------------------------------------------

export type InventorySortField = 'ancho' | 'micras' | 'camisa' | 'material' | 'metros';
export type SortDirection = 'asc' | 'desc';

export interface InventorySortState {
  field: InventorySortField;
  direction: SortDirection;
}

export const INVENTORY_SORT_FIELDS: InventorySortField[] = [
  'ancho',
  'micras',
  'camisa',
  'material',
  'metros',
];

export const INVENTORY_SORT_PREFERENCE_KEY = 'control-bobinas.inventory-sort';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const isInventorySortState = (value: unknown): value is InventorySortState => {
  if (!value || typeof value !== 'object') return false;
  const { field, direction } = value as Record<string, unknown>;
  return INVENTORY_SORT_FIELDS.includes(field as InventorySortField)
    && (direction === 'asc' || direction === 'desc');
};

const getBrowserStorage = (): StorageLike | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/** Reads the sort choice saved for this browser; invalid or unavailable storage is ignored. */
export const readInventorySortPreference = (storage: StorageLike | null = getBrowserStorage()): InventorySortState | null => {
  if (!storage) return null;
  try {
    const serialized = storage.getItem(INVENTORY_SORT_PREFERENCE_KEY);
    if (!serialized) return null;
    const parsed: unknown = JSON.parse(serialized);
    return isInventorySortState(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/** Saves the sort choice locally, independently of the signed-in user. */
export const saveInventorySortPreference = (
  sort: InventorySortState | null,
  storage: StorageLike | null = getBrowserStorage(),
): void => {
  if (!storage) return;
  try {
    if (!sort) {
      storage.removeItem(INVENTORY_SORT_PREFERENCE_KEY);
      return;
    }
    storage.setItem(INVENTORY_SORT_PREFERENCE_KEY, JSON.stringify(sort));
  } catch {
    // Storage can be disabled by the browser; sorting still works for this session.
  }
};

/** Natural compare: embedded numbers compare numerically ("475" < "22-6-22"? no: 22 < 400 → "22-6-22" before "400"). */
export const camisaNaturalCompare = (a: string, b: string) =>
  a.localeCompare(b, 'es', { numeric: true, sensitivity: 'variant' });

export const materialAlphabeticalCompare = (a: string, b: string) =>
  a.trim().localeCompare(b.trim(), 'es', { sensitivity: 'base' }) ||
  a.trim().localeCompare(b.trim(), 'es');

/**
 * Full deterministic comparator between two groups: primary sort field and
 * direction, then a stable tie-break chain so the order is predictable.
 */
export const compareGroups = (
  a: InventoryGroup,
  b: InventoryGroup,
  field: InventorySortField,
  direction: SortDirection,
): number => {
  const sign = direction === 'asc' ? 1 : -1;
  let primary = 0;
  if (field === 'ancho') primary = a.ancho - b.ancho;
  else if (field === 'micras') primary = a.micras - b.micras;
  else if (field === 'camisa') primary = camisaNaturalCompare(String(a.camisa), String(b.camisa));
  else if (field === 'material') primary = materialAlphabeticalCompare(a.material, b.material);
  else primary = a.total - b.total;
  if (primary !== 0) return sign * primary;

  // Tie-break chain: total meters desc, then characteristics asc.
  if (a.total !== b.total) return b.total - a.total;
  if (a.ancho !== b.ancho) return a.ancho - b.ancho;
  if (a.micras !== b.micras) return a.micras - b.micras;
  const byCamisa = camisaNaturalCompare(String(a.camisa), String(b.camisa));
  if (byCamisa !== 0) return byCamisa;
  return materialAlphabeticalCompare(a.material, b.material);
};

/** Applies the selected sort; with no criterion keeps the default order (metros totales desc). */
export const sortInventoryGroups = (
  groups: InventoryGroup[],
  sort: InventorySortState | null,
): InventoryGroup[] => {
  if (!sort) return groups;
  return [...groups].sort((a, b) => compareGroups(a, b, sort.field, sort.direction));
};

/** First click → asc, second click on the same field → desc, third → asc again. */
export const toggleInventorySort = (
  current: InventorySortState | null,
  field: InventorySortField,
): InventorySortState => {
  if (!current || current.field !== field) return { field, direction: 'asc' };
  if (current.direction === 'asc') return { field, direction: 'desc' };
  return { field, direction: 'asc' };
};

// ---------------------------------------------------------------------------
// Color estable por material
// ---------------------------------------------------------------------------

export const MATERIAL_PALETTE_SIZE = 12;

const normalizeMaterialForKey = (material: string) => material.trim().toLowerCase();

/** FNV-1a hash: deterministic across sessions/reloads for the same normalized material. */
export const getMaterialColorIndex = (material: string): number => {
  const key = normalizeMaterialForKey(material);
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % MATERIAL_PALETTE_SIZE;
};

/** CSS class from the palette defined in index.css; keeps color stable per material. */
export const getMaterialColorClass = (material: string): string =>
  `material-chip-${getMaterialColorIndex(material)}`;

export const parseCamisa = (value: string): Camisa =>
  /^\d+$/.test(value) ? Number(value) as Camisa : value as Camisa;

/**
 * Ordena las bobinas movidas a fábrica para que la más reciente siempre esté arriba (en primer lugar),
 * usando `movidoAFabricaEn` (o `id` como desempate/fallback), y conservando un máximo de 25 bobinas.
 */
export const sortFactoryCoils = (coils: Coil[], limit = 25): Coil[] => {
  return [...coils]
    .sort((a, b) => {
      const timeA = a.movidoAFabricaEn ? new Date(a.movidoAFabricaEn).getTime() : 0;
      const timeB = b.movidoAFabricaEn ? new Date(b.movidoAFabricaEn).getTime() : 0;
      if (timeA !== timeB) return timeB - timeA;
      return b.id - a.id;
    })
    .slice(0, limit);
};
