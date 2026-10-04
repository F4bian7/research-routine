import { notifyChange } from '@/data/changes';
import type { Db } from '@/db/db';
import type { AuthorProfile, Person, PersonLinks } from '../types';

type Row = {
  id: number;
  name: string;
  institution: string;
  topic_ids: string;
  links: string;
  openalex_id: string | null; // before migration 6; read for old backups
  openalex_ids: string | null;
  orcid: string | null;
  bluesky_did: string | null;
  openalex_ignored: string | null;
  openalex_pending: string | null;
  checked_at: string | null;
};

const parse = <T,>(json: string | null, fallback: T): T => (json ? (JSON.parse(json) as T) : fallback);

function fromRow(r: Row): Person {
  const ids = parse<string[]>(r.openalex_ids, []);
  return {
    id: r.id,
    name: r.name,
    institution: r.institution,
    topicIds: parse<number[]>(r.topic_ids, []),
    links: parse<PersonLinks>(r.links, {}),
    openalexIds: ids.length === 0 && r.openalex_id ? [r.openalex_id] : ids,
    orcid: r.orcid,
    blueskyDid: r.bluesky_did,
    ignoredIds: parse<string[]>(r.openalex_ignored, []),
    pendingProfiles: parse<AuthorProfile[]>(r.openalex_pending, []),
    checkedAt: r.checked_at,
  };
}

export async function listPeople(db: Db): Promise<Person[]> {
  const rows = await db.getAllAsync<Row>('SELECT * FROM people ORDER BY name COLLATE NOCASE');
  return rows.map(fromRow);
}

export async function getPerson(db: Db, id: number): Promise<Person | null> {
  const row = await db.getFirstAsync<Row>('SELECT * FROM people WHERE id = ?', id);
  return row ? fromRow(row) : null;
}

export type PersonInput = Omit<Person, 'id'>;

export function newPerson(p: Partial<PersonInput> & { name: string }): PersonInput {
  return {
    institution: '',
    topicIds: [],
    links: {},
    openalexIds: [],
    orcid: null,
    blueskyDid: null,
    ignoredIds: [],
    pendingProfiles: [],
    checkedAt: null,
    ...p,
  };
}

function values(p: PersonInput) {
  return [
    p.name,
    p.institution,
    JSON.stringify(p.topicIds),
    JSON.stringify(p.links),
    p.openalexIds[0] ?? null,
    JSON.stringify(p.openalexIds),
    p.orcid,
    p.blueskyDid,
    JSON.stringify(p.ignoredIds),
    JSON.stringify(p.pendingProfiles),
    p.checkedAt,
  ];
}

const COLUMNS =
  'name, institution, topic_ids, links, openalex_id, openalex_ids, orcid, bluesky_did, openalex_ignored, openalex_pending, checked_at';

export async function addPerson(db: Db, p: PersonInput): Promise<number> {
  const r = await db.runAsync(
    `INSERT INTO people (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ...values(p)
  );
  notifyChange();
  return r.lastInsertRowId;
}

export async function updatePerson(db: Db, p: Person) {
  await db.runAsync(
    `UPDATE people SET ${COLUMNS.split(', ')
      .map((c) => `${c} = ?`)
      .join(', ')} WHERE id = ?`,
    ...values(p),
    p.id
  );
  notifyChange();
}

export async function deletePerson(db: Db, id: number) {
  await db.runAsync('DELETE FROM people WHERE id = ?', id);
  notifyChange();
}
