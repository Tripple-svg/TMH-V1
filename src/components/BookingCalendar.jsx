import { useEffect, useState } from 'react';
import { createBooking, getAvailableSlots } from '../lib/bookingService';

const formatDate = (isoDate) => new Intl.DateTimeFormat('en-NG', {
  weekday: 'short', month: 'short', day: 'numeric',
}).format(new Date(`${isoDate}T12:00:00`));

function storedReviewData() {
  try {
    return JSON.parse(localStorage.getItem('tmh_brand_review_data') || localStorage.getItem('tmh_user_data') || '{}');
  } catch {
    return {};
  }
}

export default function BookingCalendar({ reviewId = null, onBooked }) {
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [form, setForm] = useState(() => {
    const stored = storedReviewData();
    return {
      fullName: stored.fullName || stored.name || '',
      email: stored.email || '',
      whatsapp: stored.whatsapp || '',
      brandName: stored.brandName || '',
    };
  });

  useEffect(() => {
    let active = true;
    getAvailableSlots().then(({ success, slots, error: loadError }) => {
      if (!active) return;
      if (success) {
        setDates(slots);
        setSelectedDate(slots[0]?.date || null);
      } else setError(loadError?.message || 'Unable to load appointment times.');
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const activeDate = dates.find(({ date }) => date === selectedDate);
  const updateForm = (event) => setForm(current => ({ ...current, [event.target.name]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!selectedDate || !selectedTime) return setError('Please select an available date and time.');
    setSubmitting(true);
    setError('');
    const result = await createBooking({ reviewId, ...form, bookedDate: selectedDate, bookedTime: selectedTime });
    setSubmitting(false);
    if (!result.success) return setError(result.error?.message || 'That time is no longer available. Please choose another slot.');
    setConfirmation({ date: selectedDate, time: selectedTime });
    onBooked?.(result);
  };

  if (confirmation) {
    return <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center text-zinc-100">
      <h3 className="text-xl font-bold text-emerald-300">Your strategy call is confirmed.</h3>
      <p className="mt-2 text-sm text-zinc-300">We’ll call you on {formatDate(confirmation.date)} at {confirmation.time}. A confirmation email is on its way.</p>
    </div>;
  }

  return (
    <section className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-zinc-100 shadow-xl sm:p-6">
      <header className="mb-5">
        <h2 className="text-xl font-bold">Book your strategy call</h2>
        <p className="mt-1 text-sm text-zinc-400">Choose a weekday and one of our evening WAT slots.</p>
      </header>
      {error && <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      {loading ? <p className="py-8 text-center text-sm text-zinc-400">Loading available times…</p> : (
        <form onSubmit={submit} className="space-y-6">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">1. Select a date</p>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {dates.map(({ date, slots }) => {
                const hasAvailability = slots.some(slot => slot.is_available);
                return <button key={date} type="button" disabled={!hasAvailability} onClick={() => { setSelectedDate(date); setSelectedTime(null); }}
                  className={`min-w-24 rounded-xl border px-3 py-2 text-sm transition ${selectedDate === date ? 'border-blue-400 bg-blue-600 text-white' : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'} disabled:cursor-not-allowed disabled:opacity-40`}>
                  {formatDate(date)}
                </button>;
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">2. Select a time (WAT)</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(activeDate?.slots || []).map((slot) => <button key={slot.slot_time} type="button" disabled={!slot.is_available}
                onClick={() => setSelectedTime(slot.slot_time)}
                className={`rounded-lg border px-3 py-2 text-sm transition ${selectedTime === slot.slot_time ? 'border-blue-400 bg-blue-600 text-white' : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'} disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-900/40 disabled:text-zinc-600`}>
                {slot.slot_time}
              </button>)}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-zinc-300">Name<input required name="fullName" value={form.fullName} onChange={updateForm} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white outline-none focus:border-blue-500" /></label>
            <label className="text-sm text-zinc-300">Email<input required type="email" name="email" value={form.email} onChange={updateForm} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white outline-none focus:border-blue-500" /></label>
            <label className="text-sm text-zinc-300">WhatsApp<input required name="whatsapp" value={form.whatsapp} onChange={updateForm} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white outline-none focus:border-blue-500" /></label>
            <label className="text-sm text-zinc-300">Brand name<input name="brandName" value={form.brandName} onChange={updateForm} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white outline-none focus:border-blue-500" /></label>
          </div>
          <button disabled={submitting || !selectedDate || !selectedTime} className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
            {submitting ? 'Confirming…' : 'Confirm strategy call'}
          </button>
        </form>
      )}
    </section>
  );
}
