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
