import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ProductionOrder } from '@workspace/api-client-react';
import { formatMeters } from '../lib/domain';

const PDF_TABLE_WIDTH = 525;
const PDF_FOOTER_REVISION = 'Versión 1.2 · Rev. 11/06/2026';
const PDF_FOOTER_CONFIDENTIALITY = 'Uso interno exclusivo · Pigmea S.L.';

const formatDateDDMMYYYY = (value: Date | string | null | undefined): string => {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatPedidosAgrupados = (order: ProductionOrder): string => {
  const pedidos = order.pedidosRelacionados ?? [];
  if (pedidos.length === 0) {
    return order.origen === 'MANUAL' ? 'Orden manual' : 'Sin pedidos';
  }

  if (pedidos.length === 1) {
    const p = pedidos[0];
    const code = p.numeroPedidoCliente || p.pedidoId;
    const metros = p.metros ? ` (${formatMeters(p.metros)} m)` : '';
    return `Total: 1 pedido\n${code}${metros}`;
  }

  const items = pedidos.map((p) => {
    const code = p.numeroPedidoCliente || p.pedidoId;
    const metros = p.metros ? ` (${formatMeters(p.metros)} m)` : '';
    return `• ${code}${metros}`;
  });

  return [`Total: ${pedidos.length} pedidos`, ...items].join('\n');
};

const buildPdfFooter = (
  doc: jsPDF,
  pageWidth: number,
  pageHeight: number,
  horizontalMargin: number
) => {
  const totalPages = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    doc.setPage(pageNumber);

    // Línea divisoria superior del pie de página
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(horizontalMargin, pageHeight - 20, pageWidth - horizontalMargin, pageHeight - 20);

    // Textos del pie de página
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);

    doc.text(PDF_FOOTER_REVISION, horizontalMargin, pageHeight - 11);
    doc.text(`Página ${pageNumber} de ${totalPages}`, pageWidth / 2, pageHeight - 11, { align: 'center' });
    doc.text(PDF_FOOTER_CONFIDENTIALITY, pageWidth - horizontalMargin, pageHeight - 11, { align: 'right' });
  }
};

/**
 * Genera el documento PDF con el listado de órdenes activas y bloqueadas de producción
 * y lo abre de inmediato en una nueva pestaña del navegador para impresión/visualización.
 */
