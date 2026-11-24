import { api } from './api.js';
import { ico } from './iconos.js';
import { avisoError, esc } from './ui.js';

const RUTAS = [
  { ruta: 'agenda', titulo: 'Agenda', corto: 'Agenda', icono: 'calendario', vista: () => import('./vistas/agenda.js') },
  { ruta: 'nueva-cita', titulo: 'Nueva cita', corto: 'Cita', icono: 'calendario-mas', vista: () => import('./vistas/nueva-cita.js') },
  { ruta: 'pacientes', titulo: 'Pacientes', corto: 'Pacientes', icono: 'usuarios', vista: () => import('./vistas/pacientes.js') },
  { ruta: 'procedimientos', titulo: 'Procedimientos', corto: 'Servicios', icono: 'portapapeles', vista: () => import('./vistas/procedimientos.js') },
  { ruta: 'horario', titulo: 'Horario', corto: 'Horario', icono: 'reloj', vista: () => import('./vistas/horario.js') },
  { ruta: 'avisos', titulo: 'Avisos', corto: 'Avisos', icono: 'campana', vista: () => import('./vistas/avisos.js') },
];

let vistaActual = null;

function pintarNavegacion(rutaActiva) {
  const enlace = (r, clase = '') =>
    `<a href="#/${r.ruta}" ${r.ruta === rutaActiva ? 'aria-current="page"' : ''} class="${clase}">${ico(r.icono)}<span>${esc(clase ? r.corto : r.titulo)}</span></a>`;
  document.getElementById('nav-lateral').innerHTML = RUTAS.map((r) => enlace(r)).join('');
  document.getElementById('nav-movil').innerHTML = RUTAS.map((r) => enlace(r, 'movil')).join('');
}

async function navegar() {
  const [bruto, consulta = ''] = (location.hash.slice(2) || 'agenda').split('?');
  const ruta = RUTAS.find((r) => r.ruta === bruto) ?? RUTAS[0];
  pintarNavegacion(ruta.ruta);
  document.title = `${ruta.titulo} · Agenda odontológica`;

  vistaActual?.desmontar?.();
  // Un contenedor nuevo en cada vista descarta los eventos de la anterior
  const anterior = document.getElementById('contenido');
  const contenedor = anterior.cloneNode(false);
  anterior.replaceWith(contenedor);
  window.scrollTo({ top: 0 });

  try {
    vistaActual = await ruta.vista();
    await vistaActual.montar(contenedor, new URLSearchParams(consulta));
  } catch (error) {
    contenedor.innerHTML = avisoError(error.mensajes ?? ['No se pudo cargar esta pantalla.']);
  }
}

async function verificarServidor() {
  const punto = document.getElementById('punto-api');
  const texto = document.getElementById('texto-api');
  try {
    await api.get('/salud');
    punto.className = 'punto ok';
    texto.textContent = 'Servidor en línea';
  } catch {
    punto.className = 'punto mal';
    texto.textContent = 'Sin conexión con el servidor';
  }
}

document.getElementById('logo').innerHTML = ico('diente');
document.getElementById('pie-icono').innerHTML = `${ico('chispa')}Agenda inteligente`;
window.addEventListener('hashchange', navegar);
navegar();
verificarServidor();
setInterval(verificarServidor, 20000);
