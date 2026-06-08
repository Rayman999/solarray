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
  selector: 'app-signup',
  imports: [CommonModule, FormsModule, RouterLink, Button, FloatLabel, InputText, Password, MagneticDirective],
  templateUrl: './signup.html',
  styleUrl: './signup.css'
})
export class Signup {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly name = signal('');
  readonly email = signal('');
  readonly password = signal('');
  readonly status = signal<AuthStatus>('idle');
  readonly errorMessage = signal('');
  readonly isFormReady = computed(
    () => this.name().trim().length >= 2 && isEmail(this.email()) && this.password().trim().length >= 8
  );

  async submit(): Promise<void> {
    if ((this.status() !== 'idle' && this.status() !== 'error') || !this.isFormReady()) {
      return;
    }

    this.status.set('loading');
    this.errorMessage.set('');

    try {
      await this.auth.signup(this.name(), this.email(), this.password());
      this.status.set('success');
      setTimeout(() => this.router.navigateByUrl('/'), 650);
    } catch (error) {
      this.status.set('error');
      this.errorMessage.set(authErrorMessage(error));
    }
  }
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
