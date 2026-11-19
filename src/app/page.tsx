'use client';

import React, { useEffect, useState, useCallback } from 'react';
import ConsentGate, { ConsentPreferences } from '@/components/ConsentGate';
import MizanCompanion from '@/components/MizanCompanion';
import ResultsAndHandoff from '@/components/ResultsAndHandoff';
import ClinicianPortal from '@/components/ClinicianPortal';
import PublicHealthMonitor from '@/components/PublicHealthMonitor';
import {
  Who5Responses,
  PhysicalContextResponses,
  Gad7Responses,
  Phq9Responses,
  ExplainableResult,
  HistoricalRecord,
  evaluateBiopsychosocialTriage,
} from '@/lib/clinical/triage';
import { ClinicianReplyPayload } from '@/lib/handoff/protocol';
import {
  saveEncryptedAssessment,
  loadDecryptedAssessments,
  hasLocalRecords,
  wipeLocalVault,
} from '@/lib/crypto/vault';
import {
  AdlDriftReport,
  DailyAdlSnapshot,
  loadAdlHistory,
  saveAdlHistory,
  evaluateMindBodyAdlDrift,
  dispatchSystemWellbeingNotification,
} from '@/lib/sensing/adlDetector';
import {
  Shield,
  Stethoscope,
  BarChart3,
  Home,
  Menu,
  X,
  PhoneCall,
  HeartHandshake,
  MessageSquareHeart,
  CalendarCheck,
  Video,
  ExternalLink,
  MapPin,
  KeyRound,
  CheckCircle2,
  Moon,
  Activity,
  HeartPulse,
  ArrowRight,
  BellRing,
  SlidersHorizontal,
  Sparkles,
  Lock,
} from 'lucide-react';

type ActivePortal = 'resident' | 'booking_status' | 'support' | 'clinician' | 'monitor';
type ResidentStage = 'consent' | 'companion' | 'results';

function buildCleanExactDataset(usualSleep: number, usualSteps: number): DailyAdlSnapshot[] {
  const now = Date.now();
  const days: DailyAdlSnapshot[] = [];
  for (let i = 6; i >= 0; i--) {
    days.push({
      date: new Date(now - i * 86400000).toISOString().slice(0, 10),
      steps: usualSteps,
      sleepHours: usualSleep,
      nightScreenPickups: 0,
      sedentaryMinutes: 360,
      restingHr: 66,
      hrvMs: 56,
    });
  }
  return days;
}

