import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { API_URL } from '../../config/api.config';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-login.html',
  styleUrl: './admin-login.css'
})
export class AdminLogin {
  correo: string = '';
  password: string = '';
  loading: boolean = false;
  errorMsg: string = '';
  showPassword: boolean = false;

  constructor(private router: Router, private cdr: ChangeDetectorRef) { }

  volverAlInicio() {
    this.router.navigate(['/']);
  }

  async onLogin(event: Event) {
    event.preventDefault();
    if (!this.correo || !this.password) {
      this.errorMsg = 'Por favor ingresa las credenciales.';
      this.cdr.detectChanges();
      return;
    }

    this.loading = true;
    this.errorMsg = '';
    this.cdr.detectChanges();

    try {
      const response = await fetch(`${API_URL}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo: this.correo, password: this.password })
      });

      this.loading = false;
      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('admin_token', data.access_token);
        localStorage.setItem('admin_name', data.user_name);
        localStorage.setItem('admin_id', data.id_admin ? data.id_admin.toString() : '');
        this.cdr.detectChanges();
        this.router.navigate(['/admin-dashboard']);
      } else {
        this.errorMsg = 'Credenciales maestras incorrectas.';
        this.cdr.detectChanges();
      }
    } catch (e) {
      this.loading = false;
      this.errorMsg = 'Error al conectar con el servidor maestro.';
      this.cdr.detectChanges();
    }
  }
}
