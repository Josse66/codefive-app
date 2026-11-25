// Parte 2 de cada práctica de manos: con el guante puesto y SIN depender de la cámara.
// La cámara (parte 1) ya revisó lo visible: dónde va la mano, cuántas manos y en qué orden.
// El guante revisa lo que la cámara no ve:
//   - agarre firme (botón de la palma),
//   - muñeca recta (inclinación contra la "mano recta" calibrada),
//   - jalón parejo (giroscopio: los tirones),
//   - parar en el clic (cuánto sigue girando la mano),
//   - en la matraca, no empujar con el puño (botón apretado mientras empuja).
// La herramienta de la pantalla gira con el giro del guante. Una pantalla guía paso a paso con
// medidores en vivo: torque, muñeca, agarre y jalón.
import { activo, calibrarMuneca, guante, led, pitar, pitarDoble } from './guante.js';
import { AJUSTES, guardarAjustes } from './camaras.js';
import { calificar } from './reglas.js';

const EJES = ['roll', 'pitch', 'yaw'];
const diferencia = (a, b) => ((a - b + 540) % 360) - 180;
const COLOR = {
  tinta: '#141c24',
  marca: '#e0a800',
  ok: '#2f7d43',
  mal: '#b42318',
  blanco: '#ffffff',
  gris: '#55616c',
};

// Muñeca: cuánto se aleja de la mano recta, en los ejes que NO son el del giro de la herramienta
// (girar para apretar es lo que se pide; doblar la muñeca hacia otro lado, no).
function desviacionMuneca() {
  if (!guante.neutro) return 0;
  const eje = AJUSTES.guanteEje?.eje;
  return Math.max(
    0,
    ...['roll', 'pitch'].filter((k) => k !== eje).map((k) => Math.abs(guante[k] - guante.neutro[k])),
  );
}

export class FaseGuante {
  /**
   * ej: ejercicio de data/manos/ejercicios.json (con su bloque "guante").
   * ui: { ctx, lienzo, decir(texto, tono), sonar(nombre) }.
   */
  constructor(ej, ui) {
    this.ej = ej;
    this.g = ej.guante;
    this.ui = ui;
  }

  get reglas() {
    return this.g.reglas;
  }

  empezar(ahora) {
    Object.assign(this, {
      paso: 'conectar',
      desde: ahora,
      fallas: new Set(),
      ultimaFalla: null,
      rep: 0,
      base: null,
      avance: 0,
      pasado: 0,
      tClic: 0,
      sueltoDesde: 0,
      munecaDesde: 0,
      inestable: 0,
      giro: null,
      terminado: false,
      calibrando: false,
      ruido: [],
      boton: { visto: false, desde: 0 },
    });
    this.ajustarUmbrales();
  }

  /**
   * Umbrales a la medida: el temblor de la mano quieta (medido con la mano recta) sube los límites
   * de "tirón" y de "punta quieta" si el guante o la persona tiemblan más; y el clic se pone al
   * alcance del giro cómodo de la persona (medido al aprender el giro), sin pasar del objetivo.
   */
  ajustarUmbrales() {
    const { g } = this;
    const cal = AJUSTES.guanteCal ?? {};
    const ruido = cal.ruido ?? 5;
    const rango = AJUSTES.guanteEje?.rango;
    this.u = {
      objetivo: g.objetivo
        ? Math.round(rango ? Math.max(12, Math.min(g.objetivo, rango * 0.75)) : g.objetivo)
        : 0,
      tiron: Math.max(g.tiron ?? 220, ruido * 8 + 60),
      movimiento: Math.max(g.movimiento ?? 35, ruido * 3 + 10),
      muneca: Math.max(g.muneca ?? 20, 22),
    };
  }

  fallar(id) {
    const regla = this.reglas.find((r) => r.id === id);
    if (!regla) return;
    this.ultimaFalla = { regla, hasta: performance.now() + 2600 };
    if (!this.fallas.has(id)) {
      this.fallas.add(id);
      this.ui.sonar(regla.critico ? 'critico' : 'mal');
      pitarDoble();
    }
  }

