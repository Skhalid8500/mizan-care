// src/lib/sensing/adlDetector.ts

export interface DailyAdlSnapshot {
  date: string;
  steps: number;
  sleepHours: number;
  nightScreenPickups: number;
  sedentaryMinutes: number;
  restingHr?: number;
  hrvMs?: number;
}

export type DriftedDomain = 'sleep' | 'movement' | 'autonomic';

export interface AdaptiveQuestion {
  id: string;
  domain: DriftedDomain | 'appetite' | 'emotional';
  promptEn: string;
  promptAr: string;
  subtextEn: string;
  subtextAr: string;
  options: { labelEn: string; labelAr: string; score: number }[];
}

export interface AdlDriftReport {
  driftDetected: boolean;
  severity: 'stable' | 'mild_drift' | 'notable_drift';
  baselineStage: 'Live On-Device Calibration' | '7-Day Rolling Baseline' | '14-Day Circadian Baseline';
  driftedDomains: DriftedDomain[];
  headlineEn: string;
  headlineAr: string;
  notificationTitle: string;
  notificationBody: string;
  findings: string[];
  contextualExplanation: string;
  baselineSummary: {
    sleepHours: number;
    steps: number;
    restingHr: number;
    hrvMs: number;
  };
  recentSummary: {
    sleepHours: number;
    steps: number;
    restingHr: number;
    hrvMs: number;
  };
  suggestedPhysicalContext: {
    sleepDisruption: number;
    painOrTension: number;
    fatigueOrRoleLimit: number;
  };
}

const ADL_STORAGE_KEY = 'mizan_adl_live_baseline_v3';

export function isNativeMobileRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return Boolean(win.Capacitor?.isNativePlatform?.());
}

export function loadAdlHistory(): DailyAdlSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ADL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAdlHistory(records: DailyAdlSnapshot[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ADL_STORAGE_KEY, JSON.stringify(records.slice(-14)));
}

/**
 * Pure Live Engine: Evaluates directly from the user's actual stored records
 * without substituting static population averages.
 */