const INITIAL_SSR_REPORT: AdlDriftReport = {
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

export default function MizanCareApp() {
  const [activePortal, setActivePortal] = useState<ActivePortal>('resident');
  const [residentStage, setResidentStage] = useState<ResidentStage>('consent');
  const [menuOpen, setMenuOpen] = useState(false);

  const [consentPrefs, setConsentPrefs] = useState<ConsentPreferences>({
    localDeviceStorage: false,
    physicalContextIncluded: true,
    anonymousTelemetry: false,
  });

  const [history, setHistory] = useState<HistoricalRecord[]>([]);
  const [hasVaultData, setHasVaultData] = useState(false);

  const [isPersonalized, setIsPersonalized] = useState(false);
  const [personalUsualSleep, setPersonalUsualSleep] = useState<number>(7.0);
  const [personalUsualSteps, setPersonalUsualSteps] = useState<number>(6000);
  const [showCalibrate, setShowCalibrate] = useState(false);

  const [adlReport, setAdlReport] = useState<AdlDriftReport>(INITIAL_SSR_REPORT);

  const [toastAlert, setToastAlert] = useState<{
    title: string;
    body: string;
    severity: 'mild' | 'high';
  } | null>(null);

  const [latestAssessment, setLatestAssessment] = useState<{
    who5: Who5Responses;
    physicalContext?: PhysicalContextResponses;
    gad7?: Gad7Responses;
    phq9?: Phq9Responses;
    result: ExplainableResult;
  } | null>(null);

  const [activePin, setActivePin] = useState('');
  const [activeKey, setActiveKey] = useState('');
  const [lookupPin, setLookupPin] = useState('');
  const [manualKeyInput, setManualKeyInput] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [sharingKeyNow, setSharingKeyNow] = useState(false);

  const [lookupResult, setLookupResult] = useState<{
    found: boolean;
    pin?: string;
    status?: string;
    selectedClinicName?: string;
    clinicianReply?: ClinicianReplyPayload | null;
    keyShared?: boolean;
  } | null>(null);

  const [liveCompletedFollowups, setLiveCompletedFollowups] = useState(0);

  const triggerDirectClinicalConsultation = useCallback(
    (reportToUse: AdlDriftReport, currentHistory: HistoricalRecord[]) => {
      setToastAlert(null);
      const who5: Who5Responses = {
        q1_cheerful: 2,
        q2_calm: 2,
        q3_active: 1,
        q4_rested: 1,
        q5_interested: 2,
      };
      const physicalContext: PhysicalContextResponses = {
        sleepDisruption: reportToUse.suggestedPhysicalContext.sleepDisruption || 3,
        painOrTension: reportToUse.suggestedPhysicalContext.painOrTension || 2,
        fatigueOrRoleLimit: reportToUse.suggestedPhysicalContext.fatigueOrRoleLimit || 3,
      };
      const result = evaluateBiopsychosocialTriage({
        who5,
        physicalContext,
        history: currentHistory,
      });
      result.whatThisMeans.unshift(
        `Automated Early Escalation: ${reportToUse.contextualExplanation}`
      );
      setLatestAssessment({ who5, physicalContext, result });
      setResidentStage('results');
    },
    []
  );

  useEffect(() => {
    const savedCustom = window.localStorage.getItem('mizan_personal_baseline_v1');
    const existing = loadAdlHistory();

    if (savedCustom && existing.length > 0) {
      try {
        const parsed = JSON.parse(savedCustom);
        setPersonalUsualSleep(parsed.sleep ?? 7.0);
        setPersonalUsualSteps(parsed.steps ?? 6000);
        setIsPersonalized(true);
      } catch {
        // ignore parse error
      }
      const report = evaluateMindBodyAdlDrift(existing);
      setAdlReport(report);

      if (report.driftDetected) {
        const isHigh = report.severity === 'notable_drift';
        setToastAlert({
          title: report.notificationTitle,
          body: report.notificationBody,
          severity: isHigh ? 'high' : 'mild',
        });
        dispatchSystemWellbeingNotification(report, () => {
          if (isHigh) {
            triggerDirectClinicalConsultation(report, []);
          } else {
            setToastAlert(null);
            setConsentPrefs((p) => ({ ...p, physicalContextIncluded: true }));
            setResidentStage('companion');
          }
        });
      }
    } else {
      const cleanStart = buildCleanExactDataset(7.0, 0);
      saveAdlHistory(cleanStart);
      setAdlReport(evaluateMindBodyAdlDrift(cleanStart));
    }

    const savedPin = window.localStorage.getItem('mizan_active_pin') || '';
    const savedKey = window.localStorage.getItem('mizan_active_key') || '';
    if (savedPin) {
      setActivePin(savedPin);
      setLookupPin(savedPin);
    }
    if (savedKey) {
      setActiveKey(savedKey);
      setManualKeyInput(savedKey);
    }
  }, [triggerDirectClinicalConsultation]);

  useEffect(() => {
    (async () => {
      const exists = await hasLocalRecords();
      setHasVaultData(exists);
      if (exists) {
        const records = await loadDecryptedAssessments();
        const parsedRecords = records ? JSON.parse(records) : [];
        const mapped = Array.isArray(parsedRecords) ? parsedRecords : [parsedRecords];
        setHistory(
          mapped.map((r: any) => ({
            timestamp: r.timestamp,
            who5Standardized: r.result.who5Standardized,
            physicalLoadScore: r.result.physicalLoadScore ?? 0,
          }))
        );
      }
    })();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let stepAccumulator = 0;

    const handleDeviceMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;
      const magnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
      if (Math.abs(magnitude - 9.8) > 2.2) {
        stepAccumulator += 1;
        if (stepAccumulator >= 10) {
          const today = new Date().toISOString().slice(0, 10);
          const current = loadAdlHistory();
          const idx = current.findIndex((d) => d.date === today);
          if (idx >= 0) {
            current[idx].steps += stepAccumulator;
            saveAdlHistory(current);
            setAdlReport(evaluateMindBodyAdlDrift(current));
          }
          stepAccumulator = 0;
        }
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const hour = new Date().getHours();
      const today = new Date().toISOString().slice(0, 10);
      const current = loadAdlHistory();
      const idx = current.findIndex((d) => d.date === today);

      if (idx >= 0 && hour >= 0 && hour <= 4) {
        current[idx].nightScreenPickups += 1;
        saveAdlHistory(current);
        const updatedReport = evaluateMindBodyAdlDrift(current);
        setAdlReport(updatedReport);

        if (updatedReport.driftDetected) {
          const isHigh = updatedReport.severity === 'notable_drift';
          setToastAlert({
            title: updatedReport.notificationTitle,
            body: updatedReport.notificationBody,
            severity: isHigh ? 'high' : 'mild',
          });
        }
      }
    };

    window.addEventListener('devicemotion', handleDeviceMotion);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('devicemotion', handleDeviceMotion);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const handleSavePersonalBaseline = () => {
    const exactDataset = buildCleanExactDataset(personalUsualSleep, personalUsualSteps);
    saveAdlHistory(exactDataset);
    window.localStorage.setItem(
      'mizan_personal_baseline_v1',
      JSON.stringify({ sleep: personalUsualSleep, steps: personalUsualSteps })
    );
    setIsPersonalized(true);
    setToastAlert(null);
    setAdlReport(evaluateMindBodyAdlDrift(exactDataset));
    setShowCalibrate(false);
  };

  const handleOneTapCheckIn = () => {
    setToastAlert(null);
    setResidentStage('companion');
  };

  const navigateTo = (portal: ActivePortal, stage?: ResidentStage) => {
    setActivePortal(portal);
    if (stage) setResidentStage(stage);
    setMenuOpen(false);
  };

  const handleWipeVault = async () => {
    await wipeLocalVault();
    window.localStorage.removeItem('mizan_personal_baseline_v1');
    const resetZero = buildCleanExactDataset(7.0, 0);
    saveAdlHistory(resetZero);
    setAdlReport(evaluateMindBodyAdlDrift(resetZero));
    setIsPersonalized(false);
    setHasVaultData(false);
    setHistory([]);
    alert('All saved records and baseline data on this device have been permanently erased.');
  };

  const handleCheckInComplete = async (payload: {
    who5: Who5Responses;
    physicalContext?: PhysicalContextResponses;
    gad7?: Gad7Responses;
    phq9?: Phq9Responses;
    result: ExplainableResult;
  }) => {
    setLatestAssessment(payload);
    setResidentStage('results');

    const today = new Date().toISOString().slice(0, 10);
    const current = loadAdlHistory();
    const idx = current.findIndex((d) => d.date === today);
    const sleepImpact = payload.physicalContext?.sleepDisruption ?? 0;
    const energyImpact = payload.physicalContext?.fatigueOrRoleLimit ?? 0;

    if (idx >= 0) {
      if (sleepImpact >= 2) {
        current[idx].sleepHours = Math.max(4.0, Number((current[idx].sleepHours - 1.5).toFixed(1)));
      }
      if (energyImpact >= 2 && current[idx].steps > 0) {
        current[idx].steps = Math.max(1500, Math.round(current[idx].steps * 0.72));
      }
      saveAdlHistory(current);
      setAdlReport(evaluateMindBodyAdlDrift(current));
    }

    const nowIso = new Date().toISOString();
    const newEntry: HistoricalRecord = {
      timestamp: nowIso,
      who5Standardized: payload.result.who5Standardized,
      physicalLoadScore: payload.result.physicalLoadScore ?? 0,
    };

    if (consentPrefs.localDeviceStorage) {
      await saveEncryptedAssessment(
        JSON.stringify({
          id: crypto.randomUUID(),
          timestamp: nowIso,
          ...payload,
        })
      );
      setHasVaultData(true);
      setHistory((prev) => [...prev, newEntry]);
    }
  };

  const handleResidentCheckBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = lookupPin.trim();
    if (!/^\d{6}$/.test(clean)) return;
    setLookupLoading(true);
    try {
      const res = await fetch('/api/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check_reply', pin: clean }),
      });
      const data = await res.json();
      if (data.active) {
        setLookupResult({
          found: true,
          pin: clean,
          status: data.status,
          selectedClinicName: data.selectedClinicName,
          clinicianReply: data.clinicianReply,
          keyShared: Boolean(data.keyShared),
        });
      } else {
        setLookupResult({ found: false });
      }
    } finally {
      setLookupLoading(false);
    }
  };

  const handleReleaseKeyFromReplyPage = async () => {
    if (!lookupResult?.pin) return;
    const keyToRelease = (lookupResult.pin === activePin ? activeKey : '') || manualKeyInput.trim();
    if (!keyToRelease) return;

    setSharingKeyNow(true);
    try {
      const res = await fetch('/api/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'release_key',
          pin: lookupResult.pin,
          keyBase64Url: keyToRelease,
        }),
      });
      if (res.ok) {
        setLookupResult((prev) => (prev ? { ...prev, keyShared: true } : prev));
      }
    } finally {
      setSharingKeyNow(false);
    }
  };

  const sleepDiff = Number(
    (adlReport.baselineSummary.sleepHours - adlReport.recentSummary.sleepHours).toFixed(1)
  );
  const stepsDropPct =
    adlReport.baselineSummary.steps > 0
      ? Math.round(
          ((adlReport.baselineSummary.steps - adlReport.recentSummary.steps) /
            adlReport.baselineSummary.steps) *
            100
        )
      : 0;

  const sleepFillPct = Math.min(
    100,
    Math.round(
      (adlReport.recentSummary.sleepHours / Math.max(adlReport.baselineSummary.sleepHours, 1)) * 100
    )
  );
  const moveFillPct =
    adlReport.baselineSummary.steps > 0
      ? Math.min(
          100,
          Math.round((adlReport.recentSummary.steps / adlReport.baselineSummary.steps) * 100)
        )
      : 0;
  const recoveryFillPct =
    adlReport.severity === 'notable_drift'
      ? 45
      : adlReport.severity === 'mild_drift'
      ? 68
      : 92;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F6F1] text-stone-900">
      {/* Floating Push Notification Banner */}
      {toastAlert && (
        <div className="fixed bottom-5 right-4 left-4 sm:left-auto sm:w-96 z-50 rounded-2xl bg-stone-900/95 backdrop-blur-md text-white p-4 shadow-2xl border border-stone-700/80 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
              <BellRing className="w-4 h-4 shrink-0" />
              <span>{toastAlert.title}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastAlert(null)}
              className="text-stone-400 hover:text-white cursor-pointer"
              aria-label="Close alert"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-stone-200 leading-relaxed">{toastAlert.body}</p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                if (toastAlert.severity === 'high') {
                  triggerDirectClinicalConsultation(adlReport, history);
                } else {
                  handleOneTapCheckIn();
                }
              }}
              className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer transition"
            >
              {toastAlert.severity === 'high' ? 'Book Consultation' : 'Begin Quiet Check-In'}
            </button>
          </div>
        </div>
      )}

      {/* Refined Editorial Header */}
      <header className="bg-[#FFFEFB]/90 backdrop-blur-md border-b border-stone-200/70 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigateTo('resident', 'consent')}
            className="flex items-center gap-3 text-left cursor-pointer shrink-0 group"
          >
            <div className="w-9 h-9 rounded-xl bg-teal-900 text-[#FFFEFB] flex items-center justify-center font-serif text-lg shadow-2xs group-hover:bg-teal-800 transition">
              م
            </div>
            <div className="flex items-center gap-2">
              <span className="font-serif font-medium text-stone-900 text-xl tracking-tight">
                Mizan Care
              </span>
              <span className="text-xs text-teal-900 bg-teal-50/90 px-2.5 py-0.5 rounded-full border border-teal-200/80">
                ميزان
              </span>
            </div>
          </button>

          <div className="flex items-center gap-2 shrink-0">
            {(activePortal !== 'resident' || residentStage !== 'consent') && (
              <button
                type="button"
                onClick={() => navigateTo('resident', 'consent')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-stone-200 bg-white hover:bg-stone-50 text-xs font-medium text-stone-700 transition cursor-pointer"
              >
                <Home className="w-3.5 h-3.5 text-teal-800" />
                Home
              </button>
            )}

            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-expanded={menuOpen}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold transition cursor-pointer shadow-2xs"
            >
              {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              <span>Menu</span>
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="border-t border-stone-200/80 bg-[#FFFEFB] shadow-xl">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <button
                type="button"
                onClick={() => navigateTo('resident', 'companion')}
                className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                  activePortal === 'resident'
                    ? 'bg-teal-50/80 border-teal-800'
                    : 'bg-stone-50/70 border-stone-200 hover:border-teal-600'
                }`}
              >
                <HeartHandshake className="w-5 h-5 text-teal-800 mb-2" />
                <div className="font-semibold text-sm text-stone-900">Mizan Companion</div>
                <p className="text-xs text-stone-600 mt-0.5">
                  3-question check-in &amp; voice-guided relief.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (activePin && !lookupPin) setLookupPin(activePin);
                  navigateTo('booking_status');
                }}
                className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                  activePortal === 'booking_status'
                    ? 'bg-teal-50/80 border-teal-800'
                    : 'bg-stone-50/70 border-stone-200 hover:border-teal-600'
                }`}
              >
                <CalendarCheck className="w-5 h-5 text-emerald-700 mb-2" />
                <div className="font-semibold text-sm text-stone-900">My Clinic Reply</div>
                <p className="text-xs text-stone-600 mt-0.5">
                  Appointment confirmation &amp; clinical key control.
                </p>
              </button>

              <button
                type="button"
                onClick={() => navigateTo('support')}
                className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                  activePortal === 'support'
                    ? 'bg-teal-50/80 border-teal-800'
                    : 'bg-stone-50/70 border-stone-200 hover:border-teal-600'
                }`}
              >
                <MessageSquareHeart className="w-5 h-5 text-amber-700 mb-2" />
                <div className="font-semibold text-sm text-stone-900">Customer Care</div>
                <p className="text-xs text-stone-600 mt-0.5">
                  24/7 UAE helplines (800-SAKINA, 800-HOPE).
                </p>
              </button>

              <button
                type="button"
                onClick={() => navigateTo('clinician')}
                className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                  activePortal === 'clinician'
                    ? 'bg-sky-50 border-sky-800'
                    : 'bg-stone-50/70 border-stone-200 hover:border-sky-700'
                }`}
              >
                <Stethoscope className="w-5 h-5 text-sky-900 mb-2" />
                <div className="font-semibold text-sm text-stone-900">Clinician Portal</div>
                <p className="text-xs text-stone-600 mt-0.5">
                  Manage clinic bookings &amp; encrypted referrals.
                </p>
              </button>

              <button
                type="button"
                onClick={() => navigateTo('monitor')}
                className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                  activePortal === 'monitor'
                    ? 'bg-indigo-50 border-indigo-800'
                    : 'bg-stone-50/70 border-stone-200 hover:border-indigo-700'
                }`}
              >
                <BarChart3 className="w-5 h-5 text-indigo-900 mb-2" />
                <div className="font-semibold text-sm text-stone-900">Health Monitor</div>
                <p className="text-xs text-stone-600 mt-0.5">
                  Anonymised service wait times &amp; equity.
                </p>
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-7 md:py-10">
        {activePortal === 'resident' && (
          <>
            {residentStage === 'consent' && (
              <div className="space-y-6">
                {/* MIZAN INTELLIGENCE — Homepage Centerpiece */}
                <section className="max-w-3xl mx-auto bg-[#FFFEFB] border border-stone-200/90 rounded-[2rem] shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-[#F3F7F5] via-[#FAF8F3] to-[#F5F7F6] px-5 sm:px-7 py-3.5 border-b border-stone-200/70 flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-2 text-xs font-semibold text-teal-950">
                      <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                      <Sparkles className="w-3.5 h-3.5 text-teal-800" />
                      <span>Mizan Intelligence</span>
                      <span className="text-stone-400 font-normal">·</span>
                      <span className="text-teal-800 font-medium">
                        {isPersonalized ? 'Your Personal Baseline' : 'Live Sensing Active'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-stone-500">
                        <Lock className="w-3 h-3 text-teal-700" /> On-Device
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowCalibrate((prev) => !prev)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-950 bg-white hover:bg-teal-50/70 border border-stone-200/90 px-3 py-1 rounded-full transition cursor-pointer"
                      >
                        <SlidersHorizontal className="w-3 h-3 text-teal-800" />
                        {showCalibrate ? 'Done' : 'Personalize Baseline'}
                      </button>
                    </div>
                  </div>

                  <div className="p-5 sm:p-7 space-y-5">
                    {showCalibrate && (
                      <div className="p-4 rounded-2xl bg-[#F4F8F6] border border-teal-200/80 space-y-3.5">
                        <p className="text-xs text-stone-700">
                          Set your current routine so Mizan resets and learns what is normal{' '}
                          <strong>for you</strong>:
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <label className="block bg-white p-3 rounded-xl border border-stone-200/80 text-xs text-stone-800 space-y-1.5">
                            <div className="flex justify-between">
                              <span className="text-stone-500">Usual sleep</span>
                              <span className="font-bold text-teal-900">
                                {personalUsualSleep.toFixed(1)} hrs
                              </span>
                            </div>
                            <input
                              type="range"
                              min={4.0}
                              max={10.0}
                              step={0.5}
                              value={personalUsualSleep}
                              onChange={(e) => setPersonalUsualSleep(Number(e.target.value))}
                              className="w-full accent-teal-800 cursor-pointer"
                            />
                          </label>

                          <label className="block bg-white p-3 rounded-xl border border-stone-200/80 text-xs text-stone-800 space-y-1.5">
                            <div className="flex justify-between">
                              <span className="text-stone-500">Usual movement</span>
                              <span className="font-bold text-teal-900">
                                {personalUsualSteps.toLocaleString()} steps
                              </span>
                            </div>
                            <input
                              type="range"
                              min={1000}
                              max={15000}
                              step={500}
                              value={personalUsualSteps}
                              onChange={(e) => setPersonalUsualSteps(Number(e.target.value))}
                              className="w-full accent-teal-800 cursor-pointer"
                            />
                          </label>
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={handleSavePersonalBaseline}
                            className="px-4 py-1.5 rounded-xl bg-teal-900 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer transition"
                          >
                            Apply My Baseline
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      <h1 className="font-serif text-2xl sm:text-[26px] text-stone-900 leading-snug">
                        Learns what is normal for you, not everyone else.
                      </h1>

                      <div className="rounded-2xl bg-[#FAF8F4] border border-stone-200/80 p-4 text-xs sm:text-sm text-stone-700">
                        {adlReport.driftDetected ? (
                          <ul className="space-y-1.5">
                            {sleepDiff > 0 && (
                              <li className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 shrink-0" />
                                <span>
                                  Sleep decreased by <strong>{sleepDiff} hrs</strong> vs. your
                                  baseline ({adlReport.recentSummary.sleepHours}h vs{' '}
                                  {adlReport.baselineSummary.sleepHours}h).
                                </span>
                              </li>
                            )}
                            {stepsDropPct > 0 && (
                              <li className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 shrink-0" />
                                <span>
                                  Daily movement decreased by <strong>{stepsDropPct}%</strong> (
                                  {adlReport.recentSummary.steps.toLocaleString()} vs{' '}
                                  {adlReport.baselineSummary.steps.toLocaleString()} steps).
                                </span>
                              </li>
                            )}
                            <li className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-teal-700 shrink-0" />
                              <span>
                                Persisted for <strong>3 days</strong>. Mizan asks{' '}
                                <strong>3 targeted questions</strong> to guide your next step.
                              </span>
                            </li>
                          </ul>
                        ) : isPersonalized ? (
                          <p>
                            Your baseline is calibrated to{' '}
                            <strong>{adlReport.baselineSummary.sleepHours}h sleep</strong> and{' '}
                            <strong>
                              {adlReport.baselineSummary.steps.toLocaleString()} steps/day
                            </strong>
                            . Readings are aligned with your routine.
                          </p>
                        ) : (
                          <p>
                            Detecting live movement and recovery on your device (
                            <strong>{adlReport.recentSummary.steps.toLocaleString()} steps</strong>{' '}
                            so far, <strong>{adlReport.recentSummary.restingHr} bpm</strong>).
                            Tap <strong>Personalize Baseline</strong> to set your usual sleep &amp;
                            pace.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* 3 Live Metric Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="p-3.5 rounded-2xl bg-white border border-stone-200/80 space-y-2">
                        <div className="flex items-center justify-between text-xs font-semibold text-stone-700">
                          <span className="inline-flex items-center gap-1.5">
                            <Moon className="w-3.5 h-3.5 text-teal-800" /> Sleep
                          </span>
                          <span className="text-stone-900 font-bold">
                            {adlReport.recentSummary.sleepHours}h
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-stone-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              adlReport.driftedDomains.includes('sleep')
                                ? 'bg-amber-500'
                                : 'bg-teal-700'
                            }`}
                            style={{ width: `${sleepFillPct}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-stone-500">
                          {isPersonalized
                            ? `Baseline: ${adlReport.baselineSummary.sleepHours}h`
                            : `Avg baseline: ${adlReport.baselineSummary.sleepHours}h`}
                        </div>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-white border border-stone-200/80 space-y-2">
                        <div className="flex items-center justify-between text-xs font-semibold text-stone-700">
                          <span className="inline-flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5 text-emerald-700" /> Movement
                          </span>
                          <span className="text-stone-900 font-bold">
                            {adlReport.recentSummary.steps.toLocaleString()}
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-stone-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              adlReport.driftedDomains.includes('movement')
                                ? 'bg-amber-500'
                                : 'bg-emerald-600'
                            }`}
                            style={{ width: `${moveFillPct}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-stone-500">
                          {isPersonalized
                            ? `Baseline: ${adlReport.baselineSummary.steps.toLocaleString()} steps`
                            : 'Live device detection'}
                        </div>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-white border border-stone-200/80 space-y-2">
                        <div className="flex items-center justify-between text-xs font-semibold text-stone-700">
                          <span className="inline-flex items-center gap-1.5">
                            <HeartPulse className="w-3.5 h-3.5 text-sky-700" /> Recovery
                          </span>
                          <span className="text-stone-900 font-bold">
                            {adlReport.severity === 'notable_drift'
                              ? 'High Load'
                              : adlReport.severity === 'mild_drift'
                              ? 'Mild Load'
                              : 'Calm'}
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-stone-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              adlReport.severity === 'notable_drift'
                                ? 'bg-rose-600'
                                : adlReport.severity === 'mild_drift'
                                ? 'bg-amber-500'
                                : 'bg-sky-600'
                            }`}
                            style={{ width: `${recoveryFillPct}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-stone-500">
                          Pulse: {adlReport.recentSummary.restingHr} bpm
                        </div>
                      </div>
                    </div>

                    {/* One-Tap Primary CTA — Begin Quiet Check-In */}
                    {adlReport.severity === 'notable_drift' ? (
                      <div className="p-4 rounded-2xl bg-rose-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <span className="text-xs font-medium text-rose-100">
                          High 3-day shift across all indicators.
                        </span>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => triggerDirectClinicalConsultation(adlReport, history)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white hover:bg-stone-100 text-stone-900 text-xs font-bold cursor-pointer transition"
                          >
                            <Stethoscope className="w-3.5 h-3.5 text-teal-800" />
                            Book Consultation
                          </button>
                          <button
                            type="button"
                            onClick={handleOneTapCheckIn}
                            className="px-3.5 py-2 rounded-xl bg-rose-900 hover:bg-rose-800 border border-rose-700 text-xs font-medium text-rose-100 cursor-pointer transition"
                          >
                            Begin Quiet Check-In
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-1 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <span className="text-xs text-stone-500">
                          3 gentle questions · Takes under 30 seconds
                        </span>
                        <button
                          type="button"
                          onClick={handleOneTapCheckIn}
                          className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-teal-800 hover:bg-teal-900 text-white font-medium text-sm transition shadow-xs cursor-pointer inline-flex items-center justify-center gap-2"
                        >
                          <span>Begin Quiet Check-In</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </section>

                {/* Consent & Privacy Settings */}
                <ConsentGate
                  onChange={(updatedPrefs) => setConsentPrefs(updatedPrefs)}
                  onWipeLocalVault={handleWipeVault}
                  hasExistingLocalData={hasVaultData}
                />

                {/* Existing Booking Quick Access */}
                <div className="max-w-3xl mx-auto p-4 sm:px-6 rounded-2xl bg-[#FFFEFB] border border-stone-200/90 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <span className="text-xs text-stone-600">
                    Already booked an appointment? View confirmation or release your clinical key.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (activePin && !lookupPin) setLookupPin(activePin);
                      navigateTo('booking_status');
                    }}
                    className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-900 text-xs font-semibold shrink-0 cursor-pointer transition"
                  >
                    Check My Clinic Reply
                  </button>
                </div>
              </div>
            )}

            {residentStage === 'companion' && (
              <MizanCompanion
                adlReport={adlReport}
                history={history}
                onCompleteAdaptiveCheckIn={(payload) => handleCheckInComplete(payload)}
                onDirectConsult={() => triggerDirectClinicalConsultation(adlReport, history)}
              />
            )}

            {residentStage === 'results' && latestAssessment && (
              <ResultsAndHandoff
                result={latestAssessment.result}
                who5={latestAssessment.who5}
                physicalContext={latestAssessment.physicalContext}
                gad7={latestAssessment.gad7}
                phq9={latestAssessment.phq9}
                history={history}
                onStartNewCheckIn={() => navigateTo('resident', 'companion')}
                onReinterpretAssessment={(updatedPayload) => setLatestAssessment(updatedPayload)}
                onHandoffCreated={(pin, key) => {
                  setActivePin(pin);
                  setActiveKey(key);
                  setLookupPin(pin);
                  setManualKeyInput(key);
                  window.localStorage.setItem('mizan_active_pin', pin);
                  window.localStorage.setItem('mizan_active_key', key);
                }}
              />
            )}
          </>
        )}

        {activePortal === 'booking_status' && (
          <div className="max-w-2xl mx-auto bg-[#FFFEFB] border border-stone-200 rounded-3xl shadow-xs p-6 md:p-10 space-y-6">
            <div>
              <span className="text-xs font-semibold text-teal-900 bg-teal-50 px-3 py-1 rounded-full">
                Resident Appointment &amp; Key Control
              </span>
              <h1 className="font-serif text-3xl text-stone-900 mt-3">
                Your Clinic Booking &amp; Response
              </h1>
              <p className="text-sm text-stone-600 mt-2 leading-relaxed">
                Enter your 6-digit booking code to view your clinic’s confirmation and release
                your private clinical unlock key whenever you are ready.
              </p>
            </div>

            <form onSubmit={handleResidentCheckBooking} className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                maxLength={6}
                value={lookupPin}
                onChange={(e) => setLookupPin(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter 6-digit booking code"
                className="flex-1 px-4 py-3 rounded-2xl border border-stone-300 font-mono text-base tracking-widest focus:outline-none focus:border-teal-800"
              />
              <button
                type="submit"
                disabled={lookupLoading}
                className="px-6 py-3 rounded-2xl bg-teal-800 hover:bg-teal-900 text-white text-sm font-semibold transition cursor-pointer"
              >
                {lookupLoading ? 'Checking...' : 'Check Booking Status'}
              </button>
            </form>

            {lookupResult && !lookupResult.found && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                No active booking pass was found for that 6-digit code.
              </div>
            )}

            {lookupResult && lookupResult.found && (
              <div className="p-5 rounded-2xl border border-teal-200 bg-teal-50/50 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-bold text-teal-950">
                    {lookupResult.selectedClinicName}
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white border border-teal-200 text-teal-900">
                    {lookupResult.status === 'APPOINTMENT_SCHEDULED'
                      ? 'Booked & Confirmed ✓'
                      : lookupResult.status === 'FOLLOWUP_COMPLETED'
                      ? 'Session Completed ✓'
                      : 'Awaiting Clinic Confirmation'}
                  </span>
                </div>

                {!lookupResult.clinicianReply ? (
                  <p className="text-xs text-stone-600 leading-relaxed">
                    Your booking request is active and awaiting confirmation by the clinic team.
                  </p>
                ) : (
                  <div className="space-y-3 bg-white p-4 rounded-xl border border-teal-200/80">
                    <div>
                      <div className="font-bold text-stone-900 text-sm">
                        {lookupResult.clinicianReply.clinicianName} ·{' '}
                        {lookupResult.clinicianReply.clinicName}
                      </div>
                      <div className="text-xs text-emerald-700 font-semibold mt-0.5">
                        Confirmed Time: {lookupResult.clinicianReply.confirmedTime} (
                        {lookupResult.clinicianReply.consultationMode})
                      </div>
                    </div>

                    <p className="text-xs text-stone-700 bg-stone-50 p-3 rounded-lg border border-stone-200 leading-relaxed">
                      &ldquo;{lookupResult.clinicianReply.message}&rdquo;
                    </p>

                    {lookupResult.clinicianReply.consultationMode === 'Video Consultation' &&
                      lookupResult.clinicianReply.meetingRoomUrl && (
                        <a
                          href={lookupResult.clinicianReply.meetingRoomUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-900 text-white text-xs font-semibold transition"
                        >
                          <Video className="w-4 h-4" />
                          Join Private Online Consultation Room
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}

                    {lookupResult.clinicianReply.consultationMode === 'In-Person Visit' &&
                      lookupResult.clinicianReply.clinicLocation && (
                        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700">
                          <MapPin className="w-4 h-4 text-teal-700" />
                          Location: {lookupResult.clinicianReply.clinicLocation}
                        </div>
                      )}
                  </div>
                )}

                <div className="p-4 rounded-xl bg-stone-900 text-white space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-semibold text-teal-300 flex items-center gap-1.5">
                      <KeyRound className="w-4 h-4" />
                      Clinical Reflection Unlock Key
                    </span>
                    {lookupResult.keyShared && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Shared with Clinician ✓
                      </span>
                    )}
                  </div>

                  {lookupResult.keyShared ? (
                    <p className="text-xs text-stone-300 leading-relaxed">
                      You have released your unlock key for this booking. Your clinician can now
                      decrypt and review your wellbeing reflection during your consultation.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-stone-300 leading-relaxed">
                        Your clinical scores remain locked until you tap the button below to
                        share your key with your clinician.
                      </p>

                      {!(lookupResult.pin === activePin && activeKey) && (
                        <input
                          type="text"
                          value={manualKeyInput}
                          onChange={(e) => setManualKeyInput(e.target.value)}
                          placeholder="Paste your Private Unlock Key"
                          className="w-full px-3 py-2 rounded-lg bg-stone-800 border border-stone-700 font-mono text-xs text-teal-200"
                        />
                      )}

                      <button
                        type="button"
                        disabled={
                          sharingKeyNow ||
                          (!(lookupResult.pin === activePin && activeKey) &&
                            !manualKeyInput.trim())
                        }
                        onClick={handleReleaseKeyFromReplyPage}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        {sharingKeyNow
                          ? 'Sharing Key...'
                          : 'Share My Clinical Key with Clinician Now'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activePortal === 'support' && (
          <div className="max-w-3xl mx-auto bg-[#FFFEFB] border border-stone-200 rounded-3xl shadow-xs p-6 md:p-10 space-y-6">
            <div>
              <span className="text-xs font-semibold text-teal-900 bg-teal-50 px-3 py-1 rounded-full">
                Resident Support &amp; Direct Helplines
              </span>
              <h1 className="font-serif text-3xl text-stone-900 mt-3">
                Customer Care &amp; Immediate Human Support
              </h1>
              <p className="text-sm text-stone-600 mt-2 leading-relaxed">
                Free, confidential support in Arabic and English across the UAE.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl bg-rose-50/70 border border-rose-200 space-y-2.5">
                <div className="font-semibold text-rose-950 text-sm flex items-center gap-2">
                  <PhoneCall className="w-4 h-4 text-rose-700" />
                  24/7 Urgent &amp; Crisis Helplines (UAE)
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <a
                    href="tel:800725462"
                    className="px-3.5 py-2 rounded-xl bg-teal-800 text-white text-xs font-semibold"
                  >
                    800-SAKINA (800-725462)
                  </a>
                  <a
                    href="tel:8004673"
                    className="px-3.5 py-2 rounded-xl bg-teal-700 text-white text-xs font-semibold"
                  >
                    800-HOPE (800-4673)
                  </a>
                  <a
                    href="tel:998"
                    className="px-3.5 py-2 rounded-xl bg-rose-700 text-white text-xs font-semibold"
                  >
                    Ambulance 998
                  </a>
                  <a
                    href="tel:999"
                    className="px-3.5 py-2 rounded-xl bg-rose-800 text-white text-xs font-semibold"
                  >
                    Police 999
                  </a>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
                <div className="font-semibold text-stone-900 text-sm flex items-center gap-2">
                  <MessageSquareHeart className="w-4 h-4 text-teal-800" />
                  Mizan Care Navigation Desk
                </div>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Assistance choosing a clinic or interpreter in Abu Dhabi, Al Ain, or Al Dhafra.
                </p>
                <div className="text-xs font-medium text-teal-900 pt-1">
                  Toll-Free Care Desk: <strong>800-64926 (MIZAN)</strong> · 8:00 AM – 10:00 PM
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => navigateTo('resident', 'companion')}
                className="px-6 py-3 rounded-2xl bg-teal-800 hover:bg-teal-900 text-white text-xs font-semibold transition cursor-pointer"
              >
                Open Mizan Companion
              </button>
            </div>
          </div>
        )}

        {activePortal === 'clinician' && (
          <ClinicianPortal
            onClosedLoopCompleted={(_, status) => {
              if (status === 'FOLLOWUP_COMPLETED') {
                setLiveCompletedFollowups((c) => c + 1);
              }
            }}
          />
        )}

        {activePortal === 'monitor' && (
          <PublicHealthMonitor liveCompletedFollowups={liveCompletedFollowups} />
        )}
      </main>

      <footer className="bg-[#FFFEFB] border-t border-stone-200/80 mt-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-stone-500">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-teal-700 shrink-0" />
            <span>
              Mizan Care supports early self-reflection and connection to care, not a medical
              diagnosis.
            </span>
          </div>

          <button
            type="button"
            onClick={() => navigateTo('support')}
            className="text-xs font-medium text-stone-600 hover:text-teal-800 underline underline-offset-4 cursor-pointer"
          >
            Customer Care &amp; 24/7 Helplines
          </button>
        </div>
      </footer>
    </div>
  );
}