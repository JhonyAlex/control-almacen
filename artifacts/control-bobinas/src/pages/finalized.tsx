import { useState } from 'react';
import { Archive, CheckCircle2, ChevronDown, Layers, Package, RefreshCw, TriangleAlert } from 'lucide-react';
import { OrderStatus, getListOrderCoilsQueryKey, useListOrderCoils, useListOrders, type ProductionOrder } from '@workspace/api-client-react';
import { formatDate, formatMeters, formatPedidosSummary } from '@/lib/domain';

function Finalized() {
  const ordersQuery = useListOrders({ status: OrderStatus.FINALIZADA });
  const orders = ordersQuery.data ?? [];
  return <div className="industrial-grid min-h-[calc(100dvh-72px)]"><div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10"><div className="load-in mb-9 flex items-end justify-between gap-4"><div><p className="font-data text-[10px] font-semibold uppercase tracking-[.2em] text-primary">Módulo 04 / trazabilidad</p><h1 className="mt-2 font-display text-[clamp(2.7rem,6vw,4.7rem)] font-semibold uppercase leading-[.88] tracking-wide">Órdenes finalizadas</h1><p className="mt-3 max-w-xl text-sm text-muted-foreground">Historial de órdenes completadas y sus bobinas fabricadas.</p></div><span className="font-data text-[11px] font-semibold uppercase tracking-[.15em] text-muted-foreground">{orders.length} órdenes</span></div>{ordersQuery.isLoading && <div className="space-y-3"><div className="h-28 animate-pulse rounded-xl bg-muted" /><div className="h-28 animate-pulse rounded-xl bg-muted" /></div>}{ordersQuery.isError && !ordersQuery.isLoading && <div className="flex flex-col items-start gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-6" role="alert"><div className="flex items-center gap-3 text-destructive"><TriangleAlert size={21} /><p className="font-semibold">No se pudo cargar el historial</p></div><button type="button" onClick={() => ordersQuery.refetch()} className="pressable flex min-h-11 items-center gap-2 rounded-lg bg-destructive px-4 text-sm font-semibold text-destructive-foreground"><RefreshCw size={16} /> Reintentar</button></div>}{!ordersQuery.isLoading && !ordersQuery.isError && (orders.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-card/60 px-6 py-16 text-center"><Archive className="mx-auto text-muted-foreground" size={32} /><h2 className="mt-3 font-display text-3xl uppercase">Sin historial todavía</h2><p className="mt-1 text-sm text-muted-foreground">Las órdenes completadas aparecerán aquí.</p></div> : <div className="space-y-3">{orders.map((order) => <FinalizedRow key={order.id} order={order} />)}</div>)}</div></div>;
}

function FinalizedRow({ order }: { order: ProductionOrder }) {
  const [open, setOpen] = useState(false);
  const coilsQuery = useListOrderCoils(order.id, { query: { enabled: open, queryKey: getListOrderCoilsQueryKey(order.id) } });
  const pedidos = order.pedidosRelacionados ?? [];
  return (
    <div className="rounded-xl border border-border bg-card" data-testid={`row-finalized-order-${order.id}`}>
      <button type="button" onClick={() => setOpen(!open)} className="flex min-h-24 w-full items-center gap-4 px-4 py-5 text-left sm:px-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#eaf4eb] text-[#347349]"><CheckCircle2 size={19} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-data text-sm font-semibold">ORD-{String(order.id).padStart(4, '0')}</span>
            <span className="font-data text-[10px] uppercase tracking-wider text-[#3c7d52]">{order.estado}</span>
            {order.origen === 'GESTION_PEDIDOS' && <span className="rounded bg-primary/10 px-2 py-0.5 font-data text-[10px] font-semibold text-primary">Nexus</span>}
          </div>
          <p className="mt-2 font-semibold">{order.ancho} mm · {order.micras} µ · Camisa {order.camisa} · {order.material}</p>
          {pedidos.length === 1 && (
            <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Package size={13} className="shrink-0" /> Pedido: {pedidos[0].numeroPedidoCliente || pedidos[0].pedidoId}
            </p>
          )}
          {pedidos.length > 1 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-xs font-semibold text-primary">
                <Layers size={13} className="shrink-0" /> {pedidos.length} pedidos agrupados:
              </span>
              {pedidos.map((p) => (
                <span key={p.id} className="rounded bg-secondary px-1.5 py-0.5 font-data text-[10px] font-medium text-secondary-foreground">
                  {p.numeroPedidoCliente || p.pedidoId} ({formatMeters(p.metros)} m)
                </span>
              ))}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span>Creada: {formatDate(order.creadoEn)}</span>
            <span>Finalizada: {order.finalizadaEn ? formatDate(order.finalizadaEn) : '—'}</span>
          </div>
        </div>
        <div className="hidden text-right sm:block">
          <p className="font-data font-semibold">{formatMeters(order.metrosFabricados)} m</p>
          <p className="text-xs text-muted-foreground">de {formatMeters(order.metrosNecesarios)} m</p>
        </div>
        <ChevronDown size={22} className={`shrink-0 text-muted-foreground transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-border px-4 pb-4 sm:px-6">
          <p className="py-3 font-data text-[10px] font-semibold uppercase tracking-[.15em] text-muted-foreground">Bobinas de esta orden</p>
          {coilsQuery.isLoading ? (
            <div className="h-12 animate-pulse rounded-lg bg-muted" />
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {(coilsQuery.data ?? []).map((coil) => {
                const coilPedidos = coil.pedidosRelacionados ?? pedidos;
                return (
                  <div key={coil.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="font-semibold">{coil.tipo} · {formatMeters(coil.metros)} m</p>
                      {coilPedidos.length > 0 && (
                        <p className="text-xs text-primary font-medium">{formatPedidosSummary(coilPedidos)}</p>
                      )}
                      <p className="text-xs text-muted-foreground">Creada: {formatDate(coil.creadoEn)}</p>
                    </div>
                    <span className="font-data text-[10px] uppercase text-muted-foreground">{coil.estado}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Finalized;