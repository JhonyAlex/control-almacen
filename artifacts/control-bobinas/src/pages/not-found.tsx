import { AlertCircle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="industrial-grid flex min-h-[calc(100dvh-72px)] w-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-7">
        <div className="flex items-center gap-3 text-destructive"><AlertCircle size={28} /><h1 className="font-display text-3xl font-semibold uppercase">Ruta no encontrada</h1></div>
        <p className="mt-4 text-sm text-muted-foreground">La pantalla solicitada no existe en Control de bobinas.</p>
      </div>
    </div>
  );
}
