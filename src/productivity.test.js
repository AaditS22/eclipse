import { describe, it, expect } from 'vitest';
import { dailyMinutes, personalBestPercent, maintainStreak } from './productivity.js';

/** A session starting at a local wall-clock time, lasting `minutes`. */
function sessAt(dateISO, hour, minute, minutes) {
  const d = new Date(dateISO + 'T00:00:00');
  d.setHours(hour, minute, 0, 0);
  const start = d.getTime();
  return { startTime: start, endTime: start + minutes * 60000, durationMinutes: minutes };
}

describe('dailyMinutes (24h attribution)', () => {
  it('counts a same-day session fully on its day', () => {
    const s = [sessAt('2026-07-08', 9, 0, 120)];
    expect(dailyMinutes(s, '2026-07-08')).toBeCloseTo(120, 5);
    expect(dailyMinutes(s, '2026-07-07')).toBe(0);
    expect(dailyMinutes(s, '2026-07-09')).toBe(0);
  });

  it('splits a midnight-crossing session across both days by wall-clock overlap', () => {
    // 11:00 PM → 1:00 AM: 120 min, one hour each side of midnight.
    const s = [sessAt('2026-07-08', 23, 0, 120)];
    expect(dailyMinutes(s, '2026-07-08')).toBeCloseTo(60, 5);
    expect(dailyMinutes(s, '2026-07-09')).toBeCloseTo(60, 5);
    // Split conserves the total.
    expect(dailyMinutes(s, '2026-07-08') + dailyMinutes(s, '2026-07-09')).toBeCloseTo(120, 5);
  });

  it('splits proportionally for an uneven crossing', () => {
    // 11:30 PM → 12:30 AM: 60 min, 30 each side.
    const s = [sessAt('2026-07-08', 23, 30, 60)];
    expect(dailyMinutes(s, '2026-07-08')).toBeCloseTo(30, 5);
    expect(dailyMinutes(s, '2026-07-09')).toBeCloseTo(30, 5);
  });
});

describe('personalBestPercent', () => {
  it('is the best single-day share of 24h', () => {
    const s = [sessAt('2026-07-06', 9, 0, 144), sessAt('2026-07-07', 9, 0, 720)]; // 10% then 50%
    expect(personalBestPercent(s)).toBeCloseTo(0.5, 5);
  });

  it('a midnight split does not inflate the best beyond the true per-day share', () => {
    // 240 min all after 10pm would be 16.7% if counted on one day; split it's less.
    const s = [sessAt('2026-07-08', 22, 0, 240)]; // 22:00–02:00 → 120 min each day
    expect(personalBestPercent(s)).toBeCloseTo(120 / 1440, 5);
  });
});

describe('maintainStreak', () => {
  it('counts consecutive recent study days at or above the recent average', () => {
    const ref = new Date('2026-07-09T12:00:00');
    // Three straight days, all equal → each meets the average → streak 3.
    const s = [
      sessAt('2026-07-07', 9, 0, 120),
      sessAt('2026-07-08', 9, 0, 120),
      sessAt('2026-07-09', 9, 0, 120),
    ];
    expect(maintainStreak(s, ref)).toBe(3);
  });

  it('is zero with no study history', () => {
    expect(maintainStreak([], new Date('2026-07-09T12:00:00'))).toBe(0);
  });
});
