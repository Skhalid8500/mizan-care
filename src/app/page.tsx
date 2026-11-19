'use client';

import React, { useEffect, useState } from 'react';
import ConsentGate, { ConsentPreferences } from '@/components/ConsentGate';
import MizanCompanion from '@/components/MizanCompanion';
import ResultsAndHandoff from '@/components/ResultsAndHandoff';
import ClinicianPortal from '@/components/ClinicianPortal';
import PublicHealthMonitor from '@/components/PublicHealthMonitor';
import {
  Who5Responses,
  PhysicalContextResponses,
  ExplainableResult,
  HistoricalRecord,
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
  isNativeMobileRuntime,
  loadAdlHistory,
  saveAdlHistory,
  evaluateMindBodyAdlDrift,
  dispatchSystemWellbeingNotification,
  buildSampleDriftDataset,
  buildInstantAnchorDataset,
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
  BellRing,
  Watch,
  Sparkles,
} from 'lucide-react';

type ActivePortal = 'resident' | 'booking_status' | 'support' | 'clinician' | 'monitor';
type ResidentStage = 'consent' | 'companion' | 'results';

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

  const [isNativeApp, setIsNativeApp] = useState(false);
  const [browserSensorEnabled, setBrowserSensorEnabled] = useState(true);
  const [adlReport, setAdlReport] = useState<AdlDriftReport>(() =>
    evaluateMindBodyAdlDrift(buildInstantAnchorDataset())
  );
  const [notificationToast, setNotificationToast] = useState<string | null>(null);

  const [latestAssessment, setLatestAssessment] = useState<{
    who5: Who5Responses;
    physicalContext?: PhysicalContextResponses;
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

  useEffect(() => {
    const native = isNativeMobileRuntime();
    setIsNativeApp(native);

    const existing = loadAdlHistory();
    if (existing.length > 0) {
      setAdlReport(evaluateMindBodyAdlDrift(existing));
    } else {
      const initialAnchor = buildInstantAnchorDataset();
      saveAdlHistory(initialAnchor);
      setAdlReport(evaluateMindBodyAdlDrift(initialAnchor));
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
  }, []);

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
    if (!browserSensorEnabled || typeof window === 'undefined') return;

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const hour = new Date().getHours();
      const today = new Date().toISOString().slice(0, 10);
      const current = loadAdlHistory();
      const idx = current.findIndex((d) => d.date === today);

      if (idx >= 0) {
        if (hour >= 0 && hour <= 4) {
          current[idx].nightScreenPickups += 1;
        }
        current[idx].steps += 120;
      } else {
        current.push({
          date: today,
          steps: 450,
          sleepHours: 7.0,
          nightScreenPickups: hour >= 0 && hour <= 4 ? 1 : 0,
          sedentaryMinutes: 380,
        });
      }
      saveAdlHistory(current);
      setAdlReport(evaluateMindBodyAdlDrift(current));
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [browserSensorEnabled]);

  const handleToggleBrowserSensor = async () => {
    const next = !browserSensorEnabled;
    setBrowserSensorEnabled(next);
    window.localStorage.setItem('mizan_browser_sensor_on', String(next));

    if (next && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  };

  const handleTriggerWellbeingNotification = async () => {
    const sample = buildSampleDriftDataset();
    saveAdlHistory(sample);
    const report = evaluateMindBodyAdlDrift(sample);
    setAdlReport(report);

    const sentSystemNotif = await dispatchSystemWellbeingNotification(report, () => {
      setConsentPrefs((p) => ({ ...p, physicalContextIncluded: true }));
      navigateTo('resident', 'companion');
    });

    setNotificationToast(
      sentSystemNotif
        ? `Sent to device notification tray: "${report.notificationBody}"`
        : report.notificationBody
    );
  };

  const navigateTo = (portal: ActivePortal, stage?: ResidentStage) => {
    setActivePortal(portal);
    if (stage) setResidentStage(stage);
    setMenuOpen(false);
  };

  const handleConsentProceed = (prefs: ConsentPreferences) => {
    setConsentPrefs(prefs);
    setResidentStage('companion');
  };

  const handleWipeVault = async () => {
    await wipeLocalVault();
    setHasVaultData(false);
    setHistory([]);
    alert('All saved records on this device have been permanently erased.');
  };

  const handleCheckInComplete = async (payload: {
    who5: Who5Responses;
    physicalContext?: PhysicalContextResponses;
    result: ExplainableResult;
  }) => {
    setLatestAssessment(payload);
    setResidentStage('results');

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

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-[#FFFEFB]/95 backdrop-blur-xs border-b border-stone-200/80 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigateTo('resident', 'consent')}
            className="flex items-center gap-3 text-left cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-teal-800 text-white flex items-center justify-center font-serif text-lg">
              م
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif font-medium text-stone-900 text-xl tracking-tight">
                  Mizan Care
                </span>
                <span className="text-xs text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200/70">
                  ميزان
                </span>
              </div>
            </div>
          </button>

          <div className="flex items-center gap-2.5">
            {(activePortal !== 'resident' || residentStage !== 'consent') && (
              <button
                type="button"
                onClick={() => navigateTo('resident', 'consent')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-stone-200 bg-white hover:bg-stone-50 text-xs font-medium text-stone-700 transition cursor-pointer"
              >
                <Home className="w-3.5 h-3.5 text-teal-700" />
                Home
              </button>
            )}

            <button
              type="button"
              onClick={() => navigateTo('resident', 'companion')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-teal-50 hover:bg-teal-100 border border-teal-200 text-xs font-semibold text-teal-900 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-700" />
              Mizan Companion
            </button>

            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-expanded={menuOpen}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold transition cursor-pointer"
            >
              {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              <span>Menu</span>
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="border-t border-stone-200 bg-[#FFFEFB] shadow-lg">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <button
                type="button"
                onClick={() => navigateTo('resident', 'companion')}
                className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                  activePortal === 'resident'
                    ? 'bg-teal-50/80 border-teal-700'
                    : 'bg-stone-50/70 border-stone-200 hover:border-teal-500'
                }`}
              >
                <HeartHandshake className="w-5 h-5 text-teal-800 mb-2" />
                <div className="font-semibold text-sm text-stone-900">Mizan Companion</div>
                <p className="text-xs text-stone-600 mt-0.5">
                  Passive rhythm baseline, 3-question check-in &amp; micro-interventions.
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
                    ? 'bg-teal-50/80 border-teal-700'
                    : 'bg-stone-50/70 border-stone-200 hover:border-teal-500'
                }`}
              >
                <CalendarCheck className="w-5 h-5 text-emerald-700 mb-2" />
                <div className="font-semibold text-sm text-stone-900">My Clinic Reply</div>
                <p className="text-xs text-stone-600 mt-0.5">
                  View booking confirmation, join video call &amp; release clinical key.
                </p>
              </button>

              <button
                type="button"
                onClick={() => navigateTo('support')}
                className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                  activePortal === 'support'
                    ? 'bg-teal-50/80 border-teal-700'
                    : 'bg-stone-50/70 border-stone-200 hover:border-teal-500'
                }`}
              >
                <MessageSquareHeart className="w-5 h-5 text-amber-700 mb-2" />
                <div className="font-semibold text-sm text-stone-900">Customer Care</div>
                <p className="text-xs text-stone-600 mt-0.5">
                  24/7 UAE helplines (800-SAKINA, 800-HOPE) &amp; emergency numbers.
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
                  Create a clinic account or sign in to manage your clinic’s bookings.
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
                  Anonymised service wait times &amp; equity metrics.
                </p>
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 md:py-10">
        {activePortal === 'resident' && (
          <>
            {residentStage === 'consent' && (
              <div className="space-y-5">
                {!isNativeApp && (
                  <div className="max-w-3xl mx-auto p-4 rounded-2xl bg-[#FFFEFB] border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 flex items-center justify-center shrink-0 mt-0.5">
                        <Watch className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-stone-900">
                          Phone &amp; Watch Early Mind–Body Detector ({adlReport.baselineStage})
                        </div>
                        <p className="text-[11px] text-stone-600 mt-0.5 leading-relaxed">
                          Tracks personal sleep &amp; movement baselines on-device and invites a
                          30-second Mizan Companion reflection when 3-day drift occurs.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      {browserSensorEnabled && (
                        <button
                          type="button"
                          onClick={handleTriggerWellbeingNotification}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-[11px] font-semibold text-amber-950 cursor-pointer"
                        >
                          <BellRing className="w-3.5 h-3.5 text-amber-700" />
                          Simulate 3-Day Drift
                        </button>
                      )}

                      <button
                        type="button"
                        role="switch"
                        aria-checked={browserSensorEnabled}
                        onClick={handleToggleBrowserSensor}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                          browserSensorEnabled ? 'bg-teal-800' : 'bg-stone-300'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                            browserSensorEnabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                )}

                {(notificationToast || (browserSensorEnabled && adlReport?.driftDetected)) && (
                  <div className="max-w-3xl mx-auto p-4 rounded-2xl bg-stone-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <BellRing className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                          Early Mind–Body Drift Alert
                        </div>
                        <p className="text-xs text-stone-100 leading-relaxed">
                          {notificationToast || adlReport?.notificationBody}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setConsentPrefs((p) => ({ ...p, physicalContextIncluded: true }));
                        setResidentStage('companion');
                      }}
                      className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold shrink-0 cursor-pointer"
                    >
                      Open Mizan Companion
                    </button>
                  </div>
                )}

                <ConsentGate
                  onProceed={handleConsentProceed}
                  onWipeLocalVault={handleWipeVault}
                  hasExistingLocalData={hasVaultData}
                />

                <div className="max-w-3xl mx-auto p-4 rounded-2xl bg-[#FFFEFB] border border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs text-stone-600">
                    Already requested a clinic appointment? Check your confirmation, join your
                    consultation room, or release your clinical key.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (activePin && !lookupPin) setLookupPin(activePin);
                      navigateTo('booking_status');
                    }}
                    className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-900 text-xs font-semibold shrink-0 cursor-pointer"
                  >
                    Check My Clinic Reply
                  </button>
                </div>
              </div>
            )}

            {residentStage === 'companion' && (
              <MizanCompanion
                adlReport={adlReport}
                onReportUpdated={(updatedReport) => setAdlReport(updatedReport)}
                history={history}
                onCompleteAdaptiveCheckIn={(payload) => handleCheckInComplete(payload)}
              />
            )}

            {residentStage === 'results' && latestAssessment && (
              <ResultsAndHandoff
                result={latestAssessment.result}
                who5={latestAssessment.who5}
                physicalContext={latestAssessment.physicalContext}
                history={history}
                onStartNewCheckIn={() => navigateTo('resident', 'companion')}
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
                Whether you need help booking a clinic visit, have a question about how your
                information stays private, or want to speak with someone right away, real support
                is available across the UAE.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl bg-rose-50/70 border border-rose-200 space-y-2.5">
                <div className="font-semibold text-rose-950 text-sm flex items-center gap-2">
                  <PhoneCall className="w-4 h-4 text-rose-700" />
                  24/7 Urgent &amp; Crisis Helplines (UAE)
                </div>
                <p className="text-xs text-stone-700 leading-relaxed">
                  Free, confidential support in Arabic and English at any hour:
                </p>
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
                  Need assistance choosing a clinic, language interpreter, or accessible appointment
                  time in Abu Dhabi, Al Ain, or Al Dhafra?
                </p>
                <div className="text-xs font-medium text-teal-900 pt-1">
                  Toll-Free Care Desk: <strong>800-64926 (MIZAN)</strong> · Daily 8:00 AM – 10:00 PM
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
              Mizan Care supports early self-reflection and connection to care—not a medical
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