-- Competencia = tecnología × grupo de función × nivel × tipo de habilidad.
CREATE TABLE IF NOT EXISTS competencias (
  id            TEXT PRIMARY KEY,
  nombre        TEXT NOT NULL,
  tecnologia    TEXT NOT NULL CHECK (tecnologia IN ('diesel', 'electrica', 'ambas')),
  grupo         INTEGER NOT NULL CHECK (grupo BETWEEN 1 AND 9),
  nivel         INTEGER NOT NULL CHECK (nivel BETWEEN 1 AND 3),
  habilidad     TEXT NOT NULL CHECK (habilidad IN ('comprension', 'diagnostico', 'mantenimiento', 'reparacion', 'seguridad')),
  prerequisito  TEXT REFERENCES competencias (id),
  critica       INTEGER NOT NULL DEFAULT 0
);

-- dificultad: escala Elo (−3 fácil a +3 difícil); se ajusta con las respuestas de todos los técnicos.
CREATE TABLE IF NOT EXISTS preguntas (
  id              TEXT PRIMARY KEY,
  competencia_id  TEXT NOT NULL REFERENCES competencias (id),
  enunciado       TEXT NOT NULL,
  opciones        TEXT NOT NULL,
  correcta        TEXT NOT NULL,
  explicacion     TEXT NOT NULL,
  fuente          TEXT NOT NULL,
  dificultad      REAL NOT NULL DEFAULT 0,
  respuestas      INTEGER NOT NULL DEFAULT 0,
  -- 'practica': diagnóstico y práctica. 'evaluacion': antes y después; nunca se ven en la práctica.
  banco           TEXT NOT NULL DEFAULT 'practica' CHECK (banco IN ('practica', 'evaluacion'))
);

-- Técnicos ficticios para la demo. dias_simulados adelanta su reloj para la revisión diferida.
CREATE TABLE IF NOT EXISTS tecnicos (
  id                 TEXT PRIMARY KEY,
  nombre             TEXT NOT NULL,
  taller             TEXT NOT NULL,
  anios_experiencia  INTEGER NOT NULL DEFAULT 0,
  tecnologia         TEXT NOT NULL DEFAULT 'diesel',
  perfil             TEXT,
  dias_simulados     INTEGER NOT NULL DEFAULT 0,
  creado_en          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Bitácora de todo lo que hace un técnico: respuestas, acciones en la práctica y evaluaciones.
-- Solo se agregan filas; el dominio se recalcula a partir de aquí.
CREATE TABLE IF NOT EXISTS eventos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tecnico_id      TEXT NOT NULL REFERENCES tecnicos (id),
  tipo            TEXT NOT NULL CHECK (tipo IN ('respuesta', 'accion')),
  fase            TEXT NOT NULL CHECK (fase IN ('diagnostico', 'pre', 'practica', 'post', 'diferida')),
  competencia_id  TEXT REFERENCES competencias (id),
  pregunta_id     TEXT REFERENCES preguntas (id),
  escenario_id    TEXT,
  paso_id         TEXT,
  accion          TEXT,
  correcta        INTEGER NOT NULL,
  critico         INTEGER NOT NULL DEFAULT 0,
  pista           INTEGER NOT NULL DEFAULT 0,
  confianza       INTEGER CHECK (confianza IN (1, 2, 3)),
  codigo_error    TEXT,
  input_device    TEXT NOT NULL DEFAULT 'mouse',
  ms              INTEGER,
  creado_en       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_eventos_tecnico ON eventos (tecnico_id, creado_en);

-- Estado actual del modelo por técnico y competencia.
CREATE TABLE IF NOT EXISTS dominio (
  tecnico_id       TEXT NOT NULL REFERENCES tecnicos (id),
  competencia_id   TEXT NOT NULL REFERENCES competencias (id),
  p_saber          REAL NOT NULL,
  estabilidad      REAL NOT NULL DEFAULT 1,
  intentos         INTEGER NOT NULL DEFAULT 0,
  aciertos         INTEGER NOT NULL DEFAULT 0,
  ultima_practica  TEXT,
  PRIMARY KEY (tecnico_id, competencia_id)
);

-- Resultado de cada momento de evaluación por técnico y competencia: antes de practicar (pre),
-- justo después (post) y la revisión diferida tras simular días (diferida).
-- dia = días simulados del técnico en ese momento; ultimo_evento = hasta dónde llegaba la bitácora.
CREATE TABLE IF NOT EXISTS evaluaciones (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tecnico_id      TEXT NOT NULL REFERENCES tecnicos (id),
  competencia_id  TEXT NOT NULL REFERENCES competencias (id),
  fase            TEXT NOT NULL CHECK (fase IN ('pre', 'post', 'diferida')),
  aciertos        INTEGER NOT NULL,
  total           INTEGER NOT NULL,
  p_saber         REAL NOT NULL,
  estabilidad     REAL NOT NULL,
  dia             INTEGER NOT NULL DEFAULT 0,
  ultimo_evento   INTEGER NOT NULL DEFAULT 0,
  creado_en       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_evaluaciones_tecnico ON evaluaciones (tecnico_id, competencia_id, fase);

-- Modo Taller: órdenes de trabajo que el técnico atiende en su bahía. Cada una es un escenario con
-- cliente y unidad ficticios; al entregarla se califica y da experiencia.
CREATE TABLE IF NOT EXISTS ordenes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tecnico_id       TEXT NOT NULL REFERENCES tecnicos (id),
  escenario_id     TEXT NOT NULL,
  motivo           TEXT NOT NULL CHECK (motivo IN ('seguridad', 'brecha', 'nueva', 'repaso')),
  cliente          TEXT NOT NULL,
  unidad           TEXT NOT NULL,
  estado           TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'en_proceso', 'entregada')),
  iniciada_en      TEXT,
  entregada_en     TEXT,
  segundos         INTEGER,
  errores          INTEGER NOT NULL DEFAULT 0,
  criticos         INTEGER NOT NULL DEFAULT 0,
  pistas           INTEGER NOT NULL DEFAULT 0,
  gasto            INTEGER NOT NULL DEFAULT 0,
  gasto_necesario  INTEGER NOT NULL DEFAULT 0,
  estrellas        INTEGER,
  xp               INTEGER NOT NULL DEFAULT 0,
  creado_en        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ordenes_tecnico ON ordenes (tecnico_id, estado);

-- Modo Aprender: lecciones que el técnico ya leyó.
CREATE TABLE IF NOT EXISTS lecciones_vistas (
  tecnico_id   TEXT NOT NULL REFERENCES tecnicos (id),
  leccion_id   TEXT NOT NULL,
  vista_en     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tecnico_id, leccion_id)
);
