import { api, ErrorApi } from '../api.js';
import { ico } from '../iconos.js';
import {
  abrirModal,
  avatar,
  avisoError,
  chipEstado,
  claseEstado,
  confirmar,
  esc,
  esqueletos,
  fechaLarga,
  horaActual,
  hoyISO,
  sumarDias,
  toast,
  vacio,
} from '../ui.js';

const FLEXIBILIDADES = [
  { valor: 'puede_adelantar', titulo: 'Puede adelantar', texto: 'Acepta ser atendido antes de su hora.' },
  { valor: 'puede_atrasar', titulo: 'Puede atrasar', texto: 'Acepta esperar si la agenda se retrasa.' },
  { valor: 'ambas', titulo: 'Adelantar o atrasar', texto: 'Tiene disponibilidad en ambos sentidos.' },
  { valor: 'mantener', titulo: 'Mantener el horario', texto: 'Debe ser atendido a su hora exacta.' },
];

// Mismo valor que TIEMPO_MAXIMO_ESPERA_MIN del servidor (src/comun/constantes.ts)
const TIEMPO_MAXIMO_ESPERA_MIN = 15;

let fecha = hoyISO();
let datos = null;
let temporizador = null;
let contenedor = null;

const minutos = (hora) => {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
};

// ---------- montaje ----------
export async function montar(el) {
  contenedor = el;
  fecha = hoyISO();
  el.addEventListener('click', alHacerClic);
  el.addEventListener('change', (e) => {
    if (e.target.matches('#selector-fecha')) {
      fecha = e.target.value || hoyISO();
      cargar();
    }
  });
  await cargar();
  temporizador = setInterval(() => {
    if (!document.querySelector('dialog[open]')) cargar(true);
  }, 45000);
}

export function desmontar() {
  clearInterval(temporizador);
  contenedor = null;
}

async function cargar(silencioso = false) {
  if (!contenedor) return;
  if (!silencioso) contenedor.innerHTML = `${cabecera()}${esqueletos(4)}`;
  try {
    datos = await api.get(`/agenda?fecha=${fecha}`);
    pintar();
  } catch (error) {
    if (!silencioso) contenedor.innerHTML = `${cabecera()}${avisoError(error.mensajes ?? [error.message])}`;
  }
}

// ---------- pintado ----------
function cabecera() {
  const esHoy = fecha === hoyISO();
  return `
    <header class="cabecera">
      <div>
        <h1>Agenda del día</h1>
        <p class="fecha-larga">${esc(fechaLarga(fecha))}${esHoy ? ' · hoy' : ''}</p>
      </div>
      <div class="cabecera-acciones">
        <div class="selector-fecha">
          <button type="button" class="btn icono fantasma chico" data-accion="dia-menos" aria-label="Día anterior">${ico('chevron-izq')}</button>
          <input type="date" id="selector-fecha" value="${fecha}" aria-label="Fecha de la agenda" />
          <button type="button" class="btn icono fantasma chico" data-accion="dia-mas" aria-label="Día siguiente">${ico('chevron-der')}</button>
        </div>
        ${esHoy ? '' : `<button type="button" class="btn" data-accion="hoy">${ico('calendario')}Hoy</button>`}
        <button type="button" class="btn" data-accion="alternativas">${ico('mezclar')}Analizar alternativas</button>
        <a class="btn primario" href="#/nueva-cita?fecha=${fecha}">${ico('mas')}Nueva cita</a>
      </div>
    </header>`;
}

