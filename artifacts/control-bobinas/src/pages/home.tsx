import { type FormEvent, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, CirclePlus, Factory, Layers3, Package, PackageCheck, RefreshCw, Send, TriangleAlert, ChevronDown } from 'lucide-react';
import {
  CoilTipo,
  getListInventoryQueryKey,
  getListOrdersQueryKey,
  OrderStatus,
  useAddManufacturedCoil,
  useAddProductionRemnant,
  useConsumeInventoryItem,
  useListInventory,
  useListOrders,
  type Coil,
} from '@workspace/api-client-react';
import { Field, inputClass, Modal } from '@/components/modal';
import { characteristicsLabel, CAMISAS, formatMeters, formatPedidosSummary, groupInventory, MATERIALES, parseCamisa } from '@/lib/domain';

function LoadingState() {
  return <div className="space-y-3" aria-label="Cargando inventario" data-testid="loading-inventory"><div className="h-24 animate-pulse rounded-xl bg-muted" /><div className="grid gap-3 sm:grid-cols-2"><div className="h-36 animate-pulse rounded-xl bg-muted" /><div className="h-36 animate-pulse rounded-xl bg-muted" /></div></div>;
}

function QueryError({ onRetry }: { onRetry: () => void }) {
  return <div className="flex flex-col items-start gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-6" role="alert" data-testid="error-inventory"><div className="flex items-center gap-3 text-destructive"><TriangleAlert size={21} /><p className="font-semibold">No se pudo cargar el almacén</p></div><p className="text-sm text-muted-foreground">Comprueba la conexión y vuelve a intentarlo.</p><button type="button" onClick={onRetry} className="pressable flex min-h-11 items-center gap-2 rounded-lg bg-destructive px-4 text-sm font-semibold text-destructive-foreground" data-testid="button-retry-inventory"><RefreshCw size={16} /> Reintentar</button></div>;
}

