import { type FormEvent, type KeyboardEvent, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Loader2, X } from 'lucide-react';
import {
  CoilStatus,
  getListInventoryQueryKey,
  useUpdateCoil,
  type Coil,
} from '@workspace/api-client-react';
import { MaterialChip } from '@/components/material-chip';
import { inputClass } from '@/components/modal';
import { formatMeters } from '@/lib/domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isCoilEditable = (coil: Coil, canManage: boolean) =>
  canManage &&
  coil.estado === CoilStatus.DISPONIBLE &&
  !coil.asignacion;

const extractApiError = (mutationError: unknown, fallback: string) => {
  const apiMessage =
    (mutationError as { data?: { error?: string } })?.data?.error ?? null;
  return apiMessage ?? fallback;
};

// ---------------------------------------------------------------------------
// CoilMaterialEditor
// ---------------------------------------------------------------------------

export type CoilMaterialEditorProps = {
  coil: Coil;
  /** Known materials offered as suggestions (free text still allowed). */
  materials: string[];
  canManage?: boolean;
  onSaved?: (message: string) => void;
};

const materialDatalistId = (coilId: number) => `coil-material-options-${coilId}`;

/**
 * Inline editor for the material of ONE physical coil.
 * Activated by touching/clicking directly on the material chip (no pencil icon).
 * Offers suggestions from known materials via datalist without restriction.
 */