  frase(guia, tono = 'guia') {
    const f = this.ultimaFalla;
    if (f && performance.now() < f.hasta) this.ui.decir(f.regla.frase, 'mal');
    else this.ui.decir(guia, tono);
  }

  giroActual() {
    const { eje, signo } = AJUSTES.guanteEje;
    return signo * (this.g.sentido ?? 1) * diferencia(guante[eje], this.base);
  }

  /** Se llama cada cuadro. Devuelve { terminado, nota } al acabar. */
  actualizar(ahora) {
    this.dibujarFondo();
    if (!activo()) {
      this.paso = this.paso === 'conectar' ? 'conectar' : this.paso;
      this.dibujarCentro(
        'Ponte el guante y conéctalo',
        'Botón "Conectar guante", a la derecha · puerto COM3',
      );
      this.ui.decir('Ponte el guante y conéctalo con el botón "Conectar guante"');
      led(false);
      return null;
    }
    if (this.paso === 'conectar') Object.assign(this, { paso: 'recta', desde: ahora });
    if (this.paso === 'recta') return this.pasoRecta(ahora);
    if (this.paso === 'boton') return this.pasoBoton(ahora);
    if (this.paso === 'giro') return this.pasoGiro(ahora);
    if (this.g.tipo === 'firme') return this.pasoFirme(ahora);
    return this.pasoJalon(ahora);
  }

  // ---------- Calibración del guante: mano recta y eje del giro ----------
  pasoRecta(ahora) {
    const falta = 3000 - (ahora - this.desde);
    if (falta > 0) {
      this.dibujarCentro(String(Math.ceil(falta / 1000)), 'Mano recta, en línea con el brazo, y quieta');
      this.ui.decir('Prepárate: deja la mano recta, en línea con el brazo, y quieta');
      return null;
    }
    if (!this.calibrando) {
      this.calibrando = true;
      this.ruido = [];
      calibrarMuneca().then(() => {
        this.calibrando = false;
        // Temblor en reposo: la mediana de lo medido mientras la mano estaba recta y quieta.
        const r = [...this.ruido].sort((a, b) => a - b);
        if (r.length) {
          AJUSTES.guanteCal = { ...AJUSTES.guanteCal, ruido: r[Math.floor(r.length / 2)] };
          guardarAjustes();
        }
        this.ajustarUmbrales();
        let paso = 'listo';
        if (!AJUSTES.guanteCal?.boton) paso = 'boton';
        else if (!AJUSTES.guanteEje) paso = 'giro';
        Object.assign(this, {
          paso,
          desde: performance.now(),
          giro: null,
          boton: { visto: false, desde: 0 },
        });
      });
    }
    this.ruido.push(guante.gmag);
    this.dibujarCentro('…', 'Midiendo la mano recta: no te muevas');
    this.ui.decir('Midiendo la mano recta: no te muevas');
    return null;
  }

  // Prueba del botón de la palma: que se apriete al cerrar la mano y se suelte al abrirla.
  pasoBoton(ahora) {
    const b = this.boton;
    b.desde ||= ahora;
    if (guante.grip) b.visto = true;
    if (b.visto && !guante.grip) {
      AJUSTES.guanteCal = { ...AJUSTES.guanteCal, boton: true };
      guardarAjustes();
      this.ui.sonar('bien');
      Object.assign(this, { paso: AJUSTES.guanteEje ? 'listo' : 'giro', desde: ahora, giro: null });
      return null;
    }
    if (ahora - b.desde > 10000) {
      // No se sintió: se sigue, pero se avisa (el agarre no se podrá medir bien).
      this.ui.decir(
        'No sentí el botón: revisa que esté en la palma y que se apriete al cerrar la mano',
        'mal',
      );
      Object.assign(this, { paso: AJUSTES.guanteEje ? 'listo' : 'giro', desde: ahora, giro: null });
      return null;
    }
    this.dibujarCentro(
      b.visto ? 'Ahora ábrela' : 'Cierra la mano',
      b.visto
        ? 'Suelta: el botón debe dejar de estar apretado'
        : 'Cierra la mano como si tomaras el mango: el botón de la palma debe apretarse',
    );
    this.ui.decir(b.visto ? 'Bien. Ahora abre la mano' : 'Cierra la mano como si tomaras el mango');
    return null;
  }

