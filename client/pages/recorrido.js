// Recorrido de primera vez en Mi plan. Se abre solo la primera vez (se recuerda en el navegador)
// y cualquier botón con data-abrir-recorrido lo vuelve a abrir.
const dialogo = document.getElementById('recorrido');

if (dialogo) {
  const tarjetas = [...dialogo.querySelectorAll('[data-tarjeta]')];
  const $ = (id) => document.getElementById(id);
  let actual = 0;

  const mostrar = (i) => {
    actual = Math.max(0, Math.min(tarjetas.length - 1, i));
    tarjetas.forEach((t, j) => {
      const tarjeta = t;
      tarjeta.hidden = j !== actual;
    });
    $('recorrido-cuenta').textContent = `${actual + 1} de ${tarjetas.length}`;
    $('recorrido-anterior').disabled = actual === 0;
    $('recorrido-siguiente').textContent = actual === tarjetas.length - 1 ? 'Empezar' : 'Siguiente →';
  };
  const cerrar = () => {
    localStorage.setItem('recorridoVisto', '1');
    dialogo.close();
  };

  $('recorrido-anterior').addEventListener('click', () => mostrar(actual - 1));
  $('recorrido-siguiente').addEventListener('click', () =>
    actual === tarjetas.length - 1 ? cerrar() : mostrar(actual + 1),
  );
  $('recorrido-saltar').addEventListener('click', cerrar);
  dialogo.addEventListener('cancel', () => localStorage.setItem('recorridoVisto', '1'));
  document.querySelectorAll('[data-abrir-recorrido]').forEach((b) =>
    b.addEventListener('click', () => {
      mostrar(0);
      dialogo.showModal();
    }),
  );

  if (!localStorage.getItem('recorridoVisto')) {
    mostrar(0);
    dialogo.showModal();
  }
}
