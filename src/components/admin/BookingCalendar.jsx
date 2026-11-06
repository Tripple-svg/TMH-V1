import { useMemo, useState } from "react";
import { calendarMonth, lagosDay } from "../../lib/adminProduction";

const bookedStatuses = new Set(["active", "confirmed", "completed", "no_show"]);
const lagosTime = new Intl.DateTimeFormat("en-NG", {
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

export default function BookingCalendar({ bookings, now }) {
  const [mountedAt] = useState(() => Date.now());
  const referenceTime = now || mountedAt;
  const today = lagosDay(new Date(referenceTime).toISOString());
  const [month, setMonth] = useState(() => today.slice(0, 7)),
    [selected, setSelected] = useState(today);
  const [year, number] = month.split("-").map(Number),
    days = calendarMonth(year, number - 1);
  const bookingsByDay = useMemo(() => {
    const days = new Map();
    for (const row of bookings) {
      const start = Date.parse(row.start_time);
      if (!bookedStatuses.has(row.status) || !Number.isFinite(start)) continue;
      const day = lagosDay(row.start_time);
      const upcoming = start >= referenceTime && ["active", "confirmed"].includes(row.status);
      if (!days.has(day)) days.set(day, []);
      days.get(day).push({ row, start, upcoming });
    }
    for (const meetings of days.values()) meetings.sort((a, b) => a.start - b.start);
    return days;
  }, [bookings, referenceTime]);
  const move = (delta) => {
    const date = new Date(Date.UTC(year, number - 1 + delta, 1));
    setMonth(date.toISOString().slice(0, 7));
    setSelected(date.toISOString().slice(0, 10));
  };
  const meetings = bookingsByDay.get(selected) || [];
  return (
    <section
      aria-label="Booking calendar"
      className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <button
          aria-label="Previous month"
          onClick={() => move(-1)}
          className="min-h-11 rounded-lg border border-white/15 px-3"
        >
          ‹
        </button>
        <h3 className="text-sm font-medium">
          {new Intl.DateTimeFormat("en-NG", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(Date.UTC(year, number - 1, 1)))}
        </h3>
        <button
          aria-label="Next month"
          onClick={() => move(1)}
          className="min-h-11 rounded-lg border border-white/15 px-3"
        >
          ›
        </button>
      </div>
      <p className="mt-3 text-xs text-zinc-400">Saved bookings in Lagos time</p>
      <ul aria-label="Calendar key" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-300">
        <li className="flex items-center gap-2"><span aria-hidden="true" className="h-2 w-2 rounded-sm bg-sky-300" />Past booking</li>
        <li className="flex items-center gap-2"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-300" />Upcoming booking</li>
      </ul>
      <div className="mt-5 grid grid-cols-7 gap-1 text-center">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <span key={day} className="pb-2 text-[10px] text-zinc-500">
            {day}
          </span>
        ))}
        {days.map((day, index) => {
          if (!day) return <span key={`empty-${index}`} />;
          const dayBookings = bookingsByDay.get(day) || [];
          const upcoming = dayBookings.filter((meeting) => meeting.upcoming).length;
          const past = dayBookings.length - upcoming;
          return (
            <button
              key={day}
              type="button"
              aria-label={`${day}, ${past} past, ${upcoming} upcoming`}
              aria-current={day === today ? "date" : undefined}
              aria-pressed={selected === day}
              onClick={() => setSelected(day)}
              className={`relative min-h-12 rounded-lg border text-xs sm:min-h-16 ${selected === day ? "border-zinc-300 bg-white/10" : "border-white/5 hover:bg-white/5"}`}
            >
              <span>{Number(day.slice(-2))}</span>
              <span aria-hidden="true" className="mt-1 flex h-2 items-center justify-center gap-1">
                {past > 0 && <span className="h-2 w-2 rounded-sm bg-sky-300" />}
                {upcoming > 0 && <span className="h-2 w-2 rounded-full bg-emerald-300" />}
              </span>
            </button>
          );
        })}
      </div>
      <div aria-live="polite" className="mt-5 space-y-3">
        <h4 className="text-sm">{selected}</h4>
        {meetings.length ? (
          meetings.map(({ row, start, upcoming }) => (
            <article
              key={row.id}
              className="rounded-xl border border-white/10 p-3"
            >
              <p className="text-sm">
                {lagosTime.format(start)} · {row.full_name || "Strategy call"}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {upcoming ? "Upcoming booking" : row.status === "no_show" ? "Marked no-show" : "Past booking"}
              </p>
              <p className="mt-1 break-all text-xs text-zinc-400">
                {row.email}
              </p>
            </article>
          ))
        ) : (
          <p className="text-xs text-zinc-500">
            No saved bookings on this day.
          </p>
        )}
      </div>
    </section>
  );
}
