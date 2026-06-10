import { CommonModule, DatePipe } from '@angular/common';
import { AfterViewInit, Component, computed, effect, ElementRef, HostListener, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { gsap } from 'gsap';
import type { Feature, FeatureCollection } from 'geojson';
import maplibregl from 'maplibre-gl';

import { AuthService } from '../../auth.service';
import { AchievementDef, CompletionAward, GameService } from '../../game.service';
import { LocationReminderService } from '../../location-reminder.service';
import { NativeLocationService } from '../../native-location.service';
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
  promotedTaskDuration: 0.46,
  moduleExitDuration: 0.18,
  moduleEnterDuration: 0.34,
  nextPulseDuration: 0.3,
  checkFillDuration: 0.15,
  checkPopDuration: 0.24,
  checkRippleDuration: 0.3,
  strikethroughDuration: 0.15,
  completionPause: 0.08,
  completeExitDuration: 0.26,
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

type MotionKey = 'pageEntry' | 'capture' | 'taskEntry' | 'details' | 'status' | 'counter' | 'openCount' | 'points' | 'module' | `task-${string}`;
type ModuleMode = 'tasks' | 'reminders' | 'notifications' | 'settings';

interface PlaceSearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

interface ParsedTime {
  date: Date;
  phrase: string;
}

type DuePresetId = 'hour' | 'evening' | 'tomorrow' | 'weekend';

const DUE_PRESETS: { id: DuePresetId; icon: string; label: string }[] = [
  { id: 'hour', icon: 'pi-forward', label: 'In an hour' },
  { id: 'evening', icon: 'pi-moon', label: 'This evening' },
  { id: 'tomorrow', icon: 'pi-sun', label: 'Tomorrow morning' },
  { id: 'weekend', icon: 'pi-calendar', label: 'Weekend' }
];

const KIND_META: Record<ReminderKind, { icon: string; label: string }> = {
  todo: { icon: 'pi-check-circle', label: 'Task' },
  habit: { icon: 'pi-refresh', label: 'Habit' },
  note: { icon: 'pi-book', label: 'Note' },
  location: { icon: 'pi-map-marker', label: 'Place' }
};

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
  readonly nativeLocation = inject(NativeLocationService);
  readonly game = inject(GameService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  @ViewChild('addButton') private addButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('quickCapture') private quickCapture?: ElementRef<HTMLInputElement>;
  @ViewChild('detailsPanel') private detailsPanel?: ElementRef<HTMLElement>;
  @ViewChild('moduleContent') private moduleContent?: ElementRef<HTMLElement>;
  @ViewChild('placeMap') private set placeMapRef(element: ElementRef<HTMLElement> | undefined) {
    if (!element) {
      return;
    }

    // Module switches re-create the map container; a map instance bound to the old node must be rebuilt.
    if (this.placeMap && this.placeMapElement !== element.nativeElement) {
      this.placeMap.remove();
      this.placeMap = undefined;
      this.placeMapReady = false;
      this.placeMarker = undefined;
      this.phoneMarker = undefined;
    }

    this.placeMapElement = element.nativeElement;
    window.requestAnimationFrame(() => this.ensurePlaceMap());
  }

  readonly detailsOpen = signal(false);
  readonly detailsRendered = signal(false);
  readonly noteOpen = signal(false);
  readonly placeFoldOpen = signal(false);
  readonly timeMenuOpen = signal(false);
  // True once the user picks a time by hand — natural-language detection then stops overriding it.
  readonly manualTimeSet = signal(false);
  readonly parsedTime = signal<ParsedTime | null>(null);
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
  readonly detailModalId = signal<string | null>(null);
  readonly detailTitle = signal('');
  readonly detailNotes = signal('');
  readonly detailDueAt = signal(toLocalInputValue(new Date()));
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
  // The on-screen stardust total lags the real total so the odometer can roll up after the chip lands.
  readonly displayedPoints = signal(this.game.totalPoints());
  readonly achievementToasts = signal<{ key: number; def: AchievementDef }[]>([]);
  readonly levelUpInfo = signal<{ level: number; rank: string } | null>(null);
  private toastSequence = 0;

  private readonly timelines = new Map<MotionKey, gsap.core.Timeline>();
  private scrollFrame = 0;
  private placeMapElement?: HTMLElement;
  private placeMap?: maplibregl.Map;
  private placeMapReady = false;
  private placeMarker?: maplibregl.Marker;
  private phoneMarker?: maplibregl.Marker;

  private readonly syncPhonePositionOnMap = effect(() => {
    const position = this.location.currentPosition();
    if (!position) {
      return;
    }

    window.requestAnimationFrame(() => this.syncPhonePosition(position));
  });

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
  readonly activeDetailReminder = computed(() => {
    const id = this.detailModalId();
    return id ? this.store.reminders().find((reminder) => reminder.id === id) : undefined;
  });
  // Psychology: cognitive load reduction. Show only a short secondary queue so the user never has to scan the full backlog on mobile.
  readonly laterReminders = computed(() => this.todayReminders().slice(1, 4));
  // Psychology: Zeigarnik relief. Acknowledge the rest of the backlog in one calm line instead of rendering it.
  readonly restingCount = computed(() => Math.max(0, this.openTaskReminders().length - 1 - this.laterReminders().length));
  // Psychology: micro-win reward. "All done" is only true when tasks existed and were finished, never faked for an empty list.
  readonly allTasksDone = computed(() => this.taskReminders().length > 0 && this.openTaskReminders().length === 0);
  // Psychology: gentle variable reward. The phrase shifts day to day, a small delight without gambling-style uncertainty.
  readonly allClearPhrase = computed(() => {
    const phrases = [
      'Everything is handled. Enjoy the quiet.',
      'Nothing waiting on you right now.',
      'Future you says thanks.',
      'The day is yours again.',
      'All loops closed. Breathe easy.'
    ];
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000);
    return phrases[dayOfYear % phrases.length];
  });
  readonly captureTitle = computed(() => {
    if (this.editingId()) {
      return 'Editing';
    }

    return this.activeModule() === 'reminders' ? 'One place to remember' : 'One thing to do';
  });
  readonly capturePlaceholder = computed(() =>
    this.activeModule() === 'reminders' ? 'What should happen there?' : 'Try: gym tomorrow at 7am'
  );
  readonly kindMeta = computed(() => KIND_META[this.kind()]);
  readonly watchActive = computed(() => this.location.isWatching() || this.nativeLocation.isWatching());
  readonly hasSelectedPlace = computed(() => Number.isFinite(Number(this.latitude())) && this.latitude() !== '' && this.longitude() !== '');
  readonly placeChipLabel = computed(() => (this.hasSelectedPlace() ? this.placeLabel() || 'Pinned place' : 'Pick place'));
  readonly radiusChipLabel = computed(() => formatRadius(this.radiusMeters()));
  // Live distances from the phone to every place reminder — the heart of "ping me when I'm there".
  readonly placeDistances = computed(() => {
    const position = this.location.currentPosition();
    const distances = new Map<string, number>();
    if (!position) {
      return distances;
    }
    for (const reminder of this.reminderReminders()) {
      if (reminder.location) {
        distances.set(reminder.id, haversineMeters(position, reminder.location));
      }
    }
    return distances;
  });
  readonly nearestPlaceReminder = computed(() => {
    const queue = this.locationQueue();
    if (!queue.length) {
      return undefined;
    }
    const distances = this.placeDistances();
    if (!distances.size) {
      return queue[0];
    }
    return [...queue].sort((a, b) => (distances.get(a.id) ?? Infinity) - (distances.get(b.id) ?? Infinity))[0];
  });
  readonly otherPlaceReminders = computed(() => this.locationQueue().filter((reminder) => reminder.id !== this.nearestPlaceReminder()?.id));
  readonly autoTimeActive = computed(() => !!this.parsedTime() && !this.manualTimeSet());
  readonly effectiveDueLabel = computed(() => {
    const parsed = this.parsedTime();
    if (parsed && !this.manualTimeSet()) {
      return friendlyDueLabel(parsed.date);
    }
    return friendlyDueLabel(new Date(this.dueAt()));
  });
  readonly activeTitle = computed(() => {
    switch (this.activeModule()) {
      case 'reminders':
        return 'Places';
      case 'notifications':
        return 'Inbox';
      case 'settings':
        return 'Settings';
      default:
        return 'Today';
    }
  });
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
      { label: 'Native app', value: this.nativeLocation.available() ? 'yes' : 'no' },
      { label: 'Native location', value: this.nativeLocation.isWatching() ? 'on' : 'off' },
      { label: 'Native status', value: this.nativeLocation.status() || 'none' },
      { label: 'Native error', value: this.nativeLocation.error() || 'none' },
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

    if (detail.message === 'Notification sent.') {
      return;
    }

    this.saveStatusTone.set(detail.tone);
    this.saveStatus.set(detail.message);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.timeMenuOpen()) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target && !target.closest('.time-menu') && !target.closest('.time-chip')) {
      this.timeMenuOpen.set(false);
    }
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
    let reminderTitle = this.title().trim();
    let dueDate = new Date(this.dueAt());
    const parsed = this.parsedTime();
    if (parsed && !this.manualTimeSet() && this.activeModule() === 'tasks' && !editingReminder) {
      // The detected phrase becomes the due time and leaves the title: "call mom tomorrow at 6pm" → "call mom".
      dueDate = parsed.date;
      const stripped = stripTimePhrase(reminderTitle, parsed.phrase);
      if (stripped) {
        reminderTitle = stripped;
      }
    }
    // Number('') is 0, which would silently pass as a pin in the Atlantic — treat empty as no pin.
    const latitude = this.latitude() === '' ? NaN : Number(this.latitude());
    const longitude = this.longitude() === '' ? NaN : Number(this.longitude());
    if (this.activeModule() === 'reminders') {
      this.kind.set('location');
    }
    const hasLocation = this.kind() === 'location' && Number.isFinite(latitude) && Number.isFinite(longitude);

    // A place reminder without a pin can never fire — stop and show the map instead of saving it silently.
    if (this.activeModule() === 'reminders' && !hasLocation) {
      this.saveStatusTone.set('error');
      this.saveStatus.set('Pick a place on the map first.');
      this.openPlaceFold();
      return;
    }

    const reminder: Reminder = {
      id: editingReminder?.id ?? crypto.randomUUID(),
      title: reminderTitle,
      notes: this.notes().trim(),
      kind: this.kind(),
      dueAt: dueDate.toISOString(),
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

    if (reminder.location) {
      void this.nativeLocation.start();
    }

    this.resetCaptureForm();
    this.closeDetailsAfterCapture();
    if (!editingReminder) {
      this.playTaskEntryFlow(reminder.id);
    }

    // Rapid-fire capture: focus snaps back so the next thought can land immediately.
    if (this.activeModule() === 'tasks') {
      window.requestAnimationFrame(() => this.quickCapture?.nativeElement.focus());
    }

    // The landing animation already confirms the add; only edits need a written receipt.
    if (editingReminder) {
      this.saveStatusTone.set('success');
      this.saveStatus.set('Changes saved.');
      window.setTimeout(() => {
        if (this.saveStatus() === 'Changes saved.') {
          this.saveStatus.set('');
        }
      }, 2_000);
    }
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
    if (this.activeModule() === module) {
      return;
    }

    if (this.reducedMotion() || !this.moduleContent?.nativeElement) {
      this.applySelectedModule(module);
      return;
    }

    const direction = moduleIndex(module) > moduleIndex(this.activeModule()) ? 1 : -1;
    const content = this.moduleContent.nativeElement;
    const moduleTimeline = this.replaceTimeline('module');

    moduleTimeline
      .to(content, {
        autoAlpha: 0,
        x: -14 * direction,
        filter: 'blur(6px)',
        duration: MOTION.moduleExitDuration,
        ease: MOTION.easeInOut
      })
      .add(() => {
        this.applySelectedModule(module);
        window.requestAnimationFrame(() => {
          gsap.set(content, { clearProps: 'transform,opacity,visibility,filter' });
          // Cards cascade in one after another, so the new module assembles rather than slides in as a slab.
          const cards = Array.from(content.children) as HTMLElement[];
          gsap.fromTo(
            cards,
            { autoAlpha: 0, x: 22 * direction, filter: 'blur(8px)' },
            {
              autoAlpha: 1,
              x: 0,
              filter: 'blur(0px)',
              duration: MOTION.moduleEnterDuration,
              ease: MOTION.easeOut,
              stagger: 0.055,
              clearProps: 'transform,opacity,visibility,filter'
            }
          );
        });
      });
  }

  toggleDetails(): void {
    if (this.detailsOpen()) {
      this.closeDetailsFlow();
      return;
    }

    this.openDetailsFlow();
  }

  onTitleChange(value: string): void {
    this.title.set(value);
    // Psychology: zero-decision capture. The app reads "tomorrow at 6pm" out of the sentence instead of asking for a form.
    if (this.activeModule() === 'tasks') {
      this.parsedTime.set(parseNaturalTime(value));
    }
  }

  toggleTimeMenu(): void {
    this.timeMenuOpen.update((open) => !open);
  }

  toggleNote(): void {
    this.noteOpen.update((open) => !open);
  }

  cycleKind(event: Event): void {
    const order: ReminderKind[] = ['todo', 'habit', 'note'];
    const next = order[(order.indexOf(this.kind()) + 1) % order.length];
    this.kind.set(next);

    if (!this.reducedMotion()) {
      const icon = (event.currentTarget as HTMLElement | null)?.querySelector('i');
      if (icon) {
        gsap.fromTo(icon, { scale: 0.4, rotation: -90 }, { scale: 1, rotation: 0, duration: 0.35, ease: MOTION.spring, clearProps: 'transform' });
      }
    }
  }

  togglePlaceFold(): void {
    if (this.placeFoldOpen()) {
      this.placeFoldOpen.set(false);
      return;
    }
    this.openPlaceFold();
  }

  private openPlaceFold(): void {
    this.placeFoldOpen.set(true);
    // The map can't size itself inside a still-folding container; nudge it after the fold settles.
    window.setTimeout(() => {
      this.ensurePlaceMap();
      this.placeMap?.resize();
    }, 340);
  }

  cycleRadius(event: Event): void {
    const presets = [100, 250, 500, 1000];
    const next = presets[(presets.indexOf(this.radiusMeters()) + 1) % presets.length];
    this.setRadius(next);

    if (!this.reducedMotion()) {
      const icon = (event.currentTarget as HTMLElement | null)?.querySelector('i');
      if (icon) {
        gsap.fromTo(icon, { scale: 0.4 }, { scale: 1, duration: 0.35, ease: MOTION.spring, clearProps: 'transform' });
      }
    }
  }

  placeDistanceLabel(reminder: Reminder): string {
    const distance = this.placeDistances().get(reminder.id);
    if (distance === undefined) {
      return this.watchActive() ? 'Locating…' : 'Watching paused';
    }

    const radius = reminder.location?.radiusMeters ?? this.radiusMeters();
    if (distance <= radius) {
      return 'In the zone';
    }
    return distance < 1000 ? `${Math.round(distance)} m away` : `${(distance / 1000).toFixed(1)} km away`;
  }

  isInsideZone(reminder: Reminder): boolean {
    const distance = this.placeDistances().get(reminder.id);
    if (distance === undefined) {
      return false;
    }
    return distance <= (reminder.location?.radiusMeters ?? this.radiusMeters());
  }

  duePresetOptions(): { id: DuePresetId; icon: string; label: string; hint: string }[] {
    return DUE_PRESETS.map((preset) => ({ ...preset, hint: friendlyDueLabel(duePresetDate(preset.id)) }));
  }

  applyDuePreset(id: DuePresetId): void {
    this.dueAt.set(toLocalInputValue(duePresetDate(id)));
    this.manualTimeSet.set(true);
    this.timeMenuOpen.set(false);
  }

  setManualDue(value: string): void {
    if (!value) {
      return;
    }
    this.dueAt.set(value);
    this.manualTimeSet.set(true);
  }

  setKind(kind: ReminderKind): void {
    // Psychology: friction reduction. Selecting a type should not force another panel transition or extra decision.
    this.kind.set(kind);
    if (kind === 'location') {
      window.requestAnimationFrame(() => this.ensurePlaceMap());
    }
  }

  completeReminder(id: string): void {
    if (this.detailModalId() === id) {
      this.closeTaskDetails();
    }

    // Psychology: multisensory reward. A single soft haptic tap pairs the visual win with touch on phones.
    try {
      navigator.vibrate?.(12);
    } catch {
      // Haptics are a bonus, never a requirement.
    }

    if (this.reducedMotion()) {
      const reminder = this.store.reminders().find((candidate) => candidate.id === id);
      void this.store.toggle(id);
      if (reminder && !reminder.completed) {
        void this.notifications.showLocal('Task completed', reminder.title);
        const award = this.game.recordCompletion(reminder);
        this.displayedPoints.set(award.totalPoints);
        this.enqueueAchievements(award.unlocked);
        if (award.leveledUp) {
          this.showLevelUp(award.level, award.rank);
        }
        this.checkDayCleared();
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

    if (this.detailModalId() === id) {
      this.closeTaskDetails();
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

    if (reminder.kind !== 'location') {
      this.openTaskDetails(id);
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

    this.openPlaceFold();

    window.requestAnimationFrame(() => {
      this.quickCapture?.nativeElement.focus();
      if (reminder.location) {
        this.setSelectedPlace(reminder.location.latitude, reminder.location.longitude, reminder.location.label, 16);
      }

      // Walk the eye to where editing happens: scroll up and pulse the capture panel once.
      const panel = document.querySelector<HTMLElement>('.capture-panel');
      panel?.scrollIntoView({ behavior: this.reducedMotion() ? 'auto' : 'smooth', block: 'start' });
      if (panel && !this.reducedMotion()) {
        gsap.fromTo(
          panel,
          { boxShadow: '0 0 0 1px rgba(240, 201, 135, 0.5), 0 0 26px rgba(240, 201, 135, 0.22)' },
          { boxShadow: '0 0 0 0px rgba(240, 201, 135, 0)', duration: 1.1, ease: 'power2.out', clearProps: 'boxShadow' }
        );
      }
    });
  }

  cancelEdit(): void {
    this.resetCaptureForm();
  }

  openTaskDetails(id: string): void {
    const reminder = this.store.reminders().find((candidate) => candidate.id === id);
    if (!reminder) {
      return;
    }

    this.detailModalId.set(reminder.id);
    this.detailTitle.set(reminder.title);
    this.detailNotes.set(reminder.notes);
    this.detailDueAt.set(toLocalInputValue(new Date(reminder.dueAt)));
  }

  closeTaskDetails(): void {
    const finish = () => {
      this.detailModalId.set(null);
      this.detailTitle.set('');
      this.detailNotes.set('');
      this.detailDueAt.set(toLocalInputValue(new Date()));
    };

    if (this.reducedMotion()) {
      finish();
      return;
    }

    const backdrop = document.querySelector<HTMLElement>('.task-modal-backdrop');
    const modal = document.querySelector<HTMLElement>('.task-modal');
    if (!backdrop || !modal) {
      finish();
      return;
    }

    // The dialog settles back down before it leaves, mirroring how it arrived.
    const closeTimeline = gsap.timeline({ onComplete: finish });
    closeTimeline.to(modal, { y: 12, scale: 0.96, autoAlpha: 0, duration: 0.18, ease: 'power2.in' }, 0);
    closeTimeline.to(backdrop, { autoAlpha: 0, duration: 0.2, ease: 'power1.in' }, 0.04);
  }

  saveTaskDetails(): void {
    const reminder = this.activeDetailReminder();
    const title = this.detailTitle().trim();
    if (!reminder || !title) {
      return;
    }

    this.store.add({
      ...reminder,
      title,
      notes: this.detailNotes().trim(),
      dueAt: new Date(this.detailDueAt()).toISOString()
    });
    this.saveStatusTone.set('success');
    this.saveStatus.set('Task updated.');
    window.setTimeout(() => {
      if (this.saveStatus() === 'Task updated.') {
        this.saveStatus.set('');
      }
    }, 2_000);
    this.closeTaskDetails();
    this.pulseTaskRow(reminder.id);
  }

  // After an edit lands, the row glows once so the eye finds where the change went.
  private pulseTaskRow(id: string): void {
    if (this.reducedMotion()) {
      return;
    }

    window.setTimeout(() => {
      const item = this.taskItem(id);
      if (!item) {
        return;
      }

      gsap.set(item, { transition: 'none' });
      gsap.fromTo(
        item,
        { boxShadow: '0 0 0 1px rgba(240, 201, 135, 0.55), 0 0 24px rgba(240, 201, 135, 0.28)' },
        { boxShadow: '0 0 0 0px rgba(240, 201, 135, 0)', duration: 0.9, ease: 'power2.out', clearProps: 'boxShadow,transition' }
      );
    }, 300);
  }

  async signOut(): Promise<void> {
    this.location.stop(false);
    await this.nativeLocation.stop(false);
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
    void this.nativeLocation.start();
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
    if (this.location.isWatching() || this.nativeLocation.isWatching()) {
      this.location.stop();
      await this.nativeLocation.stop();
      this.setPhoneModePreferred(false);
      this.playStatusSignalFlow('.phone-mode-card .pi-map-marker, .phone-mode-card .pi-stop-circle');
      return;
    }

    await this.notifications.requestPermission();
    this.location.start();
    await this.nativeLocation.start();
    this.playStatusSignalFlow('.phone-mode-card .pi-map-marker, .phone-mode-card .pi-stop-circle');
  }

  async requestNotifications(): Promise<void> {
    const granted = await this.notifications.requestPermission();
    const nativeGranted = await this.nativeLocation.showTestNotification();
    if (granted && !nativeGranted) {
      await this.notifications.showLocal('Solarray notifications are on', 'Your phone can show reminders from this app.');
    }
    this.playStatusSignalFlow('.phone-mode-card .pi-bell');
  }

  markNotificationsRead(): void {
    if (this.reducedMotion()) {
      this.notifications.markAllRead();
      return;
    }

    const rows = Array.from(document.querySelectorAll<HTMLElement>('.notification-list article'));
    if (!rows.length) {
      this.notifications.markAllRead();
      return;
    }

    // The inbox sweeps clean: rows leave one after another before the list empties.
    gsap.to(rows, {
      autoAlpha: 0,
      x: 16,
      duration: 0.18,
      stagger: 0.05,
      ease: 'power1.in',
      onComplete: () => this.notifications.markAllRead()
    });
  }

  async enablePhoneMode(): Promise<void> {
    // Psychology: implementation intention. One deliberate "arm phone mode" action replaces scattered permission chores.
    this.setPhoneModePreferred(true);
    const granted = await this.notifications.requestPermission();
    this.location.start();
    const nativeStarted = await this.nativeLocation.start();
    const isReady = (granted || nativeStarted) && !this.location.error() && !this.nativeLocation.error();
    this.saveStatusTone.set(isReady ? 'success' : 'error');
    this.saveStatus.set(nativeStarted ? 'Native phone mode armed.' : granted ? 'Phone mode armed while the app is open.' : 'Notifications still need permission.');
    this.playStatusSignalFlow('.phone-mode-card .pi-bolt, .phone-mode-card .pi-map-marker, .phone-mode-card .pi-bell');
  }

  async disablePhoneMode(): Promise<void> {
    this.setPhoneModePreferred(false);
    this.location.stop();
    await this.nativeLocation.stop();
    this.saveStatusTone.set('success');
    this.saveStatus.set('Phone mode paused.');
    this.playStatusSignalFlow('.phone-mode-card .pi-pause-circle');
  }

  async useCurrentLocation(): Promise<void> {
    await this.notifications.requestPermission();
    this.location.start();
    void this.nativeLocation.start();

    const position = this.location.currentPosition() ?? (await this.location.useCurrentPosition().catch(() => null));
    if (!position) {
      return;
    }

    this.setSelectedPlace(position.latitude, position.longitude, 'Current location', 17);
    this.kind.set('location');
    this.saveStatusTone.set('success');
    this.saveStatus.set('Current location pinned.');
  }

  setRadius(value: number): void {
    this.radiusMeters.set(Number.isFinite(value) ? value : 250);
    this.syncRadiusZone();
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

  private resetCaptureForm(): void {
    this.editingId.set(null);
    this.title.set('');
    this.notes.set('');
    this.noteOpen.set(false);
    this.timeMenuOpen.set(false);
    this.placeFoldOpen.set(false);
    this.parsedTime.set(null);
    this.manualTimeSet.set(false);
    this.dueAt.set(toLocalInputValue(new Date(Date.now() + 1000 * 60 * 60)));
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
      this.placeMap.resize();
      return;
    }

    const latitude = Number(this.latitude());
    const longitude = Number(this.longitude());
    const hasPin = this.latitude() !== '' && Number.isFinite(latitude) && Number.isFinite(longitude);
    const currentPosition = this.location.currentPosition();
    const center: [number, number] = hasPin
      ? [longitude, latitude]
      : currentPosition
        ? [currentPosition.longitude, currentPosition.latitude]
        : [28.0473, -26.2041];

    this.placeMap = new maplibregl.Map({
      container: this.placeMapElement,
      // A minimal inline style over CARTO's dark raster basemap — no API key, and it matches the observatory palette.
      style: {
        version: 8,
        sources: {
          basemap: {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
            ],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
          }
        },
        layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }]
      },
      center,
      zoom: hasPin || currentPosition ? 15 : 10,
      attributionControl: { compact: true },
      // One finger scrolls the page, two fingers move the map — the map never traps a scrolling thumb.
      cooperativeGestures: true,
      dragRotate: false,
      pitchWithRotate: false
    });
    this.placeMap.touchZoomRotate.disableRotation();
    this.placeMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    this.placeMap.on('click', (event) => this.setSelectedPlace(event.lngLat.lat, event.lngLat.lng, 'Pinned place'));
    this.placeMap.on('load', () => {
      this.placeMapReady = true;
      this.placeMap?.addSource('radius-zone', { type: 'geojson', data: emptyFeatureCollection() });
      this.placeMap?.addLayer({ id: 'radius-zone-fill', type: 'fill', source: 'radius-zone', paint: { 'fill-color': '#f0c987', 'fill-opacity': 0.08 } });
      this.placeMap?.addLayer({ id: 'radius-zone-line', type: 'line', source: 'radius-zone', paint: { 'line-color': '#f0c987', 'line-opacity': 0.45, 'line-width': 1.2 } });
      this.placeMap?.addSource('phone-accuracy', { type: 'geojson', data: emptyFeatureCollection() });
      this.placeMap?.addLayer({ id: 'phone-accuracy-fill', type: 'fill', source: 'phone-accuracy', paint: { 'fill-color': '#93b6a0', 'fill-opacity': 0.08 } });
      this.placeMap?.addLayer({ id: 'phone-accuracy-line', type: 'line', source: 'phone-accuracy', paint: { 'line-color': '#93b6a0', 'line-opacity': 0.3, 'line-width': 1 } });
      this.syncRadiusZone();
      const position = this.location.currentPosition();
      if (position) {
        this.syncPhonePosition(position);
      }
    });

    if (hasPin) {
      this.ensureSelectedPlaceMarker(latitude, longitude);
    }
  }

  private setSelectedPlace(latitude: number, longitude: number, label: string, zoom?: number): void {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }

    this.latitude.set(latitude.toFixed(6));
    this.longitude.set(longitude.toFixed(6));
    this.placeLabel.set(label);
    this.ensurePlaceMap();
    this.ensureSelectedPlaceMarker(latitude, longitude);
    this.syncRadiusZone();

    if (this.placeMap) {
      this.placeMap.easeTo({
        center: [longitude, latitude],
        zoom: zoom ?? this.placeMap.getZoom(),
        duration: this.reducedMotion() ? 0 : 600
      });
    }
  }

  private syncRadiusZone(): void {
    if (!this.placeMap || !this.placeMapReady) {
      return;
    }

    const source = this.placeMap.getSource('radius-zone') as maplibregl.GeoJSONSource | undefined;
    if (!source) {
      return;
    }

    const latitude = Number(this.latitude());
    const longitude = Number(this.longitude());
    if (this.latitude() === '' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      source.setData(emptyFeatureCollection());
      return;
    }

    source.setData(circleFeature(latitude, longitude, this.radiusMeters()));
  }

  private ensureSelectedPlaceMarker(latitude: number, longitude: number): void {
    if (!this.placeMap) {
      return;
    }

    if (this.placeMarker) {
      this.placeMarker.setLngLat([longitude, latitude]);
      return;
    }

    const element = document.createElement('div');
    element.className = 'place-pin';
    element.innerHTML = '<span></span>';
    this.placeMarker = new maplibregl.Marker({ element, draggable: true }).setLngLat([longitude, latitude]).addTo(this.placeMap);
    this.placeMarker.on('dragend', () => {
      const lngLat = this.placeMarker?.getLngLat();
      if (lngLat) {
        this.setSelectedPlace(lngLat.lat, lngLat.lng, 'Pinned place');
      }
    });
  }

  private syncPhonePosition(position: { latitude: number; longitude: number; accuracyMeters?: number }): void {
    if (!this.placeMap) {
      return;
    }

    const lngLat: [number, number] = [position.longitude, position.latitude];
    if (!this.phoneMarker) {
      const element = document.createElement('div');
      element.className = 'phone-pin';
      element.innerHTML = '<span></span>';
      this.phoneMarker = new maplibregl.Marker({ element }).setLngLat(lngLat).addTo(this.placeMap);
    } else {
      this.phoneMarker.setLngLat(lngLat);
    }

    if (this.placeMapReady) {
      const source = this.placeMap.getSource('phone-accuracy') as maplibregl.GeoJSONSource | undefined;
      source?.setData(circleFeature(position.latitude, position.longitude, Math.max(position.accuracyMeters ?? 25, 20)));
    }
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
      gsap.set(item, { transition: 'none' });
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
      this.playOpenCountFlow();
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
    const promotedFromRect = isLater ? undefined : this.promotedCandidateRect();
    const durationScale = isLater ? 0.8 : 1;
    const fillDuration = MOTION.checkFillDuration * durationScale;
    // Score the win up front: the burst needs to know whether this is a critical "stellar strike" before it fires.
    const reminderForAward = this.store.reminders().find((candidate) => candidate.id === id);
    const award = reminderForAward && !reminderForAward.completed ? this.game.recordCompletion(reminderForAward) : null;
    // The item leaves the DOM before the celebration lands, so capture where the chip should launch from now.
    const originRect = check.getBoundingClientRect();
    const completionTimeline = this.replaceTimeline(key);
    // CSS hover transitions on these elements would lag behind GSAP's per-frame updates, so they go quiet during the flow.
    gsap.set([item, check, icon], { transition: 'none' });
    gsap.set(title, { textDecorationLine: 'line-through', textDecorationColor: 'transparent' });
    completionTimeline.add(() => {
      icon.className = 'pi pi-check';
    }, 0);

    if (isLater) {
      // Psychology: quiet acknowledgement. The whole row settles with a brief lift, echoing the Next Up card's breathe at a smaller scale.
      completionTimeline.to(item, { scale: 1.012, duration: MOTION.laterRowSettleDuration, ease: MOTION.easeOut }, 0);
      completionTimeline.to(item, { scale: 1, duration: MOTION.laterRowSettleDuration, ease: MOTION.easeOut }, MOTION.laterRowSettleDuration);
    }

    // Psychology: micro-win confirmation. The orbit floods with amber the instant it is tapped — the command was heard.
    completionTimeline.to(
      check,
      {
        backgroundColor: '#f0c987',
        borderColor: 'rgba(240, 201, 135, 0.95)',
        boxShadow: '0 0 18px rgba(240, 201, 135, 0.4)',
        scale: 1.16,
        duration: fillDuration,
        ease: MOTION.easeOut
      },
      0
    );
    completionTimeline.to(icon, { color: '#1c1408', duration: fillDuration, ease: MOTION.easeOut }, 0);
    // Variable-intensity delight. Stardust scatters from the closed orbit — a crit goes loud, with flash, shake, and a richer storm.
    completionTimeline.add(() => {
      this.spawnCompletionBurst(check, { intensity: isLater ? 0.7 : 1, crit: !!award?.crit });
      if (award?.crit) {
        this.playCritImpact();
      }
      if (award && (award.crit || award.comboChain > 1)) {
        this.spawnFloatingLabel(originRect, award.crit ? 'Stellar strike ×3' : `Combo ×${formatMultiplier(award.comboMultiplier)}`, award.crit);
      }
    }, fillDuration);
    completionTimeline.to(check, { scale: 1, duration: MOTION.checkPopDuration * durationScale, ease: MOTION.spring }, fillDuration);
    // Psychology: immediate reward. A ripple expands from the touch target without moving surrounding layout.
    completionTimeline.fromTo(
      ripple,
      { autoAlpha: 1, scale: 0.72 },
      { autoAlpha: 0, scale: 1.38, duration: MOTION.checkRippleDuration * durationScale, ease: MOTION.easeOut },
      0
    );
    // Psychology: closure. The text strike lets the user briefly see the open loop resolved before removal.
    completionTimeline.to(title, { textDecorationColor: 'var(--accent)', duration: MOTION.strikethroughDuration * durationScale, ease: MOTION.easeOut }, fillDuration);
    completionTimeline.to({}, { duration: MOTION.completionPause * durationScale });
    // Psychology: Zeigarnik relief. The finished item drifts up and dissolves, released into space rather than deleted.
    completionTimeline.to(item, {
      autoAlpha: 0,
      y: -14,
      scale: 0.97,
      filter: 'blur(2px)',
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
      this.playOpenCountFlow();
      this.revealReplacementTask(id, promotedFromRect);
      if (award) {
        this.celebrateAward(award, originRect);
      }
      this.checkDayCleared();
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

    gsap.set(item, { transition: 'none' });
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
      this.playOpenCountFlow();
      this.revealReplacementTask(id);
    });
  }

  private revealReplacementTask(previousId: string, promotedFromRect?: DOMRect): void {
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
      this.resetTaskVisualState(replacement);
      gsap.set(replacement, { transition: 'none' });
      if (promotedFromRect && !this.isLaterItem(replacement)) {
        const nextRect = replacement.getBoundingClientRect();
        const x = promotedFromRect.left - nextRect.left;
        const y = promotedFromRect.top - nextRect.top;
        const scaleX = promotedFromRect.width / Math.max(nextRect.width, 1);
        const scaleY = promotedFromRect.height / Math.max(nextRect.height, 1);

        gsap.fromTo(
          replacement,
          {
            autoAlpha: 0.82,
            x,
            y,
            scaleX,
            scaleY,
            transformOrigin: 'top left',
            filter: 'blur(1px)'
          },
          {
            autoAlpha: 1,
            x: 0,
            y: 0,
            scaleX: 1,
            scaleY: 1,
            filter: 'blur(0px)',
            duration: MOTION.promotedTaskDuration,
            ease: 'power3.out',
            clearProps: 'transform,opacity,visibility,filter,transformOrigin,transition'
          }
        );
        return;
      }

      gsap.fromTo(
        replacement,
        { autoAlpha: 0, y: -8 },
        {
          autoAlpha: 1,
          y: 0,
          duration: this.isLaterItem(replacement) ? MOTION.laterTaskEntryDuration : MOTION.newTaskEntryDuration,
          ease: MOTION.easeOut,
          clearProps: 'transform,opacity,visibility,transition'
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

  // The reward moment. Stardust scatters from the closed orbit — particles live on document.body, so their
  // styles are global (src/styles.css), bypassing Angular's scoped component styles.
  private spawnCompletionBurst(origin: HTMLElement, options: { intensity?: number; crit?: boolean } = {}): void {
    if (this.reducedMotion()) {
      return;
    }

    const intensity = options.intensity ?? 1;
    const crit = options.crit ?? false;
    const rect = origin.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const particleCount = crit ? 26 : Math.round(12 * intensity);
    const reach = crit ? 1.7 : intensity;

    for (let index = 0; index < particleCount; index += 1) {
      const particle = document.createElement('span');
      // On a crit, every third mote burns white-hot.
      particle.className = crit && index % 3 === 0 ? 'completion-star white' : 'completion-star';
      const size = gsap.utils.random(2, crit ? 5.5 : 4.5);
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      particle.style.left = `${centerX}px`;
      particle.style.top = `${centerY}px`;
      document.body.appendChild(particle);

      const angle = gsap.utils.random(0, Math.PI * 2);
      const distance = gsap.utils.random(26, 64) * reach;
      gsap.fromTo(
        particle,
        { xPercent: -50, yPercent: -50, x: 0, y: 0, scale: 1, autoAlpha: 1 },
        {
          x: Math.cos(angle) * distance,
          // A slight upward drift: dust released into space, not falling to the floor.
          y: Math.sin(angle) * distance - 8,
          scale: 0,
          autoAlpha: 0,
          duration: gsap.utils.random(0.45, crit ? 0.95 : 0.8),
          ease: 'power2.out',
          onComplete: () => particle.remove()
        }
      );
    }

    const ringCount = crit ? 2 : 1;
    for (let index = 0; index < ringCount; index += 1) {
      const ring = document.createElement('span');
      ring.className = crit ? 'completion-ring crit' : 'completion-ring';
      ring.style.left = `${centerX}px`;
      ring.style.top = `${centerY}px`;
      document.body.appendChild(ring);
      gsap.fromTo(
        ring,
        { xPercent: -50, yPercent: -50, scale: 0.4, autoAlpha: 0.8 },
        {
          xPercent: -50,
          yPercent: -50,
          scale: 1.9 + index * 0.9,
          autoAlpha: 0,
          duration: 0.55 + index * 0.18,
          delay: index * 0.08,
          ease: 'power2.out',
          onComplete: () => ring.remove()
        }
      );
    }
  }

  // Casino layer: a "+N" chip pops off the check, arcs into the stardust HUD, and the odometer rolls up.
  private celebrateAward(award: CompletionAward, originRect: DOMRect): void {
    if (this.reducedMotion()) {
      this.displayedPoints.set(award.totalPoints);
    } else {
      this.flyPointsChip(award, originRect);
    }

    this.enqueueAchievements(award.unlocked);
    if (award.leveledUp) {
      window.setTimeout(() => this.showLevelUp(award.level, award.rank), this.reducedMotion() ? 0 : 950);
    }
  }

  private flyPointsChip(award: CompletionAward, originRect: DOMRect): void {
    const chip = document.createElement('span');
    chip.className = award.crit ? 'points-chip crit' : 'points-chip';
    chip.textContent = `+${award.points}`;
    chip.style.left = `${originRect.left + originRect.width / 2}px`;
    chip.style.top = `${originRect.top + originRect.height / 2}px`;
    document.body.appendChild(chip);

    const target = document.querySelector<HTMLElement>('.hud-points');
    const chipTimeline = gsap.timeline({
      onComplete: () => {
        chip.remove();
        this.playPointsRollFlow(award.totalPoints);
      }
    });

    chipTimeline.fromTo(
      chip,
      { xPercent: -50, yPercent: -50, scale: 0.4, autoAlpha: 0 },
      { scale: 1.12, autoAlpha: 1, duration: 0.24, ease: MOTION.spring }
    );

    if (target) {
      const targetRect = target.getBoundingClientRect();
      const deltaX = targetRect.left + targetRect.width / 2 - (originRect.left + originRect.width / 2);
      const deltaY = targetRect.top + targetRect.height / 2 - (originRect.top + originRect.height / 2);
      // Split easings on x and y trace an arc without needing a motion-path plugin.
      chipTimeline.to(chip, { x: deltaX, duration: 0.55, ease: 'power1.inOut' }, 0.42);
      chipTimeline.to(chip, { y: deltaY, duration: 0.55, ease: 'power2.in' }, 0.42);
      chipTimeline.to(chip, { scale: 0.35, autoAlpha: 0, duration: 0.2, ease: 'power1.in' }, 0.8);
    } else {
      // No HUD on screen (places module) — the chip just floats up and fades.
      chipTimeline.to(chip, { y: '-=34', autoAlpha: 0, duration: 0.6, ease: 'power1.out' }, 0.45);
    }
  }

  private playPointsRollFlow(targetTotal: number): void {
    const counter = { value: this.displayedPoints() };
    const pointsTimeline = this.replaceTimeline('points');
    pointsTimeline.to(
      counter,
      {
        value: targetTotal,
        duration: 0.6,
        ease: MOTION.easeOut,
        onUpdate: () => this.displayedPoints.set(Math.round(counter.value))
      },
      0
    );

    const hud = document.querySelector<HTMLElement>('.hud-points');
    if (hud) {
      pointsTimeline.fromTo(hud, { scale: 1.12 }, { scale: 1, duration: 0.45, ease: MOTION.spring, clearProps: 'transform' }, 0);
    }
  }

  // "COMBO ×2" / "STELLAR STRIKE" floats up from the kill like arcade damage text.
  private spawnFloatingLabel(originRect: DOMRect, text: string, crit: boolean): void {
    if (this.reducedMotion()) {
      return;
    }

    const label = document.createElement('span');
    label.className = crit ? 'combo-float crit' : 'combo-float';
    label.textContent = text;
    label.style.left = `${originRect.left + originRect.width / 2}px`;
    label.style.top = `${originRect.top - 6}px`;
    document.body.appendChild(label);

    gsap.fromTo(
      label,
      { xPercent: -50, yPercent: -50, y: 0, scale: 0.6, autoAlpha: 0, rotation: -6 },
      { y: -34, scale: 1, autoAlpha: 1, rotation: 0, duration: 0.32, ease: MOTION.spring }
    );
    gsap.to(label, { y: -58, autoAlpha: 0, duration: 0.5, ease: 'power1.in', delay: 0.6, onComplete: () => label.remove() });
  }

  // A crit hits the whole frame: amber flash, a quick camera shake, and a heavier haptic riff.
  private playCritImpact(): void {
    if (this.reducedMotion()) {
      return;
    }

    const flash = document.createElement('div');
    flash.className = 'crit-flash';
    document.body.appendChild(flash);
    gsap.fromTo(flash, { autoAlpha: 0.55 }, { autoAlpha: 0, duration: 0.5, ease: 'power2.out', onComplete: () => flash.remove() });

    const shell = document.querySelector<HTMLElement>('.app-shell');
    if (shell) {
      gsap.fromTo(shell, { x: -3 }, { x: 3, duration: 0.045, repeat: 5, yoyo: true, ease: 'none', onComplete: () => gsap.set(shell, { clearProps: 'transform' }) });
    }

    try {
      navigator.vibrate?.([14, 40, 18]);
    } catch {
      // Haptics are a bonus, never a requirement.
    }
  }

  private enqueueAchievements(defs: AchievementDef[]): void {
    defs.forEach((def, index) => window.setTimeout(() => this.pushAchievementToast(def), index * 700));
  }

  private pushAchievementToast(def: AchievementDef): void {
    const key = ++this.toastSequence;
    this.achievementToasts.update((list) => [...list, { key, def }]);
    // Removal waits until the toast's CSS life animation has already faded it out.
    window.setTimeout(() => {
      this.achievementToasts.update((list) => list.filter((toast) => toast.key !== key));
    }, 4_400);
  }

  private showLevelUp(level: number, rank: string): void {
    this.levelUpInfo.set({ level, rank });
    window.setTimeout(() => {
      if (this.levelUpInfo()?.level === level) {
        this.levelUpInfo.set(null);
      }
    }, 3_000);
  }

  dismissLevelUp(): void {
    this.levelUpInfo.set(null);
  }

  private checkDayCleared(): void {
    // The store signal settles after toggle; check shortly afterward whether the sky is clear.
    window.setTimeout(() => {
      if (this.allTasksDone()) {
        this.enqueueAchievements(this.game.recordDayCleared());
      }
    }, 350);
  }

  // Psychology: visible descent. The "N open" pill pops and its number ticks down, so every completion moves a number the user can feel.
  private playOpenCountFlow(): void {
    if (this.reducedMotion()) {
      return;
    }

    window.requestAnimationFrame(() => {
      const pill = document.querySelector<HTMLElement>('.day-pulse');
      const count = pill?.querySelector<HTMLElement>('.pulse-count');
      if (!pill || !count) {
        return;
      }

      const openCountTimeline = this.replaceTimeline('openCount');
      openCountTimeline.fromTo(pill, { scale: 1.14 }, { scale: 1, duration: 0.42, ease: MOTION.spring, clearProps: 'transform' }, 0);
      openCountTimeline.fromTo(
        pill,
        { boxShadow: '0 0 16px rgba(240, 201, 135, 0.45)' },
        { boxShadow: '0 0 0px rgba(240, 201, 135, 0)', duration: 0.5, ease: MOTION.easeOut, clearProps: 'boxShadow' },
        0
      );
      openCountTimeline.fromTo(
        count,
        { y: 8, autoAlpha: 0.2 },
        { y: 0, autoAlpha: 1, duration: 0.3, ease: MOTION.easeOut, clearProps: 'transform,opacity,visibility' },
        0
      );
    });
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

  private promotedCandidateRect(): DOMRect | undefined {
    return document.querySelector<HTMLElement>('.later-list [data-motion-item]')?.getBoundingClientRect();
  }

  private nextCard(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.next-card');
  }

  private detailsChevron(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.details-toggle i:last-child');
  }

  private isLaterItem(item: HTMLElement): boolean {
    return !!item.closest('.later-list');
  }

  private resetTaskVisualState(item: HTMLElement): void {
    const icon = item.querySelector<HTMLElement>('.big-check i, .small-check i');
    const title = item.querySelector<HTMLElement>('.task-copy h2, .task-copy h3');
    const ripple = item.querySelector<HTMLElement>('.check-ripple');
    const check = item.querySelector<HTMLElement>('.big-check, .small-check');

    if (icon) {
      icon.className = 'pi pi-circle';
      gsap.set(icon, { clearProps: 'color,transform,transition' });
    }

    if (check) {
      // The completion flow floods the check with amber inline styles; a reused node must come back as an open orbit.
      gsap.set(check, { clearProps: 'backgroundColor,borderColor,boxShadow,transform,transition' });
    }

    if (title) {
      gsap.set(title, { clearProps: 'textDecorationColor,textDecorationLine' });
      title.style.textDecorationLine = '';
      title.style.textDecorationColor = '';
    }

    if (ripple) {
      gsap.set(ripple, { autoAlpha: 0, scale: 0.72 });
    }

    gsap.set(item, { clearProps: 'opacity,visibility,transform,filter,transformOrigin,transition' });
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

  private applySelectedModule(module: ModuleMode): void {
    this.activeModule.set(module);

    if (module === 'reminders') {
      void this.activateLocationReminderSetup();
      return;
    }

    if (module === 'tasks') {
      if (this.kind() === 'location') {
        this.kind.set('todo');
      }
      // The tasks module uses the chip rail; any details panel left open by the places module would double up.
      this.detailsOpen.set(false);
      this.detailsRendered.set(false);
    }
  }

  private async activateLocationReminderSetup(): Promise<void> {
    this.kind.set('location');
    this.openPlaceFold();

    await this.notifications.requestPermission();
    this.location.start();
    void this.nativeLocation.start();

    if (!this.latitude() || !this.longitude()) {
      await this.useCurrentLocation();
    }
  }
}

function formatMultiplier(multiplier: number): string {
  return Number.isInteger(multiplier) ? String(multiplier) : multiplier.toFixed(1);
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function formatRadius(meters: number): string {
  return meters >= 1000 ? `${meters % 1000 ? (meters / 1000).toFixed(1) : meters / 1000} km` : `${meters} m`;
}

function emptyFeatureCollection(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

// MapLibre has no built-in metric circle; approximate one as a 64-point polygon.
function circleFeature(latitude: number, longitude: number, radiusMeters: number): Feature {
  const steps = 64;
  const degLat = radiusMeters / 111_320;
  const degLng = radiusMeters / (111_320 * Math.cos((latitude * Math.PI) / 180) || 1);
  const ring: [number, number][] = [];
  for (let index = 0; index <= steps; index += 1) {
    const angle = (index / steps) * 2 * Math.PI;
    ring.push([longitude + Math.cos(angle) * degLng, latitude + Math.sin(angle) * degLat]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}

function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const earthRadius = 6_371_000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

// Reads a clock time from the start of `rest`. To avoid hijacking ordinary numbers ("buy 5 apples"),
// it only accepts a bare hour when "at", minutes, or am/pm make the intent unambiguous.
function matchClock(rest: string): { hour: number; minute: number; consumed: number } | null {
  const match = /^\s+(?:(at)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(rest);
  if (!match) {
    return null;
  }

  const hasAt = !!match[1];
  const hasMinutes = match[3] !== undefined;
  const meridiem = match[4]?.toLowerCase();
  if (!hasAt && !hasMinutes && !meridiem) {
    return null;
  }

  let hour = Number(match[2]);
  const minute = hasMinutes ? Number(match[3]) : 0;
  if (hour > 23 || minute > 59) {
    return null;
  }

  if (meridiem === 'pm' && hour < 12) {
    hour += 12;
  }
  if (meridiem === 'am' && hour === 12) {
    hour = 0;
  }
  // "at 6" with no am/pm usually means evening, not dawn.
  if (!meridiem && !hasMinutes && hour >= 1 && hour <= 7) {
    hour += 12;
  }

  return { hour, minute, consumed: match[0].length };
}

function parseNaturalTime(input: string, now = new Date()): ParsedTime | null {
  // "in 20 min" / "in 2 hours"
  const relative = /\bin\s+(\d{1,3})\s*(m|min|mins|minutes|h|hr|hrs|hours)\b/i.exec(input);
  if (relative) {
    const amount = Number(relative[1]);
    const isHours = relative[2].toLowerCase().startsWith('h');
    return { date: new Date(now.getTime() + amount * (isHours ? 3_600_000 : 60_000)), phrase: relative[0] };
  }

  // Day anchors: "tomorrow", "tonight", "this evening", weekday names — each with an optional trailing clock.
  const dayMatch = /\b(tomorrow|today|tonight|this evening|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.exec(input);
  if (dayMatch) {
    const word = dayMatch[1].toLowerCase();
    const clock = matchClock(input.slice(dayMatch.index + dayMatch[0].length));
    // "today" alone carries no time information — only act on it when a clock follows.
    if (word === 'today' && !clock) {
      return null;
    }

    const date = new Date(now);
    let defaultHour = 9;
    if (word === 'tomorrow') {
      date.setDate(date.getDate() + 1);
    } else if (word === 'tonight') {
      defaultHour = 20;
    } else if (word === 'this evening') {
      defaultHour = 19;
    } else if (word !== 'today') {
      const target = WEEKDAYS.indexOf(word);
      let delta = (target - now.getDay() + 7) % 7;
      if (delta === 0) {
        delta = 7;
      }
      date.setDate(date.getDate() + delta);
    }

    date.setHours(clock?.hour ?? defaultHour, clock?.minute ?? 0, 0, 0);
    // "tonight" after 20:00 still deserves to land in the future.
    if ((word === 'tonight' || word === 'this evening') && !clock && date <= now) {
      return { date: new Date(now.getTime() + 3_600_000), phrase: dayMatch[0] };
    }

    return { date, phrase: input.substr(dayMatch.index, dayMatch[0].length + (clock?.consumed ?? 0)) };
  }

  // Bare "at 6pm" / "at 18:30" — today, rolling to tomorrow if already past.
  const atMatch = /\bat\s+\d/i.exec(input);
  if (atMatch) {
    // matchClock expects leading whitespace before the phrase, so lend it one.
    const clock = matchClock(' ' + input.slice(atMatch.index));
    if (clock) {
      const date = new Date(now);
      date.setHours(clock.hour, clock.minute, 0, 0);
      if (date <= now) {
        date.setDate(date.getDate() + 1);
      }
      return { date, phrase: input.substr(atMatch.index, clock.consumed - 1) };
    }
  }

  // Bare 24h time like "18:30".
  const bare = /\b(\d{1,2}):(\d{2})\b/.exec(input);
  if (bare) {
    const hour = Number(bare[1]);
    const minute = Number(bare[2]);
    if (hour <= 23 && minute <= 59) {
      const date = new Date(now);
      date.setHours(hour, minute, 0, 0);
      if (date <= now) {
        date.setDate(date.getDate() + 1);
      }
      return { date, phrase: bare[0] };
    }
  }

  return null;
}

function stripTimePhrase(title: string, phrase: string): string {
  const index = title.toLowerCase().indexOf(phrase.toLowerCase().trim());
  if (index < 0) {
    return title;
  }

  return (title.slice(0, index) + title.slice(index + phrase.trim().length))
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/[,.\-–]\s*$/, '')
    .trim();
}

function friendlyDueLabel(date: Date, now = new Date()): string {
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diffDays = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);

  if (diffDays === 0) {
    return `Today ${time}`;
  }
  if (diffDays === 1) {
    return `Tomorrow ${time}`;
  }
  if (diffDays > 1 && diffDays < 7) {
    return `${date.toLocaleDateString([], { weekday: 'short' })} ${time}`;
  }
  return `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
}

function duePresetDate(id: DuePresetId, now = new Date()): Date {
  switch (id) {
    case 'hour':
      return new Date(now.getTime() + 3_600_000);
    case 'evening': {
      const date = new Date(now);
      date.setHours(19, 0, 0, 0);
      if (date <= now) {
        date.setDate(date.getDate() + 1);
      }
      return date;
    }
    case 'tomorrow': {
      const date = new Date(now);
      date.setDate(date.getDate() + 1);
      date.setHours(9, 0, 0, 0);
      return date;
    }
    case 'weekend': {
      const date = new Date(now);
      const delta = (6 - date.getDay() + 7) % 7 || 7;
      date.setDate(date.getDate() + delta);
      date.setHours(10, 0, 0, 0);
      return date;
    }
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

function moduleIndex(module: ModuleMode): number {
  return ['tasks', 'reminders', 'notifications', 'settings'].indexOf(module);
}

function supportsScrollTimeline(): boolean {
  return false;
}
