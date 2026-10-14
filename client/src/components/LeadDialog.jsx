import { useEffect, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import InsightsPanel from './InsightsPanel.jsx';
import { useToast } from './Toast.jsx';
import { useAddDiscussion, useClearFollowUp, useInsights, useLead, useSetStatus } from '../lib/queries.js';
import { STATUSES, dateInput, followUpState, formatDateTime, timeAgo, toIso } from '../lib/format.js';

const PRESETS = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
];

export default function LeadDialog({ leadId, onClose, now }) {
  const { data: lead, error: loadError, refetch } = useLead(leadId);
  const setStatus = useSetStatus();
  const addDiscussion = useAddDiscussion();
  const clearFollowUp = useClearFollowUp();
  const insightsMutation = useInsights();
  const toast = useToast();

  const [note, setNote] = useState('');
  const [wantFollowUp, setWantFollowUp] = useState(false);
  const [date, setDate] = useState(dateInput(1));
  const [time, setTime] = useState('10:00');
  const [error, setError] = useState('');
  const [undo, setUndo] = useState(null); 
  const [insight, setInsight] = useState(null); 
  const timelineRef = useRef(null);
  const textareaRef = useRef(null);

  const loaded = lead && lead.discussions != null; 

  useEffect(() => {
    if (!undo) return undefined;
    const t = setTimeout(() => setUndo(null), 7000);
    return () => clearTimeout(t);
  }, [undo]);

  function changeStatus(e) {
    const to = e.target.value;
    const from = lead.status;
    if (to === from) return;
    setError('');
    setUndo({ from, to });
    setStatus.mutate(
      { id: lead.id, status: to },
      {
        onError: (err) => {
          setUndo(null);
          setError(`Couldn't change status: ${err.message}`);
        },
      },
    );
  }

  function undoStatus() {
    const { from } = undo;
    setUndo(null);
    setStatus.mutate({ id: lead.id, status: from }, { onError: (err) => setError(err.message) });
  }

  function saveNote(e) {
    e.preventDefault();
    const text = note.trim();
    if (!text || !loaded) return;
    if (wantFollowUp) {
      if (!date) return setError('Pick a follow-up date or untick "Set follow-up".');
      if (date < dateInput(0)) return setError("A follow-up can't be in the past.");
    }
    const followUpAt = wantFollowUp ? toIso(date, time) : null;

    setError('');
    setNote('');
    setWantFollowUp(false);
    timelineRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' });

    addDiscussion.mutate(
      { id: lead.id, note: text, followUpAt },
      {
        onSuccess: () => toast.push(followUpAt ? `Note saved. Follow-up set for ${formatDateTime(followUpAt)}.` : 'Note saved.'),
        onError: (err) => {
          setNote(text);
          setWantFollowUp(Boolean(followUpAt));
          setError(`Couldn't save the note: ${err.message}`);
        },
      },
    );
  }

  function markDone() {
    clearFollowUp.mutate(
      { id: lead.id },
      {
        onSuccess: () => toast.push('Follow-up marked done.'),
        onError: (err) => setError(err.message),
      },
    );
  }

  function summarize() {
    setInsight(null);
    insightsMutation.mutate(
      { id: lead.id },
      { onSuccess: (data) => setInsight({ ...data, forCount: lead.discussionCount }) },
    );
  }

  function useSuggestedFollowUp(days) {
    setWantFollowUp(true);
    setDate(dateInput(days));
    setTime('10:00');
    textareaRef.current?.focus();
    toast.push('Follow-up filled in. Write your note and save.');
  }

  // Ctrl/Cmd+Enter saves from the textarea
  const onNoteKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveNote(e);
  };

  // ---- load failure / loading states ----------------------------------------------------
  if (!lead || (loadError && !loaded)) {
    return (
      <Modal title="Lead" onClose={onClose} width={440}>
        <div className="modal-body" aria-busy={!loadError}>
          {loadError ? (
            <div className="banner-error" role="alert">
              {loadError.message}{' '}
              <button type="button" className="link-btn" onClick={() => refetch()}>
                Retry
              </button>
            </div>
          ) : (
            <>
              <div className="skeleton" style={{ height: 22, width: '50%' }} />
              <div className="skeleton" style={{ height: 70, marginTop: 18 }} />
            </>
          )}
        </div>
        <footer className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </footer>
      </Modal>
    );
  }

  const fState = followUpState(lead.followUpAt, now);
  const closed = lead.status === 'Won' || lead.status === 'Lost';
  const insightsStatus = insightsMutation.isPending
    ? 'loading'
    : insightsMutation.isError
      ? 'error'
      : insight && insight.forCount === lead.discussionCount
        ? 'ready'
        : 'idle';

  return (
    <Modal title={lead.name} onClose={onClose} labelledBy="lead-title" width={640}>
      <header className="modal-head lead-head">
        <div>
          <h2 id="lead-title">
            {lead.name}
            {lead.company && <span className="muted"> ({lead.company})</span>}
          </h2>
          {lead.phone && (
            <a className="phone" href={`tel:${lead.phone}`}>
              <span aria-hidden="true">📞</span> {lead.phone}
            </a>
          )}
        </div>
        <div className="head-actions">
          <label className="visually-hidden" htmlFor="status-select">
            Status
          </label>
          <select id="status-select" className="select" value={lead.status} onChange={changeStatus}>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
      </header>

      <div className="status-live" role="status" aria-live="polite">
        {undo && (
          <div className="undo-bar">
            <span>
              Status changed: {undo.from} → <strong>{undo.to}</strong>
            </span>
            <button type="button" className="link-btn" onClick={undoStatus}>
              Undo
            </button>
          </div>
        )}
      </div>

      {lead.followUpAt && !closed && (
        <div className={`followbar chip-${fState}`}>
          <span>
            <span aria-hidden="true">{fState === 'overdue' ? '⚠️' : '🔔'}</span>{' '}
            {fState === 'overdue' ? 'Follow-up overdue:' : 'Next follow-up:'} <strong>{formatDateTime(lead.followUpAt)}</strong>
          </span>
          <button type="button" className="link-btn" onClick={markDone}>
            Mark done
          </button>
        </div>
      )}

      <div className="timeline-wrap" ref={timelineRef}>
        {loaded && lead.discussions.length > 0 && (
          <div className="timeline-tools">
            <button type="button" className="pill" onClick={summarize} disabled={insightsStatus === 'loading'}>
              <span aria-hidden="true">✨</span> Summarize &amp; suggest next step
            </button>
          </div>
        )}

        <InsightsPanel
          status={insightsStatus}
          insight={insight}
          error={insightsMutation.error?.message}
          canSuggest={!closed}
          onUse={useSuggestedFollowUp}
          onDismiss={() => {
            setInsight(null);
            insightsMutation.reset();
          }}
        />

        {!loaded ? (
          <div className="stack" aria-busy="true" aria-label="Loading discussions">
            <div className="skeleton" style={{ height: 64 }} />
            <div className="skeleton" style={{ height: 64 }} />
          </div>
        ) : lead.discussions.length === 0 ? (
          <div className="empty">
            <div className="empty-emoji" aria-hidden="true">💬</div>
            <p>No discussions yet.</p>
            <small>Log your first conversation below.</small>
          </div>
        ) : (
          <ol className="timeline" aria-label="Discussion history, newest first">
            {lead.discussions.map((d, i) => (
              <li key={d.id} className={i === 0 ? 'latest' : ''}>
                <span className="dot" aria-hidden="true" />
                <div className="tl-meta">
                  <time dateTime={d.createdAt}>{formatDateTime(d.createdAt)}</time>
                  <span className="muted"> ({timeAgo(d.createdAt, now.getTime())})</span>
                </div>
                <div className="tl-card">
                  <p>{d.note}</p>
                  {d.followUpAt && (
                    <span className="chip chip-upcoming">
                      <span aria-hidden="true">📅</span> Follow-up set for {formatDateTime(d.followUpAt)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <form className="composer" onSubmit={saveNote}>
        <textarea
          data-autofocus
          ref={textareaRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={onNoteKey}
          placeholder="Log a new discussion…  (Ctrl/⌘ + Enter to save)"
          rows={3}
          maxLength={4000}
          aria-label="New discussion note"
        />

        <div className="composer-row">
          <label className="check">
            <input type="checkbox" checked={wantFollowUp} onChange={(e) => setWantFollowUp(e.target.checked)} />
            Set follow-up
          </label>

          {wantFollowUp && (
            <>
              <input
                type="date"
                value={date}
                min={dateInput(0)}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Follow-up date"
                className="mini"
              />
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                aria-label="Follow-up time"
                className="mini"
              />
            </>
          )}

          <button type="submit" className="btn btn-dark push-right" disabled={!note.trim() || !loaded}>
            Save Note
          </button>
        </div>

        {wantFollowUp && (
          <div className="presets" role="group" aria-label="Quick follow-up dates">
            {PRESETS.map((p) => (
              <button type="button" key={p.label} className="pill" onClick={() => setDate(dateInput(p.days))}>
                {p.label}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="banner-error" role="alert">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
