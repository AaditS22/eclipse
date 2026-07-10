import { describe, it, expect } from 'vitest';
import {
  weeklyDistribution,
  cognitiveLoadScore,
  clSuggestions,
  clLabel,
  settleCognitiveLoadWeeks,
  CL,
} from './cognitiveLoad.js';
import { weekStartISO, addDaysISO } from './util.js';
import { XP } from './xp.js';

// A moment inside a known week; the Sunday that starts it anchors all fixtures.
const REF = new Date('2026-07-08T12:00:00'); // a Wednesday
const WEEK_START = weekStartISO(REF); // the Sunday of REF's week

/** Build a session `dayOffset` days into the week, starting at `hour`, lasting `minutes`. */
function sess(dayOffset, hour, minutes, weekStart = WEEK_START) {
  const d = new Date(weekStart + 'T00:00:00');
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  const start = d.getTime();
  return { startTime: start, endTime: start + minutes * 60000, durationMinutes: minutes };
}

function scoreFor(sessions, ref = REF) {
  return cognitiveLoadScore(weeklyDistribution(sessions, ref));
}

describe('cognitiveLoadScore', () => {
  it('evenly spread week → Low cognitive load', () => {
    // 60 min on all 7 days, one session each — the ideal distribution.
    const sessions = [0, 1, 2, 3, 4, 5, 6].map((d) => sess(d, 9, 60));
    const scored = scoreFor(sessions);

    expect(scored.enough).toBe(true);
    expect(scored.score).toBeLessThanOrEqual(CL.LOW_MAX);
    expect(scored.label).toBe('Low');
    expect(scored.daySpike).toBe(false);
    expect(scored.blockSpike).toBe(false);
  });

  it('single-day cram → High cognitive load', () => {
    // All 7 hours of the week jammed into Thursday as one block.
    const sessions = [sess(4, 9, 420)];
    const scored = scoreFor(sessions);

    expect(scored.enough).toBe(true);
    expect(scored.score).toBeGreaterThan(CL.MODERATE_MAX);
    expect(scored.label).toBe('High');
    expect(scored.daySpike).toBe(true);
  });

  it('single long unbroken session → High cognitive load', () => {
    // One 4-hour marathon as the whole week's study.
    const sessions = [sess(2, 13, 240)];
    const scored = scoreFor(sessions);

    expect(scored.enough).toBe(true);
    expect(scored.score).toBeGreaterThan(CL.MODERATE_MAX);
    expect(scored.label).toBe('High');
    expect(scored.blockSpike).toBe(true);
  });

  it('too light a week is not judged (enough=false, stays Low)', () => {
    const scored = scoreFor([sess(1, 9, 10)]); // 10 min < MIN_MINUTES_FOR_SCORE
    expect(scored.enough).toBe(false);
    expect(scored.label).toBe('Low');
  });

  it('short breaks do not split one block, long gaps do', () => {
    // Two 60-min sessions 10 min apart merge into a 120-min block…
    const merged = weeklyDistribution([sess(3, 9, 60), { ...sess(3, 10, 60), startTime: sess(3, 10, 60).startTime + 10 * 60000, endTime: sess(3, 10, 60).endTime + 10 * 60000 }], REF);
    expect(merged.longestBlockMinutes).toBe(120);

    // …but the same minutes hours apart stay as separate 60-min blocks.
    const split = weeklyDistribution([sess(3, 9, 60), sess(3, 15, 60)], REF);
    expect(split.longestBlockMinutes).toBe(60);
  });
});

describe('clLabel thresholds', () => {
  it('maps score bands to Low/Moderate/High', () => {
    expect(clLabel(0)).toBe('Low');
    expect(clLabel(CL.LOW_MAX)).toBe('Low');
    expect(clLabel(CL.LOW_MAX + 1)).toBe('Moderate');
    expect(clLabel(CL.MODERATE_MAX)).toBe('Moderate');
    expect(clLabel(CL.MODERATE_MAX + 1)).toBe('High');
    expect(clLabel(100)).toBe('High');
  });
});

