// Iconos de trazo, dibujados en línea para que la interfaz funcione sin conexión.
const TRAZOS = {
  diente:
    '<path transform="translate(1 0)" d="M7.5 3C5 3 3.5 5 3.5 7.5c0 2.2 1 3.4 1.6 5.2.6 1.8.7 4.3 1.4 6.1.4 1.2 1.6 1.4 2.2.3.8-1.5.9-3.6 2.3-3.6s1.5 2.1 2.3 3.6c.6 1.1 1.8.9 2.2-.3.7-1.8.8-4.3 1.4-6.1.6-1.8 1.6-3 1.6-5.2C18.5 5 17 3 14.5 3c-1.4 0-2.1.6-3.5.6S8.9 3 7.5 3z"/>',
  calendario:
    '<rect x="3" y="4" width="18" height="18" rx="2.5"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  'calendario-mas':
    '<rect x="3" y="4" width="18" height="18" rx="2.5"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4"/>',
  'calendario-ok':
    '<rect x="3" y="4" width="18" height="18" rx="2.5"/><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4"/>',
  usuarios:
    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  usuario: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  'usuario-mas':
    '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/>',
  'usuario-x':
    '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M18 8l5 5M23 8l-5 5"/>',
  reloj: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  'check-circulo': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  'x-circulo': '<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  basura:
    '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  editar: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>',
  campana: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>',
  alerta:
    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  actividad: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  refrescar:
    '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  entrar: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
  reproducir: '<path d="M5 3l14 9-14 9V3z"/>',
  detener: '<rect x="5" y="5" width="14" height="14" rx="2.5"/>',
  buscar: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
  ajustes:
    '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  mezclar:
    '<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  telefono:
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  correo: '<rect x="2" y="4" width="20" height="16" rx="2.5"/><path d="M22 7l-10 7L2 7"/>',
  mas3: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  flecha: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  'chevron-izq': '<path d="M15 18l-6-6 6-6"/>',
  'chevron-der': '<path d="M9 18l6-6-6-6"/>',
  portapapeles:
    '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>',
  enviar: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
  rayo: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
  escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  temporizador: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
  chispa:
    '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z"/>',
  'puerta-entrada': '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
  silla: '<path d="M6 3h12v8H6zM4 11h16v4H4zM8 15v6M16 15v6"/>',
  documento: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  inicio: '<path d="M3 11l9-8 9 8M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/>',
};

export function ico(nombre, clase = '') {
  const trazo = TRAZOS[nombre] ?? TRAZOS.info;
  return `<svg class="i ${clase}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${trazo}</svg>`;
}
