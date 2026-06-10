import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Button } from 'primeng/button';
import { FloatLabel } from 'primeng/floatlabel';
import { InputText } from 'primeng/inputtext';
import { Password } from 'primeng/password';

import { authErrorMessage, AuthService } from '../../auth.service';
import { MagneticDirective } from '../../shared/magnetic.directive';

type AuthStatus = 'idle' | 'loading' | 'success' | 'error';

@Component({
  selector: 'app-login',
  imports: [CommonModule, FormsModule, RouterLink, Button, FloatLabel, InputText, Password, MagneticDirective],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly email = signal('');
  readonly password = signal('');
  readonly status = signal<AuthStatus>('idle');
  readonly errorMessage = signal('');
  readonly isFormReady = computed(() => isEmail(this.email()) && this.password().trim().length >= 6);

  async submit(): Promise<void> {
    if ((this.status() !== 'idle' && this.status() !== 'error') || !this.isFormReady()) {
      return;
    }

    this.status.set('loading');
    this.errorMessage.set('');

    try {
      await this.auth.login(this.email(), this.password());
      this.status.set('success');
      // Long enough for the warp-out animation to carry the card into the black hole before the route glides.
      setTimeout(() => this.router.navigateByUrl('/'), 950);
    } catch (error) {
      this.status.set('error');
      this.errorMessage.set(authErrorMessage(error));
    }
  }
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
