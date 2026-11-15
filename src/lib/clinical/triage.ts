// src/lib/clinical/triage.ts

export type SupportTier = 1 | 2 | 3 | 4;

export interface Who5Responses {
  q1_cheerful: number;     // 0 (At no time) to 5 (All of the time)
  q2_calm: number;         // 0 to 5
  q3_active: number;       // 0 to 5
  q4_rested: number;       // 0 to 5
  q5_interested: number;   // 0 to 5
}

export interface PhysicalContextResponses {
  sleepDisruption: number;      // 0 (Not at all) to 3 (Nearly every day)
  painOrTension: number;        // 0 to 3
  fatigueOrRoleLimit: number;   // 0 to 3
}

export interface Gad7Responses {
  items: [number, number, number, number, number, number, number]; // Each 0..3
}

export interface Phq9Responses {
  items: [number, number, number, number, number, number, number, number, number]; // Each 0..3; index 8 is Item 9
}

export interface HistoricalRecord {
  timestamp: string; // ISO date
  who5Standardized: number;
  physicalLoadScore: number;
}

export interface TriageInput {
  who5: Who5Responses;
  physicalContext?: PhysicalContextResponses;
  gad7?: Gad7Responses;
  phq9?: Phq9Responses;
  history?: HistoricalRecord[];
}

export interface ExplainableResult {
  who5Raw: number;
  who5Standardized: number; // 0 to 100 (higher = better wellbeing)
  physicalLoadScore: number | null; // 0 to 9 (supplementary context only)
  gad7Total: number | null;
  phq9Total: number | null;
  phq9Item9Positive: boolean;
  recommendAdaptiveFollowup: boolean;
  adaptiveReason: string | null;
  baselineComparison: {
    hasEstablishedBaseline: boolean;
    baselineWho5: number | null;
    deltaFromBaseline: number | null;
    message: string;
  };
  tier: SupportTier;
  tierLabel: string;
  requiresHumanAssessment: boolean;
  whatThisMeans: string[];
  whatThisDoesNotMean: string[];
  recommendedNextSteps: string[];
}

function clamp(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.min(max, Math.max(min, Math.round(val)));
}

export function scoreWho5(responses: Who5Responses): { raw: number; standardized: number } {
  const raw =
    clamp(responses.q1_cheerful, 0, 5) +
    clamp(responses.q2_calm, 0, 5) +
    clamp(responses.q3_active, 0, 5) +
    clamp(responses.q4_rested, 0, 5) +
    clamp(responses.q5_interested, 0, 5);

  return { raw, standardized: raw * 4 };
}

export function scorePhysicalContext(context?: PhysicalContextResponses): number | null {
  if (!context) return null;
  return (
    clamp(context.sleepDisruption, 0, 3) +
    clamp(context.painOrTension, 0, 3) +
    clamp(context.fatigueOrRoleLimit, 0, 3)
  );
}

export function scoreScale(items: number[], maxPerItem = 3): number {
  return items.reduce((sum, item) => sum + clamp(item, 0, maxPerItem), 0);
}

export function evaluateBaseline(
  currentWho5: number,
  history: HistoricalRecord[] = []
): ExplainableResult['baselineComparison'] {
  if (history.length < 2) {
    return {
      hasEstablishedBaseline: false,
      baselineWho5: null,
      deltaFromBaseline: null,
      message:
        'Personal four-week baseline not yet established. At least two prior check-ins across 14+ days are required before calculating personal trend deviations.',
    };
  }

  const sorted = [...history].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const oldest = new Date(sorted[0].timestamp).getTime();
  const newest = new Date(sorted[sorted.length - 1].timestamp).getTime();
  const spanDays = (newest - oldest) / (1000 * 60 * 60 * 24);

  if (spanDays < 14) {
    return {
      hasEstablishedBaseline: false,
      baselineWho5: null,
      deltaFromBaseline: null,
      message: `Personal baseline building (${Math.round(spanDays)} of 14 days recorded). Continue periodic check-ins to establish your personal baseline.`,
    };
  }

  const recentFourWeeks = sorted.slice(-4);
  const avg = Math.round(
    recentFourWeeks.reduce((acc, rec) => acc + rec.who5Standardized, 0) / recentFourWeeks.length
  );
  const delta = currentWho5 - avg;

  return {
    hasEstablishedBaseline: true,
    baselineWho5: avg,
    deltaFromBaseline: delta,
    message:
      delta <= -12
        ? `Your current WHO-5 score (${currentWho5}) is ${Math.abs(delta)} points below your personal baseline (${avg}), indicating a notable recent drop in subjective wellbeing.`
        : delta >= 10
        ? `Your current WHO-5 score (${currentWho5}) is ${delta} points above your personal baseline (${avg}).`
        : `Your current WHO-5 score (${currentWho5}) remains close to your personal baseline (${avg}).`,
  };
}

