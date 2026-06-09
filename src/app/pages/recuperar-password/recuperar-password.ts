import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { API_URL } from '../../config/api.config';

@Component({
  selector: 'app-recuperar-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './recuperar-password.html',
  styleUrl: './recuperar-password.css'
})
export class RecuperarPassword {
  step: number = 1; // 1: Correo, 2: Token, 3: Nueva Password
  correo: string = '';
  token: string = '';
  nuevaPassword: string = '';
  
  loading: boolean = false;
  errorMsg: string = '';
  successMsg: string = '';

  constructor(private router: Router, private cdr: ChangeDetectorRef) {}

  async solicitarToken(event: Event) {
    event.preventDefault();
    if (!this.correo) {
      this.errorMsg = 'Por favor ingresa tu correo.';
      this.cdr.detectChanges();
      return;
    }
    this.loading = true;
    this.errorMsg = '';
    this.cdr.detectChanges();
    
    try {
      const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo: this.correo })
      });
      this.loading = false;
      if (response.ok) {
        this.step = 2;
        this.successMsg = 'Código enviado. Revisa tu bandeja de entrada.';
        this.cdr.detectChanges();
      } else {
        const data = await response.json();
        this.errorMsg = data.detail || 'Correo no registrado.';
        this.cdr.detectChanges();
      }
    } catch (e) {
      this.loading = false;
      this.errorMsg = 'Error de conexión con el servidor.';
      this.cdr.detectChanges();
    }
  }

  async verificarToken(event: Event) {
    event.preventDefault();
    if (!this.token || this.token.length !== 6) {
      this.errorMsg = 'El código debe ser de 6 dígitos.';
      this.cdr.detectChanges();
      return;
    }
    this.loading = true;
    this.errorMsg = '';
    this.cdr.detectChanges();
    
    try {
      const response = await fetch(`${API_URL}/auth/verify-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo: this.correo, token: this.token })
      });
      this.loading = false;
      if (response.ok) {
        this.step = 3;
        this.successMsg = 'Código verificado. Ingresa tu nueva contraseña.';
        this.cdr.detectChanges();
      } else {
        this.errorMsg = 'Código inválido o expirado.';
        this.cdr.detectChanges();
      }
    } catch (e) {
      this.loading = false;
      this.errorMsg = 'Error al verificar el código.';
      this.cdr.detectChanges();
    }
  }

  async cambiarPassword(event: Event) {
    event.preventDefault();
    if (this.nuevaPassword.length < 6) {
      this.errorMsg = 'La contraseña debe tener al menos 6 caracteres.';
      this.cdr.detectChanges();
      return;
    }
    this.loading = true;
    this.errorMsg = '';
    this.cdr.detectChanges();
    
    try {
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          correo: this.correo, 
          token: this.token, 
          nueva_password: this.nuevaPassword 
        })
      });
      this.loading = false;
      if (response.ok) {
        this.cdr.detectChanges();
        alert('¡Contraseña actualizada con éxito! Ya puedes iniciar sesión.');
        this.router.navigate(['/login']);
      } else {
        this.errorMsg = 'Error al actualizar la contraseña.';
        this.cdr.detectChanges();
      }
    } catch (e) {
      this.loading = false;
      this.errorMsg = 'Error de conexión.';
      this.cdr.detectChanges();
    }
  }
}
