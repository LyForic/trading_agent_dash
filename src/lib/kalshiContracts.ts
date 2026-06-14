const KALSHI_15M_TICKER_TIME = /15M-(\d{2})([A-Z]{3})(\d{2})(\d{2})(\d{2})(?:-|$)/i;
const KALSHI_15M_ASSET = /^KX(BTC|ETH)15M-/i;
const KALSHI_CRYPTO_LEVEL = /^KX(BTC|ETH)-(\d{2})([A-Z]{3})(\d{2})-B(\d+)$/i;
const KALSHI_HIGH_TEMP = /^KXHIGH([A-Z]{3})-(\d{2})([A-Z]{3})(\d{2})-B(\d+)$/i;
const KALSHI_FED_DECISION = /^KXFEDDECISION-(\d{2})([A-Z]{3})$/i;
const KALSHI_NYC_MAYOR = /^KXNYCMAYOR-(\d{2})([A-Z]{3})$/i;
const KALSHI_TECH_EARNINGS = /^KXTECHEARN-(\d{2})Q([1-4])$/i;
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

const ASSET_LABELS: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
};

const CITY_LABELS: Record<string, string> = {
  MIA: 'Miami',
  NYC: 'New York City',
  LAX: 'Los Angeles',
  CHI: 'Chicago',
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

function monthName(monthToken: string) {
  const monthIndex = MONTH_INDEX[monthToken.toUpperCase()];
  if (monthIndex === undefined) return monthToken.toUpperCase();
  return new Date(Date.UTC(2026, monthIndex, 1)).toLocaleString('en-US', { month: 'short' });
}

function formatTokenDate(yearToken: string, monthToken: string, dayToken?: string) {
  const year = 2000 + Number(yearToken);
  const month = monthName(monthToken);
  return dayToken ? `${month} ${Number(dayToken)}, ${year}` : `${month} ${year}`;
}

function formatContractEnd(date: Date) {
  return date.toLocaleString('en-US', {
    timeZone: NEW_YORK_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function formatStrike(value: string) {
  return `$${Number(value).toLocaleString('en-US')}`;
}

export interface KalshiContractDescription {
  label: string;
  shortLabel: string;
}

export function describeKalshiContract(contractTicker: string): KalshiContractDescription {
  const fifteenMinuteAsset = contractTicker.match(KALSHI_15M_ASSET)?.[1]?.toUpperCase();
  const fifteenMinuteEnd = parseKalshi15MinuteContractEnd(contractTicker);
  if (fifteenMinuteAsset && fifteenMinuteEnd) {
    const asset = ASSET_LABELS[fifteenMinuteAsset] ?? fifteenMinuteAsset;
    const endLabel = formatContractEnd(fifteenMinuteEnd);
    return {
      label: `${asset} 15-minute market ending ${endLabel}`,
      shortLabel: `${asset} 15m, ${endLabel}`,
    };
  }

  const cryptoLevel = contractTicker.match(KALSHI_CRYPTO_LEVEL);
  if (cryptoLevel) {
    const [, assetToken, yearToken, monthToken, dayToken, strikeToken] = cryptoLevel;
    const asset = ASSET_LABELS[assetToken.toUpperCase()] ?? assetToken.toUpperCase();
    const dateLabel = formatTokenDate(yearToken, monthToken, dayToken);
    return {
      label: `${asset} above ${formatStrike(strikeToken)} by ${dateLabel}`,
      shortLabel: `${asset} above ${formatStrike(strikeToken)}`,
    };
  }

  const highTemp = contractTicker.match(KALSHI_HIGH_TEMP);
  if (highTemp) {
    const [, cityToken, yearToken, monthToken, dayToken, tempToken] = highTemp;
    const city = CITY_LABELS[cityToken.toUpperCase()] ?? cityToken.toUpperCase();
    const dateLabel = formatTokenDate(yearToken, monthToken, dayToken);
    return {
      label: `${city} high temperature above ${tempToken} degrees on ${dateLabel}`,
      shortLabel: `${city} high above ${tempToken}`,
    };
  }

  const fedDecision = contractTicker.match(KALSHI_FED_DECISION);
  if (fedDecision) {
    const [, yearToken, monthToken] = fedDecision;
    const dateLabel = formatTokenDate(yearToken, monthToken);
    return {
      label: `the Fed decision market for ${dateLabel}`,
      shortLabel: `Fed decision, ${dateLabel}`,
    };
  }

  const nycMayor = contractTicker.match(KALSHI_NYC_MAYOR);
  if (nycMayor) {
    const [, yearToken, monthToken] = nycMayor;
    const dateLabel = formatTokenDate(yearToken, monthToken);
    return {
      label: `the New York City mayor market for ${dateLabel}`,
      shortLabel: `NYC mayor, ${dateLabel}`,
    };
  }

  const techEarnings = contractTicker.match(KALSHI_TECH_EARNINGS);
  if (techEarnings) {
    const [, yearToken, quarterToken] = techEarnings;
    const year = 2000 + Number(yearToken);
    return {
      label: `the tech earnings market for Q${quarterToken} ${year}`,
      shortLabel: `Tech earnings, Q${quarterToken} ${year}`,
    };
  }

  return {
    label: 'this Kalshi market',
    shortLabel: 'Kalshi market',
  };
}
