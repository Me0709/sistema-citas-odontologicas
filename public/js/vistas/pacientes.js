import { api } from '../api.js';
import { ico } from '../iconos.js';
import { abrirModal, avatar, avisoError, chipEstado, esc, esqueletos, fechaCorta, toast, vacio } from '../ui.js';

let pacientes = [];
let el = null;

export async function montar(contenedor) {
  el = contenedor;
  el.innerHTML = `
    <header class="cabecera">
      <div><h1>Pacientes</h1><p>Registro con autorización de datos y su historial de citas.</p></div>
      <div class="cabecera-acciones">
        <div class="buscador">${ico('buscar')}<input type="search" id="buscar" placeholder="Buscar por nombre o documento" aria-label="Buscar paciente" /></div>
        <button type="button" class="btn primario" data-accion="nuevo">${ico('usuario-mas')}Nuevo paciente</button>
      </div>
    </header>
    <div id="lista">${esqueletos(3)}</div>`;
  el.addEventListener('click', alHacerClic);
  el.querySelector('#buscar').addEventListener('input', pintar);
  await cargar();
}

async function cargar() {
  try {
    pacientes = await api.get('/pacientes');
    pintar();
  } catch (error) {
    el.querySelector('#lista').innerHTML = avisoError(error.mensajes);
  }
}

function pintar() {
  const termino = el.querySelector('#buscar').value.trim().toLowerCase();
  const filtrados = pacientes.filter((p) => !termino || `${p.nombre} ${p.documento}`.toLowerCase().includes(termino));
  const lista = el.querySelector('#lista');
  if (!filtrados.length) {
    lista.innerHTML = `<div class="tarjeta">${vacio({
      icono: 'usuarios',
      titulo: pacientes.length ? 'Sin resultados' : 'Aún no hay pacientes',
      texto: pacientes.length ? 'Prueba con otro nombre o documento.' : 'Registra el primer paciente para poder programar citas.',
    })}</div>`;
    return;
  }
  lista.innerHTML = `<div class="rejilla-tarjetas">${filtrados
    .map(
      (p, i) => `<article class="item" style="animation-delay:${Math.min(i, 8) * 40}ms">
        <div class="item-cab">${avatar(p.nombre)}<div style="min-width:0"><h3>${esc(p.nombre)}</h3><p>Documento ${esc(p.documento)}</p></div></div>
        <div class="item-datos">
          <div>${ico('telefono')}${esc(p.telefono)}</div>
          <div>${ico('correo')}${esc(p.correo)}</div>
          <div>${ico('escudo')}Datos personales autorizados</div>
        </div>
        <div class="item-pie">
          <span class="chip">${ico('calendario')}${p.historialCitas.length} cita(s)</span>
          <button type="button" class="btn chico" data-accion="historial" data-id="${p.id}">${ico('documento')}Historial</button>
          <a class="btn chico primario" href="#/nueva-cita">${ico('calendario-mas')}Agendar</a>
        </div>
      </article>`,
    )
    .join('')}</div>`;
}

function alHacerClic(e) {
  const boton = e.target.closest('[data-accion]');
  if (!boton) return;
  if (boton.dataset.accion === 'nuevo') modalNuevo();
  if (boton.dataset.accion === 'historial') modalHistorial(pacientes.find((p) => p.id === Number(boton.dataset.id)));
}

function modalHistorial(p) {
  const citas = p.historialCitas;
  abrirModal({
    titulo: `Historial de ${p.nombre}`,
    icono: 'documento',
    ancho: true,
    cuerpo: citas.length
      ? `<div class="lista-citas">${citas
          .map(
            (c) => `<div class="cambio" style="grid-template-columns:1fr auto">
              <span><strong>${esc(fechaCorta(c.fecha))}</strong> · ${esc(c.horaInicio)} – ${esc(c.horaFin)}<br /><small style="color:var(--tenue)">${esc(c.procedimiento?.nombre ?? 'Procedimiento')} · ${c.duracionMin} min</small></span>
              ${chipEstado(c.estado)}
            </div>`,
          )
          .join('')}</div>`
      : vacio({ icono: 'calendario', titulo: 'Sin citas todavía', texto: 'Cuando el paciente tenga citas, aparecerán aquí con su estado.' }),
  });
}

function modalNuevo() {
  const dialogo = abrirModal({
    titulo: 'Nuevo paciente',
    icono: 'usuario-mas',
    cuerpo: `<form class="formulario" id="form-paciente" novalidate>
      <label class="campo"><span>Nombre completo</span><input id="nombre" autocomplete="off" maxlength="150" required /></label>
      <div class="rejilla-2">
        <label class="campo"><span>Documento</span><input id="documento" inputmode="numeric" maxlength="20" placeholder="Solo números" required /></label>
        <label class="campo"><span>Teléfono</span><input id="telefono" inputmode="tel" maxlength="15" placeholder="3001234567" required /></label>
      </div>
      <label class="campo"><span>Correo electrónico</span><input id="correo" type="email" maxlength="150" required /></label>
      <label class="opcion" style="align-items:flex-start"><input type="checkbox" id="autoriza" style="position:static;opacity:1;margin-top:3px" />
        <span><strong>Autoriza el tratamiento de sus datos personales</strong><small>Obligatorio para registrar al paciente (Ley 1581 de 2012).</small></span></label>
      <div id="error-modal"></div>
    </form>`,
    pie: `<button type="button" class="btn" data-cerrar>Cancelar</button><button type="button" class="btn primario" data-ok>${ico('check')}Registrar paciente</button>`,
  });
  dialogo.querySelector('[data-ok]').addEventListener('click', async (e) => {
    const botonOk = e.currentTarget;
    botonOk.disabled = true;
    try {
      const paciente = await api.post('/pacientes', {
        nombre: dialogo.querySelector('#nombre').value,
        documento: dialogo.querySelector('#documento').value,
        telefono: dialogo.querySelector('#telefono').value,
        correo: dialogo.querySelector('#correo').value,
        autorizaTratamientoDatos: dialogo.querySelector('#autoriza').checked,
      });
      dialogo.close();
      toast(`${paciente.nombre} quedó registrado.`);
      await cargar();
    } catch (error) {
      botonOk.disabled = false;
      dialogo.querySelector('#error-modal').innerHTML = avisoError(error.mensajes);
    }
  });
}
