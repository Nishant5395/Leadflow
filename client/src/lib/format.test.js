import { afterEach, describe, expect, it } from 'vitest';
import {
  dateInput, followUpState, isPinned,isValidPhone, sortLeads,timeAgo, toIso,
} from './format.js';

const local = (y, m, d, hh = 0, mm = 0, ss = 0) => new Date(y, m - 1, d, hh, mm, ss).toISOString();

describe('followUpState: the "today" boundary', () => {
  const now = new Date(2026, 9, 14, 12, 0, 0); // 14 Oct 2026, noon local

  it('is "today" for any time on the same local day, even if already passed', () => {
    expect(followUpState(local(2026, 10, 14, 0, 0, 0), now)).toBe('today');
    expect(followUpState(local(2026, 10, 14, 9, 0), now)).toBe('today');
    expect(followUpState(local(2026, 10, 14, 23, 59, 59), now)).toBe('today');
  });

  it('flips to overdue / upcoming exactly at local midnight', () => {
    expect(followUpState(local(2026, 10, 13, 23, 59, 59), now)).toBe('overdue');
    expect(followUpState(local(2026, 10, 15, 0, 0, 0), now)).toBe('upcoming');
  });

  it('handles a follow-up due just before midnight when it is now just after midnight', () => {
    const justAfterMidnight = new Date(2026, 9, 15, 0, 0, 1);
    expect(followUpState(local(2026, 10, 14, 23, 59, 59), justAfterMidnight)).toBe('overdue');
    expect(followUpState(local(2026, 10, 15, 0, 0, 0), justAfterMidnight)).toBe('today');
  });

  it('works across month and year boundaries', () => {
    const newYearsEve = new Date(2026, 11, 31, 23, 30);
    expect(followUpState(local(2027, 1, 1, 0, 10), newYearsEve)).toBe('upcoming');
    expect(followUpState(local(2026, 12, 31, 8, 0), newYearsEve)).toBe('today');
    expect(followUpState(local(2026, 12, 30, 23, 0), newYearsEve)).toBe('overdue');
    const leapDay = new Date(2028, 1, 29, 10, 0);
    expect(followUpState(local(2028, 3, 1, 9, 0), leapDay)).toBe('upcoming');
  });

  it('returns null when there is no follow-up', () => {
    expect(followUpState(null, now)).toBeNull();
    expect(followUpState(undefined, now)).toBeNull();
  });
});

describe('followUpState: the same instant is a different day in different timezones', () => {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  const instant = '2026-10-14T20:00:00.000Z';
  const now = new Date('2026-10-14T12:00:00.000Z');

  it.each([
    ['Asia/Kolkata', 'upcoming'], 
    ['America/Los_Angeles', 'today'],
    ['Pacific/Auckland', 'today'], 
  ])('%s -> %s', (tz, expected) => {
    process.env.TZ = tz;
    expect(followUpState(instant, now)).toBe(expected);
  });
});

describe('isPinned', () => {
  const now = new Date(2026, 9, 14, 12, 0);
  const due = local(2026, 10, 14, 15, 0);
  const overdue = local(2026, 10, 12, 15, 0);
  const later = local(2026, 10, 20, 15, 0);

  it('pins open leads due today or overdue', () => {
    expect(isPinned({ status: 'Qualified', followUpAt: due }, now)).toBe(true);
    expect(isPinned({ status: 'New', followUpAt: overdue }, now)).toBe(true);
  });
  it('does not pin future, missing, or closed-lead follow-ups', () => {
    expect(isPinned({ status: 'Qualified', followUpAt: later }, now)).toBe(false);
    expect(isPinned({ status: 'Qualified', followUpAt: null }, now)).toBe(false);
    expect(isPinned({ status: 'Won', followUpAt: due }, now)).toBe(false);
    expect(isPinned({ status: 'Lost', followUpAt: overdue }, now)).toBe(false);
  });
});

describe('toIso / dateInput', () => {
  it('round-trips a local date and time', () => {
    const d = new Date(toIso('2026-10-14', '09:30'));
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 9, 14, 9, 30]);
  });
  it('defaults to 09:00 when no time is given', () => {
    expect(new Date(toIso('2026-10-14')).getHours()).toBe(9);
  });
  it('dateInput adds days in local time, across year boundaries', () => {
    const from = new Date(2026, 11, 31, 23, 59);
    expect(dateInput(0, from)).toBe('2026-12-31');
    expect(dateInput(1, from)).toBe('2027-01-01');
    expect(dateInput(7, from)).toBe('2027-01-07');
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-10-14T12:00:00Z').getTime();
  it.each([
    ['2026-10-14T11:59:40Z', 'just now'],
    ['2026-10-14T11:55:00Z', '5 minutes ago'],
    ['2026-10-14T11:00:00Z', '1 hour ago'],
    ['2026-10-12T12:00:00Z', '2 days ago'],
    ['2026-10-14T15:00:00Z', 'in 3 hours'],
  ])('%s -> %s', (iso, expected) => {
    expect(timeAgo(iso, now)).toBe(expected);
  });
  it('returns an empty string for missing input', () => {
    expect(timeAgo(null)).toBe('');
  });
});

describe('sortLeads', () => {
  const leads = [
    { id: 'a', name: 'bob', createdAt: '2026-01-02', lastDiscussionAt: '2026-03-01', followUpAt: null },
    { id: 'b', name: 'Alice', createdAt: '2026-01-03', lastDiscussionAt: null, followUpAt: '2026-05-02' },
    { id: 'c', name: 'Carl', createdAt: '2026-01-01', lastDiscussionAt: '2026-04-01', followUpAt: '2026-05-01' },
  ];
  const ids = (sort) => sortLeads(leads, sort).map((l) => l.id);

  it('activity: latest discussion (or creation) first', () => expect(ids('activity')).toEqual(['c', 'a', 'b']));
  it('name: case-insensitive A-Z', () => expect(ids('name')).toEqual(['b', 'a', 'c']));
  it('newest: by creation date', () => expect(ids('newest')).toEqual(['b', 'a', 'c']));
  it('followup: soonest first, leads without one last', () => expect(ids('followup')).toEqual(['c', 'b', 'a']));
  it('does not mutate the input', () => {
    const copy = JSON.stringify(leads);
    sortLeads(leads, 'name');
    expect(JSON.stringify(leads)).toBe(copy);
  });
});

describe('isValidPhone', () => {
  it.each(['', '555-0123', '+1 (555) 010-9999', '555.0100 x12'])('accepts %j', (v) => expect(isValidPhone(v)).toBe(true));
  it.each(['call me', '555-CALL', '<script>'])('rejects %j', (v) => expect(isValidPhone(v)).toBe(false));
});
