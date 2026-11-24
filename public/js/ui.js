import { ico } from './iconos.js';

const ZONA = 'America/Bogota';

export const esc = (valor) =>
  String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- fechas y horas del consultorio (UTC-5) ----------
export const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: ZONA });
export const horaActual = () =>
  new Date().toLocaleTimeString('en-GB', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' });

export function sumarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
export const fechaLarga = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-CO', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
export const fechaCorta = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-CO', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
export const diaSemanaISO = (iso) => ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
export const hace = (fechaIso) => {
  const seg = Math.round((Date.now() - new Date(fechaIso).getTime()) / 1000);
  if (seg < 60) return 'justo ahora';
  if (seg < 3600) return `hace ${Math.round(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.round(seg / 3600)} h`;
  return new Date(fechaIso).toLocaleDateString('es-CO', { timeZone: ZONA, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// ---------- estados de la cita ----------
export const ESTADOS = {
  Programada: { slug: 'programada', icono: 'calendario' },
  Confirmada: { slug: 'confirmada', icono: 'calendario-ok' },
  'Por reprogramar': { slug: 'por-reprogramar', icono: 'refrescar' },
  'En sala': { slug: 'en-sala', icono: 'silla' },
  'En atención': { slug: 'en-atencion', icono: 'actividad' },
  Atendida: { slug: 'atendida', icono: 'check-circulo' },
  Cancelada: { slug: 'cancelada', icono: 'x-circulo' },
  Inasistencia: { slug: 'inasistencia', icono: 'usuario-x' },
};
export const claseEstado = (estado) => `est-${ESTADOS[estado]?.slug ?? 'programada'}`;
export const chipEstado = (estado) =>
  `<span class="chip ${claseEstado(estado)}">${ico(ESTADOS[estado]?.icono ?? 'calendario')}${esc(estado)}</span>`;

// ---------- avatares ----------
const PALETAS = [
  ['#14b8b0', '#5568e8'],
  ['#f59e0b', '#ef6a4b'],
  ['#8a5cf0', '#d646b5'],
  ['#2f7de1', '#14b8b0'],
  ['#1d9f65', '#8bc34a'],
  ['#e0457b', '#f59e0b'],
];
export function avatar(nombre) {
  const partes = String(nombre ?? '?').trim().split(/\s+/);
  const iniciales = ((partes[0]?.[0] ?? '?') + (partes[1]?.[0] ?? '')).toUpperCase();
  let h = 0;
  for (const c of String(nombre)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [a, b] = PALETAS[h % PALETAS.length];
  return `<span class="avatar" style="--c1:${a};--c2:${b}" aria-hidden="true">${esc(iniciales)}</span>`;
}

// ---------- avisos ----------
export function toast(mensaje, tipo = 'ok') {
  const contenedor = document.getElementById('toasts');
  const nodo = document.createElement('div');
  nodo.className = `toast ${tipo}`;
  nodo.setAttribute('role', tipo === 'mal' ? 'alert' : 'status');
  nodo.innerHTML = `${ico(tipo === 'ok' ? 'check-circulo' : 'alerta')}<p>${esc(mensaje)}</p>`;
  contenedor.append(nodo);
  setTimeout(() => nodo.remove(), tipo === 'ok' ? 4200 : 7000);
}

export const avisoError = (mensajes) => {
  const lista = Array.isArray(mensajes) ? mensajes : [mensajes];
  return `<div class="aviso error" role="alert">${ico('alerta')}<div>${
    lista.length > 1 ? `<strong>Revise los datos:</strong><ul>${lista.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : esc(lista[0])
  }</div></div>`;
};

// ---------- modales ----------
export function abrirModal({ titulo, icono = 'info', cuerpo, pie = '', ancho = false }) {
  const dialogo = document.createElement('dialog');
  if (ancho) dialogo.className = 'ancho';
  dialogo.innerHTML = `
    <div class="modal-cab">
      <h2>${ico(icono)}<span>${esc(titulo)}</span></h2>
      <button type="button" class="btn icono fantasma" data-cerrar aria-label="Cerrar">${ico('x')}</button>
    </div>
    <div class="modal-cuerpo">${cuerpo}</div>
    ${pie ? `<div class="modal-pie">${pie}</div>` : ''}`;
  document.body.append(dialogo);
  dialogo.addEventListener('click', (e) => {
    if (e.target === dialogo || e.target.closest('[data-cerrar]')) dialogo.close();
  });
  dialogo.addEventListener('close', () => dialogo.remove());
  dialogo.showModal();
  return dialogo;
}

export function confirmar({ titulo, mensaje, textoOk = 'Confirmar', peligro = false, icono = 'alerta' }) {
  return new Promise((resolver) => {
    const dialogo = abrirModal({
      titulo,
      icono,
      cuerpo: `<p>${esc(mensaje)}</p>`,
      pie: `<button type="button" class="btn" data-cerrar>Cancelar</button>
            <button type="button" class="btn ${peligro ? 'peligro' : 'primario'}" data-ok>${esc(textoOk)}</button>`,
    });
    let resultado = false;
    dialogo.querySelector('[data-ok]').addEventListener('click', () => {
      resultado = true;
      dialogo.close();
    });
    dialogo.addEventListener('close', () => resolver(resultado));
  });
}

export const esqueletos = (n = 3) => `<div class="lista-citas">${'<div class="esqueleto"></div>'.repeat(n)}</div>`;

export const vacio = ({ icono = 'diente', titulo, texto = '', extra = '' }) =>
  `<div class="vacio"><div class="ilustracion">${ico(icono)}</div><h3>${esc(titulo)}</h3><p>${esc(texto)}</p>${extra}</div>`;

// ---------- menús desplegables ----------
document.addEventListener('click', (e) => {
  const boton = e.target.closest('[data-menu]');
  document.querySelectorAll('.menu').forEach((m) => {
    if (!boton || !m.parentElement.contains(boton)) m.remove();
  });
  if (boton && !boton.parentElement.querySelector('.menu')) {
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = boton.dataset.menu;
    boton.parentElement.append(menu);
    // Si no cabe debajo del botón, se abre hacia arriba
    const caja = menu.getBoundingClientRect();
    if (caja.bottom > window.innerHeight - 8 && boton.getBoundingClientRect().top - caja.height > 8) {
      menu.classList.add('arriba');
    }
  } else if (boton) {
    boton.parentElement.querySelector('.menu')?.remove();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.menu').forEach((m) => m.remove());
});