export function evaluateMindBodyAdlDrift(records: DailyAdlSnapshot[]): AdlDriftReport {
  const activeRecords = records.length > 0 ? records : [];

  if (activeRecords.length === 0) {
    return {
      driftDetected: false,
      severity: 'stable',
      baselineStage: 'Live On-Device Calibration',
      driftedDomains: [],
      headlineEn: 'Listening to your live daily rhythm on this device',
      headlineAr: 'متابعة حية لإيقاعك اليومي على هذا الجهاز',
      notificationTitle: 'Mizan Care · Live Rhythm',
      notificationBody: 'Mizan is learning your personal baseline on this device.',
      findings: [],
      contextualExplanation:
        'Mizan learns your personal sleep, movement, and recovery baseline directly on your device.',
      baselineSummary: { sleepHours: 7.0, steps: 0, restingHr: 66, hrvMs: 56 },
      recentSummary: { sleepHours: 7.0, steps: 0, restingHr: 66, hrvMs: 56 },
      suggestedPhysicalContext: { sleepDisruption: 0, painOrTension: 0, fatigueOrRoleLimit: 0 },
    };
  }

  const baselineStage: AdlDriftReport['baselineStage'] =
    activeRecords.length >= 12
      ? '14-Day Circadian Baseline'
      : activeRecords.length >= 7
      ? '7-Day Rolling Baseline'
      : 'Live On-Device Calibration';

  const splitIndex = activeRecords.length >= 6 ? activeRecords.length - 3 : Math.max(1, activeRecords.length - 1);
  const baselineDays = activeRecords.slice(0, splitIndex);
  const recentDays = activeRecords.slice(splitIndex);

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / Math.max(arr.length, 1);

  const baseSteps = Math.round(avg(baselineDays.map((d) => d.steps)));
  const recentSteps = Math.round(avg(recentDays.map((d) => d.steps)));
  const stepDropPct =
    baseSteps > 500 ? Math.round(((baseSteps - recentSteps) / baseSteps) * 100) : 0;

  const baseSleep = Number(avg(baselineDays.map((d) => d.sleepHours)).toFixed(1));
  const recentSleep = Number(avg(recentDays.map((d) => d.sleepHours)).toFixed(1));
  const sleepDelta = Number((recentSleep - baseSleep).toFixed(1));

  const basePickups = avg(baselineDays.map((d) => d.nightScreenPickups));
  const recentPickups = avg(recentDays.map((d) => d.nightScreenPickups));

  const baseSedentary = avg(baselineDays.map((d) => d.sedentaryMinutes));
  const recentSedentary = avg(recentDays.map((d) => d.sedentaryMinutes));

  const baseHr = Math.round(avg(baselineDays.map((d) => d.restingHr ?? 66)));
  const recentHr = Math.round(avg(recentDays.map((d) => d.restingHr ?? 66)));

  const baseHrv = Math.round(avg(baselineDays.map((d) => d.hrvMs ?? 56)));
  const recentHrv = Math.round(avg(recentDays.map((d) => d.hrvMs ?? 56)));
  const hrvDropPct = baseHrv > 0 ? Math.round(((baseHrv - recentHrv) / baseHrv) * 100) : 0;

  const findings: string[] = [];
  const driftedDomains: DriftedDomain[] = [];

  let sleepScore = 0;
  if (sleepDelta <= -1.2 || recentPickups >= basePickups + 3) {
    driftedDomains.push('sleep');
    sleepScore = sleepDelta <= -2.0 ? 3 : 2;
    findings.push(
      `Sleep dropped to ${recentSleep.toFixed(1)}h avg (your baseline ${baseSleep.toFixed(1)}h)`
    );
  }

  let fatigueScore = 0;
  if ((baseSteps > 500 && stepDropPct >= 25) || recentSedentary >= baseSedentary + 90) {
    driftedDomains.push('movement');
    fatigueScore = stepDropPct >= 40 ? 3 : 2;
    findings.push(
      `Daily movement dropped ${Math.max(stepDropPct, 25)}% (${recentSteps.toLocaleString()} steps/day)`
    );
  }

  let tensionScore = 0;
  if (hrvDropPct >= 18 || recentHr >= baseHr + 8) {
    driftedDomains.push('autonomic');
    tensionScore = hrvDropPct >= 28 ? 3 : 2;
    findings.push(`Body recovery strain elevated across recent days`);
  }

  const baselineSummary = {
    sleepHours: baseSleep,
    steps: baseSteps,
    restingHr: baseHr,
    hrvMs: baseHrv,
  };

  const recentSummary = {
    sleepHours: recentSleep,
    steps: recentSteps,
    restingHr: recentHr,
    hrvMs: recentHrv,
  };

  if (driftedDomains.length >= 2) {
    const isHighShift = driftedDomains.length >= 3;
    const summarySentence = findings.join('; ');
    return {
      driftDetected: true,
      severity: isHighShift ? 'notable_drift' : 'mild_drift',
      baselineStage,
      driftedDomains,
      headlineEn: isHighShift
        ? 'High shift across your personal sleep, movement, and recovery'
        : 'Mild shift in your personal sleep and daily movement',
      headlineAr: isHighShift
        ? 'تغيّر ملحوظ في نومك وحركتك وراحة جسدك مقارنة بمعتادك'
        : 'تغيّر طفيف في نومك ونشاطك اليومي مقارنة بمعتادك',
      notificationTitle: 'Mizan Care · Personal Rhythm Alert',
      notificationBody: isHighShift
        ? `Significant personal shift detected: ${summarySentence}. Tap to book a consultation.`
        : `Personal shift detected: ${summarySentence}. Tap for a quick 3-question check-in.`,
      findings,
      contextualExplanation: `Compared with your own baseline (${baselineSummary.sleepHours}h sleep, ${baselineSummary.steps.toLocaleString()} steps/day), your recent rhythm shifted to ${recentSummary.sleepHours}h sleep and ${recentSummary.steps.toLocaleString()} steps/day.`,
      baselineSummary,
      recentSummary,
      suggestedPhysicalContext: {
        sleepDisruption: sleepScore,
        painOrTension: tensionScore,
        fatigueOrRoleLimit: fatigueScore,
      },
    };
  }

  return {
    driftDetected: false,
    severity: 'stable',
    baselineStage,
    driftedDomains,
    headlineEn: 'Aligned with your personal sleep, movement, and recovery rhythm',
    headlineAr: 'متوافق مع إيقاعك الشخصي للنوم والحركة وراحة الجسد',
    notificationTitle: 'Mizan Care · Personal Rhythm',
    notificationBody: 'Your movement and sleep remain aligned with your personal baseline.',
    findings,
    contextualExplanation: `Your recent sleep (${recentSummary.sleepHours}h) and movement (${recentSummary.steps.toLocaleString()} steps) match your personal baseline.`,
    baselineSummary,
    recentSummary,
    suggestedPhysicalContext: { sleepDisruption: 0, painOrTension: 0, fatigueOrRoleLimit: 0 },
  };
}

