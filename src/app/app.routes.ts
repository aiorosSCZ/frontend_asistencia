import { Routes } from '@angular/router';
import { Landing } from './pages/landing/landing';
import { RegistroTaller } from './pages/registro-taller/registro-taller';
import { Dashboard } from './pages/dashboard/dashboard';
import { LoginTaller } from './pages/login-taller/login-taller';
import { AdminLogin } from './pages/admin-login/admin-login';
import { AdminDashboard } from './pages/admin-dashboard/admin-dashboard';
import { RecuperarPassword } from './pages/recuperar-password/recuperar-password';

export const routes: Routes = [
  { path: '', component: Landing },
  { path: 'login', component: LoginTaller },
  { path: 'registro-taller', component: RegistroTaller },
  { path: 'dashboard', component: Dashboard },
  { path: 'admin-login', component: AdminLogin },
  { path: 'admin-dashboard', component: AdminDashboard },
  { path: 'recuperar-password', component: RecuperarPassword },
  { path: '**', redirectTo: '' }
];