  // Aprende con qué eje y en qué sentido gira el guante al apretar (depende de cómo va puesto).
  pasoGiro(ahora) {
    if (!this.giro) this.giro = { inicio: { ...guante }, max: { roll: 0, pitch: 0, yaw: 0 }, desde: ahora };
    EJES.forEach((k) => {
      const d = diferencia(guante[k], this.giro.inicio[k]);
      if (Math.abs(d) > Math.abs(this.giro.max[k])) this.giro.max[k] = d;
    });
    const t = ahora - this.giro.desde;
    if (t < 4000) {
      this.dibujarCentro(
        `${Math.ceil((4000 - t) / 1000)}`,
        'Toma un mango imaginario y gira la mano como si APRETARAS (jalando hacia ti); regresa',
      );
      this.ui.decir('Toma un mango imaginario y gira la mano como si apretaras, jalando hacia ti, y regresa');
      return null;
    }
    const eje = EJES.reduce(
      (a, k) => (Math.abs(this.giro.max[k]) > Math.abs(this.giro.max[a]) ? k : a),
      'roll',
    );
    if (Math.abs(this.giro.max[eje]) < 15) {
      this.giro = null; // no se movió lo suficiente: otra vez
      this.ui.decir('No sentí el giro: otra vez, gira más la mano');
      return null;
    }
    // También cuánto gira cómodo la persona: el clic se pone a su alcance.
    AJUSTES.guanteEje = { eje, signo: Math.sign(this.giro.max[eje]), rango: Math.abs(this.giro.max[eje]) };
    guardarAjustes();
    this.ajustarUmbrales();
    Object.assign(this, { paso: 'listo', desde: ahora });
    this.ui.sonar('bien');
    return null;
  }

