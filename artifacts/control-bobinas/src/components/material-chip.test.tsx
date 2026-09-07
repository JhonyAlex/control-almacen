import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MaterialChip } from './material-chip';
import { getMaterialColorClass } from '@/lib/domain';

describe('MaterialChip', () => {
  it('asigna la clase de color estable correspondiente al material', () => {
    render(<MaterialChip material="OPP RECICLADO" />);
    const chip = screen.getByTestId('material-chip-opp-reciclado');
    expect(chip.className).toContain(getMaterialColorClass('OPP RECICLADO'));
    expect(chip.className).toMatch(/material-chip-\d+/);
    expect(chip.textContent).toBe('OPP RECICLADO');
  });

  it('materiales nuevos reciben una clase de paleta válida', () => {
    render(<MaterialChip material="PET" />);
    expect(screen.getByTestId('material-chip-pet').className).toMatch(/material-chip-\d+/);
  });

  it('el tamaño lg destaca más (usado en cabecera de grupo)', () => {
    render(<MaterialChip material="OPP" size="lg" />);
    const chip = screen.getByTestId('material-chip-opp');
    expect(chip.className).toContain('text-sm');
    expect(chip.className).toContain('uppercase');
  });
});
