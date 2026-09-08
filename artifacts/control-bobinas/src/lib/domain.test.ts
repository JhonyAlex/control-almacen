import { describe, it, expect } from 'vitest';
import {
  camisaNaturalCompare,
  compareGroups,
  getMaterialColorClass,
  getMaterialColorIndex,
  groupInventory,
  materialAlphabeticalCompare,
  MATERIAL_PALETTE_SIZE,
  INVENTORY_SORT_PREFERENCE_KEY,
  readInventorySortPreference,
  saveInventorySortPreference,
  sortInventoryGroups,
  toggleInventorySort,
  type InventoryGroup,
  type InventorySortState,
} from './domain';
import type { Coil } from '@workspace/api-client-react';

const coil = (overrides: Partial<Coil>): Coil => ({
  id: 1,
  tipo: 'BOBINA',
  metros: 1000,
  ancho: 1200,
  micras: 30,
  camisa: 400,
  material: 'OPP',
  estado: 'DISPONIBLE',
  ordenId: null,
  pedidosRelacionados: [],
  creadoEn: '2026-01-01T00:00:00.000Z',
  ...overrides,
} as Coil);

const group = (overrides: Partial<InventoryGroup>): InventoryGroup => ({
  ...coil({}),
  count: 1,
  total: 1000,
  items: [coil({})],
  ...overrides,
});

describe('groupInventory', () => {
  it('agrupa por ancho-micras-camisa-material y suma metros', () => {
    const groups = groupInventory([
      coil({ id: 1, ancho: 1200, micras: 30, camisa: 400, material: 'OPP', metros: 1000 }),
      coil({ id: 2, ancho: 1200, micras: 30, camisa: 400, material: 'OPP', metros: 500 }),
      coil({ id: 3, ancho: 1200, micras: 30, camisa: 475, material: 'OPP', metros: 300 }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].count).toBe(2);
    expect(groups[0].total).toBe(1500);
    expect(groups[1].count).toBe(1);
  });

  it('sin criterio explícito conserva el orden por metros totales desc', () => {
    const g = groupInventory([
      coil({ id: 1, metros: 100, camisa: 400 }),
      coil({ id: 2, metros: 9000, camisa: 475 }),
      coil({ id: 3, metros: 500, camisa: 520 }),
    ]);
    expect(g.map((x) => x.total)).toEqual([9000, 500, 100]);
  });

  it('sortInventoryGroups con null no altera el orden por metros totales', () => {
    const groups = [
      group({ id: 1, total: 100, ancho: 1200 }),
      group({ id: 2, total: 9000, ancho: 1000 }),
    ];
    expect(sortInventoryGroups(groups, null).map((g) => g.total)).toEqual([100, 9000]);
  });
});

describe('ordenación de grupos', () => {
  const groups: InventoryGroup[] = [
    group({ id: 1, ancho: 1250, micras: 35, camisa: 475, material: 'opp reciclado', total: 100 }),
    group({ id: 2, ancho: 1000, micras: 25, camisa: '22-6-22', material: 'OPP', total: 200 }),
    group({ id: 3, ancho: 1200, micras: 30, camisa: 400, material: 'OPP RECICLADO', total: 300 }),
  ];

  it('ancho asc y desc numéricos', () => {
    const asc = sortInventoryGroups(groups, { field: 'ancho', direction: 'asc' });
    expect(asc.map((g) => g.ancho)).toEqual([1000, 1200, 1250]);
    const desc = sortInventoryGroups(groups, { field: 'ancho', direction: 'desc' });
    expect(desc.map((g) => g.ancho)).toEqual([1250, 1200, 1000]);
  });

  it('micras asc y desc numéricos', () => {
    const asc = sortInventoryGroups(groups, { field: 'micras', direction: 'asc' });
    expect(asc.map((g) => g.micras)).toEqual([25, 30, 35]);
    const desc = sortInventoryGroups(groups, { field: 'micras', direction: 'desc' });
    expect(desc.map((g) => g.micras)).toEqual([35, 30, 25]);
  });

  it('camisa con orden natural (los números embebidos comparan numéricamente)', () => {
    expect(camisaNaturalCompare('22-6-22', '400')).toBeLessThan(0);
    expect(camisaNaturalCompare('400', '475')).toBeLessThan(0);
    expect(camisaNaturalCompare('40-6-40', '40-8-40')).toBeLessThan(0);
    const asc = sortInventoryGroups(groups, { field: 'camisa', direction: 'asc' });
    expect(asc.map((g) => String(g.camisa))).toEqual(['22-6-22', '400', '475']);
    const desc = sortInventoryGroups(groups, { field: 'camisa', direction: 'desc' });
    expect(desc.map((g) => String(g.camisa))).toEqual(['475', '400', '22-6-22']);
  });

  it('material alfabético ignorando mayúsculas/minúsculas', () => {
    expect(materialAlphabeticalCompare('OPP', 'opp reciclado')).toBeLessThan(0);
    expect(materialAlphabeticalCompare('OPP RECICLADO', 'opp')).toBeGreaterThan(0);
    // Orden total: la misma palabra en distinto casing desempata de forma determinista
    expect(materialAlphabeticalCompare('OPP', 'opp')).toBeGreaterThan(0);
    expect(materialAlphabeticalCompare('opp', 'OPP')).toBeLessThan(0);
    // Orden total: 'opp' ≡ 'OPP' en base, pero desempata por variante (minúsculas primero)
    // asc: OPP < opp reciclado < OPP RECICLADO
    const asc = sortInventoryGroups(groups, { field: 'material', direction: 'asc' });
    expect(asc.map((g) => g.material)).toEqual(['OPP', 'opp reciclado', 'OPP RECICLADO']);
    // desc invierte el criterio (y el par base-igual también se invierte)
    const desc = sortInventoryGroups(groups, { field: 'material', direction: 'desc' });
    expect(desc.map((g) => g.material)).toEqual(['OPP RECICLADO', 'opp reciclado', 'OPP']);
  });

  it('metros asc y desc por el total agrupado', () => {
    const asc = sortInventoryGroups(groups, { field: 'metros', direction: 'asc' });
    expect(asc.map((g) => g.total)).toEqual([100, 200, 300]);
    const desc = sortInventoryGroups(groups, { field: 'metros', direction: 'desc' });
    expect(desc.map((g) => g.total)).toEqual([300, 200, 100]);
  });

  it('empates se resuelven con la cadena de desempate (orden estable y predecible)', () => {
    const tied = [
      group({ id: 1, ancho: 1200, micras: 30, camisa: 400, material: 'OPP', total: 500 }),
      group({ id: 2, ancho: 1200, micras: 30, camisa: 400, material: 'OPP', total: 900 }),
    ];
    const sorted = sortInventoryGroups(tied, { field: 'ancho', direction: 'asc' });
    expect(sorted.map((g) => g.total)).toEqual([900, 500]);
  });

  it('compareGroups invierte solo el criterio primario, no los desempates', () => {
    const a = group({ ancho: 1200, total: 100 });
    const b = group({ ancho: 1200, total: 500 });
    // Mismo ancho: el desempate (total desc) ordena b antes que a en ambas direcciones
    expect(compareGroups(a, b, 'ancho', 'asc')).toBeGreaterThan(0);
    expect(compareGroups(a, b, 'ancho', 'desc')).toBeGreaterThan(0);
  });
});

describe('preferencia de orden de inventario', () => {
  const stored = new Map<string, string>();
  const storage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  };

  it('guarda y recupera el criterio elegido del navegador', () => {
    saveInventorySortPreference({ field: 'metros', direction: 'asc' }, storage);
    expect(readInventorySortPreference(storage)).toEqual({ field: 'metros', direction: 'asc' });
  });

  it('ignora datos persistidos no válidos', () => {
    stored.set(INVENTORY_SORT_PREFERENCE_KEY, JSON.stringify({ field: 'desconocido', direction: 'asc' }));
    expect(readInventorySortPreference(storage)).toBeNull();
  });

  it('eliminar el criterio borra la preferencia guardada', () => {
    saveInventorySortPreference({ field: 'ancho', direction: 'desc' }, storage);
    saveInventorySortPreference(null, storage);
    expect(stored.has(INVENTORY_SORT_PREFERENCE_KEY)).toBe(false);
  });
});