  // ---------- Jalón (torquímetro, matraca y cada tuerca en estrella) ----------
  pasoJalon(ahora) {
    const { g } = this;
    const reps = g.repeticiones ?? 1;
    const conClic = g.clic !== false;
    if (this.paso === 'listo') {
      // Esperando: mientras la mano está quieta, el punto de partida la sigue (así no cuenta la
      // deriva del sensor). La aguja ya se mueve con la mano para que se vea que el guante la lee.
      const { eje } = AJUSTES.guanteEje;
      if (this.base == null || guante.gmag < 20) this.base = guante[eje];
      this.avance = this.giroActual();
      led(guante.grip);
      this.dibujarTablero(ahora);
      // El jalón empieza al girar la mano (más de 4°) o al apretar el botón.
      if (Math.abs(this.avance) > 4 || guante.grip) {
        Object.assign(this, { paso: 'jala', pasado: 0, sueltoDesde: 0, tuvoAgarre: guante.grip });
        this.ui.sonar('mano');
        return null;
      }
      this.frase(
        g.estrella
          ? `Tuerca ${this.rep + 1} de ${reps}: cierra la mano y gira jalando hacia ti`
          : 'Cierra la mano como si tomaras el mango y gira jalando hacia ti',
      );
      return null;
    }
    this.avance = this.giroActual();
    led(guante.grip);
    // Muñeca (medio segundo seguido fuera de la recta).
    if (desviacionMuneca() > this.u.muneca) {
      this.munecaDesde ||= ahora;
      if (ahora - this.munecaDesde > 500) this.fallar('g-muneca');
    } else this.munecaDesde = 0;
    if (guante.gmag > this.u.tiron) this.fallar('g-parejo');

    if (this.paso === 'clic') {
      if (conClic) {
        this.pasado = Math.max(this.pasado, this.avance - this.u.objetivo);
        if (this.pasado > (g.pasarse ?? 7)) this.fallar('g-clic');
      }
      this.dibujarTablero(ahora);
      if ((ahora - this.tClic > 500 && guante.gmag < 15) || ahora - this.tClic > 1800) {
        this.rep += 1;
        if (this.rep >= reps) return this.terminar();
        Object.assign(this, { paso: 'listo', base: null });
        return null;
      }
      this.frase(
        conClic ? '¡Clic! Para y quédate quieto' : (g.textoFin ?? '¡Se aflojó! Suelta el mango'),
        'ok',
      );
      return null;
    }
    // Jalando.
    if (this.avance < -8) {
      this.fallar('g-sentido');
      if (guante.grip) this.fallar('g-puno');
    }
    if (guante.grip) this.tuvoAgarre = true;
    if (!guante.grip) {
      this.sueltoDesde ||= ahora;
      if (ahora - this.sueltoDesde > 450) this.fallar('g-agarre');
    } else this.sueltoDesde = 0;
    if (this.avance >= this.u.objetivo) {
      Object.assign(this, { paso: 'clic', tClic: ahora });
      this.ui.sonar(conClic ? 'clic' : 'llave');
      pitar();
    }
    this.dibujarTablero(ahora);
    if (this.paso === 'jala')
      this.frase(
        this.avance < 2
          ? 'Jala hacia ti, parejo, con la muñeca recta'
          : `Sigue parejo… ${Math.round((Math.max(0, this.avance) / this.u.objetivo) * 100)} %`,
      );
    return null;
  }

  // ---------- Firme (multímetro: sostener la punta quieta) ----------
  pasoFirme(ahora) {
    const { g } = this;
    if (this.paso === 'listo') Object.assign(this, { paso: 'prep', desde: ahora });
    if (this.paso === 'prep') {
      const falta = 3000 - (ahora - this.desde);
      this.dibujarTablero(ahora);
      if (falta > 0) {
        this.frase(`Toma la punta como lápiz y apóyala en el borne (+)… ${Math.ceil(falta / 1000)}`);
        return null;
      }
      Object.assign(this, { paso: 'mide', desde: ahora, inestable: 0, ultimo: ahora });
    }
    const dt = ahora - (this.ultimo ?? ahora);
    this.ultimo = ahora;
    if (guante.gmag > this.u.movimiento) this.inestable += dt;
    if (this.inestable > 300) this.fallar('g-firme');
    if (desviacionMuneca() > this.u.muneca) {
      this.munecaDesde ||= ahora;
      if (ahora - this.munecaDesde > 500) this.fallar('g-muneca');
    } else this.munecaDesde = 0;
    led(guante.gmag <= this.u.movimiento);
    this.dibujarTablero(ahora);
    const t = (ahora - this.desde) / 1000;
    if (t >= (g.segundos ?? 3)) {
      pitar();
      return this.terminar();
    }
    this.frase(`Quieto, sosteniendo la punta… ${Math.max(0, (g.segundos ?? 3) - t).toFixed(1)} s`, 'ok');
    return null;
  }

  terminar() {
    led(false);
    this.terminado = true;
    return { terminado: true, nota: calificar(this.reglas, this.fallas), fallas: [...this.fallas] };
  }

  // ---------- Dibujo: la pantalla que guía ----------
  dibujarFondo() {
    const { ctx, lienzo } = this.ui;
    ctx.fillStyle = COLOR.tinta;
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.fillRect(0, 0, lienzo.width, 54);
    ctx.fillStyle = COLOR.blanco;
    ctx.font = '700 22px Archivo, sans-serif';
    ctx.fillText(`Parte 2 · Con el guante · ${this.ej.herramienta}`, 18, 35);
  }

