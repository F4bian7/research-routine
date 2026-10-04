import { notifyChange } from '@/data/changes';
import type { Db } from '@/db/db';
import type { Person, PersonLinks } from '../types';

type Row = {
  id: number;
  name: string;
  institution: string;
  topic_ids: string;
  links: string;
  openalex_id: string | null;
};

function fromRow(r: Row): Person {
  return {
    id: r.id,
    name: r.name,
    institution: r.institution,
    topicIds: JSON.parse(r.topic_ids) as number[],
    links: JSON.parse(r.links) as PersonLinks,
    openalexId: r.openalex_id,
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

export async function addPerson(db: Db, p: PersonInput): Promise<number> {
  const r = await db.runAsync(
    'INSERT INTO people (name, institution, topic_ids, links, openalex_id) VALUES (?, ?, ?, ?, ?)',
    p.name,
    p.institution,
    JSON.stringify(p.topicIds),
    JSON.stringify(p.links),
    p.openalexId
  );
  notifyChange();
  return r.lastInsertRowId;
}

export async function updatePerson(db: Db, p: Person) {
  await db.runAsync(
    'UPDATE people SET name = ?, institution = ?, topic_ids = ?, links = ?, openalex_id = ? WHERE id = ?',
    p.name,
    p.institution,
    JSON.stringify(p.topicIds),
    JSON.stringify(p.links),
    p.openalexId,
    p.id
  );
  notifyChange();
}

export async function deletePerson(db: Db, id: number) {
  await db.runAsync('DELETE FROM people WHERE id = ?', id);
  notifyChange();
}