describe('toggleInventorySort', () => {
  it('sin criterio previo → ascendente', () => {
    expect(toggleInventorySort(null, 'ancho')).toEqual({ field: 'ancho', direction: 'asc' });
  });

  it('clic sobre el mismo campo ascendente → descendente', () => {
    const current: InventorySortState = { field: 'micras', direction: 'asc' };
    expect(toggleInventorySort(current, 'micras')).toEqual({ field: 'micras', direction: 'desc' });
  });

  it('clic sobre un campo distinto → ascendente en el nuevo campo', () => {
    const current: InventorySortState = { field: 'micras', direction: 'desc' };
    expect(toggleInventorySort(current, 'material')).toEqual({ field: 'material', direction: 'asc' });
  });

  it('tercer clic vuelve a ascendente (ciclo predecible)', () => {
    const current: InventorySortState = { field: 'camisa', direction: 'desc' };
    expect(toggleInventorySort(current, 'camisa')).toEqual({ field: 'camisa', direction: 'asc' });
  });
});

describe('color de material determinista', () => {
  it('el mismo material siempre recibe el mismo color', () => {
    expect(getMaterialColorIndex('OPP')).toBe(getMaterialColorIndex('OPP'));
    expect(getMaterialColorClass('OPP')).toBe(getMaterialColorClass('OPP'));
    expect(getMaterialColorIndex('OPP RECICLADO')).toBe(getMaterialColorIndex('OPP RECICLADO'));
  });

  it('normaliza mayúsculas y espacios: mismo material → mismo color', () => {
    expect(getMaterialColorIndex('  opp ')).toBe(getMaterialColorIndex('OPP'));
    expect(getMaterialColorIndex('Opp Reciclado')).toBe(getMaterialColorIndex('OPP RECICLADO'));
  });

  it('materiales nuevos/dinámicos reciben un color válido del palette', () => {
    for (const material of ['PET', 'LDPE', 'BOPP TRANSPARENTE', 'X', 'material-marca-9']) {
      const index = getMaterialColorIndex(material);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(MATERIAL_PALETTE_SIZE);
      expect(getMaterialColorClass(material)).toMatch(/^material-chip-\d+$/);
    }
  });

  it('materiales distintos no colisionan siempre (distribución no degenerada)', () => {
    const materials = ['OPP', 'OPP RECICLADO', 'PET', 'LDPE', 'PEAD', 'PP', 'PA', 'EVOH'];
    const indexes = new Set(materials.map(getMaterialColorIndex));
    expect(indexes.size).toBeGreaterThan(1);
  });
});