  dibujarCentro(grande, chico) {
    const { ctx, lienzo } = this.ui;
    ctx.textAlign = 'center';
    const ancho = lienzo.width * 0.88;
    // El texto grande se achica hasta caber; el chico se parte en renglones.
    let tam = 96;
    ctx.font = `800 ${tam}px Archivo, sans-serif`;
    while (ctx.measureText(grande).width > ancho && tam > 30) {
      tam -= 6;
      ctx.font = `800 ${tam}px Archivo, sans-serif`;
    }
    ctx.fillStyle = COLOR.marca;
    ctx.fillText(grande, lienzo.width / 2, lienzo.height / 2);
    ctx.fillStyle = COLOR.blanco;
    ctx.font = '600 24px Archivo, sans-serif';
    const renglones = [];
    chico.split(' ').forEach((palabra) => {
      const ultimo = renglones.length ? renglones[renglones.length - 1] : null;
      if (ultimo != null && ctx.measureText(`${ultimo} ${palabra}`).width <= ancho)
        renglones[renglones.length - 1] = `${ultimo} ${palabra}`;
      else renglones.push(palabra);
    });
    renglones.forEach((r, k) => ctx.fillText(r, lienzo.width / 2, lienzo.height / 2 + 60 + k * 32));
    ctx.textAlign = 'start';
  }

