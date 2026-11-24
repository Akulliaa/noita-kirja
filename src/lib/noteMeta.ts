import type { NoteKind, NoteStatus } from './types';

export const KINDS: NoteKind[] = ['quest', 'theory', 'misc'];
export const KIND_ICON: Record<NoteKind, string> = { quest: '🎯', theory: '💭', misc: '📝' };

export const STATUSES: NoteStatus[] = ['idea', 'testing', 'in_progress', 'confirmed', 'wrong', 'done'];
export const STATUS_ICON: Record<NoteStatus, string> = {
  idea: '💡', testing: '🧪', in_progress: '⏳', confirmed: '✅', wrong: '❌', done: '🏁',
};
export const STATUS_COLOR: Record<NoteStatus, string> = {
  idea: '#e0c46d', testing: '#8fc1e3', in_progress: '#e0a96d', confirmed: '#9fd27a', wrong: '#e57b67', done: '#b9a3e6',
};
