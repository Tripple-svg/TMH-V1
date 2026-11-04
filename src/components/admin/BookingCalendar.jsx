import { useState } from "react";
import { calendarMonth, lagosDay } from "../../lib/adminProduction";
export default function BookingCalendar({ bookings, now }) {
  const [mountedAt] = useState(() => Date.now());
  const today = lagosDay(new Date(now || mountedAt).toISOString());
  const [month, setMonth] = useState(() => today.slice(0, 7)),
    [selected, setSelected] = useState(today);
  const [year, number] = month.split("-").map(Number),
    days = calendarMonth(year, number - 1);
  const upcoming = bookings.filter(
    (row) =>
      ["active", "confirmed"].includes(row.status) &&
      Date.parse(row.start_time) >= now,
  );
  const move = (delta) => {
    const date = new Date(Date.UTC(year, number - 1 + delta, 1));
    setMonth(date.toISOString().slice(0, 7));
    setSelected(date.toISOString().slice(0, 10));
  };
  const meetings = upcoming
    .filter((row) => lagosDay(row.start_time) === selected)
    .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time));
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
      <p className="mt-3 text-xs text-zinc-500">
        Upcoming calls from loaded bookings · Africa/Lagos
      </p>
      <div className="mt-5 grid grid-cols-7 gap-1 text-center">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <span key={day} className="pb-2 text-[10px] text-zinc-500">
            {day}
          </span>
        ))}
        {days.map((day, index) =>
          day ? (
            <button
              key={day}
              aria-label={`${day}, ${upcoming.filter((row) => lagosDay(row.start_time) === day).length} upcoming calls`}
              aria-pressed={selected === day}
              onClick={() => setSelected(day)}
              className={`relative min-h-12 rounded-lg border text-xs sm:min-h-16 ${selected === day ? "border-zinc-300 bg-white/10" : "border-white/5 hover:bg-white/5"}`}
            >
              <span>{Number(day.slice(-2))}</span>
              {upcoming.some((row) => lagosDay(row.start_time) === day) && (
                <span className="mx-auto mt-1 block h-1.5 w-1.5 rounded-full bg-emerald-300" />
              )}
            </button>
          ) : (
            <span key={`empty-${index}`} />
          ),
        )}
      </div>
      <div aria-live="polite" className="mt-5 space-y-3">
        <h4 className="text-sm">{selected}</h4>
        {meetings.length ? (
          meetings.map((row) => (
            <article
              key={row.id}
              className="rounded-xl border border-white/10 p-3"
            >
              <p className="text-sm">
                {new Intl.DateTimeFormat("en-NG", {
                  timeStyle: "short",
                  timeZone: "Africa/Lagos",
                }).format(new Date(row.start_time))}{" "}
                · {row.full_name || "Strategy call"}
              </p>
              <p className="mt-1 break-all text-xs text-zinc-400">
                {row.email}
              </p>
            </article>
          ))
        ) : (
          <p className="text-xs text-zinc-500">
            No upcoming calls on this day.
          </p>
        )}
      </div>
    </section>
  );
}