function Home({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const inventoryQuery = useListInventory();
  const ordersQuery = useListOrders({ status: OrderStatus.ACTIVA });
  const addManufactured = useAddManufacturedCoil();
  const addRemnant = useAddProductionRemnant();
  const consume = useConsumeInventoryItem();
  const [modal, setModal] = useState<'manufactured' | 'remnant' | null>(null);
  const [pendingConsume, setPendingConsume] = useState<Coil | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const items = inventoryQuery.data?.items ?? [];
  const groups = useMemo(() => groupInventory(items), [items]);
  const activeOrders = ordersQuery.data ?? [];

  const refreshInventory = () => inventoryQuery.refetch();
  const invalidateInventory = () => {
    queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey({ status: OrderStatus.ACTIVA }) });
  };

  const handleManufactured = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    addManufactured.mutate({ data: { ordenId: Number(form.get('ordenId')), metros: Number(form.get('metros')) } }, {
      onSuccess: () => { invalidateInventory(); setModal(null); setNotice('Bobina fabricada incorporada al almacén.'); },
    });
  };

  const handleRemnant = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    addRemnant.mutate({
      data: {
        metros: Number(form.get('metros')),
        ancho: Number(form.get('ancho')),
        micras: Number(form.get('micras')),
        camisa: parseCamisa(String(form.get('camisa'))),
        material: String(form.get('material')) as typeof MATERIALES[number],
      },
    }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() }); setModal(null); setNotice('Resto añadido al almacén.'); },
    });
  };

  const handleConsume = () => {
    if (!pendingConsume) return;
    consume.mutate({ id: pendingConsume.id }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() }); setPendingConsume(null); setNotice('Material enviado a fábrica.'); },
    });
  };

  return (
    <div className="industrial-grid min-h-[calc(100dvh-72px)]">
      <div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
        <div className="load-in mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="font-data text-[10px] font-semibold uppercase tracking-[.2em] text-primary">Módulo 01 / almacén</p>
            <h1 className="mt-2 font-display text-[clamp(2.7rem,6vw,4.7rem)] font-semibold uppercase leading-[.88] tracking-wide text-foreground">Estado de stock</h1>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground">Material disponible para expedición a fábrica.{canManage ? ' Registra entradas y mueve bobinas con una sola acción.' : ' Registra entradas de bobina fabricada y restos.'}</p>
          </div>
          <div className="flex gap-2.5">
            <button type="button" onClick={() => { setNotice(null); setModal('remnant'); }} className="pressable flex min-h-12 items-center justify-center gap-2 rounded-lg border border-primary/25 bg-card px-4 text-sm font-semibold text-primary hover:bg-muted sm:px-5" data-testid="button-add-remnant"><CirclePlus size={18} /> Añadir resto</button>
            <button type="button" onClick={() => { setNotice(null); setModal('manufactured'); }} className="pressable flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-110 sm:px-5" data-testid="button-add-manufactured"><Factory size={18} /> Bobina fabricada</button>
          </div>
        </div>

        {notice && <div className="mb-6 flex items-center gap-3 rounded-lg border border-[#a9c9b1] bg-[#eaf4eb] px-4 py-3 text-sm font-medium text-[#27613d]" role="status" data-testid="status-inventory-success"><Check size={18} /> {notice}<button type="button" className="ml-auto text-xs uppercase tracking-wider underline" onClick={() => setNotice(null)} data-testid="button-dismiss-notice">Cerrar</button></div>}
        {(inventoryQuery.isLoading || ordersQuery.isLoading) && <LoadingState />}
        {inventoryQuery.isError && !inventoryQuery.isLoading && <QueryError onRetry={refreshInventory} />}
        {!inventoryQuery.isLoading && !inventoryQuery.isError && (
          <>
            <section className="load-in-delay">
              <div className="relative overflow-hidden rounded-xl bg-primary p-6 text-primary-foreground shadow-lg sm:p-8">
                <div className="absolute right-[-28px] top-[-42px] h-48 w-48 rounded-full border-[22px] border-primary-foreground/10" />
                <div className="absolute bottom-[-80px] right-[90px] h-56 w-56 rounded-full border-[1px] border-primary-foreground/10" />
                <div className="relative">
                  <div className="flex items-center justify-between"><p className="font-data text-[10px] font-semibold uppercase tracking-[.2em] text-primary-foreground/65">Total en almacén</p><Layers3 size={21} className="text-accent" /></div>
                  <div className="mt-6 flex items-end gap-3"><span className="font-display text-[clamp(4rem,10vw,7.8rem)] font-semibold leading-[.72] tracking-tight" data-testid="text-total-meters">{formatMeters(inventoryQuery.data?.totalMetros ?? 0)}</span><span className="mb-1.5 font-display text-3xl uppercase text-primary-foreground/70">metros</span></div>
                  <div className="mt-8 flex items-center gap-2 border-t border-primary-foreground/15 pt-4 text-xs text-primary-foreground/70"><PackageCheck size={16} /> {items.length} unidades registradas <span className="ml-auto font-data text-[10px] uppercase tracking-wider">Actualizado ahora</span></div>
                </div>
              </div>
            </section>

            <section className="mt-10">
              <div className="mb-4 flex items-end justify-between"><div><p className="font-data text-[10px] font-semibold uppercase tracking-[.2em] text-muted-foreground">Agrupación por características</p><h2 className="mt-1 font-display text-3xl font-semibold uppercase tracking-wide">Bobinas en almacén</h2></div><span className="hidden font-data text-[10px] uppercase tracking-wider text-muted-foreground sm:block">Ancho / micras / camisa / material</span></div>
              {groups.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card/60 px-6 py-14 text-center" data-testid="empty-inventory"><PackageCheck className="mx-auto text-muted-foreground" size={30} /><h3 className="mt-3 font-display text-2xl uppercase">Almacén vacío</h3><p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Añade una bobina fabricada o registra un resto para empezar.</p></div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {groups.map((group) => (
                    <details key={`${group.ancho}-${group.micras}-${group.camisa}-${group.material}`} className="group rounded-xl border border-border bg-card transition open:border-primary/40" data-testid={`card-inventory-group-${group.id}`}>
                      <summary className="flex min-h-[116px] cursor-pointer list-none items-center justify-between gap-4 p-5 [&::-webkit-details-marker]:hidden"><div><span className="font-data text-[10px] font-semibold uppercase tracking-[.12em] text-primary">{group.material}</span><h3 className="mt-2 font-display text-3xl font-semibold leading-none">{group.ancho} <span className="text-base font-medium text-muted-foreground">mm</span><span className="mx-2 text-muted-foreground/40">·</span>{group.micras} <span className="text-base font-medium text-muted-foreground">µ</span></h3><p className="mt-2 text-xs text-muted-foreground">Camisa {group.camisa} · {group.count} {group.count === 1 ? 'unidad' : 'unidades'} · {formatMeters(group.total)} m</p></div><ChevronDown size={22} className="shrink-0 text-muted-foreground transition group-open:rotate-180" /></summary>
                      <div className="border-t border-border px-5 pb-4">
                        {group.items.map((item) => {
                          const itemPedidos = item.pedidosRelacionados ?? [];
                          return (
                            <div key={item.id} className="flex flex-col gap-3 border-b border-border py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold">
                                    {item.tipo === CoilTipo.RESTO ? 'RESTO' : 'Bobina'} <span className="font-data font-normal">{formatMeters(item.metros)} m</span>
                                  </p>
                                  {item.ordenId && (
                                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-data text-[10px] font-semibold text-primary">
                                      ORD-{String(item.ordenId).padStart(4, '0')}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">Entrada {new Date(item.creadoEn).toLocaleDateString('es-ES')}</p>
                                {itemPedidos.length > 0 ? (
                                  <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-primary">
                                    <Package size={13} className="shrink-0" />
                                    {formatPedidosSummary(itemPedidos)}
                                  </p>
                                ) : (
                                  <p className="mt-0.5 font-data text-[10px] text-muted-foreground">Sin pedido asociado</p>
                                )}
                              </div>
                              {canManage && <button type="button" onClick={() => setPendingConsume(item)} className="pressable flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground" data-testid={`button-group-consume-${item.id}`}><Send size={15} /> Enviar a fábrica</button>}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-10 pb-5">
              <div className="mb-4 flex items-end justify-between"><div><p className="font-data text-[10px] font-semibold uppercase tracking-[.2em] text-muted-foreground">Unidades</p><h2 className="mt-1 font-display text-3xl font-semibold uppercase tracking-wide">Lista para mover</h2></div><span className="font-data text-[10px] uppercase tracking-wider text-muted-foreground">{items.length} registros</span></div>
              {items.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-card/60 px-6 py-10 text-center text-sm text-muted-foreground" data-testid="empty-inventory-list">No hay unidades disponibles.</div> : <div className="overflow-hidden rounded-xl border border-border bg-card"><div className={`hidden gap-4 border-b border-border bg-muted/55 px-5 py-3 font-data text-[10px] font-semibold uppercase tracking-[.13em] text-muted-foreground md:grid ${canManage ? 'md:grid-cols-[1.4fr_.65fr_.7fr_.6fr_150px]' : 'md:grid-cols-[1.4fr_.65fr_.7fr_.6fr]'}`}><span>Identificación / Pedido</span><span>Tipo</span><span>Metros</span><span>Estado</span>{canManage && <span />}</div>{items.map((item) => {
                const itemPedidos = item.pedidosRelacionados ?? [];
                return (
                  <div key={item.id} className={`grid gap-3 border-b border-border px-4 py-4 last:border-b-0 md:items-center md:gap-4 md:px-5 ${canManage ? 'md:grid-cols-[1.4fr_.65fr_.7fr_.6fr_150px]' : 'md:grid-cols-[1.4fr_.65fr_.7fr_.6fr]'}`}>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground" data-testid={`text-inventory-item-${item.id}`}>{item.ancho} mm · {item.micras} µ</p>
                        {item.ordenId && (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-data text-[10px] font-semibold text-primary">
                            ORD-{String(item.ordenId).padStart(4, '0')}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Camisa {item.camisa} · {item.material}</p>
                      {itemPedidos.length > 0 ? (
                        <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-primary">
                          <Package size={13} className="shrink-0" />
                          {formatPedidosSummary(itemPedidos)}
                        </p>
                      ) : (
                        <p className="mt-0.5 font-data text-[10px] text-muted-foreground">Sin pedido asociado</p>
                      )}
                    </div>
                    <span className="w-fit rounded-md bg-muted px-2 py-1 font-data text-[10px] font-semibold">{item.tipo}</span>
                    <p className="font-data text-lg font-semibold">{formatMeters(item.metros)} <span className="text-xs font-normal text-muted-foreground">m</span></p>
                    <span className="flex items-center gap-1.5 text-xs font-medium text-[#3c7d52]"><span className="h-1.5 w-1.5 rounded-full bg-[#4c9a71]" />{item.estado}</span>
                    {canManage && <button type="button" onClick={() => setPendingConsume(item)} className="pressable flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary/25 px-3 text-xs font-semibold text-primary hover:bg-muted" data-testid={`button-consume-${item.id}`}><Send size={15} /> Enviar a fábrica</button>}
                  </div>
                );
              })}</div>}
            </section>
          </>
        )}
      </div>

      <Modal open={modal === 'manufactured'} onClose={() => setModal(null)} onSubmit={handleManufactured} eyebrow="Entrada de almacén" title="Bobina fabricada" submitLabel={addManufactured.isPending ? 'Registrando…' : 'Registrar bobina'} submitDisabled={addManufactured.isPending || activeOrders.length === 0}>
        {addManufactured.isError && <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert" data-testid="error-add-manufactured">No se pudo registrar la bobina. Revisa los datos.</p>}
        {activeOrders.length === 0 ? <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center"><AlertTriangle className="mx-auto text-accent" size={25} /><p className="mt-2 text-sm font-medium">No hay órdenes activas</p><p className="mt-1 text-xs text-muted-foreground">Crea una orden en Producción antes de registrar fabricación.</p></div> : <div className="space-y-5"><Field label="Orden de producción"><select name="ordenId" required className={inputClass} defaultValue="" data-testid="select-manufactured-order"><option value="" disabled>Selecciona una orden</option>{activeOrders.map((order) => {
          const pedidosText = order.pedidosRelacionados && order.pedidosRelacionados.length > 0 ? ` [${formatPedidosSummary(order.pedidosRelacionados)}]` : '';
          return <option key={order.id} value={order.id}>#{order.id}{pedidosText} · {order.ancho} mm · {order.micras} µ · pendientes {formatMeters(order.metrosPendientes)} m</option>;
        })}</select></Field><Field label="Metros fabricados" hint="cantidad positiva"><input name="metros" type="number" min="1" step="1" required className={inputClass} placeholder="Ej. 1.250" data-testid="input-manufactured-meters" /></Field></div>}
      </Modal>

      <Modal open={modal === 'remnant'} onClose={() => setModal(null)} onSubmit={handleRemnant} eyebrow="Entrada de almacén" title="Añadir resto" submitLabel={addRemnant.isPending ? 'Guardando…' : 'Guardar resto'} submitDisabled={addRemnant.isPending}>
        {addRemnant.isError && <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert" data-testid="error-add-remnant">No se pudo guardar el resto. Revisa los datos.</p>}
        <div className="grid gap-5 sm:grid-cols-2"><Field label="Ancho" hint="mm"><input name="ancho" type="number" min="1" required className={inputClass} placeholder="Ej. 1250" data-testid="input-remnant-width" /></Field><Field label="Micras"><input name="micras" type="number" min="1" required className={inputClass} placeholder="Ej. 23" data-testid="input-remnant-microns" /></Field><Field label="Camisa"><select name="camisa" required className={inputClass} defaultValue="" data-testid="select-remnant-sleeve"><option value="" disabled>Selecciona</option>{CAMISAS.map((camisa) => <option key={camisa} value={camisa}>{camisa}</option>)}</select></Field><Field label="Material"><select name="material" required className={inputClass} defaultValue="" data-testid="select-remnant-material"><option value="" disabled>Selecciona</option>{MATERIALES.map((material) => <option key={material} value={material}>{material}</option>)}</select></Field><div className="sm:col-span-2"><Field label="Metros del resto" hint="cantidad positiva"><input name="metros" type="number" min="1" step="1" required className={inputClass} placeholder="Ej. 840" data-testid="input-remnant-meters" /></Field></div></div>
      </Modal>

      {canManage && (
        <Modal open={!!pendingConsume} onClose={() => setPendingConsume(null)} title="Enviar a fábrica" eyebrow="Confirmar movimiento" submitLabel={consume.isPending ? 'Moviendo…' : 'Confirmar envío'} submitDisabled={consume.isPending} destructive onSubmit={(event) => { event.preventDefault(); handleConsume(); }}>
          {pendingConsume && <div><div className="rounded-lg border border-border bg-muted/50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-data text-[10px] uppercase tracking-[.14em] text-muted-foreground">{pendingConsume.ordenId ? `Orden ORD-${String(pendingConsume.ordenId).padStart(4, '0')}` : 'Resto de almacén'}</p>{pendingConsume.pedidosRelacionados && pendingConsume.pedidosRelacionados.length > 0 && <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{formatPedidosSummary(pendingConsume.pedidosRelacionados)}</span>}</div><p className="mt-2 font-semibold">{characteristicsLabel(pendingConsume)}</p><p className="mt-3 font-data text-3xl font-semibold">{formatMeters(pendingConsume.metros)} <span className="text-sm font-normal text-muted-foreground">metros</span></p></div><p className="mt-5 flex gap-2 text-sm leading-relaxed text-muted-foreground"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-accent" /> Esta acción marcará el material como <strong className="text-foreground">EN FÁBRICA</strong>. Comprueba la unidad antes de continuar.</p>{consume.isError && <p className="mt-4 text-sm text-destructive" role="alert" data-testid="error-consume">No se pudo mover la unidad. Inténtalo de nuevo.</p>}</div>}
        </Modal>
      )}
    </div>
  );
}

export default Home;
