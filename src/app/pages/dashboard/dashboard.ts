import { CommonModule, DatePipe } from '@angular/common';
import { AfterViewInit, Component, computed, ElementRef, HostListener, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { gsap } from 'gsap';
import * as L from 'leaflet';

import { AuthService } from '../../auth.service';
import { LocationReminderService } from '../../location-reminder.service';
import { NotificationService } from '../../notification.service';
import { Reminder, ReminderKind } from '../../reminder.model';
import { ReminderStore } from '../../reminder-store.service';

const MOTION = {
  pageEntryDuration: 0.32,
  pageEntryStagger: 0.06,
  addScaleUpDuration: 0.12,
  addScaleDownDuration: 0.13,
  addGlowDuration: 0.3,
  newTaskEntryDuration: 0.28,
  laterTaskEntryDuration: 0.2,
  laterTaskEntryScale: 0.97,
  laterRowSettleDuration: 0.16,
  nextPulseDuration: 0.3,
  checkFillDuration: 0.15,
  checkRippleDuration: 0.3,
  strikethroughDuration: 0.15,
  completionPause: 0.08,
  completeExitDuration: 0.2,
  deleteExitDuration: 0.18,
  detailsOpenDuration: 0.25,
  detailsFadeDuration: 0.15,
  detailsCloseDuration: 0.18,
  statusPulseDuration: 0.2,
  counterDuration: 0.6,
  easeOut: 'power2.out',
  easeInOut: 'power2.inOut',
  spring: 'back.out(2)'
} as const;

type MotionKey = 'pageEntry' | 'capture' | 'taskEntry' | 'details' | 'status' | 'counter' | `task-${string}`;
type ModuleMode = 'tasks' | 'reminders' | 'settings';

interface PlaceSearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

interface ReminderStatusEvent {
  tone: 'success' | 'error';
  message: string;
}

const APP_VERSION = '0.1.0';
const PHONE_MODE_KEY = 'solarray.phoneModePreferred';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, DatePipe, FormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard implements AfterViewInit, OnDestroy {
  readonly store = inject(ReminderStore);
  readonly notifications = inject(NotificationService);
  readonly location = inject(LocationReminderService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  @ViewChild('addButton') private addButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('quickCapture') private quickCapture?: ElementRef<HTMLInputElement>;
  @ViewChild('detailsPanel') private detailsPanel?: ElementRef<HTMLElement>;
  @ViewChild('placeMap') private set placeMapRef(element: ElementRef<HTMLElement> | undefined) {
    if (!element) {
      return;
    }

    this.placeMapElement = element.nativeElement;
    window.requestAnimationFrame(() => this.ensurePlaceMap());
  }

  readonly detailsOpen = signal(false);
  readonly detailsRendered = signal(false);
  readonly title = signal('');
  readonly notes = signal('');
  readonly kind = signal<ReminderKind>('todo');
  readonly dueAt = signal(toLocalInputValue(new Date(Date.now() + 1000 * 60 * 60)));
  readonly placeLabel = signal('');
  readonly placeSearch = signal('');
  readonly placeResults = signal<PlaceSearchResult[]>([]);
  readonly placeSearchLoading = signal(false);
  readonly placeSearchError = signal('');
  readonly latitude = signal('');
  readonly longitude = signal('');
  readonly radiusMeters = signal(250);
  readonly editingId = signal<string | null>(null);
  readonly completingId = signal<string | null>(null);
  readonly saveStatus = signal('');
  readonly saveStatusTone = signal<'success' | 'error'>('success');
  readonly diagnosticsOpen = signal(false);
  readonly lastRuntimeError = signal('');
  readonly phoneModePreferred = signal(readPhoneModePreferred());
  readonly activeModule = signal<ModuleMode>('tasks');
  readonly reducedMotion = signal(prefersReducedMotion());
  readonly useNativeScrollTimeline = supportsScrollTimeline();
  readonly scrollProgress = signal(0);
  readonly scrollProgressTransform = computed(() => `scaleX(${this.reducedMotion() ? 0 : this.scrollProgress()})`);
  readonly displayedCompletionRate = signal(0);

  private readonly timelines = new Map<MotionKey, gsap.core.Timeline>();
  private scrollFrame = 0;
  private placeMapElement?: HTMLElement;
  private placeMap?: L.Map;
  private placeMarker?: L.Marker;
  private placeCircle?: L.Circle;

  readonly completionRate = computed(() => {
    const total = this.taskReminders().length;
    if (!total) {
      return 0;
    }

    const completedTasks = this.store.completedReminders().filter((reminder) => reminder.kind !== 'location').length;
    return Math.round((completedTasks / total) * 100);
  });
  readonly greeting = computed(() => {
    const hour = new Date().getHours();

    if (hour < 12) {
      return 'Good morning';
    }

    if (hour < 18) {
      return 'Good afternoon';
    }

    return 'Good evening';
  });
  readonly taskReminders = computed(() => this.store.reminders().filter((reminder) => reminder.kind !== 'location'));
  readonly openTaskReminders = computed(() => this.store.openReminders().filter((reminder) => reminder.kind !== 'location'));
  readonly reminderReminders = computed(() => this.store.openReminders().filter((reminder) => reminder.kind === 'location'));
  readonly todayReminders = computed(() =>
    [...this.openTaskReminders()]
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
      .slice(0, 5)
  );
  readonly locationQueue = computed(() =>
    [...this.reminderReminders()]
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
      .slice(0, 5)
  );
  // Psychology: Zeigarnik effect. Keep exactly one open loop visually dominant so the backlog does not become mental clutter.
  readonly nextReminder = computed(() => this.todayReminders()[0]);
  // Psychology: cognitive load reduction. Show only a short secondary queue so the user never has to scan the full backlog on mobile.
  readonly laterReminders = computed(() => this.todayReminders().slice(1, 4));
  readonly captureTitle = computed(() => {
    if (this.editingId()) {
      return 'Editing';
    }

    return this.activeModule() === 'reminders' ? 'One place to remember' : 'One thing to do';
  });
  readonly capturePlaceholder = computed(() =>
    this.activeModule() === 'reminders' ? 'What should happen there?' : 'Type it, tap plus, move on'
  );
  readonly diagnosticRows = computed(() => {
    const user = this.auth.user();

    return [
      { label: 'Signed in', value: user ? 'yes' : 'no' },
      { label: 'UID', value: user?.uid ?? 'none' },
      { label: 'Email', value: user?.email ?? 'none' },
      { label: 'Sync', value: this.store.syncState() },
      { label: 'Reminders', value: String(this.store.reminders().length) },
      { label: 'Module', value: this.activeModule() },
      { label: 'Open', value: String(this.store.openReminders().length) },
      { label: 'Next', value: this.nextReminder()?.title ?? 'none' },
      { label: 'Store error', value: this.store.error() || 'none' },
      { label: 'Status', value: this.saveStatus() || 'none' },
      { label: 'Notifications', value: this.notifications.permission() },
      { label: 'Notify status', value: this.notifications.status() || 'none' },
      { label: 'Notify error', value: this.notifications.error() || 'none' },
      { label: 'Installed PWA', value: isStandaloneApp() ? 'yes' : 'no' },
      { label: 'Location watch', value: this.location.isWatching() ? 'on' : 'off' },
      { label: 'Phone mode', value: this.phoneModePreferred() ? 'armed' : 'off' },
      { label: 'Location error', value: this.location.error() || 'none' },
      { label: 'Runtime error', value: this.lastRuntimeError() || 'none' },
      { label: 'URL', value: window.location.href },
      { label: 'App version', value: APP_VERSION }
    ];
  });
  readonly diagnosticText = computed(() =>
    this.diagnosticRows()
      .map((row) => `${row.label}: ${row.value}`)
      .join('\n')
  );

  ngAfterViewInit(): void {
    this.playPageEntryFlow();
    this.playProgressCounterFlow();
    this.queueScrollProgressUpdate();
    window.setTimeout(() => this.resumePhoneMode(), 400);
  }

  ngOnDestroy(): void {
    for (const timeline of this.timelines.values()) {
      timeline.progress(1).kill();
    }

    if (this.scrollFrame) {
      window.cancelAnimationFrame(this.scrollFrame);
    }

    this.placeMap?.remove();
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.queueScrollProgressUpdate();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.queueScrollProgressUpdate();
  }

  @HostListener('window:solarray-reminder-status', ['$event'])
  onReminderStatus(event: Event): void {
    const detail = (event as CustomEvent<ReminderStatusEvent>).detail;
    if (!detail?.message) {
      return;
    }

    this.saveStatusTone.set(detail.tone);
    this.saveStatus.set(detail.message);
  }

  @HostListener('window:error', ['$event'])
  onWindowError(event: ErrorEvent): void {
    this.reportRuntimeProblem(event.message || 'A browser error happened.');
  }

  @HostListener('window:unhandledrejection', ['$event'])
  onUnhandledRejection(event: PromiseRejectionEvent): void {
    const reason = event.reason as { message?: string; code?: string } | string | null;
    const message = typeof reason === 'string' ? reason : reason?.message || reason?.code || 'A background action failed.';
    this.reportRuntimeProblem(message);
  }

  addReminder(): void {
    if (!this.title().trim()) {
      return;
    }

    const editingReminder = this.editingId()
      ? this.store.reminders().find((candidate) => candidate.id === this.editingId())
      : undefined;
    const reminderTitle = this.title().trim();
    const latitude = Number(this.latitude());
    const longitude = Number(this.longitude());
    if (this.activeModule() === 'reminders') {
      this.kind.set('location');
    }
    const hasLocation = this.kind() === 'location' && Number.isFinite(latitude) && Number.isFinite(longitude);

    const reminder: Reminder = {
      id: editingReminder?.id ?? crypto.randomUUID(),
      title: reminderTitle,
      notes: this.notes().trim(),
      kind: this.kind(),
      dueAt: new Date(this.dueAt()).toISOString(),
      completed: editingReminder?.completed ?? false,
      createdAt: editingReminder?.createdAt ?? new Date().toISOString(),
      location: hasLocation
        ? {
            label: this.placeLabel().trim() || 'Saved place',
            latitude,
            longitude,
            radiusMeters: this.radiusMeters()
          }
        : undefined
    };

    this.playCaptureFlow();
    if (!this.auth.user()) {
      this.saveStatusTone.set('error');
      this.saveStatus.set('Sign in before adding reminders.');
      return;
    }
    this.saveStatusTone.set('success');
    this.saveStatus.set('');
    this.store.add(reminder);

    this.resetCaptureForm();
    this.closeDetailsAfterCapture();
    if (!editingReminder) {
      this.playTaskEntryFlow(reminder.id);
    }
    this.saveStatusTone.set('success');
    this.saveStatus.set(editingReminder ? 'Changes saved.' : 'Reminder added.');
    window.setTimeout(() => {
      if (this.saveStatus() === 'Changes saved.' || this.saveStatus() === 'Reminder added.') {
        this.saveStatus.set('');
      }
    }, 2_000);
    void this.notifications.showLocal(editingReminder ? 'Reminder updated' : 'Reminder saved', reminderTitle || 'Your reminder is ready.');
  }

  toggleDiagnostics(): void {
    // Psychology: trust repair. Diagnostics stay tucked away until live testing needs a screenshotable explanation.
    this.diagnosticsOpen.update((open) => !open);
  }

  async copyDiagnostics(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.diagnosticText());
      this.saveStatusTone.set('success');
      this.saveStatus.set('Live check copied.');
    } catch {
      this.saveStatusTone.set('error');
      this.saveStatus.set('Could not copy live check. Screenshot this panel instead.');
    }
  }

  selectModule(module: ModuleMode): void {
    // Psychology: spatial memory. Modules keep related actions in one place so the user does not re-map the whole screen.
    this.activeModule.set(module);

    if (module === 'reminders') {
      this.kind.set('location');
      if (!this.detailsOpen()) {
        this.openDetailsFlow();
      }
      return;
    }

    if (module === 'tasks' && this.kind() === 'location') {
      this.kind.set('todo');
    }
  }

  toggleDetails(): void {
    if (this.detailsOpen()) {
      this.closeDetailsFlow();
      return;
    }

    this.openDetailsFlow();
  }

  setKind(kind: ReminderKind): void {
    // Psychology: friction reduction. Selecting a type should not force another panel transition or extra decision.
    this.kind.set(kind);
    if (kind === 'location') {
      window.requestAnimationFrame(() => this.ensurePlaceMap());
    }
  }

  completeReminder(id: string): void {
    if (this.reducedMotion()) {
      const reminder = this.store.reminders().find((candidate) => candidate.id === id);
      void this.store.toggle(id);
      if (reminder && !reminder.completed) {
        void this.notifications.showLocal('Task completed', reminder.title);
      }
      this.playProgressCounterFlow();
      return;
    }

    this.finishTaskTimeline(id);
    this.playTaskCompletionFlow(id);
  }

  deleteReminder(id: string): void {
    if (this.editingId() === id) {
      this.cancelEdit();
    }

    if (this.reducedMotion()) {
      void this.store.remove(id);
      this.playProgressCounterFlow();
      return;
    }

    this.finishTaskTimeline(id);
    this.playTaskDeletionFlow(id);
  }

  editReminder(id: string): void {
    const reminder = this.store.reminders().find((candidate) => candidate.id === id);
    if (!reminder) {
      return;
    }

    this.editingId.set(reminder.id);
    this.activeModule.set(reminder.kind === 'location' ? 'reminders' : 'tasks');
    this.title.set(reminder.title);
    this.notes.set(reminder.notes);
    this.kind.set(reminder.kind);
    this.dueAt.set(toLocalInputValue(new Date(reminder.dueAt)));
    this.placeLabel.set(reminder.location?.label ?? '');
    this.placeSearch.set(reminder.location?.label ?? '');
    this.latitude.set(reminder.location ? String(reminder.location.latitude) : '');
    this.longitude.set(reminder.location ? String(reminder.location.longitude) : '');
    this.radiusMeters.set(reminder.location?.radiusMeters ?? 250);
    this.placeResults.set([]);
    this.placeSearchError.set('');

    if (!this.detailsOpen()) {
      this.openDetailsFlow();
    }

    window.requestAnimationFrame(() => {
      this.quickCapture?.nativeElement.focus();
      if (reminder.location) {
        this.setSelectedPlace(reminder.location.latitude, reminder.location.longitude, reminder.location.label, 16);
      }
    });
  }

  cancelEdit(): void {
    this.resetCaptureForm();
  }

  async signOut(): Promise<void> {
    this.location.stop(false);
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }

  async refreshApp(): Promise<void> {
    // Psychology: trust repair. Refresh gives the user a direct recovery action when live data or cached PWA updates feel stale.
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    }

    window.location.reload();
  }

  private reportRuntimeProblem(message: string): void {
    this.lastRuntimeError.set(message);
    this.saveStatusTone.set('error');
    this.saveStatus.set(`Something failed live: ${message}`);
    this.diagnosticsOpen.set(true);
  }

  private resumePhoneMode(): void {
    if (!this.phoneModePreferred()) {
      return;
    }

    this.location.start(false);
  }

  private setPhoneModePreferred(value: boolean): void {
    this.phoneModePreferred.set(value);
    try {
      window.localStorage.setItem(PHONE_MODE_KEY, value ? '1' : '0');
    } catch {
      // The mode still works for the current app session if storage is unavailable.
    }
  }

  async toggleLocationWatch(): Promise<void> {
    if (this.location.isWatching()) {
      this.location.stop();
      this.setPhoneModePreferred(false);
      this.playStatusSignalFlow('.phone-mode-card .pi-map-marker, .phone-mode-card .pi-stop-circle');
      return;
    }

    await this.notifications.requestPermission();
    this.location.start();
    this.playStatusSignalFlow('.phone-mode-card .pi-map-marker, .phone-mode-card .pi-stop-circle');
  }

  async requestNotifications(): Promise<void> {
    const granted = await this.notifications.requestPermission();
    if (granted) {
      await this.notifications.showLocal('Solarray notifications are on', 'Your phone can show reminders from this app.');
    }
    this.playStatusSignalFlow('.phone-mode-card .pi-bell');
  }

  async enablePhoneMode(): Promise<void> {
    // Psychology: implementation intention. One deliberate "arm phone mode" action replaces scattered permission chores.
    this.setPhoneModePreferred(true);
    const granted = await this.notifications.requestPermission();
    this.location.start();
    this.saveStatusTone.set(granted && !this.location.error() ? 'success' : 'error');
    this.saveStatus.set(granted ? 'Phone mode armed.' : 'Notifications still need permission.');
    this.playStatusSignalFlow('.phone-mode-card .pi-bolt, .phone-mode-card .pi-map-marker, .phone-mode-card .pi-bell');
  }

  disablePhoneMode(): void {
    this.setPhoneModePreferred(false);
    this.location.stop();
    this.saveStatusTone.set('success');
    this.saveStatus.set('Phone mode paused.');
    this.playStatusSignalFlow('.phone-mode-card .pi-pause-circle');
  }

  async useCurrentLocation(): Promise<void> {
    const position = this.location.currentPosition() ?? (await this.readCurrentPosition().catch(() => null));
    if (!position) {
      return;
    }

    this.setSelectedPlace(position.latitude, position.longitude, 'Current location', 17);
    this.kind.set('location');
  }

  setRadius(value: number): void {
    this.radiusMeters.set(Number.isFinite(value) ? value : 250);
    this.syncPlaceCircle();
  }

  async searchPlaces(): Promise<void> {
    const query = this.placeSearch().trim();
    if (query.length < 3) {
      this.placeSearchError.set('Type at least 3 characters.');
      this.placeResults.set([]);
      return;
    }

    this.placeSearchLoading.set(true);
    this.placeSearchError.set('');

    try {
      const params = new URLSearchParams({
        q: query,
        format: 'jsonv2',
        limit: '5',
        addressdetails: '1'
      });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Place search failed.');
      }

      const results = (await response.json()) as PlaceSearchResult[];
      this.placeResults.set(results);
      this.placeSearchError.set(results.length ? '' : 'No places found.');
    } catch {
      this.placeResults.set([]);
      this.placeSearchError.set('Could not search places right now.');
    } finally {
      this.placeSearchLoading.set(false);
    }
  }

  choosePlace(result: PlaceSearchResult): void {
    this.setSelectedPlace(Number(result.lat), Number(result.lon), result.display_name, 16);
    this.placeSearch.set(result.display_name);
    this.placeResults.set([]);
  }

  private readCurrentPosition(): Promise<{ latitude: number; longitude: number }> {
    if (!('geolocation' in navigator)) {
      return Promise.reject(new Error('Location is not available on this device.'));
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
        reject,
        { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 }
      );
    });
  }

  private resetCaptureForm(): void {
    this.editingId.set(null);
    this.title.set('');
    this.notes.set('');
    this.placeLabel.set('');
    this.placeSearch.set('');
    this.placeResults.set([]);
    this.placeSearchError.set('');
    this.latitude.set('');
    this.longitude.set('');
    this.radiusMeters.set(250);
    this.kind.set('todo');
  }

  private ensurePlaceMap(): void {
    if (!this.placeMapElement || this.kind() !== 'location') {
      return;
    }

    if (this.placeMap) {
      this.placeMap.invalidateSize();
      return;
    }

    const latitude = Number(this.latitude());
    const longitude = Number(this.longitude());
    const center: L.LatLngExpression =
      Number.isFinite(latitude) && Number.isFinite(longitude) ? [latitude, longitude] : [-26.2041, 28.0473];

    this.placeMap = L.map(this.placeMapElement, {
      zoomControl: false,
      attributionControl: false
    }).setView(center, Number.isFinite(latitude) && Number.isFinite(longitude) ? 16 : 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.placeMap);
    L.control.zoom({ position: 'bottomright' }).addTo(this.placeMap);

    this.placeMarker = L.marker(center, {
      draggable: true,
      icon: L.divIcon({
        className: 'place-pin',
        html: '<span></span>',
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      })
    }).addTo(this.placeMap);
    this.placeCircle = L.circle(center, {
      radius: this.radiusMeters(),
      color: '#f0c987',
      fillColor: '#f0c987',
      fillOpacity: 0.08,
      opacity: 0.45,
      weight: 1
    }).addTo(this.placeMap);

    this.placeMap.on('click', (event) => this.setSelectedPlace(event.latlng.lat, event.latlng.lng, 'Pinned place'));
    this.placeMarker.on('dragend', () => {
      const position = this.placeMarker?.getLatLng();
      if (position) {
        this.setSelectedPlace(position.lat, position.lng, 'Pinned place');
      }
    });
  }

  private setSelectedPlace(latitude: number, longitude: number, label: string, zoom?: number): void {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }

    const position: L.LatLngExpression = [latitude, longitude];
    this.latitude.set(latitude.toFixed(6));
    this.longitude.set(longitude.toFixed(6));
    this.placeLabel.set(label);
    this.ensurePlaceMap();
    this.placeMarker?.setLatLng(position);
    this.placeCircle?.setLatLng(position);
    this.placeMap?.setView(position, zoom ?? this.placeMap.getZoom(), { animate: !this.reducedMotion() });
  }

  private syncPlaceCircle(): void {
    const latitude = Number(this.latitude());
    const longitude = Number(this.longitude());
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }

    this.placeCircle?.setLatLng([latitude, longitude]);
    this.placeCircle?.setRadius(this.radiusMeters());
  }

  private playPageEntryFlow(): void {
    const cards = this.entryCards();
    if (this.reducedMotion() || !cards.length) {
      gsap.set(cards, { autoAlpha: 1, y: 0 });
      return;
    }

    const pageEntryTimeline = this.replaceTimeline('pageEntry');
    // Psychology: spatial hierarchy. Cards assemble top-to-bottom so the user learns where each function lives.
    pageEntryTimeline.fromTo(
      cards,
      { autoAlpha: 0, y: 16 },
      {
        autoAlpha: 1,
        y: 0,
        duration: MOTION.pageEntryDuration,
        ease: MOTION.easeOut,
        stagger: MOTION.pageEntryStagger,
        clearProps: 'transform,opacity,visibility'
      }
    );
  }

  private playCaptureFlow(): void {
    if (this.reducedMotion()) {
      return;
    }

    const button = this.addButton?.nativeElement;
    const burst = button?.querySelector<HTMLElement>('.capture-burst');
    if (!button || !burst) {
      return;
    }

    const captureTimeline = this.replaceTimeline('capture');
    // Psychology: immediate feedback. The plus button confirms capture at the exact moment of intent.
    captureTimeline
      .to(button, { scale: 1.12, duration: MOTION.addScaleUpDuration, ease: MOTION.spring })
      .to(button, { scale: 1, duration: MOTION.addScaleDownDuration, ease: MOTION.easeOut }, '+=0')
      // Psychology: micro-win reward. The glow fades after the action succeeds, using only the app accent.
      .fromTo(
        burst,
        { autoAlpha: 0.5, scale: 0.42 },
        { autoAlpha: 0, scale: 1.55, duration: MOTION.addGlowDuration, ease: MOTION.easeOut },
        0
      );
  }

  private playTaskEntryFlow(id: string): void {
    if (this.reducedMotion()) {
      return;
    }

    window.requestAnimationFrame(() => {
      const item = this.taskItem(id);
      const nextCard = this.nextCard();
      if (!item || !nextCard) {
        return;
      }

      const taskEntryTimeline = this.replaceTimeline('taskEntry');
      const isLater = this.isLaterItem(item);
      // Psychology: object permanence. The new task lands from above at its final x position, avoiding sideways drift.
      // Later items settle in with a slight scale-up rather than a long travel, matching their quieter role in the list.
      taskEntryTimeline.fromTo(
        item,
        {
          autoAlpha: 0,
          y: isLater ? -8 : -12,
          scale: isLater ? MOTION.laterTaskEntryScale : 1
        },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: isLater ? MOTION.laterTaskEntryDuration : MOTION.newTaskEntryDuration,
          ease: MOTION.easeOut,
          clearProps: 'transform,opacity,visibility'
        },
        0
      );
      // Psychology: landing confirmation. The Next Up card breathes once so the user knows where the thought went.
      taskEntryTimeline.to(nextCard, { scale: 1.015, duration: MOTION.nextPulseDuration / 2, ease: MOTION.easeOut }, 0);
      taskEntryTimeline.to(nextCard, { scale: 1, duration: MOTION.nextPulseDuration / 2, ease: MOTION.easeOut }, MOTION.nextPulseDuration / 2);
    });
  }

  private playTaskCompletionFlow(id: string): void {
    const item = this.taskItem(id);
    if (!item) {
      return;
    }

    this.completingId.set(id);
    const key: MotionKey = `task-${id}`;
    const check = item.querySelector<HTMLElement>('.big-check, .small-check');
    const icon = check?.querySelector<HTMLElement>('i');
    const ripple = check?.querySelector<HTMLElement>('.check-ripple');
    const copy = item.querySelector<HTMLElement>('.task-copy');
    const title = copy?.querySelector<HTMLElement>('h2, h3');
    if (!check || !icon || !ripple || !copy || !title) {
      return;
    }

    const isLater = this.isLaterItem(item);
    const durationScale = isLater ? 0.8 : 1;
    const completionTimeline = this.replaceTimeline(key);
    gsap.set(title, { textDecorationLine: 'line-through', textDecorationColor: 'transparent' });

    if (isLater) {
      // Psychology: quiet acknowledgement. The whole row settles with a brief lift, echoing the Next Up card's breathe at a smaller scale.
      completionTimeline.to(item, { scale: 1.012, duration: MOTION.laterRowSettleDuration, ease: MOTION.easeOut }, 0);
      completionTimeline.to(item, { scale: 1, duration: MOTION.laterRowSettleDuration, ease: MOTION.easeOut }, MOTION.laterRowSettleDuration);
    }

    // Psychology: micro-win confirmation. The check fills first so the user sees the command was accepted.
    completionTimeline.to(icon, { color: 'var(--accent)', duration: MOTION.checkFillDuration * durationScale, ease: MOTION.easeOut });
    // Psychology: immediate reward. A ripple expands from the touch target without moving surrounding layout.
    completionTimeline.fromTo(
      ripple,
      { autoAlpha: 1, scale: 0.72 },
      { autoAlpha: 0, scale: 1.38, duration: MOTION.checkRippleDuration * durationScale, ease: MOTION.easeOut },
      0
    );
    // Psychology: closure. The text strike lets the user briefly see the open loop resolved before removal.
    completionTimeline.to(title, { textDecorationColor: 'var(--accent)', duration: MOTION.strikethroughDuration * durationScale, ease: MOTION.easeOut }, '>');
    completionTimeline.to({}, { duration: MOTION.completionPause * durationScale });
    // Psychology: Zeigarnik relief. The finished item leaves upward after the reward moment is visible.
    completionTimeline.to(item, {
      autoAlpha: 0,
      y: -8,
      duration: MOTION.completeExitDuration * durationScale,
      ease: MOTION.easeOut
    });
    completionTimeline.add(() => {
      const reminder = this.store.reminders().find((candidate) => candidate.id === id);
      void this.store.toggle(id);
      if (reminder && !reminder.completed) {
        void this.notifications.showLocal('Task completed', reminder.title);
      }
      this.completingId.set(null);
      this.playProgressCounterFlow();
      this.revealReplacementTask(id);
    });
  }

  private playTaskDeletionFlow(id: string): void {
    const item = this.taskItem(id);
    if (!item) {
      return;
    }

    const key: MotionKey = `task-${id}`;
    const deletionTimeline = this.replaceTimeline(key);
    const isLater = this.isLaterItem(item);

    // Psychology: clean removal. Delete is quiet and functional, so it fades away without celebration.
    // Later rows dissolve in place with a slight shrink rather than sliding, keeping the quieter list visually settled.
    deletionTimeline.to(item, {
      autoAlpha: 0,
      x: isLater ? 0 : 8,
      scale: isLater ? 0.97 : 1,
      duration: MOTION.deleteExitDuration,
      ease: MOTION.easeOut
    });
    deletionTimeline.add(() => {
      void this.store.remove(id);
      this.revealReplacementTask(id);
    });
  }

  private revealReplacementTask(previousId: string): void {
    if (this.reducedMotion()) {
      return;
    }

    window.requestAnimationFrame(() => {
      const replacement = document.querySelector<HTMLElement>('[data-motion-item]');
      if (!replacement || replacement.dataset['reminderId'] === previousId) {
        return;
      }

      // Psychology: object permanence. When Angular reuses a task node, clear the old exit state so the next item visibly takes its place.
      gsap.killTweensOf(replacement);
      gsap.fromTo(
        replacement,
        { autoAlpha: 0, y: -8 },
        {
          autoAlpha: 1,
          y: 0,
          duration: this.isLaterItem(replacement) ? MOTION.laterTaskEntryDuration : MOTION.newTaskEntryDuration,
          ease: MOTION.easeOut,
          clearProps: 'transform,opacity,visibility'
        }
      );
    });
  }

  private openDetailsFlow(): void {
    if (this.reducedMotion()) {
      this.detailsRendered.set(true);
      this.detailsOpen.set(true);
      return;
    }

    this.detailsRendered.set(true);
    this.detailsOpen.set(true);
    window.requestAnimationFrame(() => {
      const panel = this.detailsPanel?.nativeElement;
      const chevron = this.detailsChevron();
      if (!panel) {
        return;
      }

      const detailsTimeline = this.replaceTimeline('details');
      // Psychology: progressive disclosure. Details unfold from zero height so optional complexity feels intentionally revealed.
      detailsTimeline.fromTo(
        panel,
        { height: 0, autoAlpha: 0, overflow: 'hidden' },
        { height: 'auto', autoAlpha: 1, duration: MOTION.detailsOpenDuration, ease: MOTION.easeOut, clearProps: 'height,overflow,opacity,visibility' }
      );
      // Psychology: recognition over recall. The chevron rotates with the panel to keep open/close state readable.
      detailsTimeline.to(chevron, { rotate: 180, duration: MOTION.detailsOpenDuration, ease: MOTION.easeOut }, 0);
    });
  }

  private closeDetailsFlow(): void {
    if (this.reducedMotion()) {
      this.detailsOpen.set(false);
      this.detailsRendered.set(false);
      return;
    }

    const panel = this.detailsPanel?.nativeElement;
    const chevron = this.detailsChevron();
    this.detailsOpen.set(false);
    if (!panel) {
      this.detailsRendered.set(false);
      return;
    }

    const detailsTimeline = this.replaceTimeline('details');
    // Psychology: cognitive load reduction. Details fade first, then space collapses, so the page does not feel abrupt.
    detailsTimeline
      .to(panel, { autoAlpha: 0, duration: MOTION.detailsFadeDuration, ease: MOTION.easeOut })
      .to(panel, { height: 0, overflow: 'hidden', duration: MOTION.detailsCloseDuration, ease: MOTION.easeInOut })
      // Psychology: recognition over recall. The chevron returns in sync with the collapsing panel.
      .to(chevron, { rotate: 0, duration: MOTION.detailsOpenDuration, ease: MOTION.easeOut }, 0)
      .add(() => {
        this.detailsRendered.set(false);
        gsap.set(panel, { clearProps: 'height,overflow,opacity,visibility' });
      });
  }

  private closeDetailsAfterCapture(): void {
    if (!this.detailsOpen()) {
      return;
    }

    this.closeDetailsFlow();
  }

  private playStatusSignalFlow(iconSelector: string): void {
    if (this.reducedMotion()) {
      return;
    }

    const icon = document.querySelector<HTMLElement>(iconSelector);
    if (!icon) {
      return;
    }

    const statusTimeline = this.replaceTimeline('status');
    // Psychology: change blindness prevention. The changed signal pulses once so status updates are noticed without competing with capture.
    statusTimeline.to(icon, { scale: 1.1, duration: MOTION.statusPulseDuration / 2, ease: MOTION.easeOut });
    statusTimeline.to(icon, { scale: 1, duration: MOTION.statusPulseDuration / 2, ease: MOTION.easeOut });
  }

  private playProgressCounterFlow(): void {
    const target = this.completionRate();
    if (this.reducedMotion()) {
      this.displayedCompletionRate.set(target);
      return;
    }

    const counter = { value: this.displayedCompletionRate() };
    const counterTimeline = this.replaceTimeline('counter');
    // Psychology: earned progress. Counting toward the current percentage makes progress feel active, not static.
    counterTimeline.to(counter, {
      value: target,
      duration: MOTION.counterDuration,
      ease: MOTION.easeOut,
      onUpdate: () => this.displayedCompletionRate.set(Math.round(counter.value))
    });
  }

  private queueScrollProgressUpdate(): void {
    if (this.reducedMotion() || this.useNativeScrollTimeline || this.scrollFrame) {
      return;
    }

    this.scrollFrame = window.requestAnimationFrame(() => {
      this.scrollFrame = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      this.scrollProgress.set(scrollable <= 0 ? 0 : Math.min(window.scrollY / scrollable, 1));
    });
  }

  private entryCards(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('[data-entry-card]'));
  }

  private taskItem(id: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(`[data-reminder-id="${id}"]`);
  }

  private nextCard(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.next-card');
  }

  private detailsChevron(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.details-toggle i');
  }

  private isLaterItem(item: HTMLElement): boolean {
    return !!item.closest('.later-list');
  }

  private replaceTimeline(key: MotionKey): gsap.core.Timeline {
    this.finishTimeline(key);
    const timeline = gsap.timeline({
      onComplete: () => this.timelines.delete(key)
    });
    this.timelines.set(key, timeline);
    return timeline;
  }

  private finishTimeline(key: MotionKey): void {
    const timeline = this.timelines.get(key);
    if (!timeline) {
      return;
    }

    timeline.progress(1).kill();
    this.timelines.delete(key);
  }

  private finishTaskTimeline(id: string): void {
    this.finishTimeline(`task-${id}`);
  }
}

function toLocalInputValue(date: Date): string {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isStandaloneApp(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

function readPhoneModePreferred(): boolean {
  try {
    return window.localStorage.getItem(PHONE_MODE_KEY) !== '0';
  } catch {
    return true;
  }
}

function supportsScrollTimeline(): boolean {
  return false;
}
