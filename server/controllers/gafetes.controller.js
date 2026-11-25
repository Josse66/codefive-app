import { escribirCookie } from '#helpers/sesion.js';
import { actualizarGafete, entrarConGafete, leerGafete, listarGafetes } from '#services/gafetes.service.js';

// Entrar con gafete (QR) + PIN, y administración de gafetes por el responsable del taller.

export function leer(req, res) {
  res.json(leerGafete(req.body?.codigo));
}

export function entrar(req, res) {
  try {
    const { token, segundos, tecnicoId } = entrarConGafete(req.body?.codigo, req.body?.pin);
    escribirCookie(res, token, segundos);
    res.json({ destino: `/tecnicos/${tecnicoId}/autobus` });
  } catch (error) {
    if (error.status !== 401) throw error;
    res.status(401).json({ error: error.message, restantes: error.restantes });
  }
}

export function listar(_req, res) {
  res.json(listarGafetes());
}

export function actualizar(req, res) {
  res.json(actualizarGafete(req.params.tecnicoId, req.body ?? {}));
}