export const exportProductionOrdersPDF = (
  activeOrders: ProductionOrder[],
  blockedOrders: ProductionOrder[] = []
) => {
  const allOrders = [...(activeOrders ?? []), ...(blockedOrders ?? [])];
  if (allOrders.length === 0) {
    return;
  }

  // A4 portrait = 595.28 x 841.89 pt
  const doc = new jsPDF('p', 'pt', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const tableWidth = PDF_TABLE_WIDTH;
  const tableHorizontalMargin = (pageWidth - tableWidth) / 2;

  // ================= ENCABEZADO =================
  // Título corporativo principal
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text('PIGMEA S.L.', tableHorizontalMargin, 28);

  // Subtítulo de sección
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Órdenes de producción', tableHorizontalMargin, 42);

  // Sub-subtítulo informativo detallando el conteo de activas y bloqueadas
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  const totalCount = allOrders.length;
  let subtitleDetail = `${totalCount} ${totalCount === 1 ? 'orden' : 'órdenes'}`;
  if (activeOrders.length > 0 && blockedOrders.length > 0) {
    subtitleDetail = `${totalCount} órdenes (${activeOrders.length} activas, ${blockedOrders.length} bloqueadas)`;
  } else if (blockedOrders.length > 0) {
    subtitleDetail = `${blockedOrders.length} órdenes bloqueadas`;
  }
  doc.text(`Módulo 02 · Control de Fabricación (${subtitleDetail})`, tableHorizontalMargin, 54);

  // Fecha actual en la esquina superior derecha alineada con el margen de la tabla
  const today = new Date();
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);
  doc.text(formatDateDDMMYYYY(today), pageWidth - tableHorizontalMargin, 28, { align: 'right' });

  // ================= TABLA DE DATOS =================
  const tableHeaders = [
    'Orden',
    'Estado',
    'Origen',
    'Ancho',
    'Micras',
    'Camisa',
    'Material',
    'Pedidos agrupados',
    'Metros Nec.',
    'Metros Fab.',
    'Hecho',
    'Creada',
  ];

  const tableRows = allOrders.map((order) => [
    `ORD-${String(order.id).padStart(4, '0')}`,
    order.estado,
    order.origen === 'GESTION_PEDIDOS' ? 'Nexus' : 'Manual',
    `${formatMeters(order.ancho)} mm`,
    `${order.micras} µ`,
    String(order.camisa),
    order.material,
    formatPedidosAgrupados(order),
    `${formatMeters(order.metrosNecesarios)} m`,
    `${formatMeters(order.metrosFabricados)} m`,
    '', // Hecho: casilla cuadrada dibujada en didDrawCell
    formatDateDDMMYYYY(order.creadoEn),
  ]);

  const startY = 64;

  autoTable(doc, {
    startY,
    head: [tableHeaders],
    body: tableRows,
    theme: 'grid',
    tableWidth,
    margin: { left: tableHorizontalMargin, right: tableHorizontalMargin, top: 20, bottom: 28 },
    styles: {
      fontSize: 7,
      cellPadding: { top: 3, right: 2.5, bottom: 3, left: 2.5 },
      valign: 'middle',
      textColor: [31, 41, 55],
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
      overflow: 'linebreak',
      halign: 'center',
    },
    headStyles: {
      fillColor: [45, 55, 72], // #2d3748
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 6.8,
      halign: 'center',
      valign: 'middle',
      cellPadding: { top: 3.5, right: 2, bottom: 3.5, left: 2 },
    },
    columnStyles: {
      0: { cellWidth: 48, fontStyle: 'bold' },              // Orden
      1: { cellWidth: 38, fontSize: 6.5 },                  // Estado
      2: { cellWidth: 34, fontSize: 6.5 },                  // Origen
      3: { cellWidth: 38 },                                // Ancho
      4: { cellWidth: 28 },                                // Micras
      5: { cellWidth: 32 },                                // Camisa
      6: { cellWidth: 40, fontSize: 6.5 },                  // Material
      7: { cellWidth: 125, halign: 'left', fontSize: 6.5 }, // Pedidos agrupados (con ancho máx. y multilínea)
      8: { cellWidth: 40, halign: 'right' },               // Metros Nec.
      9: { cellWidth: 40, halign: 'right' },               // Metros Fab.
      10: { cellWidth: 22 },                               // Hecho (checkbox)
      11: { cellWidth: 40, fontSize: 6.3 },                // Creada
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const order = allOrders[data.row.index];

        // Filas alternas para activas
        if (data.row.index % 2 === 1) {
          data.cell.styles.fillColor = [248, 250, 252]; // slate-50
        }

        if (order) {
          // Si la orden está bloqueada, aplicar fondo sutil distintivo en la fila
          if (order.estado === 'BLOQUEADA') {
            data.cell.styles.fillColor = data.row.index % 2 === 1 ? [254, 243, 199] : [255, 251, 235]; // amber-100 / amber-50
          }

          // Color de estado
          if (data.column.index === 1) {
            if (order.estado === 'ACTIVA') {
              data.cell.styles.textColor = [39, 97, 61]; // verde
              data.cell.styles.fontStyle = 'bold';
            } else if (order.estado === 'BLOQUEADA') {
              data.cell.styles.textColor = [180, 83, 9]; // amber-700
              data.cell.styles.fontStyle = 'bold';
            }
          }

          // Origen Nexus destacado sutil
          if (data.column.index === 2 && order.origen === 'GESTION_PEDIDOS') {
            data.cell.styles.textColor = [37, 99, 235]; // azul
          }
        }
      }
    },
    didDrawCell: (data) => {
      // Dibujar checkbox cuadrado limpio en la columna "Hecho"
      if (data.section === 'body' && data.column.index === 10) {
        const { x, y, width, height } = data.cell;
        const boxSize = 8;
        const boxX = x + (width - boxSize) / 2;
        const boxY = y + (height - boxSize) / 2;

        doc.setDrawColor(45, 55, 72);
        doc.setLineWidth(0.75);
        doc.rect(boxX, boxY, boxSize, boxSize);
      }
    },
  });

  // Construir pie de página institucional en todas las hojas
  buildPdfFooter(doc, pageWidth, pageHeight, tableHorizontalMargin);

  // Apertura inmediata del PDF renderizado en nueva pestaña
  const pdfBlob = doc.output('blob');
  const blobUrl = URL.createObjectURL(pdfBlob);
  const openedTab = window.open(blobUrl, '_blank');

  // Fallback si el navegador bloquea ventanas emergentes
  if (!openedTab) {
    const filenameDate = today.toISOString().split('T')[0];
    doc.save(`ordenes_produccion_${filenameDate}.pdf`);
  }

  // Liberar el blob después de 1 minuto
  const timer = setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 60000);
  if (typeof timer === 'object' && 'unref' in timer && typeof timer.unref === 'function') {
    timer.unref();
  }
};
