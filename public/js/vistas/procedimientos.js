import { api } from '../api.js';
import { ico } from '../iconos.js';
import { abrirModal, avisoError, confirmar, esc, esqueletos, toast, vacio } from '../ui.js';

let el = null;
let lista = [];
let verInactivos = false;

const DURACIONES = Array.from({ length: 12 }, (_, i) => (i + 1) * 15);
const selectorDuracion = (valor) =>
  `<select id="duracion">${DURACIONES.map((d) => `<option value="${d}" ${d === valor ? 'selected' : ''}>${d} minutos${d >= 60 ? ` (${d / 60} h)` : ''}</option>`).join('')}</select>`;

export async function montar(contenedor) {
  el = contenedor;
  verInactivos = false;
  el.innerHTML = `
    <header class="cabecera">
      <div><h1>Procedimientos</h1><p>Cada cita reserva el tiempo del procedimiento, en bloques de 15 minutos.</p></div>
      <div class="cabecera-acciones">
        <div class="segmentos" role="group" aria-label="Filtro">
          <button type="button" aria-pressed="true" data-filtro="activos">Activos</button>
          <button type="button" aria-pressed="false" data-filtro="todos">Todos</button>
        </div>
        <button type="button" class="btn primario" data-accion="nuevo">${ico('mas')}Nuevo procedimiento</button>
      </div>
    </header>
    <div id="lista">${esqueletos(3)}</div>`;
  el.addEventListener('click', alHacerClic);
  await cargar();
}

async function cargar() {
  try {
    lista = await api.get(`/procedimientos${verInactivos ? '?incluirInactivos=true' : ''}`);
    pintar();
  } catch (error) {
    el.querySelector('#lista').innerHTML = avisoError(error.mensajes);
  }
}

function pintar() {
  const contenedor = el.querySelector('#lista');
  if (!lista.length) {
    contenedor.innerHTML = `<div class="tarjeta">${vacio({ icono: 'portapapeles', titulo: 'No hay procedimientos', texto: 'Crea el primero para poder programar citas.' })}</div>`;
    return;
  }
  contenedor.innerHTML = `<div class="rejilla-tarjetas">${lista
    .map(
      (p, i) => `<article class="item ${p.activo ? '' : 'inactivo'}" style="animation-delay:${Math.min(i, 8) * 40}ms">
        <div class="item-cab"><div class="icono-grande">${ico('diente')}</div><div><h3>${esc(p.nombre)}</h3><p>Reserva ${p.duracionMin} minutos</p></div></div>
        <div class="item-pie">
          <span class="chip ${p.activo ? 'est-atendida' : 'est-cancelada'}">${ico(p.activo ? 'check-circulo' : 'x-circulo')}${p.activo ? 'Disponible' : 'Desactivado'}</span>
          <span class="chip">${ico('reloj')}${p.duracionMin} min</span>
          ${
            p.activo
              ? `<button type="button" class="btn chico" data-accion="editar" data-id="${p.id}">${ico('editar')}Editar</button>
                 <button type="button" class="btn chico peligro" data-accion="desactivar" data-id="${p.id}">${ico('x-circulo')}Desactivar</button>`
              : ''
          }
        </div>
      </article>`,
    )
    .join('')}</div>`;
}

function alHacerClic(e) {
  const filtro = e.target.closest('[data-filtro]');
  if (filtro) {
    verInactivos = filtro.dataset.filtro === 'todos';
    el.querySelectorAll('[data-filtro]').forEach((b) => b.setAttribute('aria-pressed', String(b === filtro)));
    cargar();
    return;
  }
  const boton = e.target.closest('[data-accion]');
  if (!boton) return;
  const procedimiento = lista.find((p) => p.id === Number(boton.dataset.id));
  if (boton.dataset.accion === 'nuevo') modalFormulario();
  if (boton.dataset.accion === 'editar') modalFormulario(procedimiento);
  if (boton.dataset.accion === 'desactivar') desactivar(procedimiento);
}

function modalFormulario(p) {
  const dialogo = abrirModal({
    titulo: p ? 'Editar procedimiento' : 'Nuevo procedimiento',
    icono: p ? 'editar' : 'portapapeles',
    cuerpo: `<label class="campo"><span>Nombre</span><input id="nombre" maxlength="100" value="${esc(p?.nombre ?? '')}" placeholder="Por ejemplo: Limpieza dental" /></label>
      <label class="campo"><span>Duración</span>${selectorDuracion(p?.duracionMin ?? 30)}<small>Una cita ya programada conserva la duración que tenía al crearse.</small></label>
      <div id="error-modal"></div>`,
    pie: `<button type="button" class="btn" data-cerrar>Cancelar</button><button type="button" class="btn primario" data-ok>${ico('check')}Guardar</button>`,
  });
  dialogo.querySelector('[data-ok]').addEventListener('click', async (e) => {
    const cuerpo = { nombre: dialogo.querySelector('#nombre').value, duracionMin: Number(dialogo.querySelector('#duracion').value) };
    const botonOk = e.currentTarget;
    botonOk.disabled = true;
    try {
      const respuesta = p ? await api.patch(`/procedimientos/${p.id}`, cuerpo) : await api.post('/procedimientos', cuerpo);
      dialogo.close();
      toast(respuesta.aviso ?? (p ? 'Procedimiento actualizado.' : 'Procedimiento creado.'));
      await cargar();
    } catch (error) {
      botonOk.disabled = false;
      dialogo.querySelector('#error-modal').innerHTML = avisoError(error.mensajes);
    }
  });
}

async function desactivar(p) {
  const ok = await confirmar({
    titulo: 'Desactivar procedimiento',
    mensaje: `«${p.nombre}» dejará de ofrecerse en citas nuevas. Las citas existentes y el historial se conservan.`,
    textoOk: 'Desactivar',
    peligro: true,
  });
  if (!ok) return;
  try {
    await api.patch(`/procedimientos/${p.id}/desactivar`);
    toast('Procedimiento desactivado.');
    await cargar();
  } catch (error) {
    toast(error.message, 'mal');
  }
}