export function generateAdaptiveQuestions(report: AdlDriftReport): AdaptiveQuestion[] {
  const q1: AdaptiveQuestion = {
    id: 'q-sleep',
    domain: 'sleep',
    promptEn: report.driftedDomains.includes('sleep')
      ? `Your sleep averaged ${report.recentSummary.sleepHours} hours lately (down from your usual ${report.baselineSummary.sleepHours} hours). How rested do you feel when you wake up?`
      : `Your sleep has stayed around ${report.recentSummary.sleepHours} hours. Have you been waking up feeling refreshed and ready for your day?`,
    promptAr: report.driftedDomains.includes('sleep')
      ? `بلغ متوسط نومك ${report.recentSummary.sleepHours} ساعات مؤخراً (أقل من معتادك ${report.baselineSummary.sleepHours} ساعات). ما مدى شعورك بالراحة عند الاستيقاظ؟`
      : `استقر نومك حول ${report.recentSummary.sleepHours} ساعات. هل تستيقظ وأنت تشعر بالانتعاش والاستعداد ليومك؟`,
    subtextEn: '1 of 3 · Rest & Recovery',
    subtextAr: '1 من 3 · النوم والراحة',
    options: [
      { labelEn: 'Feeling refreshed and rested', labelAr: 'أشعر بالانتعاش والراحة', score: 0 },
      { labelEn: 'A little tired in the morning', labelAr: 'تعب خفيف في الصباح', score: 1 },
      { labelEn: 'Waking up heavy or unrefreshed', labelAr: 'أستيقظ مثقلاً دون راحة كافية', score: 2 },
      { labelEn: 'Exhausted even after resting', labelAr: 'إرهاق شديد حتى بعد الراحة', score: 3 },
    ],
  };

  const q2: AdaptiveQuestion = {
    id: 'q-appetite',
    domain: 'appetite',
    promptEn:
      'How has your appetite been lately, for example feeling hungry but finding it hard to eat, skipping meals, or feeling stomach tightness?',
    promptAr:
      'كيف كانت شهيتك للطعام مؤخراً، مثل الشعور بالجوع مع صعوبة في الأكل، أو تفويت الوجبات، أو انقباض المعدة؟',
    subtextEn: '2 of 3 · Appetite & Body Signals',
    subtextAr: '2 من 3 · الشهية وإشارات الجسد',
    options: [
      { labelEn: 'Eating normally as usual', labelAr: 'آكل بشكل طبيعي كالمعتاد', score: 0 },
      { labelEn: 'Slightly less appetite than usual', labelAr: 'شهيتي أقل قليلاً من المعتاد', score: 1 },
      {
        labelEn: 'Hungry, but struggling to eat or finishing very little',
        labelAr: 'أشعر بالجوع لكن أجد صعوبة في الأكل',
        score: 2,
      },
      {
        labelEn: 'Barely able to eat or strong stomach tightness',
        labelAr: 'بالكاد أستطيع الأكل أو أشعر بضيق شديد في المعدة',
        score: 3,
      },
    ],
  };

  const q3: AdaptiveQuestion = {
    id: 'q-energy-calm',
    domain: 'movement',
    promptEn:
      'Have low energy, body tension, or a heavy mood made it harder to get through your normal daily routine?',
    promptAr:
      'هل جعل انخفاض الطاقة أو شد الجسد أو ثقل المزاج إكمال روتينك اليومي أصعب من المعتاد؟',
    subtextEn: '3 of 3 · Daily Energy & Emotional Balance',
    subtextAr: '3 من 3 · الطاقة اليومية والتوازن النفسي',
    options: [
      { labelEn: 'No, my energy and mood feel steady', labelAr: 'لا، طاقتي ومزاجي مستقران', score: 0 },
      { labelEn: 'Moving a bit slower than usual', labelAr: 'أتحرك ببطء أكثر قليلاً من المعتاد', score: 1 },
      {
        labelEn: 'Noticeably drained, tense, or overwhelmed',
        labelAr: 'أشعر باستنزاف أو شد أو ضغط واضح',
        score: 2,
      },
      {
        labelEn: 'Struggling to get through everyday tasks',
        labelAr: 'أجد صعوبة كبيرة في إنجاز مهامي اليومية',
        score: 3,
      },
    ],
  };

  return [q1, q2, q3];
}

export async function dispatchSystemWellbeingNotification(
  report: AdlDriftReport,
  onNotificationTap?: () => void
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }

  if (Notification.permission !== 'granted') {
    return false;
  }

  const notif = new Notification(report.notificationTitle, {
    body: report.notificationBody,
    tag: 'mizan-mind-body-drift',
  });

  notif.onclick = () => {
    window.focus();
    notif.close();
    onNotificationTap?.();
  };

  return true;
}