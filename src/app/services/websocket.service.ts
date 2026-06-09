import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { WS_URL } from '../config/api.config';

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  private socket!: WebSocket;
  private emergencySubject = new Subject<any>();
  
  // Observable para que los componentes se suscriban a las alertas
  public emergency$ = this.emergencySubject.asObservable();

  constructor() { }

  connect(idTaller: number): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return;

    const wsUrl = `${WS_URL}/talleres/${idTaller}`;
    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      console.log(`🔌 WebSocket conectado para el taller #${idTaller}`);
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'NUEVA_EMERGENCIA' || data.type === 'COTIZACION_ACEPTADA' || data.type === 'COTIZACION_RECHAZADA') {
          this.emergencySubject.next(data);
        }
      } catch (e) {
        console.error('⚠️ Error al procesar mensaje WebSocket:', e);
      }
    };

    this.socket.onclose = (event) => {
      console.warn('⚠️ WebSocket cerrado. Reintentando en 5 segundos...', event);
      setTimeout(() => this.connect(idTaller), 5000);
    };

    this.socket.onerror = (error) => {
      console.error('❌ Error en canal WebSocket:', error);
    };
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
    }
  }
}