function metricas(citas) {
  const activas = citas.filter((c) => !['Cancelada', 'Inasistencia'].includes(c.estado));
  const conteo = (...estados) => citas.filter((c) => estados.includes(c.estado)).length;
  const retrasadas = citas.filter((c) => (c.cambioMin ?? 0) > 0).length;
  const tarjeta = (clase, icono, valor, texto) =>
    `<div class="metrica"><div class="ico ${clase}">${ico(icono)}</div><div><strong>${valor}</strong><span>${texto}</span></div></div>`;
  return `<section class="metricas" aria-label="Resumen del día">
    ${tarjeta('ico-primario', 'calendario', activas.length, 'Citas del día')}
    ${tarjeta('ico-violeta', 'silla', conteo('En sala', 'En atención'), 'En sala o en atención')}
    ${tarjeta('ico-ok', 'check-circulo', conteo('Atendida'), 'Atendidas')}
    ${tarjeta('ico-aviso', 'temporizador', retrasadas, 'Con hora estimada retrasada')}
  </section>`;
}

function tarjetaCita(c) {
  const estimada = c.horaEstimada;
  const real = c.horaInicioReal;
  const principal = real ?? estimada ?? c.horaProgramada;
  const cambio = c.cambioMin;
  const delta =
    estimada && cambio
      ? `<span class="delta ${cambio > 0 ? 'mas' : 'menos'}" title="Cambio frente a la hora programada">${ico(cambio > 0 ? 'temporizador' : 'rayo')}${cambio > 0 ? '+' : ''}${cambio} min</span>`
      : '';
  const programada = real || (estimada && estimada !== c.horaProgramada) ? `<small>prog. ${esc(c.horaProgramada)}</small>` : `<small>hasta ${esc(c.horaFinProgramada)}</small>`;

  const meta = [`<span class="chip">${ico('reloj')}${c.duracionMin} min</span>`];
  if (c.horaLlegada) meta.push(`<span class="chip">${ico('entrar')}Llegó ${esc(c.horaLlegada)}</span>`);
  if (c.avisoRetrasoMin) meta.push(`<span class="chip est-por-reprogramar">${ico('temporizador')}Avisó +${c.avisoRetrasoMin} min</span>`);
  if (c.horaInicioReal && c.horaFinReal) {
    const real = minutos(c.horaFinReal) - minutos(c.horaInicioReal);
    const dif = real - c.duracionMin;
    meta.push(`<span class="chip ${dif > 0 ? 'est-por-reprogramar' : 'est-atendida'}">${ico('check')}Duró ${real} min${dif ? ` (${dif > 0 ? '+' : ''}${dif})` : ''}</span>`);
  }

  return `<article class="cita ${claseEstado(c.estado)}" data-cita="${c.id}">
    <div class="cita-hora"><strong>${esc(principal)}</strong>${programada}${delta}</div>
    <div class="cita-cuerpo">
      ${avatar(c.paciente.nombre)}
      <div style="min-width:0">
        <h3>${esc(c.paciente.nombre)}</h3>
        <p>${esc(c.procedimiento.nombre)}</p>
        <div class="cita-meta">${chipEstado(c.estado)}${meta.join('')}</div>
      </div>
    </div>
    <div class="cita-acciones">${acciones(c)}</div>
  </article>`;
}

