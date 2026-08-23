import { type FormEvent, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ClipboardPlus, Factory, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import {
  getListOrdersQueryKey,
  OrderStatus,
  useCreateOrder,
  useDeleteOrder,
  useListOrders,
  type ProductionOrder,
} from '@workspace/api-client-react';
import { Field, inputClass, Modal } from '@/components/modal';
import { CAMISAS, formatDate, formatMeters, MATERIALES, parseCamisa } from '@/lib/domain';

function OrderSkeleton() {
  return <div className="space-y-3" aria-label="Cargando órdenes" data-testid="loading-orders"><div className="h-44 animate-pulse rounded-xl bg-muted" /><div className="h-44 animate-pulse rounded-xl bg-muted" /></div>;
}

function Production() {
  const queryClient = useQueryClient();
  const ordersQuery = useListOrders({ status: OrderStatus.ACTIVA });
  const createOrder = useCreateOrder();
  const deleteOrder = useDeleteOrder();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductionOrder | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const orders = ordersQuery.data ?? [];
  const onCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createOrder.mutate({
      data: {
        ancho: Number(form.get('ancho')),
        micras: Number(form.get('micras')),
        camisa: parseCamisa(String(form.get('camisa'))),
        material: String(form.get('material')) as typeof MATERIALES[number],
        metrosNecesarios: Number(form.get('metrosNecesarios')),
      },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey({ status: OrderStatus.ACTIVA }) });
        setCreateOpen(false);
        setNotice('Orden creada y añadida a producción.');
      },
    });
  };

  const onDelete = () => {
    if (!deleteTarget) return;
    deleteOrder.mutate({ id: deleteTarget.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey({ status: OrderStatus.ACTIVA }) });
        setDeleteTarget(null);
        setNotice('Orden eliminada de producción.');
      },
    });
  };

  return (
    <div className="industrial-grid min-h-[calc(100dvh-72px)]">
      <div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
        <div className="load-in mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div><p className="font-data text-[10px] font-semibold uppercase tracking-[.2em] text-primary">Módulo 02 / producción</p><h1 className="mt-2 font-display text-[clamp(2.7rem,6vw,4.7rem)] font-semibold uppercase leading-[.88] tracking-wide">Órdenes activas</h1><p className="mt-3 max-w-xl text-sm text-muted-foreground">Controla lo que está en fabricación. Cada metro registrado actualiza el pendiente de la orden.</p></div>
          <button type="button" onClick={() => { setNotice(null); setCreateOpen(true); }} className="pressable flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:brightness-110" data-testid="button-create-order"><ClipboardPlus size={18} /> Nueva orden</button>
        </div>
        {notice && <div className="mb-6 flex items-center gap-3 rounded-lg border border-[#a9c9b1] bg-[#eaf4eb] px-4 py-3 text-sm font-medium text-[#27613d]" role="status" data-testid="status-production-success"><span className="h-2 w-2 rounded-full bg-[#4c9a71]" />{notice}<button type="button" className="ml-auto text-xs uppercase tracking-wider underline" onClick={() => setNotice(null)} data-testid="button-dismiss-production-notice">Cerrar</button></div>}
        {ordersQuery.isLoading && <OrderSkeleton />}
        {ordersQuery.isError && !ordersQuery.isLoading && <div className="flex flex-col items-start gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-6" role="alert" data-testid="error-orders"><div className="flex items-center gap-3 text-destructive"><TriangleAlert size={21} /><p className="font-semibold">No se pudieron cargar las órdenes</p></div><button type="button" onClick={() => ordersQuery.refetch()} className="pressable flex min-h-11 items-center gap-2 rounded-lg bg-destructive px-4 text-sm font-semibold text-destructive-foreground" data-testid="button-retry-orders"><RefreshCw size={16} /> Reintentar</button></div>}
        {!ordersQuery.isLoading && !ordersQuery.isError && (orders.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-card/60 px-6 py-16 text-center" data-testid="empty-active-orders"><Factory className="mx-auto text-muted-foreground" size={32} /><h2 className="mt-3 font-display text-3xl uppercase">Sin órdenes activas</h2><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Cuando entre una nueva necesidad de fabricación, créala aquí para que el carretillero pueda asignar sus bobinas.</p><button type="button" onClick={() => setCreateOpen(true)} className="pressable mt-6 min-h-12 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground" data-testid="button-create-first-order">Crear primera orden</button></div> : <div className="space-y-3" data-testid="list-active-orders">{orders.map((order, index) => <OrderCard key={order.id} order={order} index={index} onDelete={() => setDeleteTarget(order)} />)}</div>)}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} onSubmit={onCreate} eyebrow="Plan de fabricación" title="Nueva orden" submitLabel={createOrder.isPending ? 'Creando…' : 'Crear orden'} submitDisabled={createOrder.isPending}>
        {createOrder.isError && <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert" data-testid="error-create-order">No se pudo crear la orden. Revisa los datos.</p>}
        <div className="grid gap-5 sm:grid-cols-2"><Field label="Ancho" hint="mm"><input name="ancho" type="number" min="1" required className={inputClass} placeholder="Ej. 1250" data-testid="input-order-width" /></Field><Field label="Micras"><input name="micras" type="number" min="1" required className={inputClass} placeholder="Ej. 23" data-testid="input-order-microns" /></Field><Field label="Camisa"><select name="camisa" required className={inputClass} defaultValue="" data-testid="select-order-sleeve"><option value="" disabled>Selecciona</option>{CAMISAS.map((camisa) => <option key={camisa} value={camisa}>{camisa}</option>)}</select></Field><Field label="Material"><select name="material" required className={inputClass} defaultValue="" data-testid="select-order-material"><option value="" disabled>Selecciona</option>{MATERIALES.map((material) => <option key={material} value={material}>{material}</option>)}</select></Field><div className="sm:col-span-2"><Field label="Metros necesarios" hint="cantidad positiva"><input name="metrosNecesarios" type="number" min="1" step="1" required className={inputClass} placeholder="Ej. 12.500" data-testid="input-order-meters" /></Field></div></div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onSubmit={(event) => { event.preventDefault(); onDelete(); }} eyebrow="Acción irreversible" title="Eliminar orden" submitLabel={deleteOrder.isPending ? 'Eliminando…' : 'Eliminar orden'} submitDisabled={deleteOrder.isPending} destructive>
        {deleteTarget && <div><div className="rounded-lg border border-border bg-muted/50 p-4"><p className="font-data text-[10px] uppercase tracking-[.14em] text-muted-foreground">Orden #{deleteTarget.id}</p><p className="mt-2 font-semibold">{deleteTarget.ancho} mm · {deleteTarget.micras} µ · {deleteTarget.material}</p><p className="mt-2 text-sm text-muted-foreground">{formatMeters(deleteTarget.metrosPendientes)} m pendientes de fabricar</p></div><p className="mt-5 text-sm leading-relaxed text-muted-foreground">Se eliminará esta orden activa. El material ya registrado no se modifica.</p>{deleteOrder.isError && <p className="mt-3 text-sm text-destructive" role="alert" data-testid="error-delete-order">No se pudo eliminar la orden.</p>}</div>}
      </Modal>
    </div>
  );
}

function OrderCard({ order, index, onDelete }: { order: ProductionOrder; index: number; onDelete: () => void }) {
  const progress = order.metrosNecesarios > 0 ? Math.min(100, (order.metrosFabricados / order.metrosNecesarios) * 100) : 0;
  return <article className="load-in rounded-xl border border-border bg-card p-5 sm:p-6" style={{ animationDelay: `${index * 55}ms` }} data-testid={`card-order-${order.id}`}>
    <div className="flex flex-col gap-5 xl:flex-row xl:items-center">
      <div className="min-w-0 flex-1"><div className="flex items-center gap-3"><span className="rounded-md bg-primary px-2.5 py-1 font-data text-[11px] font-semibold text-primary-foreground" data-testid={`text-order-id-${order.id}`}>ORD-{String(order.id).padStart(4, '0')}</span><span className="flex items-center gap-1.5 font-data text-[10px] uppercase tracking-wider text-[#3c7d52]"><span className="h-1.5 w-1.5 rounded-full bg-[#4c9a71]" /> {order.estado}</span></div><h2 className="mt-4 font-display text-[2.35rem] font-semibold leading-none">{order.ancho} <span className="text-xl font-medium text-muted-foreground">mm</span><span className="mx-2 text-muted-foreground/40">/</span>{order.micras} <span className="text-xl font-medium text-muted-foreground">µ</span></h2><p className="mt-2 text-sm text-muted-foreground">Camisa <strong className="text-foreground">{order.camisa}</strong> <span className="mx-1.5 text-muted-foreground/40">·</span> {order.material}</p></div>
      <div className="grid grid-cols-3 gap-3 border-y border-border py-4 xl:min-w-[410px] xl:border-y-0 xl:border-l xl:py-0 xl:pl-7"><div><p className="text-[11px] text-muted-foreground">Necesarios</p><p className="mt-1 font-data text-xl font-semibold">{formatMeters(order.metrosNecesarios)} <span className="text-xs font-normal text-muted-foreground">m</span></p></div><div><p className="text-[11px] text-muted-foreground">Fabricados</p><p className="mt-1 font-data text-xl font-semibold text-primary">{formatMeters(order.metrosFabricados)} <span className="text-xs font-normal text-muted-foreground">m</span></p></div><div><p className="text-[11px] text-muted-foreground">Pendientes</p><p className="mt-1 font-data text-xl font-semibold text-accent-foreground">{formatMeters(order.metrosPendientes)} <span className="text-xs font-normal text-muted-foreground">m</span></p></div></div>
      <div className="xl:w-[190px]"><div className="flex justify-between text-[11px] text-muted-foreground"><span>Avance</span><span className="font-data font-semibold text-foreground">{Math.round(progress)}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-[11px] text-muted-foreground">Creada {formatDate(order.creadoEn)}</p></div>
      <button type="button" onClick={onDelete} className="pressable flex min-h-11 items-center justify-center gap-2 rounded-lg border border-destructive/25 px-3 text-xs font-semibold text-destructive hover:bg-destructive/5 xl:w-[130px]" data-testid={`button-delete-order-${order.id}`}><Trash2 size={16} /> Eliminar</button>
    </div>
  </article>;
}

export default Production;