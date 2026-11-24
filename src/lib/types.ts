export type Role = 'pending' | 'reader' | 'admin';
export type Lang = 'fr' | 'en';

export interface Profile {
  id: string;
  username: string;
  role: Role;
  color: string;
  lang: Lang;
  created_at: string;
}

export interface Element {
  id: string;
  name: string;
  name_tr: string | null;
  lang: Lang;
  created_by: string | null;
  created_at: string;
}

export interface Mixture {
  id: string;
  ingredients: string[];
  result_id: string | null;
  no_reaction: boolean;
  note: string | null;
  note_tr: string | null;
  lang: Lang;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type NoteKind = 'quest' | 'theory' | 'misc';
export type NoteStatus = 'idea' | 'testing' | 'in_progress' | 'confirmed' | 'wrong' | 'done';

export interface Note {
  id: string;
  kind: NoteKind;
  title: string;
  title_tr: string | null;
  body: string;
  body_tr: string | null;
  lang: Lang;
  status: NoteStatus;
  tags: string[];
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteVersion {
  id: number;
  note_id: string;
  kind: NoteKind;
  title: string;
  body: string;
  status: NoteStatus;
  tags: string[];
  edited_by: string | null;
  edited_at: string;
}

export interface Book {
  id: string;
  title: string;
  title_tr: string | null;
  content: string;
  content_tr: string | null;
  lang: Lang;
  loc_x: number | null;
  loc_y: number | null;
  loc_label: string | null;
  loc_label_tr: string | null;
  tags: string[];
  found_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type Confidence = 'unknown' | 'guess' | 'likely' | 'sure';

export interface Glyph {
  id: string;
  image_path: string | null;
  symbol: string | null;
  meaning: string;
  meaning_tr: string | null;
  notes: string;
  notes_tr: string | null;
  lang: Lang;
  confidence: Confidence;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
