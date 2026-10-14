import { randomUUID } from 'node:crypto';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
export function demoLeads() {
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const todayAt = (h, m = 0) => {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  const note = (text, agoMs, followUpAt = null) => ({
    id: randomUUID(),
    note: text,
    followUpAt,
    createdAt: iso(now - agoMs),
  });

  const lead = (name, company, phone, status, discussions, createdAgo) => {
    const latestWithFollowUp = [...discussions]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .find((d) => d.followUpAt);
    return {
      id: randomUUID(),
      name,
      company,
      phone,
      status,
      followUpAt: latestWithFollowUp ? latestWithFollowUp.followUpAt : null,
      createdAt: iso(now - createdAgo),
      discussions,
    };
  };

  return [
    lead('Sarah Connor', 'Acme Corp', '555-0199', 'Proposal Sent', [
      note('Lead emailed via web form.', 12 * DAY),
      note('Initial discovery call. They need a CRM for 10 reps. Pain points include dropping leads and no follow-up tracking.', 9 * DAY),
      note('Sent pricing PDF. Said she would review with her boss.', 2 * DAY, todayAt(14, 0)),
    ], 12 * DAY),
    lead('Tony Stark', 'Stark Industries', '555-0123', 'Qualified', [
      note('Demo went great. Wants SSO and a custom report.', 4 * DAY, todayAt(11, 30)),
    ], 6 * DAY),
    lead('Ron Swanson', 'Very Good Building & Construction', '555-0150', 'Qualified', [
      note('Asked for a security questionnaire before moving forward.', 5 * DAY, iso(now - 26 * HOUR)),
    ], 7 * DAY),
    lead('Leslie Knope', 'Pawnee Parks Dept.', '555-0166', 'Contacted', [
      note('Very enthusiastic. Wants to loop in her team before a demo.', 1 * DAY, iso(now + 30 * HOUR)),
    ], 3 * DAY),
    lead('Hank Scorpio', 'Globex', '555-0142', 'New', [
      note('Inbound lead from website contact form.', 2 * DAY),
    ], 2 * DAY),
    lead('Bill Lumbergh', 'Initech', '555-0177', 'Contacted', [
      note('Left a voicemail with his assistant.', 1 * DAY),
    ], 3 * DAY),
    lead('Bruce Wayne', 'Wayne Enterprises', '555-0100', 'Won', [
      note('Intro call, strong interest in the enterprise tier.', 20 * DAY),
      note('Contract signed! Sending welcome package.', 3 * DAY),
    ], 25 * DAY),
    lead('Dana Scully', 'FBI Dept. of Records', '555-0188', 'Lost', [
      note('Went with a competitor on price.', 6 * DAY),
    ], 18 * DAY),
  ];
}
