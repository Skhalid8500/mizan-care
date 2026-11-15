// src/lib/sensing/adlDetector.ts

export interface DailyAdlSnapshot {
  date: string;
  steps: number;
  sleepHours: number;
  nightScreenPickups: number;
  sedentaryMinutes: number;
  restingHr?: number; // Populated automatically when paired with a smartwatch
  hrvMs?: number;     // Populated automatically when paired with a smartwatch
}

export interface AdlDriftReport {
  driftDetected: boolean;
  severity: 'stable' | 'mild_drift' | 'notable_drift';
  headline: string;
  notificationTitle: string;
  notificationBody: string;
  findings: string[];
  suggestedPhysicalContext: {
    sleepDisruption: number;
    painOrTension: number;
    fatigueOrRoleLimit: number;
  };
}

const ADL_STORAGE_KEY = 'mizan_adl_14day_baseline_v1';

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
 * Evaluates the last 3-4 days against the person's own 14-day physical & behavioral baseline.
 * Never diagnoses; generates a clear human summary for the phone/watch notification.
 */
export function evaluateMindBodyAdlDrift(records: DailyAdlSnapshot[]): AdlDriftReport {
  if (records.length < 5) {
    return {
      driftDetected: false,
      severity: 'stable',
      headline: 'Learning your personal daily rhythm',
      notificationTitle: 'Mizan Care · Mind–Body Rhythm',
      notificationBody: 'Your daily movement and sleep baseline looks steady.',
      findings: [],
      suggestedPhysicalContext: { sleepDisruption: 0, painOrTension: 0, fatigueOrRoleLimit: 0 },
    };
  }

  const baselineDays = records.slice(0, -3);
  const recentDays = records.slice(-3);

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

  const recentHrvDays = recentDays.filter((d) => typeof d.hrvMs === 'number');
  const baseHrvDays = baselineDays.filter((d) => typeof d.hrvMs === 'number');
  const hrvDropPct =
    recentHrvDays.length > 0 && baseHrvDays.length > 0
      ? Math.round(
          ((avg(baseHrvDays.map((d) => d.hrvMs!)) - avg(recentHrvDays.map((d) => d.hrvMs!))) /
            avg(baseHrvDays.map((d) => d.hrvMs!))) *
            100
        )
      : 0;

  const findings: string[] = [];
  let domainsShifted = 0;

  // 1. Sleep & Night Rest Domain
  let sleepScore = 0;
  if (sleepDelta <= -1.2 || recentPickups >= basePickups + 3) {
    domainsShifted += 1;
    sleepScore = sleepDelta <= -2.0 ? 3 : 2;
    findings.push(
      `Sleep & rest shifted (${recentSleep.toFixed(1)}h avg vs your usual ${baseSleep.toFixed(1)}h)`
    );
  }

  // 2. Physical Movement & Mobility Domain
  let fatigueScore = 0;
  if (stepDropPct >= 25 || recentSedentary >= baseSedentary + 90) {
    domainsShifted += 1;
    fatigueScore = stepDropPct >= 40 ? 3 : 2;
    findings.push(
      `Daily physical movement dipped by ${Math.max(stepDropPct, 25)}% (${Math.round(recentSteps).toLocaleString()} steps/day)`
    );
  }

  // 3. Smartwatch Autonomic Stress / Tension Domain (HRV / Resting HR)
  let tensionScore = 0;
  if (hrvDropPct >= 18) {
    domainsShifted += 1;
    tensionScore = hrvDropPct >= 28 ? 3 : 2;
    findings.push(`Smartwatch recovery (HRV) dropped ${hrvDropPct}% during rest`);
  }

  if (domainsShifted >= 2) {
    const summarySentence = findings.join('; ');
    return {
      driftDetected: true,
      severity: domainsShifted >= 3 ? 'notable_drift' : 'mild_drift',
      headline: 'Noticeable shift in your physical & daily rhythm over the past 3 days',
      notificationTitle: 'Mizan Care · Mind & Body Check-In',
      notificationBody: `We noticed a change in your daily rhythm: ${summarySentence}. Tap to take a quiet 60-second check-in.`,
      findings,
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
    headline: 'Your physical and daily routine rhythm is steady',
    notificationTitle: 'Mizan Care · Mind & Body Rhythm',
    notificationBody: 'Your movement and sleep patterns remain close to your personal baseline.',
    findings,
    suggestedPhysicalContext: { sleepDisruption: 0, painOrTension: 0, fatigueOrRoleLimit: 0 },
  };
}

/**
 * Dispatches a real system notification on phone, smartwatch (paired via OS notification mirroring),
 * or desktop browser so the user sees what is happening directly in the notification tray.
 */
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

/**
 * Generates a realistic 10-day baseline + 3-day Mind-Body drift dataset
 * so users/reviewers can immediately experience the phone/watch notification report.
 */
export function buildSampleDriftDataset(): DailyAdlSnapshot[] {
  const days: DailyAdlSnapshot[] = [];
  const now = Date.now();

  // 7 baseline days (healthy personal rhythm)
  for (let i = 9; i >= 3; i--) {
    days.push({
      date: new Date(now - i * 86400000).toISOString().slice(0, 10),
      steps: 7800 + (i % 3) * 450,
      sleepHours: 7.4,
      nightScreenPickups: 1,
      sedentaryMinutes: 360,
      restingHr: 64,
      hrvMs: 56,
    });
  }

  // Last 3 days (subtle physical + behavioral drift: shorter sleep, lower movement, lower HRV)
  for (let i = 2; i >= 0; i--) {
    days.push({
      date: new Date(now - i * 86400000).toISOString().slice(0, 10),
      steps: 4100 - i * 200,
      sleepHours: 5.1,
      nightScreenPickups: 6,
      sedentaryMinutes: 520,
      restingHr: 74,
      hrvMs: 38,
    });
  }

  return days;
}