function acciones(c) {
  const boton = (accion, icono, texto, clase = '') =>
    `<button type="button" class="btn chico ${clase}" data-accion="${accion}" data-id="${c.id}">${ico(icono)}${texto}</button>`;
  const item = (accion, icono, texto, clase = '') =>
    `<button type="button" role="menuitem" class="${clase}" data-accion="${accion}" data-id="${c.id}">${ico(icono)}${texto}</button>`;
  const menu = (items) =>
    items.length
      ? `<span class="menu-wrap"><button type="button" class="btn icono chico fantasma" aria-haspopup="menu" aria-label="Más acciones" data-menu="${esc(items.join(''))}">${ico('mas3')}</button></span>`
      : '';

  switch (c.estado) {
    case 'Programada':
    case 'Confirmada': {
      // Pasados 15 minutos de la hora programada ya no se admite la llegada: corresponde la inasistencia.
      const esperaVencida = fecha === hoyISO() && minutos(horaActual()) > minutos(c.horaProgramada) + TIEMPO_MAXIMO_ESPERA_MIN;
      if (esperaVencida) {
        return (
          boton('inasistencia', 'usuario-x', 'Registrar inasistencia', 'primario') +
          menu([
            item('llegada', 'entrar', 'Registrar llegada con otra hora'),
            item('proponer', 'refrescar', 'Proponer nuevo horario'),
            '<hr />',
            item('cancelar', 'x-circulo', 'Cancelar cita', 'rojo'),
          ])
        );
      }
      return (
        boton('llegada', 'entrar', 'Registrar llegada', 'primario') +
        menu([
          item('aviso', 'temporizador', 'Avisar retraso del paciente'),
          item('flexibilidad', 'ajustes', 'Flexibilidad de horario'),
          item('proponer', 'refrescar', 'Proponer nuevo horario'),
          '<hr />',
          item('inasistencia', 'usuario-x', 'Registrar inasistencia'),
          item('cancelar', 'x-circulo', 'Cancelar cita', 'rojo'),
        ])
      );
    }
    case 'En sala':
      return boton('inicio', 'reproducir', 'Iniciar atención', 'primario') + menu([item('cancelar', 'x-circulo', 'Cancelar cita', 'rojo')]);
    case 'En atención':
      return boton('fin', 'detener', 'Finalizar atención', 'primario');
    case 'Por reprogramar':
      return (
        boton('proponer', 'refrescar', 'Proponer horario') +
        menu([item('flexibilidad', 'ajustes', 'Flexibilidad de horario'), '<hr />', item('cancelar', 'x-circulo', 'Cancelar cita', 'rojo')])
      );
    default:
      return '';
  }
}

function pintar() {
  if (!contenedor || !datos) return;
  const citas = datos.citas;
  let cuerpo;
  if (citas.length === 0) {
    const espacios = (datos.espaciosDisponibles ?? []).filter((_, i) => i % 2 === 0).slice(0, 14);
    cuerpo = `<div class="tarjeta">${vacio({
      icono: 'calendario',
      titulo: 'No hay citas programadas',
      texto: espacios.length ? 'Estos espacios del horario de atención están disponibles. Toca uno para agendar.' : 'El odontólogo no tiene horario de atención este día.',
      extra: espacios.length
        ? `<div class="espacios">${espacios.map((e) => `<a class="espacio" href="#/nueva-cita?fecha=${e.fecha}&hora=${e.inicio}">${esc(e.inicio)}</a>`).join('')}</div>`
        : '',
    })}</div>`;
  } else {
    cuerpo = `${metricas(citas)}<section class="lista-citas" aria-label="Citas del día">${citas.map(tarjetaCita).join('')}</section>`;
  }
  contenedor.innerHTML = cabecera() + cuerpo;
}

// ---------- acciones ----------
function alHacerClic(e) {
  const boton = e.target.closest('[data-accion]');
  if (!boton) return;
  const id = Number(boton.dataset.id);
  const cita = datos?.citas.find((c) => c.id === id);
  document.querySelectorAll('.menu').forEach((m) => m.remove());

  const rutas = {
    'dia-menos': () => ((fecha = sumarDias(fecha, -1)), cargar()),
    'dia-mas': () => ((fecha = sumarDias(fecha, 1)), cargar()),
    hoy: () => ((fecha = hoyISO()), cargar()),
    alternativas: () => modalAlternativas(),
    llegada: () => accionConHora(cita, { ruta: 'llegada', campo: 'horaLlegada', titulo: 'Registrar llegada', icono: 'entrar', texto: `Llegada de ${cita?.paciente.nombre}.`, ok: 'Registrar llegada', exito: 'Llegada registrada: el paciente pasa a sala.' }),
    inicio: () => accionConHora(cita, { ruta: 'inicio-atencion', campo: 'hora', titulo: 'Iniciar atención', icono: 'reproducir', texto: `Inicio de la atención de ${cita?.paciente.nombre}.`, ok: 'Iniciar atención', exito: 'Atención iniciada.' }),
    fin: () => accionConHora(cita, { ruta: 'fin-atencion', campo: 'hora', titulo: 'Finalizar atención', icono: 'detener', texto: `Fin de la atención de ${cita?.paciente.nombre}. Las horas de las citas siguientes se recalculan.`, ok: 'Finalizar atención', exito: 'Atención finalizada: se recalcularon las horas siguientes.' }),
    inasistencia: () => accionConHora(cita, { ruta: 'inasistencia', campo: 'hora', titulo: 'Registrar inasistencia', icono: 'usuario-x', texto: `Solo se acepta si pasaron más de 15 minutos de la hora de la cita de ${cita?.paciente.nombre}.`, ok: 'Registrar inasistencia', exito: 'Inasistencia registrada.' }),
    aviso: () => modalAviso(cita),
    cancelar: () => modalCancelar(cita),
    flexibilidad: () => modalFlexibilidad(cita),
    proponer: () => modalProponer(cita),
  };
  rutas[boton.dataset.accion]?.();
}

