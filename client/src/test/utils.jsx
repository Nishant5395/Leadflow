import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/Toast.jsx';
import App from '../App.jsx';

export const NOW = new Date(2026, 9, 14, 12, 0, 0); // 14 Oct 2026, noon local time
const at = (dayOffset, h, m = 0) => new Date(2026, 9, 14 + dayOffset, h, m).toISOString();

const note = (id, text, createdAt, followUpAt = null) => ({ id, note: text, createdAt, followUpAt });

export function sampleLeads() {
  return [
    {
      id: 'sarah',
      name: 'Sarah Connor',
      company: 'Acme Corp',
      phone: '555-0199',
      status: 'Proposal Sent',
      followUpAt: at(0, 14),
      createdAt: at(-12, 9),
      discussions: [
        note('s1', 'Lead emailed via web form.', at(-12, 9)),
        note('s2', 'Initial discovery call went well.', at(-9, 10)),
        note('s3', 'Sent pricing PDF.', at(-2, 11), at(0, 14)),
      ],
    },
    {
      id: 'ron',
      name: 'Ron Swanson',
      company: 'Very Good Building',
      phone: '555-0150',
      status: 'Qualified',
      followUpAt: at(-1, 17),
      createdAt: at(-7, 9),
      discussions: [note('r1', 'Wants a security questionnaire.', at(-5, 9), at(-1, 17))],
    },
    {
      id: 'leslie',
      name: 'Leslie Knope',
      company: 'Pawnee Parks',
      phone: '555-0166',
      status: 'Contacted',
      followUpAt: at(1, 10),
      createdAt: at(-3, 9),
      discussions: [note('l1', 'Enthusiastic, wants to loop in her team.', at(-1, 9), at(1, 10))],
    },
    {
      id: 'bruce',
      name: 'Bruce Wayne',
      company: 'Wayne Enterprises',
      phone: '555-0100',
      status: 'Won',
      followUpAt: at(0, 9), // due today but the deal is closed: must NOT be pinned
      createdAt: at(-25, 9),
      discussions: [note('b1', 'Contract signed!', at(-3, 9), at(0, 9))],
    },
    {
      id: 'hank',
      name: 'Hank Scorpio',
      company: 'Globex',
      phone: '555-0142',
      status: 'New',
      followUpAt: null,
      createdAt: at(-2, 9),
      discussions: [],
    },
  ];
}

export function manyLeads(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `bulk-${i}`,
    name: `Lead ${String(i + 1).padStart(2, '0')}`,
    company: '',
    phone: '',
    status: 'New',
    followUpAt: null,
    createdAt: new Date(2026, 8, 1, 0, i).toISOString(),
    discussions: [],
  }));
}

export function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const user = userEvent.setup();
  const utils = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { user, client, ...utils };
}
