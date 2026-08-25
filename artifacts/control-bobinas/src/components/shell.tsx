import { type ReactNode } from 'react';
import { Boxes, ClipboardList, History, Warehouse, Activity, Layers3 } from 'lucide-react';
import { getReadinessCheckQueryKey, useReadinessCheck } from '@workspace/api-client-react';
import { Link, useLocation } from 'wouter';

const navItems = [
  { href: '/', label: 'Almacén', short: 'Stock', icon: Warehouse },
  { href: '/material', label: 'Material', short: 'Material', icon: Layers3 },
  { href: '/produccion', label: 'Producción', short: 'Órdenes', icon: ClipboardList },
  { href: '/finalizadas', label: 'Finalizadas', short: 'Historial', icon: History },
];

export function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const readiness = useReadinessCheck({
    query: {
      queryKey: getReadinessCheckQueryKey(),
      refetchInterval: 30_000,
      retry: 1,
    },
  });
  const connectionLabel = readiness.isPending
    ? 'Comprobando'
    : readiness.isError
      ? 'Sin conexión'
      : 'Conectado';
  const connectionColor = readiness.isError ? 'bg-destructive' : 'bg-[#4c9a71]';
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-[92px] items-center border-b border-sidebar-border px-7">
          <Link href="/" className="flex items-center gap-3" data-testid="link-brand">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><Boxes size={23} strokeWidth={2.5} /></span>
            <span>
              <span className="block font-display text-[25px] font-semibold uppercase leading-none tracking-wide">Control</span>
              <span className="mt-0.5 block font-data text-[10px] font-semibold uppercase tracking-[.22em] text-sidebar-foreground/55">de bobinas</span>
            </span>
          </Link>
        </div>
        <div className="px-5 pt-8">
          <p className="px-3 font-data text-[10px] font-semibold uppercase tracking-[.18em] text-sidebar-foreground/40">Navegación</p>
          <nav className="mt-3 space-y-1.5">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = location === href;
              return (
                <Link key={href} href={href} className={`group flex min-h-14 items-center gap-3 rounded-lg px-3.5 text-sm font-semibold transition ${active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`} data-testid={`link-nav-${label.toLowerCase()}`}>
                  <Icon size={20} className={active ? 'text-sidebar-primary' : 'text-sidebar-foreground/45'} />
                  <span>{label}</span>
                  {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary" />}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="mt-auto p-5">
          <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/45 p-4">
            <div className="flex items-center gap-2 text-sidebar-primary"><Activity size={15} /><span className="font-data text-[10px] font-semibold uppercase tracking-[.15em]">Sistema operativo</span></div>
            <p className="mt-2 text-xs leading-relaxed text-sidebar-foreground/55">Lectura de inventario en tiempo real</p>
          </div>
          <p className="mt-5 px-1 font-data text-[10px] text-sidebar-foreground/30">PLANTA 01</p>
        </div>
      </aside>

      <header className="flex h-[72px] items-center justify-between border-b border-border bg-card px-4 md:ml-[248px] md:h-[92px] md:px-10">
        <div className="md:hidden">
          <Link href="/" className="flex items-center gap-2.5" data-testid="link-mobile-brand">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground"><Boxes size={20} /></span>
            <span className="font-display text-2xl font-semibold uppercase tracking-wide">Control de bobinas</span>
          </Link>
        </div>
        <div className="ml-auto flex items-center gap-3"><span className={`h-2 w-2 rounded-full ${connectionColor}`} /><span className="font-data text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{connectionLabel}</span></div>
      </header>

      <main className="pb-24 md:ml-[248px] md:pb-0">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid h-[76px] grid-cols-4 border-t border-border bg-card/95 backdrop-blur md:hidden">
        {navItems.map(({ href, short, icon: Icon }) => {
          const active = location === href;
          return <Link key={href} href={href} className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${active ? 'text-primary' : 'text-muted-foreground'}`} data-testid={`link-mobile-nav-${short.toLowerCase()}`}><Icon size={21} /><span>{short}</span></Link>;
        })}
      </nav>
    </div>
  );
}