export function CoilMaterialEditor({
  coil,
  materials,
  canManage = true,
  onSaved,
}: CoilMaterialEditorProps) {
  const queryClient = useQueryClient();
  const updateCoil = useUpdateCoil();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(coil.material);
  const [error, setError] = useState<string | null>(null);

  const editable = isCoilEditable(coil, canManage);

  const startEditing = () => {
    setValue(coil.material);
    setError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setValue(coil.material);
    setError(null);
  };

  const save = (event: FormEvent<HTMLFormElement> | KeyboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    if (updateCoil.isPending) return;
    const trimmed = value.trim();
    if (!trimmed) {
      setError('El material no puede estar vacío.');
      return;
    }
    setError(null);
    updateCoil.mutate(
      { id: coil.id, data: { material: trimmed } },
      {
        onSuccess: (updated) => {
          setEditing(false);
          setValue(updated.material);
          queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
          onSaved?.(
            `Material de la bobina #${coil.id} actualizado a ${updated.material}. El grupo se ha actualizado.`,
          );
        },
        onError: (mutationError) => {
          setError(
            extractApiError(mutationError, 'No se pudo guardar el material. Inténtalo de nuevo.'),
          );
        },
      },
    );
  };

  if (!editing) {
    if (!editable) {
      return <MaterialChip material={coil.material} size="sm" />;
    }
    return (
      <button
        type="button"
        onClick={startEditing}
        className="pressable group/edit cursor-pointer rounded-full transition focus:outline-none focus:ring-2 focus:ring-ring"
        title="Tocar para editar material de esta bobina"
        data-testid={`button-edit-material-${coil.id}`}
      >
        <MaterialChip
          material={coil.material}
          size="sm"
          className="transition group-hover/edit:ring-1 group-hover/edit:ring-primary/40"
        />
      </button>
    );
  }

  return (
    <form
      onSubmit={save}
      className="w-full max-w-64"
      data-testid={`form-edit-material-${coil.id}`}
    >
      <div className="flex items-center gap-1.5">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              cancelEditing();
            }
          }}
          list={materialDatalistId(coil.id)}
          autoFocus
          disabled={updateCoil.isPending}
          className={`${inputClass} min-h-8 px-2 py-1 text-xs`}
          aria-label="Material de la bobina"
          data-testid={`input-edit-material-${coil.id}`}
        />
        <datalist id={materialDatalistId(coil.id)}>
          {materials.map((material) => (
            <option key={material} value={material} />
          ))}
        </datalist>
        <button
          type="submit"
          disabled={updateCoil.isPending}
          className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
          aria-label="Guardar material"
          data-testid={`button-save-material-${coil.id}`}
        >
          {updateCoil.isPending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Check size={14} />
          )}
        </button>
        <button
          type="button"
          onClick={cancelEditing}
          disabled={updateCoil.isPending}
          className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          aria-label="Cancelar edición de material"
          data-testid={`button-cancel-material-${coil.id}`}
        >
          <X size={13} />
        </button>
      </div>
      {error && (
        <p
          className="mt-1 flex items-start gap-1 text-xs font-medium text-destructive"
          role="alert"
          data-testid={`error-edit-material-${coil.id}`}
        >
          <AlertCircle size={13} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// CoilMetersEditor
// ---------------------------------------------------------------------------

const DEFAULT_METER_SUGGESTIONS = [500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000];

export type CoilMetersEditorProps = {
  coil: Coil;
  suggestions?: number[];
  canManage?: boolean;
  onSaved?: (message: string) => void;
};

const metersDatalistId = (coilId: number) => `coil-meters-options-${coilId}`;

/**
 * Inline editor for the meters of ONE physical coil or remnant.
 * Activated by touching/clicking directly on the meters text (no pencil icon).
 * Allows free numeric entry with suggestions via datalist.
 */
export function CoilMetersEditor({
  coil,
  suggestions = DEFAULT_METER_SUGGESTIONS,
  canManage = true,
  onSaved,
}: CoilMetersEditorProps) {
  const queryClient = useQueryClient();
  const updateCoil = useUpdateCoil();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(String(coil.metros));
  const [error, setError] = useState<string | null>(null);

  const editable = isCoilEditable(coil, canManage);

  const startEditing = () => {
    setValue(String(coil.metros));
    setError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setValue(String(coil.metros));
    setError(null);
  };

  const save = (event: FormEvent<HTMLFormElement> | KeyboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    if (updateCoil.isPending) return;
    const parsed = Number(value);
    if (Number.isNaN(parsed) || parsed <= 0) {
      setError('Los metros deben ser un número mayor a cero.');
      return;
    }
    setError(null);
    updateCoil.mutate(
      { id: coil.id, data: { metros: parsed } },
      {
        onSuccess: (updated) => {
          setEditing(false);
          setValue(String(updated.metros));
          queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
          onSaved?.(
            `Metros de la bobina #${coil.id} actualizados a ${formatMeters(updated.metros)} m. El grupo se ha actualizado.`,
          );
        },
        onError: (mutationError) => {
          setError(
            extractApiError(mutationError, 'No se pudieron guardar los metros. Inténtalo de nuevo.'),
          );
        },
      },
    );
  };

  if (!editing) {
    if (!editable) {
      return <span className="font-data font-normal">{formatMeters(coil.metros)} m</span>;
    }
    return (
      <button
        type="button"
        onClick={startEditing}
        className="font-data font-normal text-foreground cursor-pointer rounded px-1 -mx-1 transition hover:bg-muted/70 hover:text-primary hover:underline focus:outline-none focus:ring-1 focus:ring-ring"
        title="Tocar para editar metros de esta bobina"
        data-testid={`button-edit-metros-${coil.id}`}
      >
        {formatMeters(coil.metros)} m
      </button>
    );
  }

  return (
    <form
      onSubmit={save}
      className="inline-flex flex-wrap items-center gap-1.5"
      data-testid={`form-edit-metros-${coil.id}`}
    >
      <div className="flex items-center gap-1">
        <input
          type="number"
          step="any"
          min="1"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              cancelEditing();
            }
          }}
          list={metersDatalistId(coil.id)}
          autoFocus
          disabled={updateCoil.isPending}
          className={`${inputClass} min-h-8 w-24 px-2 py-1 font-data text-xs`}
          aria-label="Metros de la bobina"
          data-testid={`input-edit-metros-${coil.id}`}
        />
        <span className="font-data text-xs text-muted-foreground">m</span>
      </div>
      <datalist id={metersDatalistId(coil.id)}>
        {suggestions.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <button
        type="submit"
        disabled={updateCoil.isPending}
        className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
        aria-label="Guardar metros"
        data-testid={`button-save-metros-${coil.id}`}
      >
        {updateCoil.isPending ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Check size={14} />
        )}
      </button>
      <button
        type="button"
        onClick={cancelEditing}
        disabled={updateCoil.isPending}
        className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        aria-label="Cancelar edición de metros"
        data-testid={`button-cancel-metros-${coil.id}`}
      >
        <X size={13} />
      </button>
      {error && (
        <p
          className="mt-1 w-full flex items-start gap-1 text-xs font-medium text-destructive"
          role="alert"
          data-testid={`error-edit-metros-${coil.id}`}
        >
          <AlertCircle size={13} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// CoilCamisaEditor
// ---------------------------------------------------------------------------

export type CoilCamisaEditorProps = {
  coil: Coil;
  camisas: (string | number)[];
  canManage?: boolean;
  onSaved?: (message: string) => void;
};

const camisaDatalistId = (coilId: number) => `coil-camisa-options-${coilId}`;

/**
 * Inline editor for the camisa of ONE physical coil or remnant.
 * Activated by touching/clicking directly on "Camisa {valor}" (no pencil icon).
 * Allows free entry with suggestions via datalist without restriction.
 */
export function CoilCamisaEditor({
  coil,
  camisas,
  canManage = true,
  onSaved,
}: CoilCamisaEditorProps) {
  const queryClient = useQueryClient();
  const updateCoil = useUpdateCoil();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(String(coil.camisa));
  const [error, setError] = useState<string | null>(null);

  const editable = isCoilEditable(coil, canManage);

  const startEditing = () => {
    setValue(String(coil.camisa));
    setError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setValue(String(coil.camisa));
    setError(null);
  };

  const save = (event: FormEvent<HTMLFormElement> | KeyboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    if (updateCoil.isPending) return;
    const trimmed = value.trim();
    if (!trimmed) {
      setError('La camisa no puede estar vacía.');
      return;
    }
    setError(null);
    updateCoil.mutate(
      { id: coil.id, data: { camisa: trimmed } },
      {
        onSuccess: (updated) => {
          setEditing(false);
          setValue(String(updated.camisa));
          queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
          onSaved?.(
            `Camisa de la bobina #${coil.id} actualizada a ${updated.camisa}. El grupo se ha actualizado.`,
          );
        },
        onError: (mutationError) => {
          setError(
            extractApiError(mutationError, 'No se pudo guardar la camisa. Inténtalo de nuevo.'),
          );
        },
      },
    );
  };

  if (!editing) {
    if (!editable) {
      return (
        <span className="font-data text-xs font-semibold text-foreground">
          Camisa {coil.camisa}
        </span>
      );
    }
    return (
      <button
        type="button"
        onClick={startEditing}
        className="font-data text-xs font-semibold text-foreground cursor-pointer rounded px-1 -mx-1 transition hover:bg-muted/70 hover:text-primary hover:underline focus:outline-none focus:ring-1 focus:ring-ring"
        title="Tocar para editar camisa de esta bobina"
        data-testid={`button-edit-camisa-${coil.id}`}
      >
        Camisa {coil.camisa}
      </button>
    );
  }

  return (
    <form
      onSubmit={save}
      className="inline-flex flex-wrap items-center gap-1.5"
      data-testid={`form-edit-camisa-${coil.id}`}
    >
      <div className="flex items-center gap-1">
        <span className="font-data text-xs font-medium text-muted-foreground">Camisa</span>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              cancelEditing();
            }
          }}
          list={camisaDatalistId(coil.id)}
          autoFocus
          disabled={updateCoil.isPending}
          className={`${inputClass} min-h-8 w-28 px-2 py-1 font-data text-xs font-semibold`}
          aria-label="Camisa de la bobina"
          data-testid={`input-edit-camisa-${coil.id}`}
        />
      </div>
      <datalist id={camisaDatalistId(coil.id)}>
        {camisas.map((c) => (
          <option key={String(c)} value={String(c)} />
        ))}
      </datalist>
      <button
        type="submit"
        disabled={updateCoil.isPending}
        className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
        aria-label="Guardar camisa"
        data-testid={`button-save-camisa-${coil.id}`}
      >
        {updateCoil.isPending ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Check size={14} />
        )}
      </button>
      <button
        type="button"
        onClick={cancelEditing}
        disabled={updateCoil.isPending}
        className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        aria-label="Cancelar edición de camisa"
        data-testid={`button-cancel-camisa-${coil.id}`}
      >
        <X size={13} />
      </button>
      {error && (
        <p
          className="mt-1 w-full flex items-start gap-1 text-xs font-medium text-destructive"
          role="alert"
          data-testid={`error-edit-camisa-${coil.id}`}
        >
          <AlertCircle size={13} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}
    </form>
  );
}
