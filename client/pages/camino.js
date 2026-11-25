// Mi camino: monta la vitrina con el autobús (solo en pantallas anchas).
const vitrina = document.getElementById('vitrina');
if (vitrina && window.matchMedia('(min-width: 1024px)').matches) {
  import('../escena/vitrina.js').then(({ montarVitrina }) => montarVitrina(vitrina, { velocidad: 0.12 }));
}
