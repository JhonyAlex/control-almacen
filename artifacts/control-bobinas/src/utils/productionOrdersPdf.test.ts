import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderOrigin, OrderStatus, type ProductionOrder } from '@workspace/api-client-react';
import { exportProductionOrdersPDF } from './productionOrdersPdf';

const { autoTableMock, saveMock } = vi.hoisted(() => ({
  autoTableMock: vi.fn(),
  saveMock: vi.fn(),
}));

vi.mock('jspdf-autotable', () => ({ default: autoTableMock }));

vi.mock('jspdf', () => ({
  default: class MockJsPDF {
    internal = { pageSize: { getWidth: () => 595.28, getHeight: () => 841.89 } };
    setFontSize() {}
    setFont() {}
    setTextColor() {}
    setDrawColor() {}
    setLineWidth() {}
    text() {}
    line() {}
    rect() {}
    setPage() {}
    getNumberOfPages() {
      return 1;
    }
    output() {
      return new Blob();
    }
    save(...args: unknown[]) {
      saveMock(...args);
    }
  },
}));

const PDF_TABLE_WIDTH = 525;

const order = (overrides: Partial<ProductionOrder> = {}): ProductionOrder => ({
  id: 13,
  ancho: 1090,
  micras: 25,
  camisa: '47-8-47',
  material: 'LDPE TTE',
  metrosNecesarios: 12500,
  metrosFabricados: 2000,
  metrosPendientes: 10500,
  estado: OrderStatus.ACTIVA,
  origen: OrderOrigin.MANUAL,
  pedidosRelacionados: [],
  creadoEn: '2026-09-01T00:00:00.000Z',
  finalizadaEn: null,
  nota: null,
  ...overrides,
});

type TableOptions = {
  head: string[][];
  body: string[][];
  columnStyles: Record<number, { cellWidth?: number }>;
  didDrawCell: (data: { section: string; column: { index: number }; cell: { x: number; y: number; width: number; height: number } }) => void;
};

const renderPdf = (activeOrders: ProductionOrder[], blockedOrders: ProductionOrder[] = []) => {
  exportProductionOrdersPDF(activeOrders, blockedOrders);
  expect(autoTableMock).toHaveBeenCalledTimes(1);
  const [doc, options] = autoTableMock.mock.calls[0] as [Record<string, unknown>, TableOptions];
  return { doc, options };
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock'), writable: true, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true, configurable: true });
  vi.spyOn(window, 'open').mockReturnValue({} as Window);
});

describe('exportProductionOrdersPDF', () => {
  it('exporta las columnas acordadas sin "Metros Fab." y con "Metros pendientes"', () => {
    const { options } = renderPdf([order()]);

    expect(options.head[0]).toEqual([
      'Orden',
      'Estado',
      'Origen',
      'Ancho',
      'Micras',
      'Camisa',
      'Material',
      'Pedidos agrupados',
      'Metros pendientes',
      'Hecho',
      'Creada',
    ]);
    expect(options.head[0]).not.toContain('Metros Fab.');
    expect(options.head[0]).not.toContain('Metros Nec.');
  });

  it('muestra los metros pendientes en la columna de metros', () => {
    const { options } = renderPdf([
      order({ metrosNecesarios: 12500, metrosFabricados: 2000, metrosPendientes: 10500 }),
    ]);

    const metersIndex = options.head[0].indexOf('Metros pendientes');
    expect(options.body[0][metersIndex]).toBe('10.500 m');
    expect(options.body[0]).not.toContain('12.500 m');
    expect(options.body[0]).not.toContain('2.000 m');
  });

  it('mantiene alineadas las columnas de cada fila con el encabezado', () => {
    const { options } = renderPdf([order(), order({ id: 14, estado: OrderStatus.BLOQUEADA })]);

    for (const row of options.body) {
      expect(row).toHaveLength(options.head[0].length);
    }
    expect(options.head[0].indexOf('Hecho')).toBe(9);
    expect(options.body[0][options.head[0].indexOf('Hecho')]).toBe('');
  });

  it('dibuja la casilla de "Hecho" en la columna correcta tras eliminar una columna', () => {
    const { doc, options } = renderPdf([order()]);
    const rectSpy = vi.spyOn(doc as { rect: () => void }, 'rect');

    options.didDrawCell({ section: 'body', column: { index: 9 }, cell: { x: 10, y: 20, width: 24, height: 12 } });
    expect(rectSpy).toHaveBeenCalledTimes(1);

    rectSpy.mockClear();
    options.didDrawCell({ section: 'body', column: { index: 8 }, cell: { x: 10, y: 20, width: 24, height: 12 } });
    expect(rectSpy).not.toHaveBeenCalled();
  });

  it('mantiene el ancho total de la tabla al repartir el espacio de la columna eliminada', () => {
    const { options } = renderPdf([order()]);

    const totalWidth = Object.values(options.columnStyles).reduce(
      (total, column) => total + (column.cellWidth ?? 0),
      0
    );
    expect(totalWidth).toBe(PDF_TABLE_WIDTH);
    expect(Object.keys(options.columnStyles)).toHaveLength(options.head[0].length);
  });

  it('ordena las órdenes bloqueadas de primero', () => {
    const { options } = renderPdf([order({ id: 21 })], [order({ id: 22, estado: OrderStatus.BLOQUEADA })]);

    expect(options.body.map((row) => row[0])).toEqual(['ORD-0022', 'ORD-0021']);
  });
});
