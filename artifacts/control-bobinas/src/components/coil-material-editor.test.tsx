import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CoilMaterialEditor } from './coil-material-editor';
import type { Coil } from '@workspace/api-client-react';

const mutateMock = vi.fn();

vi.mock('@workspace/api-client-react', async () => {
  const actual = await vi.importActual<typeof import('@workspace/api-client-react')>('@workspace/api-client-react');
  return {
    ...actual,
    useUpdateCoilMaterial: () => ({
      mutate: mutateMock,
      isPending: false,
      isError: false,
      isSuccess: false,
    }),
  };
});

const coil = (overrides: Partial<Coil> = {}): Coil =>
  ({
    id: 7,
    tipo: 'BOBINA',
    metros: 2000,
    ancho: 1200,
    micras: 30,
    camisa: 400,
    material: 'OPP',
    estado: 'DISPONIBLE',
    ordenId: null,
    asignacion: null,
    pedidosRelacionados: [],
    creadoEn: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as Coil;

const renderEditor = (props: Partial<Parameters<typeof CoilMaterialEditor>[0]> = {}) => {
  const queryClient = new QueryClient();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <CoilMaterialEditor
        coil={props.coil ?? coil()}
        materials={props.materials ?? ['OPP', 'OPP RECICLADO', 'PET']}
        canManage={props.canManage ?? true}
        onSaved={props.onSaved}
      />
    </QueryClientProvider>,
  );
  return utils;
};

beforeEach(() => {
  mutateMock.mockReset();
});

describe('CoilMaterialEditor', () => {
  it('muestra el material como chip clicable cuando es editable', () => {
    renderEditor();
    const button = screen.getByTestId('button-edit-material-7');
    expect(button).toBeTruthy();
    expect(button.textContent).toContain('OPP');
    // el datalist solo aparece en edición
    expect(screen.queryByTestId('input-edit-material-7')).toBeNull();
  });

  it('al hacer clic convierte el material en campo editable con sugerencias (datalist)', () => {
    renderEditor();
    fireEvent.click(screen.getByTestId('button-edit-material-7'));
    const input = screen.getByTestId('input-edit-material-7') as HTMLInputElement;
    expect(input.value).toBe('OPP');
    const datalist = document.getElementById('coil-material-options-7');
    expect(datalist).toBeTruthy();
    const options = datalist?.querySelectorAll('option');
    expect(options?.length).toBe(3);
  });

  it('Enter (submit) guarda con trim del valor', () => {
    renderEditor();
    fireEvent.click(screen.getByTestId('button-edit-material-7'));
    const input = screen.getByTestId('input-edit-material-7');
    fireEvent.change(input, { target: { value: '  PET  ' } });
    fireEvent.submit(screen.getByTestId('form-edit-material-7'));
    expect(mutateMock).toHaveBeenCalledTimes(1);
    const args = mutateMock.mock.calls[0][0];
    expect(args.id).toBe(7);
    expect(args.data.material).toBe('PET');
  });

  it('no acepta vacío: muestra error y no llama al backend', () => {
    renderEditor();
    fireEvent.click(screen.getByTestId('button-edit-material-7'));
    const input = screen.getByTestId('input-edit-material-7');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(screen.getByTestId('form-edit-material-7'));
    expect(mutateMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('error-edit-material-7').textContent).toContain('no puede estar vacío');
    // el editor sigue abierto (estado consistente para reintentar o cancelar)
    expect(screen.getByTestId('input-edit-material-7')).toBeTruthy();
  });

  it('Escape cancela la edición y restaura el valor sin llamar al backend', () => {
    renderEditor();
    fireEvent.click(screen.getByTestId('button-edit-material-7'));
    const input = screen.getByTestId('input-edit-material-7') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'CAMBIO' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(mutateMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('input-edit-material-7')).toBeNull();
    expect(screen.getByTestId('button-edit-material-7').textContent).toContain('OPP');
  });

  it('error del backend muestra el mensaje y mantiene la UI consistente (sin cerrar ni borrar)', () => {
    renderEditor();
    fireEvent.click(screen.getByTestId('button-edit-material-7'));
    fireEvent.change(screen.getByTestId('input-edit-material-7'), { target: { value: 'NUEVO' } });
    fireEvent.submit(screen.getByTestId('form-edit-material-7'));

    const onError = mutateMock.mock.calls[0][1].onError;
    act(() => {
      onError({ data: { error: 'La bobina está asignada a una orden' } }, {});
    });

    expect(screen.getByTestId('error-edit-material-7').textContent).toContain(
      'La bobina está asignada a una orden',
    );
    expect(screen.getByTestId('input-edit-material-7')).toBeTruthy();
  });

  it('no es editable sin permisos de gestión: chip sin botón', () => {
    renderEditor({ canManage: false });
    expect(screen.queryByTestId('button-edit-material-7')).toBeNull();
    expect(screen.getByTestId('material-chip-opp').textContent).toContain('OPP');
  });

  it('no es editable si la bobina está asignada a una orden', () => {
    renderEditor({ coil: coil({ asignacion: { ordenId: 3, metros: 2000, origen: 'AUTO_STOCK', asignadoEn: '2026-01-02T00:00:00.000Z' } }) });
    expect(screen.queryByTestId('button-edit-material-7')).toBeNull();
  });

  it('no es editable si la bobina está EN FÁBRICA', () => {
    renderEditor({ coil: coil({ estado: 'EN FÁBRICA' }) });
    expect(screen.queryByTestId('button-edit-material-7')).toBeNull();
  });
});
