import { useState } from 'react';
import Modal from './Modal.jsx';
import { useCreateLead } from '../lib/queries.js';
import { isValidPhone } from '../lib/format.js';

export default function AddLeadDialog({ onClose, onCreated }) {
  const create = useCreateLead();
  const [form, setForm] = useState({ name: '', company: '', phone: '' });
  const [touched, setTouched] = useState({});
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const touch = (k) => () => setTouched((t) => ({ ...t, [k]: true }));

  const errors = {
    name: !form.name.trim() ? 'Name is required.' : '',
    phone: !isValidPhone(form.phone) ? 'Enter a valid phone number.' : '',
  };
  const show = (k) => touched[k] && errors[k];

  function submit(e) {
    e.preventDefault();
    setTouched({ name: true, phone: true });
    if (errors.name || errors.phone) return;
    setError('');
    create.mutate(form, {
      onSuccess: onCreated,
      onError: (err) => setError(err.message),
    });
  }

  return (
    <Modal title="Add New Lead" onClose={onClose} labelledBy="add-title" width={440}>
      <form onSubmit={submit} noValidate>
        <header className="modal-head">
          <h2 id="add-title">Add New Lead</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="modal-body stack">
          <div className="field">
            <label htmlFor="lead-name">
              Full Name <i className="req" aria-hidden="true">*</i>
            </label>
            <input
              id="lead-name"
              data-autofocus
              required
              value={form.name}
              onChange={set('name')}
              onBlur={touch('name')}
              placeholder="e.g., John Doe"
              maxLength={120}
              autoComplete="off"
              aria-invalid={Boolean(show('name'))}
              aria-describedby={show('name') ? 'name-err' : undefined}
              className={show('name') ? 'invalid' : ''}
            />
            {show('name') && (
              <small id="name-err" className="err" role="alert">
                {errors.name}
              </small>
            )}
          </div>

          <div className="field">
            <label htmlFor="lead-company">
              Company <em>(Optional)</em>
            </label>
            <input
              id="lead-company"
              value={form.company}
              onChange={set('company')}
              placeholder="e.g., Stark Industries"
              maxLength={120}
              autoComplete="off"
            />
          </div>

          <div className="field">
            <label htmlFor="lead-phone">
              Phone <em>(Optional)</em>
            </label>
            <input
              id="lead-phone"
              value={form.phone}
              onChange={set('phone')}
              onBlur={touch('phone')}
              placeholder="e.g., 555-0123"
              inputMode="tel"
              maxLength={40}
              autoComplete="off"
              aria-invalid={Boolean(show('phone'))}
              aria-describedby={show('phone') ? 'phone-err' : undefined}
              className={show('phone') ? 'invalid' : ''}
            />
            {show('phone') && (
              <small id="phone-err" className="err" role="alert">
                {errors.phone}
              </small>
            )}
          </div>

          {error && (
            <div className="banner-error" role="alert">
              {error}
            </div>
          )}
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Save Lead'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
