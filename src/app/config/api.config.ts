// URL Base del Servidor (Comenta/descomenta según el entorno)
export const BASE_URL = 'http://localhost:8000'; // Desarrollo Local
//export const BASE_URL = 'https://backend-fastapi-su7t.onrender.com'; // Producción

export const API_URL = `${BASE_URL}/api`;
export const WS_URL = `${BASE_URL.replace(/^http/, 'ws')}/ws`;
