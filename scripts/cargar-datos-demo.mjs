// Carga datos de demostración en una instancia local (servidor en ejecución).
// Uso: npm run demo:datos   (usa PORT del entorno o 3000)
const BASE = `http://localhost:${process.env.PORT ?? 3000}`;

async function llamar(metodo, ruta, cuerpo) {
  const respuesta = await fetch(BASE + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    throw new Error(`${metodo} ${ruta} respondió ${respuesta.status}: ${JSON.stringify(datos?.message ?? datos)}`);
  }
  return datos;
}

const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

async function principal() {
  await llamar('GET', '/salud').catch(() => {
    throw new Error(`No hay servidor en ${BASE}. Inícielo primero con: npm run start:dev`);
  });

  // Horario de atención: todos los días, para que la demostración funcione cualquier día de la semana
  const franjas = [1, 2, 3, 4, 5, 6, 7].flatMap((diaSemana) => [
    { diaSemana, horaInicio: '08:00', horaFin: '12:00' },
    { diaSemana, horaInicio: '14:00', horaFin: '18:00' },
  ]);
  await llamar('PUT', '/disponibilidad', { franjas });

  const procedimientos = {};
  for (const [nombre, duracionMin] of [
    ['Limpieza dental', 30],
    ['Resina o calza', 45],
    ['Control de ortodoncia', 30],
    ['Endodoncia', 90],
    ['Extracción simple', 60],
  ]) {
    procedimientos[nombre] = await llamar('POST', '/procedimientos', { nombre, duracionMin });
  }

  const pacientes = [];
  for (const [i, [nombre, correo]] of [
    ['Ana María Ruiz', 'ana.ruiz@correo.com'],
    ['Carlos Mejía Pérez', 'carlos.mejia@correo.com'],
    ['Laura Fernández', 'laura.fernandez@correo.com'],
    ['Sebastián Orozco', 'sebastian.orozco@correo.com'],
    ['Valentina Castro', 'valentina.castro@correo.com'],
    ['Andrés Torres', 'andres.torres@correo.com'],
  ].entries()) {
    pacientes.push(
      await llamar('POST', '/pacientes', {
        nombre,
        documento: String(1000100000 + i),
        telefono: `30012345${String(10 + i)}`,
        correo,
        autorizaTratamientoDatos: true,
      }),
    );
  }

  const agenda = [
    [0, 'Limpieza dental', '08:00', 'ambas'],
    [1, 'Resina o calza', '08:30', 'puede_atrasar'],
    [2, 'Control de ortodoncia', '09:30', 'mantener'],
    [3, 'Endodoncia', '10:00', 'puede_adelantar'],
    [4, 'Control de ortodoncia', '11:30', 'puede_atrasar'],
    [5, 'Limpieza dental', '14:00', 'ambas'],
  ];
  for (const [indice, procedimiento, horaInicio, flexibilidad] of agenda) {
    const cita = await llamar('POST', '/citas', {
      pacienteId: pacientes[indice].id,
      procedimientoId: procedimientos[procedimiento].id,
      fecha: hoy,
      horaInicio,
    });
    await llamar('PUT', `/citas/${cita.id}/flexibilidad`, { flexibilidad });
  }

  console.log(`Datos de demostración cargados para ${hoy}:`);
  console.log(`  ${franjas.length} franjas de atención, ${Object.keys(procedimientos).length} procedimientos,`);
  console.log(`  ${pacientes.length} pacientes y ${agenda.length} citas.`);
  console.log(`Abra ${BASE}/ para ver la agenda.`);
}

principal().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
