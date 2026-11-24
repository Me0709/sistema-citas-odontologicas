import { api } from '../api.js';
import { ico } from '../iconos.js';
import { avisoError, esc, esqueletos, hace, vacio } from '../ui.js';

const TIPOS = {
  retraso: { icono: 'temporizador', clase: 'ico-aviso', titulo: 'Nueva hora estimada' },
  adelanto: { icono: 'rayo', clase: 'ico-ok', titulo: 'Puede adelantar su cita' },
  requiere_alternativas: { icono: 'mezclar', clase: 'ico-violeta', titulo: 'Debe mantener su horario' },
  sin_alternativas: { icono: 'alerta', clase: 'ico-peligro', titulo: 'Sin alternativas posibles' },
  alternativas_propuestas: { icono: 'chispa', clase: 'ico-acento', titulo: 'Alternativas propuestas' },
  cita_cancelada: { icono: 'x-circulo', clase: 'ico-peligro', titulo: 'Cita cancelada por el consultorio' },
  propuesta_rechazada: { icono: 'usuario-x', clase: 'ico-aviso', titulo: 'Propuesta rechazada' },
  propuesta_vencida: { icono: 'reloj', clase: 'ico-aviso', titulo: 'Propuesta sin respuesta' },
};

let el = null;
let filtro = '';
let temporizador = null;

export async function montar(contenedor) {
  el = contenedor;
  filtro = '';
  el.innerHTML = `
    <header class="cabecera">
      <div><h1>Avisos</h1><p>Lo que el sistema comunica a pacientes y al administrador. Quedan registrados dentro del sistema.</p></div>
      <div class="cabecera-acciones">
        <div class="segmentos" role="group" aria-label="Destinatario">
          <button type="button" aria-pressed="true" data-filtro="">Todos</button>
          <button type="button" aria-pressed="false" data-filtro="paciente">Pacientes</button>
          <button type="button" aria-pressed="false" data-filtro="administrador">Administrador</button>
        </div>
        <button type="button" class="btn" data-accion="actualizar">${ico('refrescar')}Actualizar</button>
      </div>
    </header>
    <div id="lista">${esqueletos(3)}</div>`;
  el.addEventListener('click', (e) => {
    const f = e.target.closest('[data-filtro]');
    if (f) {
      filtro = f.dataset.filtro;
      el.querySelectorAll('[data-filtro]').forEach((b) => b.setAttribute('aria-pressed', String(b === f)));
      cargar();
    }
    if (e.target.closest('[data-accion=actualizar]')) cargar();
  });
  await cargar();
  temporizador = setInterval(cargar, 30000);
}

export function desmontar() {
  clearInterval(temporizador);
}

async function cargar() {
  const lista = el?.querySelector('#lista');
  if (!lista) return;
  try {
    const avisos = await api.get(`/notificaciones${filtro ? `?destinatario=${filtro}` : ''}`);
    if (!avisos.length) {
      lista.innerHTML = `<div class="tarjeta">${vacio({ icono: 'campana', titulo: 'Todo en calma', texto: 'Cuando la agenda se retrase o cambie, los avisos aparecerán aquí.' })}</div>`;
      return;
    }
    lista.innerHTML = `<div class="notificaciones">${avisos
      .map((n) => {
        const t = TIPOS[n.tipo] ?? { icono: 'campana', clase: 'ico-primario', titulo: n.tipo };
        return `<article class="noti">
          <div class="metrica" style="padding:0;border:0;box-shadow:none;background:none"><div class="ico ${t.clase}">${ico(t.icono)}</div></div>
          <div style="min-width:0">
            <strong>${esc(t.titulo)}</strong>
            <p>${esc(n.mensaje)}</p>
            <small>${ico(n.destinatario === 'paciente' ? 'usuario' : 'escudo')} ${n.destinatario === 'paciente' ? 'Paciente' : 'Administrador'}${n.destinatario === 'paciente' ? ` · ${esc(n.destino)}` : ''}${n.citaId ? ` · cita ${n.citaId}` : ''}</small>
          </div>
          <time datetime="${esc(n.creadaEn)}">${esc(hace(n.creadaEn))}</time>
        </article>`;
      })
      .join('')}</div>`;
  } catch (error) {
    lista.innerHTML = avisoError(error.mensajes);
  }
}
