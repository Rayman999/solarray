export type ReminderKind = 'todo' | 'location' | 'habit' | 'note';

export interface ReminderLocation {
  label: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface Reminder {
  id: string;
  title: string;
  notes: string;
  kind: ReminderKind;
  dueAt: string;
  completed: boolean;
  location?: ReminderLocation;
  createdAt: string;
}