function modalCampoHora({ titulo, icono, texto, ok, valorInicial }) {
  const dialogo = abrirModal({
    titulo,
    icono,
    cuerpo: `<p>${esc(texto)}</p>
      <label class="campo"><span>Hora real (opcional)</span>
        <input type="time" id="hora-real" value="${valorInicial}" step="60" />
        <small>Si la deja vacía, se usa la hora actual del consultorio.</small></label>
      <div id="error-modal"></div>`,
    pie: `<button type="button" class="btn" data-cerrar>Cancelar</button><button type="button" class="btn primario" data-ok>${ico('check')}${esc(ok)}</button>`,
  });
  return dialogo;
}

function accionConHora(cita, cfg) {
  const dialogo = modalCampoHora({ ...cfg, valorInicial: fecha === hoyISO() ? horaActual() : '' });
  dialogo.querySelector('[data-ok]').addEventListener('click', async (e) => {
    const hora = dialogo.querySelector('#hora-real').value;
    const botonOk = e.currentTarget;
    botonOk.disabled = true;
    try {
      await api.post(`/citas/${cita.id}/${cfg.ruta}`, hora ? { [cfg.campo]: hora } : {});
      dialogo.close();
      toast(cfg.exito);
      await cargar(true);
    } catch (error) {
      botonOk.disabled = false;
      dialogo.querySelector('#error-modal').innerHTML = avisoError(error.mensajes);
    }
  });
}

function modalAviso(cita) {
  const dialogo = abrirModal({
    titulo: 'Avisar retraso del paciente',
    icono: 'temporizador',
    cuerpo: `<p>${esc(cita.paciente.nombre)} avisó que llegará tarde. El sistema recalcula las horas de las citas siguientes.</p>
      <label class="campo"><span>Minutos de retraso</span><input type="number" id="minutos" min="1" max="180" step="1" value="15" /></label>
      <div id="error-modal"></div>`,
    pie: `<button type="button" class="btn" data-cerrar>Cancelar</button><button type="button" class="btn primario" data-ok>${ico('check')}Registrar aviso</button>`,
  });
  dialogo.querySelector('[data-ok]').addEventListener('click', async (e) => {
    const botonOk = e.currentTarget;
    botonOk.disabled = true;
    try {
      await api.post(`/citas/${cita.id}/aviso-retraso`, { minutos: Number(dialogo.querySelector('#minutos').value) });
      dialogo.close();
      toast('Aviso de retraso registrado: se recalcularon las horas.');
      await cargar(true);
    } catch (error) {
      botonOk.disabled = false;
      dialogo.querySelector('#error-modal').innerHTML = avisoError(error.mensajes);
    }
  });
}

