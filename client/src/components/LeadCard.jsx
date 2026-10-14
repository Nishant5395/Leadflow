import StatusBadge from './StatusBadge.jsx';
import { followUpState, formatDateTime, formatTime, timeAgo } from '../lib/format.js';

export default function LeadCard({ lead, pinned, onOpen, now }) {
  const state = followUpState(lead.followUpAt, now);
  const closed = lead.status === 'Won' || lead.status === 'Lost';

  let followText = null;
  if (lead.followUpAt && !closed) {
    if (state === 'today') followText = `Follow-up today at ${formatTime(lead.followUpAt)}`;
    else if (state === 'overdue') followText = `Overdue since ${formatDateTime(lead.followUpAt)}`;
    else followText = `Follow-up ${formatDateTime(lead.followUpAt)}`;
  }

  return (
    <button
      type="button"
      className={`card ${pinned ? 'card-pinned' : ''} ${closed ? 'card-closed' : ''}`}
      onClick={() => onOpen(lead.id)}
    >
      <span className="card-top">
        <span className="card-name">
          <strong>{lead.name}</strong>
          {lead.company && <span className="muted"> ({lead.company})</span>}
        </span>
        <StatusBadge status={lead.status} />
      </span>

      <span className="card-note">
        {lead.lastNote ? (
          <>
            <span className="label">Last Note:</span> <span className="note-text">{lead.lastNote}</span>
          </>
        ) : (
          <span className="muted italic">No discussions yet. Click to log the first one.</span>
        )}
        {lead.lastDiscussionAt && <span className="ago"> · {timeAgo(lead.lastDiscussionAt, now.getTime())}</span>}
      </span>

      {followText && (
        <span className={`chip chip-${state}`}>
          <span aria-hidden="true">{state === 'overdue' ? '⚠️' : '🔔'}</span> {followText}
        </span>
      )}
    </button>
  );
}
