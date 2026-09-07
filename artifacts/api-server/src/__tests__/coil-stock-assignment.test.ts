import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectCoilsForDeficit } from "../lib/coil-stock-selection";

describe("selectCoilsForDeficit", () => {
  it("deficit cero o negativo no selecciona nada", () => {
    assert.deepEqual(selectCoilsForDeficit([{ id: 1, metros: 5000 }], 0), []);
    assert.deepEqual(selectCoilsForDeficit([{ id: 1, metros: 5000 }], -10), []);
  });

  it("bobinas con metros <= 0 se descartan", () => {
    assert.deepEqual(
      selectCoilsForDeficit(
        [
          { id: 1, metros: 0 },
          { id: 2, metros: -5 },
        ],
        1000,
      ),
      [],
    );
  });

  it("una sola bobina suficiente → preferir la de menor metraje que cubra", () => {
    const chosen = selectCoilsForDeficit(
      [
        { id: 1, metros: 9000 },
        { id: 2, metros: 2600 },
        { id: 3, metros: 2400 },
      ],
      2500,
    );
    assert.deepEqual(chosen, [{ id: 2, metros: 2600 }]);
  });

  it("empate de metraje suficiente → desempatar por id (determinista)", () => {
    const chosen = selectCoilsForDeficit(
      [
        { id: 7, metros: 3000 },
        { id: 3, metros: 3000 },
      ],
      2500,
    );
    assert.deepEqual(chosen, [{ id: 3, metros: 3000 }]);
  });

  it("ninguna bobina individual basta → combinar varias hasta cubrir", () => {
    const chosen = selectCoilsForDeficit(
      [
        { id: 1, metros: 2000 },
        { id: 2, metros: 3000 },
        { id: 3, metros: 1500 },
      ],
      5000,
    );
    // Greedy de mayor a menor: 3000 + 2000 = 5000, no toma más.
    assert.deepEqual(chosen, [
      { id: 2, metros: 3000 },
      { id: 1, metros: 2000 },
    ]);
  });

  it("no asigna bobinas adicionales una vez cubierta la necesidad", () => {
    const chosen = selectCoilsForDeficit(
      [
        { id: 1, metros: 4000 },
        { id: 2, metros: 2000 },
        { id: 3, metros: 1000 },
      ],
      4000,
    );
    assert.deepEqual(chosen, [{ id: 1, metros: 4000 }]);
  });

  it("metros insuficientes en total → toma todas las disponibles", () => {
    const chosen = selectCoilsForDeficit(
      [
        { id: 1, metros: 1000 },
        { id: 2, metros: 1500 },
      ],
      5000,
    );
    assert.deepEqual(chosen, [
      { id: 2, metros: 1500 },
      { id: 1, metros: 1000 },
    ]);
  });

  it("la misma bobina nunca se selecciona dos veces", () => {
    const chosen = selectCoilsForDeficit(
      [
        { id: 1, metros: 3000 },
        { id: 2, metros: 1000 },
      ],
      3500,
    );
    const ids = chosen.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("es determinista ante el orden de entrada", () => {
    const a = selectCoilsForDeficit(
      [
        { id: 1, metros: 1000 },
        { id: 2, metros: 2000 },
        { id: 3, metros: 3000 },
      ],
      4500,
    );
    const b = selectCoilsForDeficit(
      [
        { id: 3, metros: 3000 },
        { id: 1, metros: 1000 },
        { id: 2, metros: 2000 },
      ],
      4500,
    );
    assert.deepEqual(a, b);
  });
});
