import { liveTable } from './live.svelte';
import type { Book, Glyph, Note } from './types';

export const notes = liveTable<Note>('notes', 'updated_at', false);
export const books = liveTable<Book>('books', 'created_at', false);
export const glyphs = liveTable<Glyph>('glyphs', 'sort_order');
