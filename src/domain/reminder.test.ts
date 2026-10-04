/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseTime, reminderIcs } from './reminder';

test('time input', () => {
  assert.equal(parseTime('8:05'), '08:05');
  assert.equal(parseTime('18.30'), '18:30');
  assert.equal(parseTime('24:00'), null);
  assert.equal(parseTime('noon'), null);
});

test('weekday reminder event', () => {
  const ics = reminderIcs({ time: '08:05', weekdaysOnly: true, startDate: '2026-10-05', appUrl: 'https://a.b/' });
  assert.match(ics, /DTSTART:20261005T080500\r\n/);
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR\r\n/);
  assert.match(ics, /BEGIN:VALARM\r\nACTION:DISPLAY/);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});
