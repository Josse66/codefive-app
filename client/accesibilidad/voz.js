// Voz que lee en voz alta, siempre junto con el MISMO texto en pantalla (a los técnicos mayores
// les ayuda oír y leer a la vez: Shore y Heisz, 2015). Usa la lectura del navegador: funciona sin
// internet con las voces en español instaladas en el sistema.
let vozElegida = null;

function elegirVoz() {
  const voces = window.speechSynthesis?.getVoices() ?? [];
  vozElegida =
    voces.find((v) => v.lang === 'es-MX') ??
    voces.find((v) => v.lang?.startsWith('es-US')) ??
    voces.find((v) => v.lang?.startsWith('es')) ??
    null;
}
if ('speechSynthesis' in window) {
  elegirVoz();
  window.speechSynthesis.addEventListener?.('voiceschanged', elegirVoz);
}

export const hayVoz = () => 'speechSynthesis' in window;

/** Lee el texto (corta lo que se estaba leyendo). */
export function hablar(texto) {
  if (!hayVoz() || !texto) return;
  const frase = new SpeechSynthesisUtterance(texto);
  frase.lang = vozElegida?.lang ?? 'es-MX';
  if (vozElegida) frase.voice = vozElegida;
  frase.rate = 0.92; // un poco más pausado que lo normal
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(frase);
}

export function callar() {
  if (hayVoz()) window.speechSynthesis.cancel();
}
