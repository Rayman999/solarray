import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { NativeGeofenceService } from './native-geofence.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  // Instantiated at the root so OS geofences stay in sync with reminders from app start, on any page.
  private readonly nativeGeofence = inject(NativeGeofenceService);
}
