import { Package, PackageOpen, RefreshCw, TriangleAlert } from 'lucide-react';
import { useListInventory, type Coil } from '@workspace/api-client-react';
import { characteristicsLabel, formatDate, formatMeters, formatPedidosSummary } from '@/lib/domain';

function Material() {
  const inventory = useListInventory();
  const items = inventory.data?.items ?? [];
  return (
    <div className="industrial-grid min-h-[calc(100dvh-72px)]">
      <div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
        <div className="load-in mb-9 flex items-end justify-between gap-4">
          <div><p className="font-data text-[10px] font-semibold uppercase tracking-[.2em] text-primary">Módulo 02 / material</p><h1 className="mt-2 font-display text-[clamp(2.7rem,6vw,4.7rem)] font-semibold uppercase leading-[.88] tracking-wide">Material disponible</h1><p className="mt-3 max-w-xl text-sm text-muted-foreground">Consulta detallada de todas las unidades que permanecen disponibles en el almacén.</p></div>
          <span className="font-data text-[11px] font-semibold uppercase tracking-[.15em] text-muted-foreground">{items.length} unidades</span>
        </div>
        {inventory.isLoading && <div className="space-y-3"><div className="h-20 animate-pulse rounded-xl bg-muted" /><div className="h-20 animate-pulse rounded-xl bg-muted" /></div>}
        {inventory.isError && !inventory.isLoading && <div className="flex flex-col items-start gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-6" role="alert"><div className="flex items-center gap-3 text-destructive"><TriangleAlert size={21} /><p className="font-semibold">No se pudo cargar el material</p></div><button type="button" onClick={() => inventory.refetch()} className="pressable flex min-h-11 items-center gap-2 rounded-lg bg-destructive px-4 text-sm font-semibold text-destructive-foreground"><RefreshCw size={16} /> Reintentar</button></div>}
        {!inventory.isLoading && !inventory.isError && (items.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-card/60 px-6 py-16 text-center"><PackageOpen className="mx-auto text-muted-foreground" size={32} /><h2 className="mt-3 font-display text-3xl uppercase">Sin material disponible</h2><p className="mt-1 text-sm text-muted-foreground">Las bobinas y restos disponibles aparecen aquí.</p></div> : <div className="overflow-hidden rounded-xl border border-border bg-card">{items.map((item) => <MaterialRow key={item.id} item={item} />)}</div>)}
      </div>
    </div>
  );
}

function MaterialRow({ item }: { item: Coil }) {
  const itemPedidos = item.pedidosRelacionados ?? [];
  return (
    <div className="grid gap-3 border-b border-border px-4 py-4 last:border-b-0 md:grid-cols-[1.5fr_.6fr_.65fr_1fr] md:items-center md:gap-5 md:px-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{characteristicsLabel(item)}</p>
          {item.ordenId && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 font-data text-[10px] font-semibold text-primary">
              ORD-{String(item.ordenId).padStart(4, '0')}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Entrada registrada {formatDate(item.creadoEn)}</p>
        {itemPedidos.length > 0 ? (
          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-primary">
            <Package size={13} className="shrink-0" />
            {formatPedidosSummary(itemPedidos)}
          </p>
        ) : (
          <p className="mt-0.5 font-data text-[10px] text-muted-foreground">Sin pedido / Resto</p>
        )}
      </div>
      <span className={`w-fit rounded-md px-2 py-1 font-data text-[10px] font-semibold ${item.tipo === 'RESTO' ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-foreground'}`}>{item.tipo}</span>
      <p className="font-data text-xl font-semibold">{formatMeters(item.metros)} <span className="text-xs font-normal text-muted-foreground">m</span></p>
      <span className="font-data text-[10px] uppercase tracking-wider text-[#3c7d52]">{item.estado}</span>
    </div>
  );
}

export default Material;