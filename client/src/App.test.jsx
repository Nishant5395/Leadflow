import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import { createFakeApi } from './test/fakeApi.js';
import { NOW, manyLeads, renderApp, sampleLeads } from './test/utils.jsx';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); 
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const pinnedSection = () => screen.getByRole('region', { name: /today's follow-ups/i });
const allSection = () => screen.getByRole('region', { name: /all leads/i });
const cardNames = (section) => within(section).getAllByRole('button').map((b) => b.querySelector('strong')?.textContent);

describe('lead list', () => {
  it('pins open leads whose follow-up is due today or overdue, most urgent first', async () => {
    createFakeApi(sampleLeads());
    renderApp();

    await screen.findByRole('region', { name: /today's follow-ups/i });
    expect(cardNames(pinnedSection())).toEqual(['Ron Swanson', 'Sarah Connor']);
    expect(within(pinnedSection()).getByText(/overdue since/i)).toBeInTheDocument();
    expect(within(pinnedSection()).getByText(/follow-up today at/i)).toBeInTheDocument();

    const rest = cardNames(allSection());
    expect(rest).toContain('Leslie Knope');
    expect(rest).toContain('Bruce Wayne'); 
    expect(rest).not.toContain('Sarah Connor');
  });

  it('shows the last note, time since it, and an empty hint for leads without discussions', async () => {
    createFakeApi(sampleLeads());
    renderApp();
    const sarah = (await screen.findByText('Sarah Connor')).closest('button');
    expect(within(sarah).getByText('Sent pricing PDF.')).toBeInTheDocument();
    expect(within(sarah).getByText(/2 days ago/)).toBeInTheDocument();
    const hank = screen.getByText('Hank Scorpio').closest('button');
    expect(within(hank).getByText(/no discussions yet/i)).toBeInTheDocument();
  });

  it('filters by status with live counts, and searches', async () => {
    createFakeApi(sampleLeads());
    const { user } = renderApp();
    await screen.findByText('Sarah Connor');

    const won = screen.getByRole('button', { name: /^Won\s*1$/ });
    await user.click(won);
    expect(won).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Bruce Wayne')).toBeInTheDocument();
    expect(screen.queryByText('Sarah Connor')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^All\s*5$/ }));
    await user.type(screen.getByRole('searchbox', { name: /search leads/i }), 'globex');
    expect(screen.getByText('Hank Scorpio')).toBeInTheDocument();
    expect(screen.queryByText('Leslie Knope')).not.toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText(/no leads match/i)).toBeInTheDocument();
  });

  it('sorts the unpinned list', async () => {
    createFakeApi(sampleLeads());
    const { user } = renderApp();
    await screen.findByText('Sarah Connor');
    await user.selectOptions(screen.getByRole('combobox', { name: /sort leads by/i }), 'name');
    expect(cardNames(allSection())).toEqual(['Bruce Wayne', 'Hank Scorpio', 'Leslie Knope']);
  });

  it('pages long lists with "Show more"', async () => {
    createFakeApi(manyLeads(45));
    const { user } = renderApp();
    await screen.findByText('Lead 45');
    expect(within(allSection()).getAllByRole('button', { name: /lead \d\d/i })).toHaveLength(20);

    await user.click(screen.getByRole('button', { name: /show 20 more \(25 remaining\)/i }));
    expect(within(allSection()).getAllByRole('button', { name: /lead \d\d/i })).toHaveLength(40);

    await user.click(screen.getByRole('button', { name: /show 5 more \(5 remaining\)/i }));
    expect(screen.queryByRole('button', { name: /show .* more/i })).not.toBeInTheDocument();
  });

  it('shows an error with retry when the list cannot load', async () => {
    const api = createFakeApi(sampleLeads());
    api.failNext('GET', '/api/leads', 'Database is down');
    const { user } = renderApp();
    expect(await screen.findByText(/couldn't load leads: database is down/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('Sarah Connor')).toBeInTheDocument();
  });
});

describe('add lead', () => {
  it('validates, then creates a lead with status New', async () => {
    const api = createFakeApi(sampleLeads());
    const { user } = renderApp();
    await screen.findByText('Sarah Connor');

    await user.click(screen.getByRole('button', { name: /add new lead/i }));
    const dialog = screen.getByRole('dialog', { name: /add new lead/i });
    expect(within(dialog).getByLabelText(/full name/i)).toHaveFocus();

    await user.click(within(dialog).getByRole('button', { name: /save lead/i }));
    expect(await within(dialog).findByText('Name is required.')).toBeInTheDocument();
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false);

    await user.type(within(dialog).getByLabelText(/phone/i), 'call me');
    await user.tab();
    expect(await within(dialog).findByText('Enter a valid phone number.')).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText(/phone/i));

    await user.type(within(dialog).getByLabelText(/full name/i), 'Ada Lovelace');
    await user.type(within(dialog).getByLabelText(/company/i), 'Analytical Engines');
    await user.click(within(dialog).getByRole('button', { name: /save lead/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Added Ada Lovelace.');
    const card = screen.getByText('Ada Lovelace').closest('button');
    expect(within(card).getByText('New')).toBeInTheDocument();
    expect(api.all()[0].name).toBe('Ada Lovelace');
  });

  it('shows the server error if saving fails, and keeps the form open', async () => {
    const api = createFakeApi(sampleLeads());
    api.failNext('POST', '/api/leads', 'Name already exists');
    const { user } = renderApp();
    await screen.findByText('Sarah Connor');
    await user.click(screen.getByRole('button', { name: /add new lead/i }));
    await user.type(screen.getByLabelText(/full name/i), 'Dup');
    await user.click(screen.getByRole('button', { name: /save lead/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Name already exists');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('keyboard shortcuts', () => {
  it('"n" opens Add Lead, "/" focuses search, and neither fires while typing', async () => {
    createFakeApi(sampleLeads());
    const { user } = renderApp();
    await screen.findByText('Sarah Connor');

    await user.keyboard('/');
    const search = screen.getByRole('searchbox');
    expect(search).toHaveFocus();

    await user.keyboard('n'); 
    expect(search).toHaveValue('n');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.clear(search);
    await user.click(document.body);
    await user.keyboard('n');
    expect(screen.getByRole('dialog', { name: /add new lead/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('theme', () => {
  it('toggles between light and dark and remembers the choice', async () => {
    createFakeApi(sampleLeads());
    document.documentElement.dataset.theme = 'light';
    const { user } = renderApp();
    await user.click(screen.getByRole('button', { name: /switch to dark theme/i }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('leadflow-theme')).toBe('dark');
    await user.click(screen.getByRole('button', { name: /switch to light theme/i }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});

describe('lead dialog', () => {
  async function openLead(user, name) {
    await user.click((await screen.findByText(name)).closest('button'));
    return screen.findByRole('dialog');
  }

  it('shows the discussion history newest first', async () => {
    createFakeApi(sampleLeads());
    const { user } = renderApp();
    const dialog = await openLead(user, 'Sarah Connor');
    const timeline = await within(dialog).findByRole('list', { name: /discussion history/i });
    const notes = within(timeline)
      .getAllByRole('listitem')
      .map((li) => li.querySelector('p').textContent);
    expect(notes).toEqual(['Sent pricing PDF.', 'Initial discovery call went well.', 'Lead emailed via web form.']);
    expect(within(dialog).getByRole('link', { name: /555-0199/ })).toHaveAttribute('href', 'tel:555-0199');
  });

  it('adds a note instantly (optimistically), updates the list row, and pins the lead when follow-up is today', async () => {
    const api = createFakeApi(sampleLeads());
    api.pause();
    const { user } = renderApp();
    const dialog = await openLead(user, 'Hank Scorpio');
    expect(await within(dialog).findByText('No discussions yet.')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/new discussion note/i), 'Intro call done, very keen.');
    await user.click(within(dialog).getByLabelText(/set follow-up/i));
    await user.click(within(dialog).getByRole('button', { name: 'Today' }));
    await user.click(within(dialog).getByRole('button', { name: /save note/i }));

    expect(await within(dialog).findByText('Intro call done, very keen.')).toBeInTheDocument();
    expect(api.get('hank').discussions).toHaveLength(0);
    expect(within(dialog).getByLabelText(/new discussion note/i)).toHaveValue('');

    api.resume();
    await waitFor(() => expect(api.get('hank').discussions).toHaveLength(1));
    expect(api.get('hank').followUpAt).toBeTruthy();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(cardNames(pinnedSection())).toContain('Hank Scorpio'));
    const hank = within(pinnedSection()).getByText('Hank Scorpio').closest('button');
    expect(within(hank).getByText('Intro call done, very keen.')).toBeInTheDocument();
  });

  it('rolls back the optimistic note and restores the form when the server rejects it', async () => {
    const api = createFakeApi(sampleLeads());
    api.failNext('POST', '/discussions', 'Disk full');
    const { user } = renderApp();
    const dialog = await openLead(user, 'Hank Scorpio');
    await within(dialog).findByText('No discussions yet.');

    await user.type(within(dialog).getByLabelText(/new discussion note/i), 'This will fail');
    await user.click(within(dialog).getByRole('button', { name: /save note/i }));

    expect(await within(dialog).findByText(/couldn't save the note: disk full/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/new discussion note/i)).toHaveValue('This will fail');
    expect(within(dialog).queryByRole('list', { name: /discussion history/i })).not.toBeInTheDocument();
    expect(within(dialog).getByText('No discussions yet.')).toBeInTheDocument();
  });

  it('changes status immediately, offers undo, and rolls back on server failure', async () => {
    const api = createFakeApi(sampleLeads());
    const { user } = renderApp();
    const dialog = await openLead(user, 'Hank Scorpio');
    const select = within(dialog).getByRole('combobox', { name: /status/i });

    await user.selectOptions(select, 'Qualified');
    expect(select).toHaveValue('Qualified');
    expect(await within(dialog).findByText(/status changed/i)).toHaveTextContent('New → Qualified');
    await waitFor(() => expect(api.get('hank').status).toBe('Qualified'));

    await user.click(within(dialog).getByRole('button', { name: /undo/i }));
    await waitFor(() => expect(select).toHaveValue('New'));
    await waitFor(() => expect(api.get('hank').status).toBe('New'));

    api.failNext('PATCH', '/api/leads/hank', 'Nope');
    await user.selectOptions(select, 'Won');
    expect(await within(dialog).findByText(/couldn't change status: nope/i)).toBeInTheDocument();
    await waitFor(() => expect(select).toHaveValue('New'));
    expect(api.get('hank').status).toBe('New');
  });

  it('clears a follow-up with "Mark done"', async () => {
    const api = createFakeApi(sampleLeads());
    const { user } = renderApp();
    const dialog = await openLead(user, 'Ron Swanson');
    expect(within(dialog).getByText(/follow-up overdue/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /mark done/i }));
    await waitFor(() => expect(within(dialog).queryByText(/follow-up overdue/i)).not.toBeInTheDocument());
    expect(api.get('ron').followUpAt).toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('region', { name: /today's follow-ups/i })).toBeInTheDocument());
    expect(cardNames(pinnedSection())).toEqual(['Sarah Connor']);
  });

  it('summarizes a lead and can pre-fill the suggested follow-up', async () => {
    createFakeApi(sampleLeads());
    const { user } = renderApp();
    const dialog = await openLead(user, 'Sarah Connor');
    await user.click(await within(dialog).findByRole('button', { name: /summarize/i }));

    const panel = await within(dialog).findByRole('region', { name: /lead summary/i });
    expect(await within(panel).findByText(/Sarah Connor is at "Proposal Sent"/)).toBeInTheDocument();
    expect(within(panel).getByText('Rule-based')).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: /use suggested follow-up \(in 3 days\)/i }));
    expect(within(dialog).getByLabelText(/set follow-up/i)).toBeChecked();
    expect(within(dialog).getByLabelText(/^follow-up date$/i)).toHaveValue('2026-10-17');
  });

  it('closes on Escape and returns focus to the card that opened it', async () => {
    createFakeApi(sampleLeads());
    const { user } = renderApp();
    const card = (await screen.findByText('Hank Scorpio')).closest('button');
    await user.click(card);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(card).toHaveFocus();
  });
});