describe('clSuggestions', () => {
  it('names the specific overloaded day for a single-day cram', () => {
    const dist = weeklyDistribution([sess(4, 9, 420)], REF); // Thursday
    const tips = clSuggestions(dist, cognitiveLoadScore(dist));
    expect(tips.length).toBeGreaterThan(0);
    expect(tips[0]).toContain('Thursday');
  });

  it('calls out a long unbroken stretch', () => {
    const dist = weeklyDistribution([sess(2, 13, 240)], REF);
    const tips = clSuggestions(dist, cognitiveLoadScore(dist));
    expect(tips.some((t) => /stretch|blocks/.test(t))).toBe(true);
  });

  it('stays silent for a well-distributed week', () => {
    const dist = weeklyDistribution([0, 1, 2, 3, 4, 5, 6].map((d) => sess(d, 9, 60)), REF);
    expect(clSuggestions(dist, cognitiveLoadScore(dist))).toEqual([]);
  });
});

describe('settleCognitiveLoadWeeks', () => {
  const priorWeekStart = addDaysISO(WEEK_START, -7);
  const inPriorWeek = (dayOffset, hour, minutes) => sess(dayOffset, hour, minutes, priorWeekStart);

  it('pays the balanced-week bonus and extends the streak for a Low prior week', () => {
    const state = {
      sessions: [0, 1, 2, 3, 4, 5, 6].map((d) => inPriorWeek(d, 9, 60)),
      cl: { lastWeek: priorWeekStart, lowStreak: 0, bestLowStreak: 0 },
    };
    const res = settleCognitiveLoadWeeks(state, REF);

    expect(res.awardedXp).toBe(XP.LOW_CL_WEEKLY_BONUS);
    expect(state.cl.lowStreak).toBe(1);
    expect(state.cl.bestLowStreak).toBe(1);
    expect(state.cl.lastWeek).toBe(WEEK_START);
  });

  it('resets the streak and pays nothing for a crammed prior week', () => {
    const state = {
      sessions: [inPriorWeek(4, 9, 420)],
      cl: { lastWeek: priorWeekStart, lowStreak: 3, bestLowStreak: 5 },
    };
    const res = settleCognitiveLoadWeeks(state, REF);

    expect(res.awardedXp).toBe(0);
    expect(state.cl.lowStreak).toBe(0);
    expect(state.cl.bestLowStreak).toBe(5); // best is preserved
  });

  it('is idempotent — a second settle in the same week awards nothing more', () => {
    const state = {
      sessions: [0, 1, 2, 3, 4, 5, 6].map((d) => inPriorWeek(d, 9, 60)),
      cl: { lastWeek: priorWeekStart, lowStreak: 0, bestLowStreak: 0 },
    };
    settleCognitiveLoadWeeks(state, REF);
    const again = settleCognitiveLoadWeeks(state, REF);
    expect(again.awardedXp).toBe(0);
    expect(state.cl.lowStreak).toBe(1);
  });

  it('first-ever run just anchors the week with no retroactive award', () => {
    const state = { sessions: [], cl: { lastWeek: null, lowStreak: 0, bestLowStreak: 0 } };
    const res = settleCognitiveLoadWeeks(state, REF);
    expect(res.awardedXp).toBe(0);
    expect(state.cl.lastWeek).toBe(WEEK_START);
  });

  it('does not move the cursor backwards or re-pay when the clock is set back', () => {
    // Cursor already at the current week; a settle with an earlier clock must
    // be a no-op (no rewind → no double-pay when time later moves forward).
    const state = {
      sessions: [0, 1, 2, 3, 4, 5, 6].map((d) => inPriorWeek(d, 9, 60)),
      cl: { lastWeek: WEEK_START, lowStreak: 2, bestLowStreak: 2 },
    };
    const past = new Date(new Date(WEEK_START + 'T12:00:00').getTime() - 7 * 86400000);
    const res = settleCognitiveLoadWeeks(state, past);
    expect(res.awardedXp).toBe(0);
    expect(state.cl.lastWeek).toBe(WEEK_START); // unchanged
    expect(state.cl.lowStreak).toBe(2);
  });
});