function modalCancelar(cita) {
  const dialogo = abrirModal({
    titulo: 'Cancelar cita',
    icono: 'x-circulo',
    cuerpo: `<p>Cita de <strong>${esc(cita.paciente.nombre)}</strong> a las ${esc(cita.horaProgramada)}.</p>
      <div class="opciones">
        <label class="opcion"><input type="radio" name="origen" value="paciente" checked /><span><strong>Lo pide el paciente</strong><small>Queda en su historial.</small></span></label>
        <label class="opcion"><input type="radio" name="origen" value="consultorio" /><span><strong>Cancela el consultorio</strong><small>Se notifica al paciente.</small></span></label>
      </div>
      <label class="campo"><span>Motivo <small>(obligatorio si cancela el consultorio)</small></span><textarea id="motivo" maxlength="200" placeholder="Por ejemplo: emergencia del odontólogo"></textarea></label>
      <div id="error-modal"></div>`,
    pie: `<button type="button" class="btn" data-cerrar>Volver</button><button type="button" class="btn peligro" data-ok>${ico('x-circulo')}Cancelar la cita</button>`,
  });
  dialogo.querySelector('[data-ok]').addEventListener('click', async (e) => {
    const origen = dialogo.querySelector('input[name=origen]:checked').value;
    const motivo = dialogo.querySelector('#motivo').value.trim();
    const botonOk = e.currentTarget;
    botonOk.disabled = true;
    try {
      await api.post(`/citas/${cita.id}/cancelacion`, motivo || origen === 'consultorio' ? { origen, motivo } : { origen });
      dialogo.close();
      toast(origen === 'consultorio' ? 'Cita cancelada: el paciente fue notificado.' : 'Cita cancelada.');
      await cargar(true);
    } catch (error) {
      botonOk.disabled = false;
      dialogo.querySelector('#error-modal').innerHTML = avisoError(error.mensajes);
    }
  });
}

async function modalFlexibilidad(cita) {
  let actual = { flexibilidad: 'mantener', declarada: false };
  try {
    actual = await api.get(`/citas/${cita.id}/flexibilidad`);
  } catch (error) {
    toast(error.message, 'mal');
    return;
  }
  const dialogo = abrirModal({
    titulo: 'Flexibilidad de horario',
    icono: 'ajustes',
    cuerpo: `<p>¿Qué tan flexible es <strong>${esc(cita.paciente.nombre)}</strong> con su horario? El sistema lo usa al reordenar la agenda.${actual.declarada ? '' : ' Todavía no ha declarado nada, y se trata como «mantener el horario».'}</p>
      <div class="opciones">${FLEXIBILIDADES.map((f) => `<label class="opcion"><input type="radio" name="flex" value="${f.valor}" ${f.valor === actual.flexibilidad ? 'checked' : ''} /><span><strong>${f.titulo}</strong><small>${f.texto}</small></span></label>`).join('')}</div>
      <div id="error-modal"></div>`,
    pie: `<button type="button" class="btn" data-cerrar>Cancelar</button><button type="button" class="btn primario" data-ok>${ico('check')}Guardar</button>`,
  });
  dialogo.querySelector('[data-ok]').addEventListener('click', async (e) => {
    const botonOk = e.currentTarget;
    botonOk.disabled = true;
    try {
      await api.put(`/citas/${cita.id}/flexibilidad`, { flexibilidad: dialogo.querySelector('input[name=flex]:checked').value });
      dialogo.close();
      toast('Flexibilidad guardada.');
    } catch (error) {
      botonOk.disabled = false;
      dialogo.querySelector('#error-modal').innerHTML = avisoError(error.mensajes);
    }
  });
}

