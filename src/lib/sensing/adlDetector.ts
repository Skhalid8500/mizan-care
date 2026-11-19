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
  domain: DriftedDomain | 'emotional' | 'safety';
  prompt: string;
  subtext: string;
  options: { label: string; score: number }[];
}

export interface AdlDriftReport {
  driftDetected: boolean;
  severity: 'stable' | 'mild_drift' | 'notable_drift';
  baselineStage: 'Day-1 Self-Anchor' | '7-Day Rolling Baseline' | '14-Day Circadian Baseline';
  driftedDomains: DriftedDomain[];
  headline: string;
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

export function buildInstantAnchorDataset(
  usualSleep = 7.0,
  usualSteps = 6000,
  usualHr = 68,
  anchorTimestamp?: number
): DailyAdlSnapshot[] {
  const days: DailyAdlSnapshot[] = [];
  const now =
    anchorTimestamp ??
    (typeof window !== 'undefined' ? Date.now() : Date.parse('2026-11-18T12:00:00Z'));
  for (let i = 6; i >= 0; i--) {
    days.push({
      date: new Date(now - i * 86400000).toISOString().slice(0, 10),
      steps: Math.round(usualSteps + ((i % 3) - 1) * 350),
      sleepHours: Number((usualSleep + (i % 2 === 0 ? 0.2 : -0.1)).toFixed(1)),
      nightScreenPickups: 1,
      sedentaryMinutes: 360,
      restingHr: usualHr,
      hrvMs: 55,
    });
  }
  return days;
}

export async function readLiveBleHeartRate(): Promise<{ bpm: number; estimatedHrvMs: number } | null> {
  if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
    return null;
  }
  try {
    const nav = navigator as unknown as {
      bluetooth: {
        requestDevice: (opts: { filters: { services: number[] }[] }) => Promise<{
          gatt?: {
            connect: () => Promise<{
              getPrimaryService: (id: number) => Promise<{
                getCharacteristic: (id: number) => Promise<{
                  readValue: () => Promise<DataView>;
                }>;
              }>;
            }>;
          };
        }>;
      };
    };
    const device = await nav.bluetooth.requestDevice({
      filters: [{ services: [0x180d] }],
    });
    const server = await device.gatt?.connect();
    if (!server) return null;
    const service = await server.getPrimaryService(0x180d);
    const char = await service.getCharacteristic(0x2a37);
    const value = await char.readValue();
    const flags = value.getUint8(0);
    const is16Bit = (flags & 0x01) !== 0;
    const bpm = is16Bit ? value.getUint16(1, true) : value.getUint8(1);
    const estimatedHrvMs = Math.max(22, Math.round(115 - bpm * 0.85));
    return { bpm, estimatedHrvMs };
  } catch {
    return null;
  }
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

  const baseHr = Math.round(avg(baselineDays.map((d) => d.restingHr ?? 68)));
  const recentHr = Math.round(avg(recentDays.map((d) => d.restingHr ?? 68)));

  const baseHrv = Math.round(avg(baselineDays.map((d) => d.hrvMs ?? 55)));
  const recentHrv = Math.round(avg(recentDays.map((d) => d.hrvMs ?? 55)));
  const hrvDropPct = baseHrv > 0 ? Math.round(((baseHrv - recentHrv) / baseHrv) * 100) : 0;

  const findings: string[] = [];
  const driftedDomains: DriftedDomain[] = [];

  let sleepScore = 0;
  if (sleepDelta <= -1.2 || recentPickups >= basePickups + 3) {
    driftedDomains.push('sleep');
    sleepScore = sleepDelta <= -2.0 ? 3 : 2;
    findings.push(
      `Sleep & rest shifted (${recentSleep.toFixed(1)}h avg vs your usual ${baseSleep.toFixed(1)}h)`
    );
  }

  let fatigueScore = 0;
  if (stepDropPct >= 25 || recentSedentary >= baseSedentary + 90) {
    driftedDomains.push('movement');
    fatigueScore = stepDropPct >= 40 ? 3 : 2;
    findings.push(
      `Daily physical movement dipped by ${Math.max(stepDropPct, 25)}% (${Math.round(recentSteps).toLocaleString()} steps/day)`
    );
  }

