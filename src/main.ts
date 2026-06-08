import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withViewTransitions } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';
import { providePrimeNG } from 'primeng/config';

import { App } from './app/app';
import { routes } from './app/app.routes';

const SolarrayPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#fdf8ee',
      100: '#fbeed2',
      200: '#f7dfac',
      300: '#f3d088',
      400: '#f1cb95',
      500: '#f0c987',
      600: '#d9b577',
      700: '#b6975f',
      800: '#937949',
      900: '#776037',
      950: '#473823'
    }
  }
});

bootstrapApplication(App, {
  providers: [
    provideRouter(routes, withViewTransitions({ skipInitialTransition: true })),
    provideAnimationsAsync(),
    providePrimeNG({
      ripple: true,
      theme: {
        preset: SolarrayPreset,
        options: {
          darkModeSelector: '.dark-mode'
        }
      }
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
}).catch((error) => console.error(error));
