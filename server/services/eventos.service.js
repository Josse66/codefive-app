import db from '#db/conexion.js';
import logger from '#config/logger.js';
import { avisar } from '#config/envivo.js';

const insertar = db.prepare(`
  INSERT INTO eventos (tecnico_id, tipo, fase, competencia_id, pregunta_id, escenario_id, paso_id, accion,
                       correcta, critico, pista, confianza, codigo_error, input_device, ms)
  VALUES (@tecnico_id, @tipo, @fase, @competencia_id, @pregunta_id, @escenario_id, @paso_id, @accion,
          @correcta, @critico, @pista, @confianza, @codigo_error, @input_device, @ms)`);

// Registra un evento en la bitácora (solo se agregan filas) y en el log de auditoría.
export function registrarEvento(evento) {
  const fila = {
    competencia_id: null,
    pregunta_id: null,
    escenario_id: null,
    paso_id: null,
    accion: null,
    critico: 0,
    pista: 0,
    confianza: null,
    codigo_error: null,
    input_device: 'mouse',
    ms: null,
    ...evento,
  };
  fila.correcta = fila.correcta ? 1 : 0;
  fila.critico = fila.critico ? 1 : 0;
  fila.pista = fila.pista ? 1 : 0;
  const { lastInsertRowid } = insertar.run(fila);
  logger.info(
    `evento ${fila.tipo}/${fila.fase} tecnico=${fila.tecnico_id} competencia=${fila.competencia_id} correcta=${fila.correcta}`,
  );
  const id = Number(lastInsertRowid);
  // Los tableros abiertos se actualizan con cada respuesta o acción.
  avisar('evento', {
    id,
    tecnicoId: fila.tecnico_id,
    fase: fila.fase,
    competenciaId: fila.competencia_id,
    escenarioId: fila.escenario_id,
    critico: fila.critico === 1,
    codigoError: fila.codigo_error,
  });
  return id;
}
