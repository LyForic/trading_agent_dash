const KALSHI_15M_TICKER_TIME = /15M-(\d{2})([A-Z]{3})(\d{2})(\d{2})(\d{2})(?:-|$)/i;
const NEW_YORK_TIME_ZONE = 'America/New_York';

const MONTH_INDEX: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

function partsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = partsInTimeZone(date, timeZone);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return localAsUtc - date.getTime();
}

function zonedTimeToUtc(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
) {
  const localAsUtc = Date.UTC(year, monthIndex, day, hour, minute);
  let utcMs = localAsUtc;

  for (let i = 0; i < 3; i += 1) {
    utcMs = localAsUtc - timeZoneOffsetMs(new Date(utcMs), timeZone);
  }

  return new Date(utcMs);
}

export function parseKalshi15MinuteContractEnd(contractTicker: string): Date | null {
  const match = contractTicker.match(KALSHI_15M_TICKER_TIME);
  if (!match) return null;

  const [, yearToken, monthToken, dayToken, hourToken, minuteToken] = match;
  const monthIndex = MONTH_INDEX[monthToken.toUpperCase()];
  if (monthIndex === undefined) return null;

  const year = 2000 + Number(yearToken);
  const day = Number(dayToken);
  const hour = Number(hourToken);
  const minute = Number(minuteToken);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59
  ) {
    return null;
  }

  return zonedTimeToUtc(year, monthIndex, day, hour, minute, NEW_YORK_TIME_ZONE);
}

export function contractEndForReplay(contractTicker: string, settledAt: Date): Date {
  const tickerEnd = parseKalshi15MinuteContractEnd(contractTicker);
  if (!tickerEnd) return settledAt;

  const settledDeltaMs = settledAt.getTime() - tickerEnd.getTime();
  const isPlausibleSettlementDelay = settledDeltaMs >= -60_000 && settledDeltaMs <= 60 * 60 * 1000;

  return isPlausibleSettlementDelay ? tickerEnd : settledAt;
}
