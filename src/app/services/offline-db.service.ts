import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';

export interface OfflineAction {
  uuid_offline: string;
  url: string;
  method: string;
  body: any;
  status: 'pendiente' | 'error';
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class OfflineDbService extends Dexie {
  accionesOffline!: Table<OfflineAction, string>;

  constructor() {
    super('SegurIAOfflineDB');
    this.version(1).stores({
      accionesOffline: 'uuid_offline, status, timestamp'
    });
  }

  generateUuid(): string {
    return uuidv4();
  }

  async addOfflineAction(url: string, method: string, body: any, uuidOffline: string): Promise<void> {
    await this.accionesOffline.add({
      uuid_offline: uuidOffline,
      url,
      method,
      body,
      status: 'pendiente',
      timestamp: Date.now()
    });
  }

  async getPendingActions(): Promise<OfflineAction[]> {
    return this.accionesOffline.where('status').equals('pendiente').sortBy('timestamp');
  }

  async deleteAction(uuidOffline: string): Promise<void> {
    await this.accionesOffline.delete(uuidOffline);
  }

  async markAsError(uuidOffline: string): Promise<void> {
    await this.accionesOffline.update(uuidOffline, { status: 'error' });
  }
}
