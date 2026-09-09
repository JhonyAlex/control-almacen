import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  CoilCamisaEditor,
  CoilMaterialEditor,
  CoilMetersEditor,
} from './coil-material-editor';
import { formatMeters } from '@/lib/domain';
import type { Coil } from '@workspace/api-client-react';

const mutateMock = vi.fn();

vi.mock('@workspace/api-client-react', async () => {
  const actual = await vi.importActual<typeof import('@workspace/api-client-react')>(
    '@workspace/api-client-react',
  );
  return {
    ...actual,
    useUpdateCoil: () => ({
      mutate: mutateMock,
      isPending: false,
      isError: false,
      isSuccess: false,
    }),
    useUpdateCoilMaterial: () => ({
      mutate: mutateMock,
      isPending: false,
      isError: false,
      isSuccess: false,
    }),
  };
});

const sampleCoil = (overrides: Partial<Coil> = {}): Coil =>
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

const renderWithQueryClient = (ui: React.ReactElement) => {
  const queryClient = new QueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

beforeEach(() => {
  mutateMock.mockReset();
});

describe('CoilMaterialEditor', () => {
  it('muestra el material como chip clicable sin lápiz cuando es editable', () => {
    renderWithQueryClient(
      <CoilMaterialEditor
        coil={sampleCoil()}
        materials={['OPP', 'OPP RECICLADO', 'PET']}
      />,
    );
    const button = screen.getByTestId('button-edit-material-7');
    expect(button).toBeTruthy();
    expect(button.textContent).toContain('OPP');
    expect(screen.queryByTestId('input-edit-material-7')).toBeNull();
  });

  it('al hacer clic convierte el material en campo editable con sugerencias (datalist)', () => {
    renderWithQueryClient(
      <CoilMaterialEditor
        coil={sampleCoil()}
        materials={['OPP', 'OPP RECICLADO', 'PET']}
      />,
    );
    fireEvent.click(screen.getByTestId('button-edit-material-7'));
    const input = screen.getByTestId('input-edit-material-7') as HTMLInputElement;
    expect(input.value).toBe('OPP');
    const datalist = document.getElementById('coil-material-options-7');
    expect(datalist).toBeTruthy();
    const options = datalist?.querySelectorAll('option');
    expect(options?.length).toBe(3);
  });

  it('Enter (submit) guarda con trim del valor libre', () => {
    renderWithQueryClient(
      <CoilMaterialEditor
        coil={sampleCoil()}
        materials={['OPP', 'OPP RECICLADO', 'PET']}
      />,
    );
    fireEvent.click(screen.getByTestId('button-edit-material-7'));
    const input = screen.getByTestId('input-edit-material-7');
    fireEvent.change(input, { target: { value: '  CUSTOM MATERIAL  ' } });
    fireEvent.submit(screen.getByTestId('form-edit-material-7'));
    expect(mutateMock).toHaveBeenCalledTimes(1);
    const args = mutateMock.mock.calls[0][0];
    expect(args.id).toBe(7);
    expect(args.data.material).toBe('CUSTOM MATERIAL');
  });

  it('no acepta vacío: muestra error y no llama al backend', () => {
    renderWithQueryClient(
      <CoilMaterialEditor
        coil={sampleCoil()}
        materials={['OPP', 'OPP RECICLADO', 'PET']}
      />,
    );
    fireEvent.click(screen.getByTestId('button-edit-material-7'));
    const input = screen.getByTestId('input-edit-material-7');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(screen.getByTestId('form-edit-material-7'));
    expect(mutateMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('error-edit-material-7').textContent).toContain('no puede estar vacío');
    expect(screen.getByTestId('input-edit-material-7')).toBeTruthy();
  });

  it('Escape cancela la edición y restaura el valor sin llamar al backend', () => {
    renderWithQueryClient(
      <CoilMaterialEditor
        coil={sampleCoil()}
        materials={['OPP', 'OPP RECICLADO', 'PET']}
      />,
    );
    fireEvent.click(screen.getByTestId('button-edit-material-7'));
    const input = screen.getByTestId('input-edit-material-7') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'CAMBIO' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(mutateMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('input-edit-material-7')).toBeNull();
    expect(screen.getByTestId('button-edit-material-7').textContent).toContain('OPP');
  });

  it('botón cancelar (X) cancela la edición', () => {
    renderWithQueryClient(
      <CoilMaterialEditor
        coil={sampleCoil()}
        materials={['OPP', 'OPP RECICLADO', 'PET']}
      />,
    );
    fireEvent.click(screen.getByTestId('button-edit-material-7'));
    expect(screen.getByTestId('input-edit-material-7')).toBeTruthy();
    fireEvent.click(screen.getByTestId('button-cancel-material-7'));
    expect(screen.queryByTestId('input-edit-material-7')).toBeNull();
    expect(screen.getByTestId('button-edit-material-7').textContent).toContain('OPP');
  });

  it('error del backend muestra el mensaje y mantiene la UI abierta', () => {
    renderWithQueryClient(
      <CoilMaterialEditor
        coil={sampleCoil()}
        materials={['OPP', 'OPP RECICLADO', 'PET']}
      />,
    );
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

  it('no es editable sin permisos de gestión', () => {
    renderWithQueryClient(
      <CoilMaterialEditor
        coil={sampleCoil()}
        materials={['OPP']}
        canManage={false}
      />,
    );
    expect(screen.queryByTestId('button-edit-material-7')).toBeNull();
    expect(screen.getByTestId('material-chip-opp').textContent).toContain('OPP');
  });

  it('no es editable si la bobina está asignada a una orden', () => {
    renderWithQueryClient(
      <CoilMaterialEditor
        coil={sampleCoil({
          asignacion: {
            ordenId: 3,
            metros: 2000,
            origen: 'AUTO_STOCK',
            asignadoEn: '2026-01-02T00:00:00.000Z',
          },
        })}
        materials={['OPP']}
      />,
    );
    expect(screen.queryByTestId('button-edit-material-7')).toBeNull();
  });
});

describe('CoilMetersEditor', () => {
  it('muestra los metros como texto clicable sin lápiz cuando es editable', () => {
    renderWithQueryClient(<CoilMetersEditor coil={sampleCoil({ metros: 3500 })} />);
    const button = screen.getByTestId('button-edit-metros-7');
    expect(button).toBeTruthy();
    expect(button.textContent).toContain(formatMeters(3500) + ' m');
    expect(screen.queryByTestId('input-edit-metros-7')).toBeNull();
  });

  it('al tocar los metros abre input numérico con sugerencias en datalist', () => {
    renderWithQueryClient(
      <CoilMetersEditor coil={sampleCoil({ metros: 2000 })} suggestions={[500, 1000, 2000]} />,
    );
    fireEvent.click(screen.getByTestId('button-edit-metros-7'));
    const input = screen.getByTestId('input-edit-metros-7') as HTMLInputElement;
    expect(input.value).toBe('2000');
    const datalist = document.getElementById('coil-meters-options-7');
    expect(datalist).toBeTruthy();
    expect(datalist?.querySelectorAll('option').length).toBe(3);
  });

  it('guarda los nuevos metros ingresados', () => {
    renderWithQueryClient(<CoilMetersEditor coil={sampleCoil()} />);
    fireEvent.click(screen.getByTestId('button-edit-metros-7'));
    const input = screen.getByTestId('input-edit-metros-7');
    fireEvent.change(input, { target: { value: '4500' } });
    fireEvent.submit(screen.getByTestId('form-edit-metros-7'));
    expect(mutateMock).toHaveBeenCalledTimes(1);
    const args = mutateMock.mock.calls[0][0];
    expect(args.id).toBe(7);
    expect(args.data.metros).toBe(4500);
  });

  it('valida que los metros sean un número mayor a cero', () => {
    renderWithQueryClient(<CoilMetersEditor coil={sampleCoil()} />);
    fireEvent.click(screen.getByTestId('button-edit-metros-7'));
    const input = screen.getByTestId('input-edit-metros-7');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.submit(screen.getByTestId('form-edit-metros-7'));
    expect(mutateMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('error-edit-metros-7').textContent).toContain('mayor a cero');
  });

  it('cancela con Escape y con botón cancelar', () => {
    renderWithQueryClient(<CoilMetersEditor coil={sampleCoil({ metros: 2000 })} />);
    fireEvent.click(screen.getByTestId('button-edit-metros-7'));
    const input = screen.getByTestId('input-edit-metros-7');
    fireEvent.change(input, { target: { value: '9999' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(mutateMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('input-edit-metros-7')).toBeNull();
    expect(screen.getByTestId('button-edit-metros-7').textContent).toContain(formatMeters(2000) + ' m');
  });
});

describe('CoilCamisaEditor', () => {
  it('muestra la camisa como texto clicable sin lápiz cuando es editable', () => {
    renderWithQueryClient(
      <CoilCamisaEditor coil={sampleCoil({ camisa: '47-5-47' })} camisas={['400', '47-5-47']} />,
    );
    const button = screen.getByTestId('button-edit-camisa-7');
    expect(button).toBeTruthy();
    expect(button.textContent).toContain('Camisa 47-5-47');
    expect(screen.queryByTestId('input-edit-camisa-7')).toBeNull();
  });

  it('al tocar la camisa abre input de texto con sugerencias libres', () => {
    renderWithQueryClient(
      <CoilCamisaEditor coil={sampleCoil({ camisa: 400 })} camisas={[400, 475, '22-6-22']} />,
    );
    fireEvent.click(screen.getByTestId('button-edit-camisa-7'));
    const input = screen.getByTestId('input-edit-camisa-7') as HTMLInputElement;
    expect(input.value).toBe('400');
    const datalist = document.getElementById('coil-camisa-options-7');
    expect(datalist).toBeTruthy();
    expect(datalist?.querySelectorAll('option').length).toBe(3);
  });

  it('guarda una camisa libre personalizada', () => {
    renderWithQueryClient(
      <CoilCamisaEditor coil={sampleCoil()} camisas={[400, 475]} />,
    );
    fireEvent.click(screen.getByTestId('button-edit-camisa-7'));
    const input = screen.getByTestId('input-edit-camisa-7');
    fireEvent.change(input, { target: { value: '99-SPECIAL' } });
    fireEvent.submit(screen.getByTestId('form-edit-camisa-7'));
    expect(mutateMock).toHaveBeenCalledTimes(1);
    const args = mutateMock.mock.calls[0][0];
    expect(args.id).toBe(7);
    expect(args.data.camisa).toBe('99-SPECIAL');
  });

  it('valida que la camisa no esté vacía', () => {
    renderWithQueryClient(
      <CoilCamisaEditor coil={sampleCoil()} camisas={[400]} />,
    );
    fireEvent.click(screen.getByTestId('button-edit-camisa-7'));
    const input = screen.getByTestId('input-edit-camisa-7');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(screen.getByTestId('form-edit-camisa-7'));
    expect(mutateMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('error-edit-camisa-7').textContent).toContain('no puede estar vacía');
  });
});
