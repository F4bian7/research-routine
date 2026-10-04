import type { Db } from '@/db/db';

import type { Topic } from '../types';

export async function listTopics(db: Db): Promise<Topic[]> {
  return db.getAllAsync<Topic>('SELECT id, name, color FROM topics ORDER BY name');
}
