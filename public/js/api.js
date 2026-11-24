// Cliente de la API REST. Todas las rutas son relativas: la interfaz se sirve desde el mismo servidor.
export class ErrorApi extends Error {
  constructor(estado, mensajes, cuerpo) {
    super(mensajes[0]);
    this.estado = estado;
    this.mensajes = mensajes;
    this.cuerpo = cuerpo;
  }
}

async function llamar(metodo, ruta, cuerpo) {
  let respuesta;
  try {
    respuesta = await fetch(ruta, {
      method: metodo,
      headers: cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorApi(0, ['No se pudo conectar con el servidor. Verifique que esté en ejecución.'], null);
  }
  const texto = await respuesta.text();
  let datos = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    datos = null;
  }
  if (!respuesta.ok) {
    const mensajes = Array.isArray(datos?.message)
      ? datos.message
      : [datos?.message ?? `Error ${respuesta.status}`];
    throw new ErrorApi(respuesta.status, mensajes, datos);
  }
  return datos;
}

export const api = {
  get: (ruta) => llamar('GET', ruta),
  post: (ruta, cuerpo = {}) => llamar('POST', ruta, cuerpo),
  put: (ruta, cuerpo = {}) => llamar('PUT', ruta, cuerpo),
  patch: (ruta, cuerpo = {}) => llamar('PATCH', ruta, cuerpo),
};
