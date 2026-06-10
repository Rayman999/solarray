import { computed, Injectable, signal } from '@angular/core';

import { Reminder } from './reminder.model';

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export interface CompletionAward {
  points: number;
  comboChain: number;
  comboMultiplier: number;
  crit: boolean;
  totalPoints: number;
  level: number;
  leveledUp: boolean;
  rank: string;
  unlocked: AchievementDef[];
}

interface GameState {
  totalPoints: number;
  completionsAllTime: number;
  lastCompletionAt: number;
  comboChain: number;
  unlocked: string[];
  dayStreak: number;
  lastActiveDay: string;
}

const STORAGE_KEY = 'solarray.game.v1';
// Completions inside this window chain into a combo — long enough to feel earnable, short enough to feel hot.
const COMBO_WINDOW_MS = 90_000;
const CRIT_CHANCE = 0.1;
const CRIT_MULTIPLIER = 3;
const MAX_COMBO_MULTIPLIER = 3;
const BASE_POINTS = 20;
const ON_TIME_BONUS = 10;

const RANKS = [
  'Stardust',
  'Observer',
  'Stargazer',
  'Comet Chaser',
  'Navigator',
  'Astronomer',
  'Voyager',
  'Star Forger',
  'Nebula Architect',
  'Solar Sovereign'
] as const;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-light', title: 'First Light', description: 'Your first task, complete.', icon: 'pi-sun' },
  { id: 'lyra', title: 'Lyra', description: '10 tasks completed.', icon: 'pi-star' },
  { id: 'orion', title: 'Orion', description: '50 tasks completed.', icon: 'pi-star-fill' },
  { id: 'andromeda', title: 'Andromeda', description: '100 tasks completed.', icon: 'pi-globe' },
  { id: 'comet-chain', title: 'Comet Chain', description: 'Three completions in one streak.', icon: 'pi-bolt' },
  { id: 'stellar-strike', title: 'Stellar Strike', description: 'Land a critical completion.', icon: 'pi-asterisk' },
  { id: 'dawn-watch', title: 'Dawn Watch', description: 'Complete a task before 9:00.', icon: 'pi-clock' },
  { id: 'night-watch', title: 'Night Watch', description: 'Complete a task after 22:00.', icon: 'pi-moon' },
  { id: 'constant-orbit', title: 'Constant Orbit', description: 'Active three days in a row.', icon: 'pi-refresh' },
  { id: 'deep-field', title: 'Deep Field', description: 'Reach level 5.', icon: 'pi-compass' },
  { id: 'clear-skies', title: 'Clear Skies', description: 'Cleared every task for the day.', icon: 'pi-check-circle' }
];

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly state = signal<GameState>(loadState());

  readonly totalPoints = computed(() => this.state().totalPoints);
  readonly level = computed(() => levelForPoints(this.state().totalPoints));
  readonly rank = computed(() => rankForLevel(this.level()));
  readonly dayStreak = computed(() => this.state().dayStreak);
  readonly levelProgress = computed(() => {
    const points = this.state().totalPoints;
    const level = levelForPoints(points);
    const current = pointsForLevel(level);
    const next = pointsForLevel(level + 1);
    return Math.min(Math.max((points - current) / (next - current), 0), 1);
  });

  recordCompletion(reminder: Reminder): CompletionAward {
    const now = Date.now();
    const state = this.state();

    const comboChain = now - state.lastCompletionAt <= COMBO_WINDOW_MS ? state.comboChain + 1 : 1;
    const comboMultiplier = Math.min(1 + (comboChain - 1) * 0.5, MAX_COMBO_MULTIPLIER);
    const crit = Math.random() < CRIT_CHANCE;
    const onTime = new Date(reminder.dueAt).getTime() >= now;

    const today = dayKey(new Date());
    const yesterday = dayKey(new Date(now - 86_400_000));
    const dayStreak = state.lastActiveDay === today ? Math.max(state.dayStreak, 1) : state.lastActiveDay === yesterday ? state.dayStreak + 1 : 1;

    const base = BASE_POINTS + (onTime ? ON_TIME_BONUS : 0) + Math.min(dayStreak, 7) * 2;
    const points = Math.round(base * comboMultiplier) * (crit ? CRIT_MULTIPLIER : 1);

    const previousLevel = levelForPoints(state.totalPoints);
    const totalPoints = state.totalPoints + points;
    const level = levelForPoints(totalPoints);
    const completionsAllTime = state.completionsAllTime + 1;
    const hour = new Date().getHours();

    const alreadyUnlocked = new Set(state.unlocked);
    const unlocked: AchievementDef[] = [];
    const tryUnlock = (id: string, condition: boolean) => {
      if (!condition || alreadyUnlocked.has(id)) {
        return;
      }
      const def = ACHIEVEMENTS.find((achievement) => achievement.id === id);
      if (def) {
        alreadyUnlocked.add(id);
        unlocked.push(def);
      }
    };

    tryUnlock('first-light', completionsAllTime >= 1);
    tryUnlock('lyra', completionsAllTime >= 10);
    tryUnlock('orion', completionsAllTime >= 50);
    tryUnlock('andromeda', completionsAllTime >= 100);
    tryUnlock('comet-chain', comboChain >= 3);
    tryUnlock('stellar-strike', crit);
    tryUnlock('dawn-watch', hour < 9);
    tryUnlock('night-watch', hour >= 22);
    tryUnlock('constant-orbit', dayStreak >= 3);
    tryUnlock('deep-field', level >= 5);

    this.state.set({
      totalPoints,
      completionsAllTime,
      lastCompletionAt: now,
      comboChain,
      unlocked: [...alreadyUnlocked],
      dayStreak,
      lastActiveDay: today
    });
    persistState(this.state());

    return {
      points,
      comboChain,
      comboMultiplier,
      crit,
      totalPoints,
      level,
      leveledUp: level > previousLevel,
      rank: rankForLevel(level),
      unlocked
    };
  }

  recordDayCleared(): AchievementDef[] {
    const state = this.state();
    if (state.unlocked.includes('clear-skies')) {
      return [];
    }

    const def = ACHIEVEMENTS.find((achievement) => achievement.id === 'clear-skies');
    if (!def) {
      return [];
    }

    this.state.set({ ...state, unlocked: [...state.unlocked, def.id] });
    persistState(this.state());
    return [def];
  }
}

// Cumulative stardust needed per level: 120, 360, 720, 1200... an early first level-up, then a widening climb.
function pointsForLevel(level: number): number {
  return 60 * level * (level + 1);
}

function levelForPoints(points: number): number {
  let level = 0;
  while (pointsForLevel(level + 1) <= points) {
    level += 1;
  }
  return level;
}

function rankForLevel(level: number): string {
  return RANKS[Math.min(level, RANKS.length - 1)];
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function loadState(): GameState {
  const fallback: GameState = {
    totalPoints: 0,
    completionsAllTime: 0,
    lastCompletionAt: 0,
    comboChain: 0,
    unlocked: [],
    dayStreak: 0,
    lastActiveDay: ''
  };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<GameState>;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

function persistState(state: GameState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The game still runs for the session if storage is unavailable.
  }
}
