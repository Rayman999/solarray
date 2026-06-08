import { Routes } from '@angular/router';

import { authGuard, guestGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/dashboard').then((m) => m.Dashboard), canActivate: [authGuard] },
  { path: 'login', loadComponent: () => import('./pages/login/login').then((m) => m.Login), canActivate: [guestGuard] },
  { path: 'signup', loadComponent: () => import('./pages/signup/signup').then((m) => m.Signup), canActivate: [guestGuard] }
];