function modalProponer(cita) {
  const dialogo = abrirModal({
    titulo: 'Proponer nuevo horario',
    icono: 'refrescar',
    cuerpo: `<p>La cita de <strong>${esc(cita.paciente.nombre)}</strong> queda «Por reprogramar» mientras el paciente responde (plazo de 15 minutos).</p>
      <div class="rejilla-2">
        <label class="campo"><span>Fecha</span><input type="date" id="p-fecha" value="${fecha}" /></label>
        <label class="campo"><span>Hora de inicio</span><input type="time" id="p-hora" step="900" value="${cita.horaProgramada}" /></label>
      </div>
      <label class="campo"><span>Motivo del cambio</span><textarea id="p-motivo" maxlength="300">Retraso en la atención anterior</textarea></label>
      <div id="error-modal"></div>`,
    pie: `<button type="button" class="btn" data-cerrar>Cancelar</button><button type="button" class="btn primario" data-ok>${ico('enviar')}Enviar propuesta</button>`,
  });
  dialogo.querySelector('[data-ok]').addEventListener('click', async (e) => {
    const botonOk = e.currentTarget;
    botonOk.disabled = true;
    try {
      const propuesta = await api.post(`/citas/${cita.id}/propuestas-reprogramacion`, {
        fecha: dialogo.querySelector('#p-fecha').value,
        horaInicio: dialogo.querySelector('#p-hora').value,
        motivo: dialogo.querySelector('#p-motivo').value,
      });
      dialogo.close();
      await cargar(true);
      modalRespuesta(propuesta.id, cita);
    } catch (error) {
      botonOk.disabled = false;
      dialogo.querySelector('#error-modal').innerHTML = avisoError(error.mensajes);
    }
  });
}

async function modalRespuesta(id, cita) {
  const propuesta = await api.get(`/propuestas-reprogramacion/${id}`);
  const x = propuesta.explicacion;
  const dialogo = abrirModal({
    titulo: 'Propuesta pendiente de respuesta',
    icono: 'enviar',
    cuerpo: `<div class="explicacion"><strong>${ico('info')}Lo que verá el paciente</strong>
        ${esc(x.motivo)}. Su cita se ${x.sentido === 'atrasa' ? 'atrasa' : 'adelanta'} <b>${x.minutosDesplazamiento} min</b>:
        de ${esc(x.horarioActual.horaInicio)} a <b>${esc(x.horarioPropuesto.horaInicio)}</b> (${esc(x.horarioPropuesto.fecha)}).</div>
      <p>Registre la respuesta de <strong>${esc(cita.paciente.nombre)}</strong>:</p>
      <div id="error-modal"></div>`,
    pie: `<button type="button" class="btn peligro" data-rechazo>${ico('x-circulo')}Rechazó</button>
          <button type="button" class="btn" data-cerrar>Decidir después</button>
          <button type="button" class="btn primario" data-acepta>${ico('check')}Aceptó</button>`,
  });
  const responder = async (ruta, cuerpo, mensaje) => {
    try {
      await api.post(`/propuestas-reprogramacion/${id}/${ruta}`, cuerpo);
      dialogo.close();
      toast(mensaje);
      await cargar(true);
    } catch (error) {
      dialogo.querySelector('#error-modal').innerHTML = avisoError(error.mensajes);
    }
  };
  dialogo.querySelector('[data-acepta]').addEventListener('click', () => responder('aceptacion', { origen: 'administrador' }, 'Propuesta aceptada: la cita cambió de horario.'));
  dialogo.querySelector('[data-rechazo]').addEventListener('click', () => responder('rechazo', {}, 'Propuesta rechazada: se conserva la cita original.'));
}

