// Filtro One Euro (Casiez et al., 2012): quita el temblor de la mano sin agregar retraso al moverse rápido.
// Copiado de hand-lab.
const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff) / dt);

export class OneEuro {
  constructor({ minCutoff = 1.5, beta = 8, dCutoff = 1 } = {}) {
    Object.assign(this, { minCutoff, beta, dCutoff });
    this.reset();
  }

  reset() {
    this.x = null;
    this.dx = 0;
    this.t = 0;
  }

  /** v: valor, t: tiempo en segundos */
  filter(v, t) {
    if (this.x === null) {
      this.x = v;
      this.t = t;
      return v;
    }
    const dt = Math.max(t - this.t, 1e-3);
    this.t = t;
    this.dx += alpha(this.dCutoff, dt) * ((v - this.x) / dt - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (v - this.x);
    return this.x;
  }
}
