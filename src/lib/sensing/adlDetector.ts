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
  baselineStage: 'Day-1 Self-Anchor' | '7-Day Rolling Baseline' | '14-Day Circadian Baseline';
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

const ADL_STORAGE_KEY = 'mizan_adl_14day_baseline_v2';

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

export function buildInstantAnchorDataset(
  usualSleep = 7.2,
  usualSteps = 6500,
  usualHr = 66,
  anchorTimestamp?: number
): DailyAdlSnapshot[] {
  const days: DailyAdlSnapshot[] = [];
  const now =
    anchorTimestamp ??
    (typeof window !== 'undefined' ? Date.now() : Date.parse('2026-11-18T12:00:00Z'));
  for (let i = 6; i >= 0; i--) {
    days.push({
      date: new Date(now - i * 86400000).toISOString().slice(0, 10),
      steps: Math.round(usualSteps + ((i % 3) - 1) * 300),
      sleepHours: Number((usualSleep + (i % 2 === 0 ? 0.2 : -0.1)).toFixed(1)),
      nightScreenPickups: 1,
      sedentaryMinutes: 350,
      restingHr: usualHr,
      hrvMs: 56,
    });
  }
  return days;
}

export function buildMildDriftDataset(): DailyAdlSnapshot[] {
  const days: DailyAdlSnapshot[] = [];
  const now = typeof window !== 'undefined' ? Date.now() : Date.parse('2026-11-18T12:00:00Z');

  for (let i = 9; i >= 3; i--) {
    days.push({
      date: new Date(now - i * 86400000).toISOString().slice(0, 10),
      steps: 6400,
      sleepHours: 7.2,
      nightScreenPickups: 1,
      sedentaryMinutes: 350,
      restingHr: 66,
      hrvMs: 56,
    });
  }

  for (let i = 2; i >= 0; i--) {
    days.push({
      date: new Date(now - i * 86400000).toISOString().slice(0, 10),
      steps: 4400,
      sleepHours: 5.5,
      nightScreenPickups: 4,
      sedentaryMinutes: 460,
      restingHr: 71,
      hrvMs: 49,
    });
  }

  return days;
}

export function buildSampleDriftDataset(): DailyAdlSnapshot[] {
  const days: DailyAdlSnapshot[] = [];
  const now = typeof window !== 'undefined' ? Date.now() : Date.parse('2026-11-18T12:00:00Z');

  for (let i = 9; i >= 3; i--) {
    days.push({
      date: new Date(now - i * 86400000).toISOString().slice(0, 10),
      steps: 6400 + (i % 3) * 300,
      sleepHours: 7.2,
      nightScreenPickups: 1,
      sedentaryMinutes: 350,
      restingHr: 66,
      hrvMs: 56,
    });
  }

  for (let i = 2; i >= 0; i--) {
    days.push({
      date: new Date(now - i * 86400000).toISOString().slice(0, 10),
      steps: 2500 - i * 150,
      sleepHours: 4.5,
      nightScreenPickups: 6,
      sedentaryMinutes: 540,
      restingHr: 78,
      hrvMs: 36,
    });
  }

  return days;
}

export function evaluateMindBodyAdlDrift(records: DailyAdlSnapshot[]): AdlDriftReport {
  const activeRecords = records.length >= 4 ? records : buildInstantAnchorDataset();

  const baselineStage: AdlDriftReport['baselineStage'] =
    records.length >= 12
      ? '14-Day Circadian Baseline'
      : records.length >= 6
      ? '7-Day Rolling Baseline'
      : 'Day-1 Self-Anchor';

  const baselineDays = activeRecords.slice(0, -3);
  const recentDays = activeRecords.slice(-3);

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / Math.max(arr.length, 1);

  const baseSteps = avg(baselineDays.map((d) => d.steps));
  const recentSteps = avg(recentDays.map((d) => d.steps));
  const stepDropPct = baseSteps > 0 ? Math.round(((baseSteps - recentSteps) / baseSteps) * 100) : 0;

  const baseSleep = avg(baselineDays.map((d) => d.sleepHours));
  const recentSleep = avg(recentDays.map((d) => d.sleepHours));
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
      `Sleep dropped to ${recentSleep.toFixed(1)}h avg (usual ${baseSleep.toFixed(1)}h)`
    );
  }

  let fatigueScore = 0;
  if (stepDropPct >= 25 || recentSedentary >= baseSedentary + 90) {
    driftedDomains.push('movement');
    fatigueScore = stepDropPct >= 40 ? 3 : 2;
    findings.push(
      `Daily movement dropped ${Math.max(stepDropPct, 25)}% (${Math.round(recentSteps).toLocaleString()} steps/day)`
    );
  }

  let tensionScore = 0;
  if (hrvDropPct >= 18 || recentHr >= baseHr + 8) {
    driftedDomains.push('autonomic');
    tensionScore = hrvDropPct >= 28 ? 3 : 2;
    findings.push(`Body recovery strain elevated across the past 3 days`);
  }

  const baselineSummary = {
    sleepHours: Number(baseSleep.toFixed(1)),
    steps: Math.round(baseSteps),
    restingHr: baseHr,
    hrvMs: baseHrv,
  };

  const recentSummary = {
    sleepHours: Number(recentSleep.toFixed(1)),
    steps: Math.round(recentSteps),
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
        ? 'High 3-day shift across sleep, movement, and body recovery'
        : 'Mild shift in your sleep and daily movement over the last 3 days',
      headlineAr: isHighShift
        ? 'تغيّر ملحوظ خلال 3 أيام في النوم والحركة وراحة الجسد'
        : 'تغيّر طفيف في نومك ونشاطك اليومي خلال الأيام الثلاثة الماضية',
      notificationTitle: 'Mizan Care · Daily Rhythm Alert',
      notificationBody: isHighShift
        ? `Significant 3-day shift detected: ${summarySentence}. Tap to book a direct physical consultation.`
        : `Mild shift detected: ${summarySentence}. Tap for a quick 3-question check-in.`,
      findings,
      contextualExplanation: `Over the past 3 days, your sleep (${recentSummary.sleepHours}h vs your usual ${baselineSummary.sleepHours}h) and daily energy rhythm have shifted. Stress and emotional overload often affect sleep, appetite, and physical energy first.`,
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
    headlineEn: 'Your daily sleep, movement, and body recovery look steady',
    headlineAr: 'نومك ونشاطك اليومي وراحة جسدك تبدو مستقرة',
    notificationTitle: 'Mizan Care · Daily Rhythm',
    notificationBody: 'Your movement and sleep remain close to your usual routine.',
    findings,
    contextualExplanation: `Your recent sleep (${recentSummary.sleepHours}h) and daily movement (${recentSummary.steps.toLocaleString()} steps/day) match your usual rhythm.`,
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
      ? `Your sleep averaged ${report.recentSummary.sleepHours} hours lately (down from ${report.baselineSummary.sleepHours} hours). How rested do you feel when you wake up?`
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