import { api } from '../api.js';
import { ico } from '../iconos.js';
import { avisoError, esc, esqueletos, fechaCorta, toast } from '../ui.js';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
let el = null;
let semana = [];

const texto = (m) => (typeof m === 'string' ? m : (m?.message ?? JSON.stringify(m)));

export async function montar(contenedor) {
  el = contenedor;
  el.innerHTML = `
    <header class="cabecera">
      <div><h1>Horario de atención</h1><p>Define los días y las franjas en que atiende el odontólogo.</p></div>
      <div class="cabecera-acciones">
        <button type="button" class="btn" data-accion="ejemplo">${ico('chispa')}Lunes a viernes</button>
        <button type="button" class="btn primario" data-accion="guardar">${ico('check')}Guardar horario</button>
      </div>
    </header>
    <div class="tarjeta"><div id="dias">${esqueletos(3)}</div></div>
    <div id="resultado" style="margin-top:16px"></div>`;
  el.addEventListener('click', alHacerClic);
  el.addEventListener('input', alEditar);
  try {
    const franjas = await api.get('/disponibilidad');
    semana = DIAS.map((_, i) => franjas.filter((f) => f.diaSemana === i + 1).map((f) => ({ horaInicio: f.horaInicio, horaFin: f.horaFin })));
    pintar();
  } catch (error) {
    el.querySelector('#dias').innerHTML = avisoError(error.mensajes);
  }
}

function pintar() {
  el.querySelector('#dias').innerHTML = `<div class="dias">${DIAS.map(
    (nombre, d) => `<div class="dia">
      <h3>${nombre}</h3>
      <div class="franjas">
        ${
          semana[d].length
            ? semana[d]
                .map(
                  (f, i) => `<span class="franja">
                    <input type="time" step="900" value="${esc(f.horaInicio)}" data-dia="${d}" data-i="${i}" data-campo="horaInicio" aria-label="${nombre}, inicio de la franja ${i + 1}" />
                    <span aria-hidden="true">–</span>
                    <input type="time" step="900" value="${esc(f.horaFin)}" data-dia="${d}" data-i="${i}" data-campo="horaFin" aria-label="${nombre}, fin de la franja ${i + 1}" />
                    <button type="button" class="btn icono fantasma chico" data-accion="quitar" data-dia="${d}" data-i="${i}" aria-label="Quitar franja">${ico('x')}</button>
                  </span>`,
                )
                .join('')
            : '<span class="sin-atencion">Sin atención</span>'
        }
        <button type="button" class="btn chico" data-accion="agregar" data-dia="${d}">${ico('mas')}Franja</button>
      </div>
    </div>`,
  ).join('')}</div>`;
}

function alEditar(e) {
  const campo = e.target.closest('[data-campo]');
  if (!campo) return;
  semana[Number(campo.dataset.dia)][Number(campo.dataset.i)][campo.dataset.campo] = campo.value;
}

function alHacerClic(e) {
  const boton = e.target.closest('[data-accion]');
  if (!boton) return;
  const dia = Number(boton.dataset.dia);
  const i = Number(boton.dataset.i);
  switch (boton.dataset.accion) {
    case 'agregar':
      semana[dia].push(semana[dia].length ? { horaInicio: '14:00', horaFin: '18:00' } : { horaInicio: '08:00', horaFin: '12:00' });
      pintar();
      break;
    case 'quitar':
      semana[dia].splice(i, 1);
      pintar();
      break;
    case 'ejemplo':
      semana = DIAS.map((_, d) => (d < 5 ? [{ horaInicio: '08:00', horaFin: '12:00' }, { horaInicio: '14:00', horaFin: '18:00' }] : []));
      pintar();
      break;
    case 'guardar':
      guardar(boton);
      break;
  }
}

async function guardar(boton) {
  const franjas = semana.flatMap((franjasDia, d) => franjasDia.map((f) => ({ diaSemana: d + 1, horaInicio: f.horaInicio, horaFin: f.horaFin })));
  const salida = el.querySelector('#resultado');
  boton.disabled = true;
  try {
    const r = await api.put('/disponibilidad', { franjas });
    toast('Horario guardado.');
    const afectadas = r.citasAfectadas ?? [];
    salida.innerHTML = `<div class="aviso exito">${ico('check-circulo')}<div><strong>Horario guardado.</strong> Genera ${r.espaciosPorSemana} espacios de 15 minutos por semana.</div></div>${
      afectadas.length
        ? `<div class="aviso alerta" style="margin-top:12px">${ico('alerta')}<div><strong>${afectadas.length} cita(s) quedaron fuera del nuevo horario</strong> y pasaron a «Por reprogramar»:<ul>${afectadas
            .map((c) => `<li>Cita ${c.id}: ${esc(fechaCorta(c.fecha))}, ${esc(c.horaInicio)} – ${esc(c.horaFin)} (era ${esc(c.estadoAnterior)})</li>`)
            .join('')}</ul></div></div>`
        : ''
    }`;
  } catch (error) {
    salida.innerHTML = avisoError((error.mensajes ?? [error.message]).map(texto));
  } finally {
    boton.disabled = false;
  }
}
