import { useState, useEffect } from 'react';
import Markdown from 'react-markdown';
import { SidebarLayout, TOOLS_NAV } from '../components/SidebarLayout';
import styles from './Schedule.module.css';

const API_BASE = '/api';

interface ScheduleEntry {
  date: string;
  event: string;
  time?: string;
  notes?: string;
}

export function Schedule() {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ScheduleEntry>({ date: '', event: '', time: '', notes: '' });

  useEffect(() => {
    loadSchedule();
  }, []);

  async function loadSchedule() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/schedule`);
      if (res.ok) {
        const data = await res.json();
        setContent(data.schedule || '');
      }
    } catch (e) {
      console.error('Failed to load schedule:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.date || !form.event) return;
    setAdding(true);
    try {
      const res = await fetch(`${API_BASE}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setForm({ date: '', event: '', time: '', notes: '' });
        setShowForm(false);
        await loadSchedule();
      }
    } catch (e) {
      console.error('Failed to add event:', e);
    } finally {
      setAdding(false);
    }
  }

  return (
    <SidebarLayout navItems={TOOLS_NAV} navTitle="Tools" filters={[]}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Schedule</h1>
          <p className={styles.subtitle}>
            Shared appointments via <code>~/.oracle/ψ/inbox/schedule.md</code>
          </p>
        </div>
        <button
          className={styles.addBtn}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Cancel' : '+ Add Event'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className={styles.form}>
          <div className={styles.formRow}>
            <input
              className={styles.input}
              placeholder="Date (e.g. 5 Mar, 28 ก.พ.)"
              value={form.date}
              onChange={e => setForm({ ...form, date: e.target.value })}
              required
            />
            <input
              className={styles.input}
              placeholder="Time (e.g. 14:00, TBD)"
              value={form.time}
              onChange={e => setForm({ ...form, time: e.target.value })}
            />
          </div>
          <input
            className={styles.input}
            placeholder="Event description"
            value={form.event}
            onChange={e => setForm({ ...form, event: e.target.value })}
            required
          />
          <input
            className={styles.input}
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
          />
          <button type="submit" className={styles.submitBtn} disabled={adding}>
            {adding ? 'Adding...' : 'Add to Schedule'}
          </button>
        </form>
      )}

      {loading ? (
        <div className={styles.loading}>Loading schedule...</div>
      ) : content ? (
        <div className={styles.content}>
          <Markdown>{content}</Markdown>
        </div>
      ) : (
        <div className={styles.empty}>
          <p>No schedule found.</p>
          <p className={styles.hint}>
            Use <code>oracle_schedule_add</code> or click "+ Add Event" to create appointments.
          </p>
        </div>
      )}
    </SidebarLayout>
  );
}
