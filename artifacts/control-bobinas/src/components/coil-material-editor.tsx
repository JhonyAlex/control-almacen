import { type FormEvent, type KeyboardEvent, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Loader2, Pencil } from 'lucide-react';
import {
  CoilStatus,
  getListInventoryQueryKey,
  useUpdateCoilMaterial,
  type Coil,
} from '@workspace/api-client-react';
import { MaterialChip } from '@/components/material-chip';
import { inputClass } from '@/components/modal';

type CoilMaterialEditorProps = {
  coil: Coil;
  /** Known materials offered as suggestions (free text still allowed). */
  materials: string[];
  canManage: boolean;
  onSaved?: (message: string) => void;
};

const datalistId = (coilId: number) => `coil-material-options-${coilId}`;

/**
 * Inline editor for the material of ONE physical coil. Only available coils
 * that are not committed to an order (auto-assignment) can be edited; the
 * backend enforces the same rules. Enter saves, Escape cancels.
 */
export function CoilMaterialEditor({ coil, materials, canManage, onSaved }: CoilMaterialEditorProps) {
  const queryClient = useQueryClient();
  const updateMaterial = useUpdateCoilMaterial();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(coil.material);
  const [error, setError] = useState<string | null>(null);

  const editable =
    canManage &&
    coil.estado === CoilStatus.DISPONIBLE &&
    !coil.asignacion;

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
    if (updateMaterial.isPending) return;
    const trimmed = value.trim();
    if (!trimmed) {
      setError('El material no puede estar vacío.');
      return;
    }
    setError(null);
    updateMaterial.mutate(
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
          // Keep editing mode so the UI stays consistent with the backend.
          const apiMessage =
            (mutationError as { data?: { error?: string } })?.data?.error ?? null;
          setError(apiMessage ?? 'No se pudo guardar el material. Inténtalo de nuevo.');
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
        className="material-chip pressable group/edit cursor-pointer"
        title="Editar material de esta bobina"
        data-testid={`button-edit-material-${coil.id}`}
      >
        <MaterialChip material={coil.material} size="sm" className="border-transparent bg-transparent p-0" />
        <Pencil size={11} className="ml-1 shrink-0 opacity-45 transition group-hover/edit:opacity-100" />
      </button>
    );
  }

  return (
    <form onSubmit={save} className="w-full max-w-64" data-testid={`form-edit-material-${coil.id}`}>
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
          list={datalistId(coil.id)}
          autoFocus
          disabled={updateMaterial.isPending}
          className={`${inputClass} min-h-9 px-2 py-1 text-sm`}
          aria-label="Material de la bobina"
          data-testid={`input-edit-material-${coil.id}`}
        />
        <datalist id={datalistId(coil.id)}>
          {materials.map((material) => (
            <option key={material} value={material} />
          ))}
        </datalist>
        <button
          type="submit"
          disabled={updateMaterial.isPending}
          className="pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
          aria-label="Guardar material"
          data-testid={`button-save-material-${coil.id}`}
        >
          {updateMaterial.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />}
        </button>
      </div>
      {error && (
        <p className="mt-1 flex items-start gap-1 text-xs font-medium text-destructive" role="alert" data-testid={`error-edit-material-${coil.id}`}>
          <AlertCircle size={13} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}
    </form>
  );
}