// ---------- alternativas de reprogramación (HU-10) ----------
function modalAlternativas() {
  const opciones = (datos?.citas ?? []).map((c) => `<option value="${c.id}">${esc(c.horaProgramada)} · ${esc(c.paciente.nombre)}</option>`).join('');
  const dialogo = abrirModal({
    titulo: 'Analizar alternativas de reprogramación',
    icono: 'mezclar',
    ancho: true,
    cuerpo: `<p>El sistema evalúa las citas pendientes de hoy y propone cómo reordenarlas con el menor desplazamiento, respetando la flexibilidad de cada paciente.</p>
      <div class="rejilla-2">
        <label class="campo"><span>¿Qué ocurrió?</span>
          <select id="evento"><option value="retraso">Un retraso</option><option value="cancelacion">Una cancelación</option><option value="inasistencia">Una inasistencia</option></select></label>
        <label class="campo"><span>Cita que lo originó <small>(opcional)</small></span>
          <select id="cita-evento"><option value="">Ninguna en particular</option>${opciones}</select></label>
      </div>
      <div id="resultado-alt"></div>`,
    pie: `<button type="button" class="btn" data-cerrar>Cerrar</button><button type="button" class="btn primario" data-ok>${ico('mezclar')}Analizar</button>`,
  });
  dialogo.querySelector('[data-ok]').addEventListener('click', async (e) => {
    const salida = dialogo.querySelector('#resultado-alt');
    const citaId = dialogo.querySelector('#cita-evento').value;
    const botonOk = e.currentTarget;
    botonOk.disabled = true;
    salida.innerHTML = esqueletos(2);
    try {
      const r = await api.post('/agenda/alternativas', { evento: dialogo.querySelector('#evento').value, ...(citaId ? { citaId: Number(citaId) } : {}) });
      salida.innerHTML = pintarAlternativas(r);
    } catch (error) {
      salida.innerHTML = avisoError(error.mensajes);
    } finally {
      botonOk.disabled = false;
    }
  });
}

function nombrePaciente(citaId) {
  return datos?.citas.find((c) => c.id === citaId)?.paciente.nombre ?? `Cita ${citaId}`;
}

function filaCambio(a) {
  const d = a.desplazamientoMin;
  return `<div class="cambio">
    <span><strong>${esc(nombrePaciente(a.citaId))}</strong></span>
    <span class="hora antes">${esc(a.horaPrevista)}</span>
    <span>${ico('flecha')}</span>
    <span class="hora">${esc(a.horaPropuesta)} ${d ? `<span class="delta ${d > 0 ? 'mas' : 'menos'}">${d > 0 ? '+' : ''}${d} min</span>` : '<span class="chip est-atendida">sin cambio</span>'}</span>
  </div>`;
}

function pintarAlternativas(r) {
  const aviso = r.citasNoEvaluadas
    ? `<div class="aviso alerta">${ico('info')}<div>Hay ${r.citasNoEvaluadas} cita(s) más que no se evaluaron: el análisis se limita a ${r.citasEvaluadas} a la vez.</div></div>`
    : '';
  if (!r.hayAlternativa) {
    return `${aviso}<div class="aviso error">${ico('alerta')}<div><strong>No hay una combinación que respete a todos los pacientes.</strong><br />${esc(r.motivo)}<ul>${r.citasEnConflicto.map((c) => `<li>${esc(nombrePaciente(c.citaId))}: ${esc(c.horaPrevista)} (${esc(c.flexibilidad.replace('_', ' '))})</li>`).join('')}</ul>Se dejó una alerta para el administrador.</div></div>`;
  }
  const mueve = r.propuesta.asignaciones.filter((a) => a.desplazamientoMin !== 0);
  return `${aviso}
    <div class="resumen-alt">
      <span class="chip est-confirmada">${ico('check')}Mejor propuesta</span>
      <span class="chip">${ico('temporizador')}${r.propuesta.desplazamientoTotalMin} min en total</span>
      <span class="chip">${ico('usuarios')}${r.propuesta.pacientesDesplazados} paciente(s) se mueven</span>
      <span class="chip">${ico('mezclar')}${r.explicacion.alternativasEvaluadas} alternativas evaluadas</span>
    </div>
    ${mueve.length ? r.propuesta.asignaciones.map(filaCambio).join('') : '<div class="aviso exito">' + ico('check-circulo') + '<div>Nadie necesita moverse: la agenda se mantiene como está.</div></div>'}
    <div class="explicacion"><strong>${ico('info')}¿Por qué esta propuesta?</strong>${esc(r.explicacion.motivo)}</div>
    ${r.otras.length ? `<p class="fecha-larga" style="text-transform:none">Otras ${r.otras.length} alternativa(s): ${r.otras.map((o) => `${o.desplazamientoTotalMin} min`).join(', ')} de desplazamiento total.</p>` : ''}`;
}
