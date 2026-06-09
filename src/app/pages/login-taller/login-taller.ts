import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { API_URL } from '../../config/api.config';

@Component({
  selector: 'app-login-taller',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login-taller.html',
  styleUrl: './login-taller.css',
})
export class LoginTaller {
  correo: string = '';
  password: string = '';
  loading: boolean = false;
  errorMsg: string = '';

  constructor(
    private apiService: ApiService, 
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  onLogin(event: Event) {
    event.preventDefault();
    if (!this.correo || !this.password) {
      this.errorMsg = 'Por favor ingresa tu correo y contraseña.';
      return;
    }

    this.loading = true;
    this.errorMsg = '';

    this.apiService.loginTaller({ correo: this.correo, password: this.password }).subscribe({
      next: (response: any) => {
        this.loading = false;
        this.cdr.detectChanges();
        
        if (response.role === 'taller') {
          localStorage.setItem('token_taller', response.access_token);
          localStorage.setItem('user_id', response.user_id);
          localStorage.setItem('user_name', response.user_name);
          localStorage.setItem('user_nit', response.nit || '');
          localStorage.setItem('user_direccion', response.direccion || '');
          this.router.navigate(['/dashboard']);
        } else {
          this.errorMsg = 'Rol no autorizado para acceder a esta aplicación.';
        }
      },
      error: (err) => {
        this.loading = false;
        this.errorMsg = err.error?.detail || 'Error en el servidor.';
        console.error(err);
        this.cdr.detectChanges();
      }

    });
  }
}

