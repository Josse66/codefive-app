import { bitacora, calcularIndices } from '#services/simulador.service.js';
import { obtenerTecnico } from '#services/tecnicos.service.js';

// Reporte imprimible de un técnico (evidencias de IEF, ICO e IEFI): evaluaciones inicial, final y
// diferida por sistema, matriz de sistemas, Pareto, bitácora y horas contra la línea base.
const EXPERIENCIA = { general: 'General', mayor: 'Adulto Mayor' };
const RESULTADO = { correcta: '✓ correcta', error: '✗ error', critico: '⚠ crítico', ayuda: '? pidió ayuda' };
const ACTIVIDAD = {
  conoce: 'Conoce',
  encuentra: 'Encuéntralo',
  comprueba: 'Comprueba',
  orden: 'Orden de taller',
  libre: 'Práctica libre',
};

export function mostrarReporte(req, res) {
  const tecnico = obtenerTecnico(req.params.id);
  if (!tecnico) {
    res.status(404).render('404', { titulo: 'No encontrado', ruta: req.originalUrl });
    return;
  }
  const indices = calcularIndices(tecnico.id);
  const fmt = (x) => (x == null ? '—' : x);
  res.render('reporte', {
    titulo: `Reporte · ${tecnico.nombre}`,
    seccion: 'tablero',
    sinMenu: true,
    tecnico: { ...tecnico, experienciaTexto: EXPERIENCIA[tecnico.experiencia] ?? tecnico.experiencia },
    fecha: new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }),
    ief: {
      ...indices.ief,
      valor: fmt(indices.ief.valor),
      dominio: fmt(indices.ief.dominio),
      retencion: fmt(indices.ief.retencion),
    },
    ico: {
      ...indices.ico,
      valor: fmt(indices.ico.valor),
      precision: fmt(indices.ico.precision),
      autonomia: fmt(indices.ico.autonomia),
      reduccionErrores: fmt(indices.ico.reduccionErrores),
      criticosFinales: fmt(indices.ico.criticosFinales),
    },
    iefi: {
      ...indices.iefi,
      valor: fmt(indices.iefi.valor),
      reduccionTiempo: fmt(indices.iefi.reduccionTiempo),
      horasAhorradas: fmt(indices.iefi.horasAhorradas),
    },
    sistemas: indices.sistemas.map((s) => ({
      ...s,
      inicial: fmt(s.inicial),
      final: fmt(s.final),
      diferida: fmt(s.diferida),
      orden: fmt(s.orden),
      estado: s.acreditado ? 'Acreditado' : 'Pendiente',
    })),
    brechas: indices.sistemas.filter((s) => !s.acreditado).map((s) => s.nombre),
    pareto: indices.pareto,
    bitacora: bitacora(tecnico.id, 60).map((a) => ({
      ...a,
      actividad: ACTIVIDAD[a.actividad] ?? a.actividad,
      resultado: RESULTADO[a.resultado] ?? a.resultado,
      critico: a.resultado === 'critico',
      ayuda: a.conAyuda ? 'con ayuda' : '',
    })),
  });
}