export function evaluateBiopsychosocialTriage(input: TriageInput): ExplainableResult {
  const { raw: who5Raw, standardized: who5Standardized } = scoreWho5(input.who5);
  const physicalLoadScore = scorePhysicalContext(input.physicalContext);
  const gad7Total = input.gad7 ? scoreScale(input.gad7.items, 3) : null;
  const phq9Total = input.phq9 ? scoreScale(input.phq9.items, 3) : null;
  const phq9Item9Positive = input.phq9 ? clamp(input.phq9.items[8], 0, 3) > 0 : false;

  const baselineComparison = evaluateBaseline(who5Standardized, input.history);

  // Determine if supplementary GAD-7 / PHQ-9 should be offered (user may also opt-in anytime)
  const significantDrop =
    baselineComparison.hasEstablishedBaseline &&
    baselineComparison.deltaFromBaseline !== null &&
    baselineComparison.deltaFromBaseline <= -15;

  const recommendAdaptiveFollowup =
    who5Standardized <= 50 || (physicalLoadScore !== null && physicalLoadScore >= 5) || significantDrop;

  let adaptiveReason: string | null = null;
  if (recommendAdaptiveFollowup) {
    const reasons: string[] = [];
    if (who5Standardized <= 50) reasons.push('WHO-5 wellbeing score is 50 or below');
    if (physicalLoadScore !== null && physicalLoadScore >= 5)
      reasons.push('persistent sleep, pain, or daily functioning impact was noted');
    if (significantDrop) reasons.push('notable decrease compared to your personal baseline');
    adaptiveReason = `Additional optional GAD-7 and PHQ-9 check-ins are offered because ${reasons.join(
      ' and '
    )}.`;
  }

  // Deterministic 4-Tier Stepped Care Routing
  let tier: SupportTier = 1;
  let tierLabel = 'Tier 1 — Self-Guided & Preventive Wellbeing Support';
  let requiresHumanAssessment = false;

  if (phq9Item9Positive || (phq9Total !== null && phq9Total >= 20) || (gad7Total !== null && gad7Total >= 15)) {
    tier = 4;
    tierLabel = 'Tier 4 — Priority Human Clinical Assessment & Safety Support';
    requiresHumanAssessment = true;
  } else if (
    (phq9Total !== null && phq9Total >= 10) ||
    (gad7Total !== null && gad7Total >= 10) ||
    who5Standardized <= 32 ||
    (who5Standardized <= 44 && physicalLoadScore !== null && physicalLoadScore >= 6)
  ) {
    tier = 3;
    tierLabel = 'Tier 3 — Primary Care, Tele-Mental Health & Coordinated Clinical Review';
    requiresHumanAssessment = true;
  } else if (
    who5Standardized <= 52 ||
    (phq9Total !== null && phq9Total >= 5) ||
    (gad7Total !== null && gad7Total >= 5) ||
    (physicalLoadScore !== null && physicalLoadScore >= 4) ||
    significantDrop
  ) {
    tier = 2;
    tierLabel = 'Tier 2 — Community, Peer & Guided Low-Intensity Support';
  }

  // Construct Explainable Guardrails ("What This Means / What This Does NOT Mean")
  const whatThisMeans: string[] = [
    `Your standardized WHO-5 Wellbeing Index score is ${who5Standardized}/100 (higher scores reflect stronger subjective wellbeing over the past two weeks).`,
  ];

  if (physicalLoadScore !== null) {
    whatThisMeans.push(
      `Your contextual physical-functioning impact score is ${physicalLoadScore}/9, helping highlight how sleep, physical tension, or fatigue interact with daily wellbeing.`
    );
  }
  if (gad7Total !== null) {
    whatThisMeans.push(`Your GAD-7 anxiety screening score is ${gad7Total}/21.`);
  }
  if (phq9Total !== null) {
    whatThisMeans.push(`Your PHQ-9 mood screening score is ${phq9Total}/27.`);
  }
  if (phq9Item9Positive) {
    whatThisMeans.push(
      'You indicated thoughts of self-harm or being better off dead on PHQ-9 Item 9. This response warrants timely conversation and assessment by a trained healthcare professional.'
    );
  }

  const whatThisDoesNotMean: string[] = [
    'This screening result is NOT a medical or psychiatric diagnosis.',
    'Validated screening tools and contextual physical questions cannot independently establish a mental-health disorder.',
    'A positive response on a screening question does NOT automatically establish imminent danger, nor can an algorithm replace human clinical risk formulation.',
    'A licensed healthcare professional remains responsible for clinical evaluation and care decisions.',
  ];

  const recommendedNextSteps: string[] = [];
  if (tier === 1) {
    recommendedNextSteps.push(
      'Explore evidence-informed sleep hygiene, relaxation, and physical activity routines.',
      'Re-check your wellbeing in 1–2 weeks to build your personal baseline.'
    );
  } else if (tier === 2) {
    recommendedNextSteps.push(
      'Review verified community wellbeing programmes, peer circles, or guided self-management options with transparent wait times.',
      'Optionally generate a Zero-Knowledge eligibility proof if a community programme requires screening confirmation without sharing raw scores.'
    );
  } else if (tier === 3) {
    recommendedNextSteps.push(
      'Connect with primary care, tele-mental health, or counselling services—especially where both emotional stress and physical symptoms are present.',
      'Use the Warm Hand-Off generator to share only the specific scores you authorize with your chosen clinician.'
    );
  } else {
    recommendedNextSteps.push(
      'Connect directly with a trained human professional or verified crisis support line for timely clinical assessment.',
      'If you are in immediate physical danger, contact emergency services right away.'
    );
  }

  return {
    who5Raw,
    who5Standardized,
    physicalLoadScore,
    gad7Total,
    phq9Total,
    phq9Item9Positive,
    recommendAdaptiveFollowup,
    adaptiveReason,
    baselineComparison,
    tier,
    tierLabel,
    requiresHumanAssessment,
    whatThisMeans,
    whatThisDoesNotMean,
    recommendedNextSteps,
  };
}