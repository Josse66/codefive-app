// Mapa de competencias: seleccionar un recuadro de la lámina (o su botón en pantallas chicas)
// muestra la tabla de ese grupo.
const recuadros = document.querySelectorAll('.recuadro-grupo[role="button"]');
const botones = document.querySelectorAll('.boton-grupo');
const paneles = document.querySelectorAll('.panel-grupo');

function seleccionar(grupo) {
  recuadros.forEach((r) => {
    const activo = r.dataset.grupo === grupo;
    r.setAttribute('aria-pressed', String(activo));
    r.querySelector('.anillo').setAttribute('visibility', activo ? 'visible' : 'hidden');
  });
  botones.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.grupo === grupo)));
  paneles.forEach((p) => p.toggleAttribute('hidden', p.id !== `grupo-${grupo}`));
}

recuadros.forEach((r) => {
  r.addEventListener('click', () => seleccionar(r.dataset.grupo));
  r.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter' || evento.key === ' ') {
      evento.preventDefault();
      seleccionar(r.dataset.grupo);
    }
  });
});
botones.forEach((b) => b.addEventListener('click', () => seleccionar(b.dataset.grupo)));
