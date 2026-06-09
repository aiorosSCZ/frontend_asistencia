import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { API_URL } from '../config/api.config';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private apiUrl = API_URL;


  constructor(private http: HttpClient) { }

  // --- Talleres ---

  registerTaller(tallerData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/talleres/`, tallerData);
  }

  loginTaller(credentials: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/talleres/login`, credentials);
  }

  // --- Clientes (Por si acaso se usara en web) ---

  registerCliente(clienteData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/clientes/`, clienteData);
  }
}