  dibujarTablero(ahora) {
    const { ctx, lienzo } = this.ui;
    const { g } = this;
    const W = lienzo.width;
    const H = lienzo.height;
    // Izquierda: la herramienta (carátula de torque) o la punta (multímetro).
    const cx = W * 0.32;
    const cy = H * 0.55;
    const R = H * 0.3;
    if (g.tipo === 'firme') {
      const quieto = guante.gmag <= this.u.movimiento;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = quieto ? 'rgba(47,125,67,.35)' : 'rgba(180,35,24,.35)';
      ctx.fill();
      const temblor = Math.min(R * 0.5, guante.gmag * 0.8);
      ctx.beginPath();
      ctx.arc(cx + (Math.random() - 0.5) * temblor, cy + (Math.random() - 0.5) * temblor, 14, 0, Math.PI * 2);
      ctx.fillStyle = COLOR.mal;
      ctx.fill();
      ctx.fillStyle = COLOR.blanco;
      ctx.font = '700 22px Archivo, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(quieto ? 'Punta quieta' : 'La punta se mueve', cx, cy + R * 0.85);
      ctx.textAlign = 'start';
    } else {
      // Carátula: arco de 0 al objetivo; aguja con el giro del guante.
      const a0 = Math.PI * 0.8;
      const a1 = Math.PI * 2.2;
      const ang = (v) => a0 + (a1 - a0) * Math.max(0, Math.min(1.25, v / this.u.objetivo)) * 0.8;
      ctx.lineWidth = 18;
      ctx.strokeStyle = 'rgba(255,255,255,.15)';
      ctx.beginPath();
      ctx.arc(cx, cy, R, a0, ang(this.u.objetivo * 1.25));
      ctx.stroke();
      ctx.strokeStyle = COLOR.marca;
      ctx.beginPath();
      ctx.arc(cx, cy, R, a0, ang(Math.max(0.01, Math.min(this.avance, this.u.objetivo))));
      ctx.stroke();
      // Marca del clic.
      const ac = ang(this.u.objetivo);
      ctx.strokeStyle = COLOR.ok;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ac) * (R - 26), cy + Math.sin(ac) * (R - 26));
      ctx.lineTo(cx + Math.cos(ac) * (R + 26), cy + Math.sin(ac) * (R + 26));
      ctx.stroke();
      // Aguja.
      const aa = ang(this.avance);
      ctx.strokeStyle = COLOR.blanco;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(aa) * (R - 10), cy + Math.sin(aa) * (R - 10));
      ctx.stroke();
      ctx.fillStyle = COLOR.blanco;
      ctx.textAlign = 'center';
      ctx.font = '800 40px Archivo, sans-serif';
      ctx.fillText(`${Math.round(Math.max(0, (this.avance / this.u.objetivo) * 100))} %`, cx, cy + 14);
      ctx.font = '600 18px Archivo, sans-serif';
      ctx.fillText(g.clic === false ? 'hasta que se afloje' : 'hasta el clic', cx, cy + 42);
      if (g.estrella) {
        // Qué tuerca toca: en estrella, la que va enfrente de la anterior.
        const orden = [0, 5, 2, 7, 4, 9, 6, 1, 8, 3];
        const r = R * 0.55;
        for (let k = 0; k < 10; k += 1) {
          const a = -Math.PI / 2 + (k / 10) * Math.PI * 2;
          const n = orden.indexOf(k);
          let relleno = 'rgba(255,255,255,.2)';
          if (n < this.rep) relleno = COLOR.ok;
          else if (n === this.rep && Math.floor(ahora / 300) % 2) relleno = COLOR.marca;
          ctx.beginPath();
          ctx.arc(
            cx + Math.cos(a) * r * 0.55 + R * 1.25,
            cy - R * 0.6 + Math.sin(a) * r * 0.55,
            9,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = relleno;
          ctx.fill();
        }
        ctx.font = '600 16px Archivo, sans-serif';
        ctx.fillText(
          `Tuerca ${Math.min(this.rep + 1, g.repeticiones)} de ${g.repeticiones}`,
          cx + R * 1.25,
          cy - R * 0.05,
        );
      }
      ctx.textAlign = 'start';
    }
    // Derecha: medidores.
    const x = W * 0.62;
    let y = H * 0.24;
    const barra = (titulo, valor, maximo, limite, texto) => {
      ctx.fillStyle = COLOR.blanco;
      ctx.font = '700 20px Archivo, sans-serif';
      ctx.fillText(titulo, x, y);
      ctx.font = '600 18px Archivo, sans-serif';
      ctx.textAlign = 'end';
      ctx.fillText(texto, W - 30, y);
      ctx.textAlign = 'start';
      const w = W - 30 - x;
      ctx.fillStyle = 'rgba(255,255,255,.15)';
      ctx.fillRect(x, y + 10, w, 16);
      const f = Math.min(1, valor / maximo);
      ctx.fillStyle = valor > limite ? COLOR.mal : COLOR.ok;
      ctx.fillRect(x, y + 10, w * f, 16);
      ctx.fillStyle = COLOR.marca;
      ctx.fillRect(x + w * (limite / maximo) - 2, y + 4, 4, 28);
      y += 78;
    };
    const muneca = desviacionMuneca();
    barra(
      'Muñeca',
      muneca,
      45,
      this.u.muneca,
      guante.neutro ? `${Math.round(muneca)}° de la recta` : 'sin calibrar',
    );
    if (g.tipo === 'firme')
      barra('Movimiento', guante.gmag, 120, g.movimiento ?? 35, `${Math.round(guante.gmag)} °/s`);
    else barra('Jalón', guante.gmag, 300, g.tiron ?? 220, guante.gmag > this.u.tiron ? '¡tirón!' : 'parejo');
    // Agarre.
    ctx.fillStyle = COLOR.blanco;
    ctx.font = '700 20px Archivo, sans-serif';
    ctx.fillText('Agarre (botón)', x, y);
    ctx.beginPath();
    ctx.arc(x + 18, y + 34, 16, 0, Math.PI * 2);
    ctx.fillStyle = guante.grip ? COLOR.ok : 'rgba(255,255,255,.2)';
    ctx.fill();
    ctx.fillStyle = COLOR.blanco;
    ctx.font = '600 18px Archivo, sans-serif';
    ctx.fillText(guante.grip ? 'Firme' : 'Suelto', x + 44, y + 40);
  }
}
