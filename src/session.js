/* ============================================================
   Session processing — the heart of the loop.
   Called when a timer stops. Computes XP, updates streak/level/
   credits, advances monthly rank, runs achievements, and returns
   a summary for the complete modal.
   ============================================================ */

import { getState, update, rolloverDaily } from './state.js';
import { computeSessionXp, creditsGained, nextStreak, levelForXp } from './xp.js';
import { ensureMonth, planetIndexForXp, PLANETS } from './rank.js';
import { evaluateAchievements } from './achievements.js';
import { totalDailyGoal } from './subjects.js';
import { settleCognitiveLoadWeeks } from './cognitiveLoad.js';
import { isoDate, uid, SUBJECT_COLORS } from './util.js';

/**
 * Finalize a study session.
 * @param {string} subject
 * @param {number} startTime  ms timestamp
 * @param {number} endTime    ms timestamp
 * @returns summary for the modal
 */
export function processSessionEnd(subject, startTime, endTime) {
  const todayISO = isoDate(new Date(endTime));
  rolloverDaily(todayISO);

  const s = getState();
  const durationMinutes = Math.max(1, Math.round((endTime - startTime) / 60000));
  const subjectName = subject.trim() || 'General Study';

  // ---- Pre-session context (read before mutating) ----
  const isNewSubject = !s.subjects.some((x) => x.name.toLowerCase() === subjectName.toLowerCase());
  const firstSessionToday = !s.daily.firstSessionDone;

  const todayMinsBefore = s.sessions
    .filter((x) => isoDate(new Date(x.startTime)) === todayISO)
    .reduce((sum, x) => sum + x.durationMinutes, 0);

  // Daily goal = sum of every subject's daily goal.
  const goal = totalDailyGoal(s);
  const goalMetNow =
    goal > 0 && !s.daily.goalBonusAwarded && todayMinsBefore < goal && todayMinsBefore + durationMinutes >= goal;

  // ---- Streak (only advances on real study days) ----
  const newStreak = nextStreak(s.user.lastStudyDate, todayISO, s.user.streak);

  // ---- XP breakdown (time + flat bonuses) ----
  const breakdown = computeSessionXp({
    durationMinutes,
    streak: newStreak,
    timeXpAwardedToday: s.daily.timeXpAwarded,
    firstSessionToday,
    isNewSubject,
    goalMetNow,
  });

  const oldXp = s.user.xp;
  const oldLevel = s.user.level;

  const finished = {
    sessionId: uid('sess'),
    subject: subjectName,
    startTime,
    endTime,
    durationMinutes,
    xpEarned: breakdown.total,
  };

  let result;

  // ---- Commit ----
  update((st) => {
    ensureMonth(st, todayISO);
    const monthlyBefore = st.rank.monthlyXp;

    // Auto-register a subject if the user logged something off-list.
    if (isNewSubject) {
      st.subjects.push({
        id: uid('subj'),
        name: subjectName,
        color: SUBJECT_COLORS[st.subjects.length % SUBJECT_COLORS.length],
        dailyGoalMinutes: 0,
        completedAt: null,
        completedTier: null,
        relicId: null,
      });
    }
    st.sessions.push(finished);

    // Settle any week(s) that fully elapsed since the last session. A week that
    // ended on a Low cognitive-load score pays a one-time balanced-week bonus
    // and extends the low-CL streak (which drives milestone badges below).
    const clSettle = settleCognitiveLoadWeeks(st, new Date(endTime));
    const weeklyBonus = clSettle.awardedXp;

    st.user.xp += breakdown.total + weeklyBonus;
    st.rank.monthlyXp += breakdown.total + weeklyBonus;
    st.daily.timeXpAwarded += breakdown.timeXp;
    st.daily.firstSessionDone = true;
    if (goalMetNow) st.daily.goalBonusAwarded = true;

    // Recompute level + credits from lifetime XP.
    st.user.level = levelForXp(st.user.xp);
    const credits = creditsGained(oldXp, st.user.xp);
    st.user.credits += credits;
    st.user.streak = newStreak;
    st.user.lastStudyDate = todayISO;
    st.stats.xpToday = (st.stats.xpToday || 0) + breakdown.total;

    // Rank-up (monthly planet) detection.
    const rankBefore = planetIndexForXp(monthlyBefore);
    const rankAfter = planetIndexForXp(st.rank.monthlyXp);

    // Relics are no longer minted here — subjects are completed manually
    // from the Subjects tab, which is where the relic is forged.
    st.user.collection = st.user.collection || [];

    const newAchievements = evaluateAchievements(st, { session: finished });

    result = {
      subject: subjectName,
      durationMinutes,
      breakdown,
      creditsEarned: credits,
      leveledUp: st.user.level > oldLevel,
      oldLevel,
      newLevel: st.user.level,
      totalXp: breakdown.total + weeklyBonus,
      rankedUp: rankAfter > rankBefore,
      newPlanet: PLANETS[rankAfter],
      newAchievements,
      // Balanced-week payout (0 unless a week just settled on a Low CL score).
      weeklyBonus,
      lowClStreak: st.cl.lowStreak,
    };
  });

  return result;
}
