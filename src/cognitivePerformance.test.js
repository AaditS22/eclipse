import { describe, it, expect } from 'vitest';
import {
  weeklyPerformance,
  consistencyScore,
  weeklyTargetMinutes,
  performanceTips,
  settleCognitivePerformanceWeeks,
  CP,
  CP_TIERS,
  CP_MAX_SCORE,
} from './cognitivePerformance.js';
import { weekStartISO, addDaysISO } from './util.js';
import { XP } from './xp.js';

// A moment inside a known week; the Sunday that starts it anchors all fixtures.
const REF = new Date('2026-07-08T12:00:00'); // a Wednesday
const WEEK_START = weekStartISO(REF);

/** A session `dayOffset` days into the week, starting at `hour`, lasting `minutes`. */
function sess(dayOffset, hour, minutes, weekStart = WEEK_START) {
  const d = new Date(weekStart + 'T00:00:00');
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  const start = d.getTime();
  return { startTime: start, endTime: start + minutes * 60000, durationMinutes: minutes };
}

const perf = (sessions, mode = 'lecture') => weeklyPerformance(sessions, { refDate: REF, mode });

describe('day-mode targets', () => {
  it('lecture week = 4h weekdays + 8h weekends = 36h', () => {
    expect(weeklyTargetMinutes('lecture')).toBe(5 * 240 + 2 * 480); // 2160
  });
  it('white week = 10h/day, holidays = 5h/day', () => {
    expect(weeklyTargetMinutes('white')).toBe(7 * 600); // 4200
    expect(weeklyTargetMinutes('holidays')).toBe(7 * 300); // 2100
  });
});

describe('consistencyScore', () => {
  it('identical sessions → highly consistent', () => {
    const s = [0, 1, 2, 3].map((d) => sess(d, 9, 90));
    expect(consistencyScore(s)).toBeGreaterThan(0.9);
  });
  it('wildly varying length + timing → low consistency', () => {
    const s = [sess(0, 6, 40), sess(1, 23, 600), sess(2, 13, 120), sess(3, 19, 480)];
    expect(consistencyScore(s)).toBeLessThan(CP.CONSISTENCY_OK);
  });
  it('a single session cannot establish a rhythm', () => {
    expect(consistencyScore([sess(1, 9, 120)])).toBe(0);
  });
});

describe('weeklyPerformance tiers', () => {
  it('on-target + consistent → Optimal, and a perfect week hits the +10 ceiling', () => {
    // 6 identical 6-hour sessions = 2160 min = exactly the lecture target.
    const p = perf([0, 1, 2, 3, 4, 5].map((d) => sess(d, 9, 360)));
    expect(p.tier).toBe('OPTIMAL');
    expect(p.score).toBe(CP_MAX_SCORE);
    expect(p.burnoutRisk).toBe('none');
  });

  it('empty week → No work done, floored at -10', () => {
    const p = perf([]);
    expect(p.tier).toBe('NO_WORK');
    expect(p.enough).toBe(false);
    expect(p.score).toBe(-10);
  });

  it('all study on effectively one day → No work done (not a real week)', () => {
    // Big multi-session Monday + a token Tuesday: one-day dominance.
    const p = perf([sess(1, 9, 700), sess(1, 14, 700), sess(1, 19, 600), sess(2, 9, 50)]);
    expect(p.tier).toBe('NO_WORK');
    expect(p.score).toBeLessThanOrEqual(CP_TIERS.NO_WORK.max);
  });

  it('sustained shortfall across the week → Underperforming', () => {
    const p = perf([0, 1, 2, 3, 4].map((d) => sess(d, 9, 120))); // 600 / 2160 ≈ 0.28
    expect(p.tier).toBe('UNDERPERFORMING');
    expect(p.score).toBeGreaterThanOrEqual(-5);
    expect(p.score).toBeLessThanOrEqual(-1);
  });

  it('around target but erratic → No sign of improvement (0)', () => {
    const durations = [60, 600, 120, 500, 300, 580]; // sum 2160 ≈ target, wildly uneven
    const hours = [6, 23, 13, 8, 20, 11];
    const p = perf(durations.map((m, i) => sess(i, hours[i], m)));
    expect(p.consistent).toBe(false);
    expect(p.tier).toBe('NO_IMPROVEMENT');
    expect(p.score).toBe(0);
  });

  it('well above target → Overperforming, scored positive but below Optimal', () => {
    // Consistent but 1.5× the target → not Optimal (excess ≠ efficiency).
    const p = perf([0, 1, 2, 3, 4, 5].map((d) => sess(d, 9, 540))); // 3240 / 2160 = 1.5
    expect(p.tier).toBe('OVERPERFORMING');
    expect(p.score).toBeGreaterThanOrEqual(1);
    expect(p.score).toBeLessThanOrEqual(5);
    expect(p.score).toBeLessThan(CP_MAX_SCORE);
  });

  it('flags burnout risk on consistent, large, sustained excess — separate from the score', () => {
    const p = perf([0, 1, 2, 3, 4, 5].map((d) => sess(d, 9, 560))); // ratio ≈ 1.56
    expect(p.tier).toBe('OVERPERFORMING');
    expect(p.burnoutRisk).toBe('high');
    expect(p.score).toBeGreaterThan(0); // burnout does NOT drag the number negative
  });
});

