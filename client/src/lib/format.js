export const STATUSES = ['New', 'Contacted', 'Qualified', 'Proposal Sent', 'Won', 'Lost'];

export const STATUS_CLASS = {
  New: 'st-new',
  Contacted: 'st-contacted',
  Qualified: 'st-qualified',
  'Proposal Sent': 'st-proposal',
  Won: 'st-won',
  Lost: 'st-lost',
};

const pad = (n) => String(n).padStart(2, '0');

/** "2 days ago", "just now", "in 3 hours" */
export function timeAgo(iso, now = Date.now()) {
  if (!iso) return '';
  const diff = now - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const units = [
    ['day', 86400000],
    ['hour', 3600000],
    ['minute', 60000],
  ];
  for (const [name, ms] of units) {
    if (abs >= ms) {
      const n = Math.floor(abs / ms);
      const label = `${n} ${name}${n === 1 ? '' : 's'}`;
      return diff >= 0 ? `${label} ago` : `in ${label}`;
    }
  }
  return 'just now';
}

export function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function isSameLocalDay(a, b = new Date()) {
  const x = new Date(a);
  return x.getFullYear() === b.getFullYear() && x.getMonth() === b.getMonth() && x.getDate() === b.getDate();
}

export function followUpState(iso, now = new Date()) {
  if (!iso) return null;
  const t = new Date(iso);
  if (isSameLocalDay(t, now)) return 'today';
  return t < now ? 'overdue' : 'upcoming';
}

/** A lead is pinned when its follow-up is due today or overdue, and the lead is still open. */
export function isPinned(lead, now = new Date()) {
  if (lead.status === 'Won' || lead.status === 'Lost') return false;
  const s = followUpState(lead.followUpAt, now);
  return s === 'today' || s === 'overdue';
}

/** Combine yyyy-mm-dd and HH:mm (as entered, local time) into an ISO string. */
export function toIso(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '09:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

/** yyyy-mm-dd for an <input type="date">, `days` from today, in local time. */
export function dateInput(days = 0, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const SORTS = {
  activity: 'Recent activity',
  followup: 'Follow-up soonest',
  newest: 'Newest lead',
  name: 'Name (A–Z)',
};

export function sortLeads(leads, sort) {
  const activity = (l) => l.lastDiscussionAt || l.createdAt;
  const byActivity = (a, b) => activity(b).localeCompare(activity(a));
  const copy = [...leads];
  switch (sort) {
    case 'name':
      return copy.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    case 'newest':
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case 'followup':
      return copy.sort((a, b) => {
        if (a.followUpAt && b.followUpAt) return a.followUpAt.localeCompare(b.followUpAt);
        if (a.followUpAt) return -1;
        if (b.followUpAt) return 1;
        return byActivity(a, b);
      });
    default:
      return copy.sort(byActivity);
  }
}

const PHONE_RE = /^[0-9+()\-.\sx]*$/i;
export const isValidPhone = (v) => PHONE_RE.test(v);
