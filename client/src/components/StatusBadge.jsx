import { STATUS_CLASS } from '../lib/format.js';

export default function StatusBadge({ status }) {
  return <span className={`badge ${STATUS_CLASS[status] || ''}`}>{status}</span>;
}
