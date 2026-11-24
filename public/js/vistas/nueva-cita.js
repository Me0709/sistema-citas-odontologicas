import { api } from '../api.js';
import { ico } from '../iconos.js';
import { avisoError, diaSemanaISO, esc, fechaLarga, hoyISO, toast } from '../ui.js';

const FLEXIBILIDADES = [
  { valor: '', titulo: 'Sin declarar', texto: 'Se trata como «mantener el horario».' },
  { valor: 'puede_adelantar', titulo: 'Puede adelantar', texto: 'Acepta que lo atiendan antes.' },
  { valor: 'puede_atrasar', titulo: 'Puede atrasar', texto: 'Acepta esperar un poco más.' },
  { valor: 'ambas', titulo: 'Adelantar o atrasar', texto: 'Flexible en ambos sentidos.' },
  { valor: 'mantener', titulo: 'Mantener el horario', texto: 'Solo a su hora exacta.' },
];

let franjas = [];

export async function montar(el, parametros) {
  el.innerHTML = '<div class="esqueleto" style="height:360px"></div>';
  let pacientes;
  let procedimientos;
  try {
    [pacientes, procedimientos, franjas] = await Promise.all([api.get('/pacientes'), api.get('/procedimientos'), api.get('/disponibilidad')]);
  } catch (error) {
    el.innerHTML = avisoError(error.mensajes);
    return;
  }

  const fechaInicial = parametros.get('fecha') || hoyISO();
  const horaInicial = parametros.get('hora') || '';

  el.innerHTML = `
    <header class="cabecera">
      <div><h1>Nueva cita</h1><p>Reserva un espacio en la agenda del odontólogo.</p></div>
    </header>
    <div class="pasos">
      <form class="tarjeta formulario" id="form-cita" novalidate>
        <div class="tarjeta-cab"><h2>${ico('calendario-mas')} Datos de la cita</h2></div>
        <label class="campo"><span>Paciente</span>
          <select id="paciente" required>
            <option value="">Selecciona un paciente…</option>
            ${pacientes.map((p) => `<option value="${p.id}">${esc(p.nombre)} · ${esc(p.documento)}</option>`).join('')}
          </select>
          ${pacientes.length ? '' : '<small>Aún no hay pacientes. <a href="#/pacientes">Registra el primero</a>.</small>'}
        </label>
        <label class="campo"><span>Procedimiento</span>
          <select id="procedimiento" required>
            <option value="">Selecciona un procedimiento…</option>
            ${procedimientos.map((p) => `<option value="${p.id}">${esc(p.nombre)} · ${p.duracionMin} min</option>`).join('')}
          </select>
        </label>
        <div class="rejilla-2">
          <label class="campo"><span>Fecha</span><input type="date" id="fecha" value="${esc(fechaInicial)}" required /></label>
          <label class="campo"><span>Hora de inicio</span><input type="time" id="hora" step="900" value="${esc(horaInicial)}" required /><small>En bloques de 15 minutos.</small></label>
        </div>
        <fieldset style="border:0;padding:0;margin:0" class="campo">
          <span>Flexibilidad del paciente <small>(opcional)</small></span>
          <div class="opciones">
            ${FLEXIBILIDADES.map((f, i) => `<label class="opcion"><input type="radio" name="flex" value="${f.valor}" ${i === 0 ? 'checked' : ''} /><span><strong>${f.titulo}</strong><small>${f.texto}</small></span></label>`).join('')}
          </div>
        </fieldset>
        <div id="resultado"></div>
        <div style="display:flex;justify-content:flex-end;gap:10px">
          <a class="btn" href="#/agenda">Cancelar</a>
          <button type="submit" class="btn primario" id="guardar">${ico('check')}Programar cita</button>
        </div>
      </form>

      <aside class="tarjeta" aria-label="Horario de atención">
        <div class="tarjeta-cab"><h2>${ico('reloj')} Horario de atención</h2></div>
        <div id="horario-dia"></div>
        <div class="aviso info" style="margin-top:16px">${ico('info')}<div>Si el espacio está ocupado, el sistema te sugiere los próximos horarios libres.</div></div>
      </aside>
    </div>`;

  const formulario = el.querySelector('#form-cita');
  const campoFecha = el.querySelector('#fecha');
  const pintarHorario = () => {
    const dia = diaSemanaISO(campoFecha.value || hoyISO());
    const delDia = franjas.filter((f) => f.diaSemana === dia);
    el.querySelector('#horario-dia').innerHTML = `<p class="fecha-larga" style="margin-bottom:10px">${esc(fechaLarga(campoFecha.value || hoyISO()))}</p>${
      delDia.length
        ? `<div class="espacios" style="justify-content:flex-start">${delDia.map((f) => `<span class="chip est-confirmada">${ico('reloj')}${esc(f.horaInicio)} – ${esc(f.horaFin)}</span>`).join('')}</div>`
        : `<div class="aviso alerta">${ico('alerta')}<div>El odontólogo no atiende este día.</div></div>`
    }`;
  };
  campoFecha.addEventListener('change', pintarHorario);
  pintarHorario();

  formulario.addEventListener('submit', async (e) => {
    e.preventDefault();
    const salida = el.querySelector('#resultado');
    const boton = el.querySelector('#guardar');
    const pacienteId = Number(el.querySelector('#paciente').value);
    const procedimientoId = Number(el.querySelector('#procedimiento').value);
    if (!pacienteId || !procedimientoId) {
      salida.innerHTML = avisoError('Selecciona el paciente y el procedimiento.');
      return;
    }
    boton.disabled = true;
    salida.innerHTML = '';
    try {
      const cita = await api.post('/citas', {
        pacienteId,
        procedimientoId,
        fecha: campoFecha.value,
        horaInicio: el.querySelector('#hora').value,
      });
      const flex = formulario.querySelector('input[name=flex]:checked').value;
      if (flex) await api.put(`/citas/${cita.id}/flexibilidad`, { flexibilidad: flex });
      toast(`Cita programada de ${cita.horaInicio} a ${cita.horaFin}.`);
      salida.innerHTML = `<div class="aviso exito">${ico('check-circulo')}<div><strong>Cita programada.</strong> ${esc(fechaLarga(cita.fecha))}, de ${esc(cita.horaInicio)} a ${esc(cita.horaFin)}. <a href="#/agenda">Ver la agenda</a>.</div></div>`;
    } catch (error) {
      salida.innerHTML = pintarConflicto(error);
      salida.querySelectorAll('[data-espacio]').forEach((b) =>
        b.addEventListener('click', () => {
          campoFecha.value = b.dataset.fecha;
          el.querySelector('#hora').value = b.dataset.hora;
          pintarHorario();
          salida.innerHTML = `<div class="aviso info">${ico('info')}<div>Cambiamos la fecha y la hora. Pulsa «Programar cita» para confirmar.</div></div>`;
        }),
      );
    } finally {
      boton.disabled = false;
    }
  });
}

function pintarConflicto(error) {
  const cuerpo = error.cuerpo ?? {};
  if (cuerpo.proximosEspacios?.length) {
    return `<div class="aviso alerta">${ico('alerta')}<div><strong>${esc(error.message)}.</strong> Estos son los próximos espacios libres, elige uno:
      <div class="espacios" style="justify-content:flex-start;margin-top:10px">${cuerpo.proximosEspacios
        .map((s) => `<button type="button" class="espacio" data-espacio data-fecha="${esc(s.fecha)}" data-hora="${esc(s.horaInicio)}">${esc(s.fecha)} · ${esc(s.horaInicio)} – ${esc(s.horaFin)}</button>`)
        .join('')}</div></div></div>`;
  }
  if (cuerpo.citaEnConflicto) {
    const c = cuerpo.citaEnConflicto;
    return `<div class="aviso alerta">${ico('alerta')}<div><strong>${esc(error.message)}.</strong> Se cruza con la cita ${c.id} (${esc(c.horaInicio)} – ${esc(c.horaFin)}, ${esc(c.estado)}).</div></div>`;
  }
  return avisoError(error.mensajes);
}
