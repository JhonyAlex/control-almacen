import { type FormEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';

type ModalProps = {
  open: boolean;
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  destructive?: boolean;
};

export function Modal({
  open,
  title,
  eyebrow,
  onClose,
  children,
  onSubmit,
  submitLabel,
  submitDisabled,
  destructive,
}: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[hsl(var(--foreground)/.45)] p-0 backdrop-blur-[2px] sm:items-center sm:p-5" role="presentation">
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card shadow-2xl sm:max-w-xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-start justify-between border-b border-border px-5 py-4 sm:px-7">
          <div>
            {eyebrow && <p className="mb-1 font-data text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">{eyebrow}</p>}
            <h2 className="font-display text-3xl font-semibold uppercase leading-none tracking-wide text-foreground">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="pressable flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" data-testid="button-close-modal" aria-label="Cerrar">
            <X size={22} strokeWidth={2.2} />
          </button>
        </div>
        {onSubmit ? (
          <form onSubmit={onSubmit}>
            <div className="px-5 py-5 sm:px-7">{children}</div>
            <div className="flex gap-3 border-t border-border bg-muted/40 px-5 py-4 sm:justify-end sm:px-7">
              <button type="button" onClick={onClose} className="pressable min-h-12 flex-1 rounded-lg border border-border bg-card px-5 font-semibold text-foreground hover:bg-muted sm:flex-none" data-testid="button-cancel-modal">Cancelar</button>
              <button type="submit" disabled={submitDisabled} className={`pressable min-h-12 flex-1 rounded-lg px-6 font-semibold disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none ${destructive ? 'bg-destructive text-destructive-foreground hover:brightness-110' : 'bg-primary text-primary-foreground hover:brightness-110'}`} data-testid="button-submit-modal">
                {submitLabel ?? 'Guardar'}
              </button>
            </div>
          </form>
        ) : children}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between gap-2 text-xs font-semibold uppercase tracking-[.1em] text-muted-foreground">
        {label}
        {hint && <span className="font-normal normal-case tracking-normal text-muted-foreground/80">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export const inputClass = "min-h-12 w-full rounded-lg border border-input bg-card px-3.5 text-base text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/25";