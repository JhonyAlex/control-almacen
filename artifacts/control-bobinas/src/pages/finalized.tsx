import { Archive, CheckCircle2, RefreshCw, TriangleAlert } from 'lucide-react';
import { OrderStatus, useListOrders, type ProductionOrder } from '@workspace/api-client-react';
import { formatDate, formatMeters } from '@/lib/domain';

function Finalized() {
  const ordersQuery = useListOrders({ status: OrderStatus.FINALIZADA });
  const orders = ordersQuery.data ?? [];

  return (
    <div className="industrial-grid min-h-[calc(100dvh-72px)]">
      <div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
        <div className="load-in mb-9">
          <p className="font-data text-[10px] font-semibold uppercase tracking-[.2em] text-primary">Módulo 03 / trazabilidad</p>
          <div className="mt-2 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h1 className="font-display text-[clamp(2.7rem,6vw,4.7rem)] font-semibold uppercase leading-[.88] tracking-wide">Órdenes finalizadas</h1><p className="mt-3 max-w-xl text-sm text-muted-foreground">Historial de fabricación completada. Consulta los metros solicitados y registrados.</p></div><span className="font-data text-[11px] font-semibold uppercase tracking-[.15em] text-muted-foreground">{orders.length} registros</span></div>
        </div>
        {ordersQuery.isLoading && <div className="space-y-3" aria-label="Cargando historial" data-testid="loading-finalized"><div className="h-28 animate-pulse rounded-xl bg-muted" /><div className="h-28 animate-pulse rounded-xl bg-muted" /><div className="h-28 animate-pulse rounded-xl bg-muted" /></div>}
        {ordersQuery.isError && !ordersQuery.isLoading && <div className="flex flex-col items-start gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-6" role="alert" data-testid="error-finalized"><div className="flex items-center gap-3 text-destructive"><TriangleAlert size={21} /><p className="font-semibold">No se pudo cargar el historial</p></div><button type="button" onClick={() => ordersQuery.refetch()} className="pressable flex min-h-11 items-center gap-2 rounded-lg bg-destructive px-4 text-sm font-semibold text-destructive-foreground" data-testid="button-retry-finalized"><RefreshCw size={16} /> Reintentar</button></div>}
        {!ordersQuery.isLoading && !ordersQuery.isError && (orders.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-card/60 px-6 py-16 text-center" data-testid="empty-finalized-orders"><Archive className="mx-auto text-muted-foreground" size={32} /><h2 className="mt-3 font-display text-3xl uppercase">Sin historial todavía</h2><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Las órdenes completadas aparecerán aquí para su consulta.</p></div> : <div className="overflow-hidden rounded-xl border border-border bg-card" data-testid="list-finalized-orders"><div className="hidden grid-cols-[1.25fr_1fr_.8fr_.8fr_.9fr] gap-4 border-b border-border bg-muted/55 px-5 py-3 font-data text-[10px] font-semibold uppercase tracking-[.13em] text-muted-foreground md:grid"><span>Orden</span><span>Especificación</span><span>Solicitados</span><span>Fabricados</span><span>Finalizada</span></div>{orders.map((order) => <FinalizedRow key={order.id} order={order} />)}</div>)}
      </div>
    </div>
  );
}

function FinalizedRow({ order }: { order: ProductionOrder }) {
  return <div className="grid gap-3 border-b border-border px-4 py-5 last:border-b-0 md:grid-cols-[1.25fr_1fr_.8fr_.8fr_.9fr] md:items-center md:gap-4 md:px-5" data-testid={`row-finalized-order-${order.id}`}>
    <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#eaf4eb] text-[#347349]"><CheckCircle2 size={18} /></span><div><p className="font-data text-sm font-semibold">ORD-{String(order.id).padStart(4, '0')}</p><p className="mt-0.5 text-xs text-muted-foreground">{order.estado}</p></div></div>
    <div><p className="font-semibold">{order.ancho} mm · {order.micras} µ</p><p className="mt-1 text-xs text-muted-foreground">Camisa {order.camisa} · {order.material}</p></div>
    <div><p className="text-[11px] text-muted-foreground md:hidden">Metros solicitados</p><p className="font-data font-semibold">{formatMeters(order.metrosNecesarios)} m</p></div>
    <div><p className="text-[11px] text-muted-foreground md:hidden">Metros fabricados</p><p className="font-data font-semibold text-primary">{formatMeters(order.metrosFabricados)} m</p></div>
    <p className="text-xs text-muted-foreground">{formatDate(order.creadoEn)}</p>
  </div>;
}

export default Finalized;