describe('holidays discipline bonus', () => {
  it('lifts an equivalent week higher than a non-holiday mode, capped at +10', () => {
    // Same session SHAPE scaled to each mode's target so ratio + consistency
    // match; only the holidays bonus should differ.
    const holidayWeek = [0, 1, 2, 3, 4, 5].map((d) => sess(d, 9, 525)); // 3150 / 2100 = 1.5
    const whiteWeek = [0, 1, 2, 3, 4, 5].map((d) => sess(d, 9, 1050)); // 6300 / 4200 = 1.5

    const h = perf(holidayWeek, 'holidays');
    const w = perf(whiteWeek, 'white');

    expect(h.tier).toBe('OVERPERFORMING');
    expect(w.tier).toBe('OVERPERFORMING');
    expect(h.score).toBeGreaterThan(w.score); // the discipline bonus shows through
    expect(h.score).toBeLessThanOrEqual(CP_MAX_SCORE);
  });
});

describe('performanceTips', () => {
  it('gives a burnout-aware tip when overperforming with risk', () => {
    const p = perf([0, 1, 2, 3, 4, 5].map((d) => sess(d, 9, 560)));
    const tips = performanceTips(p);
    expect(tips.length).toBeGreaterThan(0);
    expect(tips[0]).toMatch(/recovery|over target/i);
  });
  it('stays silent when there isn\'t enough of a week', () => {
    expect(performanceTips(perf([sess(1, 9, 10)]))).toEqual([]);
  });
});

describe('settleCognitivePerformanceWeeks', () => {
  const priorWeekStart = addDaysISO(WEEK_START, -7);
  const inPrior = (d, h, m) => sess(d, h, m, priorWeekStart);

  it('pays the Optimal-week bonus and extends the streak', () => {
    const state = {
      settings: { dayMode: 'lecture' },
      sessions: [0, 1, 2, 3, 4, 5].map((d) => inPrior(d, 9, 360)), // an Optimal prior week
      cp: { lastWeek: priorWeekStart, optimalStreak: 0, bestOptimalStreak: 0 },
    };
    const res = settleCognitivePerformanceWeeks(state, REF);
    expect(res.awardedXp).toBe(XP.OPTIMAL_WEEK_BONUS);
    expect(state.cp.optimalStreak).toBe(1);
    expect(state.cp.bestOptimalStreak).toBe(1);
    expect(state.cp.lastWeek).toBe(WEEK_START);
  });

  it('resets the streak and pays nothing for a non-optimal prior week', () => {
    const state = {
      settings: { dayMode: 'lecture' },
      sessions: [0, 1, 2, 3, 4].map((d) => inPrior(d, 9, 120)), // underperforming
      cp: { lastWeek: priorWeekStart, optimalStreak: 3, bestOptimalStreak: 5 },
    };
    const res = settleCognitivePerformanceWeeks(state, REF);
    expect(res.awardedXp).toBe(0);
    expect(state.cp.optimalStreak).toBe(0);
    expect(state.cp.bestOptimalStreak).toBe(5); // best preserved
  });

  it('is idempotent within the same week', () => {
    const state = {
      settings: { dayMode: 'lecture' },
      sessions: [0, 1, 2, 3, 4, 5].map((d) => inPrior(d, 9, 360)),
      cp: { lastWeek: priorWeekStart, optimalStreak: 0, bestOptimalStreak: 0 },
    };
    settleCognitivePerformanceWeeks(state, REF);
    const again = settleCognitivePerformanceWeeks(state, REF);
    expect(again.awardedXp).toBe(0);
    expect(state.cp.optimalStreak).toBe(1);
  });

  it('first-ever run just anchors the cursor with no retroactive award', () => {
    const state = { settings: {}, sessions: [], cp: { lastWeek: null, optimalStreak: 0, bestOptimalStreak: 0 } };
    const res = settleCognitivePerformanceWeeks(state, REF);
    expect(res.awardedXp).toBe(0);
    expect(state.cp.lastWeek).toBe(WEEK_START);
  });

  it('never rewinds the cursor when the clock is set back', () => {
    const state = {
      settings: { dayMode: 'lecture' },
      sessions: [0, 1, 2, 3, 4, 5].map((d) => inPrior(d, 9, 360)),
      cp: { lastWeek: WEEK_START, optimalStreak: 2, bestOptimalStreak: 2 },
    };
    const past = new Date(new Date(WEEK_START + 'T12:00:00').getTime() - 7 * 86400000);
    const res = settleCognitivePerformanceWeeks(state, past);
    expect(res.awardedXp).toBe(0);
    expect(state.cp.lastWeek).toBe(WEEK_START);
    expect(state.cp.optimalStreak).toBe(2);
  });
});
