import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useMemo, useState } from 'react';

interface Props {
  availableDateKeys: string[];
  latestDateKey: string;
  minDateKey: string;
  selectedDateKey: string;
  loading?: boolean;
  onClose: () => void;
  onSelectDate: (dateKey: string) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return { year, month, day };
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function monthKeyFromDateKey(dateKey: string) {
  return dateKey.slice(0, 7);
}

function dateKeyForMonthDay(monthKey: string, day: number) {
  return `${monthKey}-${pad(day)}`;
}

function addMonths(monthKey: string, delta: number) {
  const { year, month } = parseDateKey(`${monthKey}-01`);
  const next = new Date(Date.UTC(year, month - 1 + delta, 1, 12));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}`;
}

function daysInMonth(monthKey: string) {
  const { year, month } = parseDateKey(`${monthKey}-01`);
  return new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
}

function firstWeekday(monthKey: string) {
  const { year, month } = parseDateKey(`${monthKey}-01`);
  return new Date(Date.UTC(year, month - 1, 1, 12)).getUTCDay();
}

function formatMonthLabel(monthKey: string) {
  const { year, month } = parseDateKey(`${monthKey}-01`);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1, 12)));
}

function formatDateLabel(dateKey: string) {
  const { year, month, day } = parseDateKey(dateKey);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function PublicLabCalendar({
  availableDateKeys,
  latestDateKey,
  minDateKey,
  selectedDateKey,
  loading = false,
  onClose,
  onSelectDate,
}: Props) {
  const [visibleMonthKey, setVisibleMonthKey] = useState(() => monthKeyFromDateKey(selectedDateKey));
  const availableDates = useMemo(() => new Set(availableDateKeys), [availableDateKeys]);
  const minMonthKey = monthKeyFromDateKey(minDateKey);
  const latestMonthKey = monthKeyFromDateKey(latestDateKey);
  const canGoPrevious = visibleMonthKey > minMonthKey;
  const canGoNext = visibleMonthKey < latestMonthKey;
  const monthLabel = formatMonthLabel(visibleMonthKey);
  const leadingBlankCount = firstWeekday(visibleMonthKey);
  const dayCount = daysInMonth(visibleMonthKey);

  return (
    <section className="public-lab-calendar" aria-label="Public lab calendar">
      <div className="public-lab-calendar__head">
        <div>
          <span>Public Lab</span>
          <h2>{monthLabel}</h2>
        </div>
        <div className="public-lab-calendar__actions">
          <button
            type="button"
            onClick={() => setVisibleMonthKey((monthKey) => addMonths(monthKey, -1))}
            disabled={!canGoPrevious}
            aria-label="Previous month"
          >
            <ChevronLeft size={15} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setVisibleMonthKey((monthKey) => addMonths(monthKey, 1))}
            disabled={!canGoNext}
            aria-label="Next month"
          >
            <ChevronRight size={15} aria-hidden />
          </button>
          <button type="button" onClick={onClose} aria-label="Close public lab calendar">
            <X size={15} aria-hidden />
          </button>
        </div>
      </div>

      <div className="public-lab-calendar__weekdays" aria-hidden>
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>

      <div className="public-lab-calendar__grid" role="grid" aria-label={`${monthLabel} public lab dates`}>
        {Array.from({ length: leadingBlankCount }, (_, index) => (
          <span key={`blank-${index}`} aria-hidden />
        ))}
        {Array.from({ length: dayCount }, (_, index) => {
          const day = index + 1;
          const dateKey = dateKeyForMonthDay(visibleMonthKey, day);
          const hasData = availableDates.has(dateKey);
          const inRange = dateKey >= minDateKey && dateKey <= latestDateKey;
          const selected = dateKey === selectedDateKey;

          return (
            <button
              key={dateKey}
              type="button"
              className={selected ? 'public-lab-calendar__day public-lab-calendar__day--selected' : 'public-lab-calendar__day'}
              disabled={!hasData || !inRange}
              aria-pressed={selected}
              aria-label={`Show Public Lab for ${formatDateLabel(dateKey)}`}
              onClick={() => onSelectDate(dateKey)}
            >
              <span>{day}</span>
            </button>
          );
        })}
      </div>

      <div className="public-lab-calendar__foot">
        <button type="button" onClick={() => onSelectDate(latestDateKey)}>
          Latest
        </button>
        <span aria-live="polite">{loading ? 'Loading selected day' : `Selected ${formatDateLabel(selectedDateKey)}`}</span>
      </div>
    </section>
  );
}
