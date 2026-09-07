import { getMaterialColorClass } from '@/lib/domain';

type MaterialChipProps = {
  material: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  testId?: string;
};

const sizeClasses: Record<NonNullable<MaterialChipProps['size']>, string> = {
  sm: 'px-1.5 py-0.5 text-[11px] font-semibold tracking-wide',
  md: 'px-2 py-1 text-[13px] font-bold uppercase tracking-wide',
  lg: 'px-2.5 py-1 text-sm font-bold uppercase tracking-[.06em]',
};

/**
 * Colored, stable visual identifier for a material value. The same material
 * always maps to the same color (see getMaterialColorClass), including new
 * dynamic materials.
 */
export function MaterialChip({ material, size = 'sm', className = '', testId }: MaterialChipProps) {
  return (
    <span
      className={`material-chip ${getMaterialColorClass(material)} ${sizeClasses[size]} ${className}`}
      data-testid={testId ?? `material-chip-${material.trim().toLowerCase().replace(/\s+/g, '-')}`}
    >
      {material}
    </span>
  );
}
