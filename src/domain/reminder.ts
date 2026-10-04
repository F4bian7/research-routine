// A daily reminder as an iCalendar event with an alert. A web app on the iPhone cannot
// schedule its own notifications, but the Calendar app can, once the event is added.

export function parseTime(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

// `startDate` is YYYY-MM-DD. Times are "floating", so they follow the phone's time zone.
export function reminderIcs(opts: {
  time: string;
  weekdaysOnly: boolean;
  startDate: string;
  appUrl: string;
}): string {
  const [h, m] = opts.time.split(':');
  const start = `${opts.startDate.replace(/-/g, '')}T${h}${m}00`;
  const rule = opts.weekdaysOnly ? 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' : 'FREQ=DAILY';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Research Routine//EN',
    'BEGIN:VEVENT',
    'UID:daily-reminder@research-routine',
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    'DURATION:PT10M',
    `RRULE:${rule}`,
    'SUMMARY:Research routine',
    `DESCRIPTION:Today's 10 minutes: ${opts.appUrl}`,
    `URL:${opts.appUrl}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Research routine',
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