  let tensionScore = 0;
  if (hrvDropPct >= 18 || recentHr >= baseHr + 8) {
    driftedDomains.push('autonomic');
    tensionScore = hrvDropPct >= 28 ? 3 : 2;
    findings.push(
      `Autonomic recovery shifted (HRV ${recentHrv}ms vs ${baseHrv}ms; resting HR ${recentHr} bpm)`
    );
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
    const summarySentence = findings.join('; ');
    return {
      driftDetected: true,
      severity: driftedDomains.length >= 3 ? 'notable_drift' : 'mild_drift',
      baselineStage,
      driftedDomains,
      headline: 'Noticeable shift in your mind–body rhythm over the past 3 days',
      notificationTitle: 'Mizan Companion · Gentle Mind–Body Check-In',
      notificationBody: `Your recent rhythm shifted: ${summarySentence}. Tap for a 30-second reflection.`,
      findings,
      contextualExplanation: `Your recent sleep (${recentSummary.sleepHours}h vs ${baselineSummary.sleepHours}h) and daily rhythm have shifted compared with your usual pattern. These changes can reflect physical exhaustion, work stress, or recovery load—not a medical diagnosis.`,
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
    headline: 'Your physical and daily routine rhythm is steady',
    notificationTitle: 'Mizan Companion · Mind–Body Rhythm',
    notificationBody: 'Your movement, sleep, and recovery remain close to your personal baseline.',
    findings,
    contextualExplanation: `Your recent sleep (${recentSummary.sleepHours}h) and movement (${recentSummary.steps.toLocaleString()} steps/day) align closely with your personal baseline.`,
    baselineSummary,
    recentSummary,
    suggestedPhysicalContext: { sleepDisruption: 0, painOrTension: 0, fatigueOrRoleLimit: 0 },
  };
}

export function generateAdaptiveQuestions(report: AdlDriftReport): AdaptiveQuestion[] {
  const questions: AdaptiveQuestion[] = [];

  if (report.driftedDomains.includes('sleep')) {
    questions.push({
      id: 'q-sleep',
      domain: 'sleep',
      prompt: `Your sleep averaged ${report.recentSummary.sleepHours}h over the last 3 days (down from ${report.baselineSummary.sleepHours}h). How rested have you felt upon waking?`,
      subtext: 'Connecting sleep duration with subjective recovery',
      options: [
        { label: 'Still feeling fairly refreshed', score: 0 },
        { label: 'Slightly sluggish in the morning', score: 1 },
        { label: 'Waking up tired or heavy', score: 2 },
        { label: 'Exhausted even after resting', score: 3 },
      ],
    });
  }

  if (report.driftedDomains.includes('movement')) {
    questions.push({
      id: 'q-movement',
      domain: 'movement',
      prompt: `Your daily movement dipped to ${report.recentSummary.steps.toLocaleString()} steps/day. Has low energy or physical fatigue made daily tasks harder?`,
      subtext: 'Evaluating functional energy & daily activity load',
      options: [
        { label: 'No, energy feels steady', score: 0 },
        { label: 'A little slower than usual', score: 1 },
        { label: 'Noticeably drained during tasks', score: 2 },
        { label: 'Struggling to get through the day', score: 3 },
      ],
    });
  }

  if (report.driftedDomains.includes('autonomic')) {
    questions.push({
      id: 'q-autonomic',
      domain: 'autonomic',
      prompt: `Your wearable recovery markers shifted (HRV ${report.recentSummary.hrvMs}ms). Have you noticed physical tension, tightness, or mental restlessness?`,
      subtext: 'Linking autonomic stress load with somatic tension',
      options: [
        { label: 'Body feels relaxed and calm', score: 0 },
        { label: 'Mild neck/shoulder tightness', score: 1 },
        { label: 'Frequently tense or on edge', score: 2 },
        { label: 'Constant physical tension or racing thoughts', score: 3 },
      ],
    });
  }

  if (questions.length < 3) {
    questions.push({
      id: 'q-emotional',
      domain: 'emotional',
      prompt:
        'Over the past few days, how often have you felt calm, in good spirits, and able to handle daily pressures?',
      subtext: 'Core WHO-5 emotional wellbeing anchor',
      options: [
        { label: 'Most or all of the time', score: 0 },
        { label: 'More than half the time', score: 1 },
        { label: 'Less than half the time', score: 2 },
        { label: 'Rarely or not at all', score: 3 },
      ],
    });
  }

  if (questions.length < 3) {
    questions.push({
      id: 'q-overwhelm',
      domain: 'emotional',
      prompt: 'When you pause right now, how heavy or overwhelming does your current stress feel?',
      subtext: 'Helps Mizan Companion choose the right support intensity',
      options: [
        { label: 'Manageable — just checking in', score: 0 },
        { label: 'A bit stressed, could use a reset', score: 1 },
        { label: 'Heavy — affecting sleep or focus', score: 2 },
        { label: 'Overwhelming — I want human support', score: 3 },
      ],
    });
  }

  return questions.slice(0, 3);
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

export function buildSampleDriftDataset(): DailyAdlSnapshot[] {
  const days: DailyAdlSnapshot[] = [];
  const now = Date.now();

  for (let i = 9; i >= 3; i--) {
    days.push({
      date: new Date(now - i * 86400000).toISOString().slice(0, 10),
      steps: 6100 + (i % 3) * 350,
      sleepHours: 7.1,
      nightScreenPickups: 1,
      sedentaryMinutes: 350,
      restingHr: 68,
      hrvMs: 56,
    });
  }

  for (let i = 2; i >= 0; i--) {
    days.push({
      date: new Date(now - i * 86400000).toISOString().slice(0, 10),
      steps: 2600 - i * 150,
      sleepHours: 4.6,
      nightScreenPickups: 6,
      sedentaryMinutes: 530,
      restingHr: 76,
      hrvMs: 37,
    });
  }

  return days;
}