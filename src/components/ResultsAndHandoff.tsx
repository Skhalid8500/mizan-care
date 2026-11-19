'use client';

import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  ExplainableResult,
  Who5Responses,
  PhysicalContextResponses,
  Gad7Responses,
  Phq9Responses,
  HistoricalRecord,
  SupportTier,
  evaluateBiopsychosocialTriage,
} from '@/lib/clinical/triage';
import {
  AuthorizedShareScope,
  AuthorizedClinicalSummary,
  GeneratedHandoffCredential,
  ClinicianReplyPayload,
  createEncryptedHandoffPackage,
} from '@/lib/handoff/protocol';
import { CLINIC_DIRECTORY } from '@/data/clinics';
import CrisisSafetyBanner from './CrisisSafetyBanner';
import {
  Shield,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Copy,
  Check,
  Building2,
  Clock,
  Globe2,
  RotateCcw,
  Video,
  Users,
  HeartHandshake,
  PhoneCall,
  RefreshCw,
  ExternalLink,
  CalendarCheck,
  MapPin,
  KeyRound,
  PlusCircle,
} from 'lucide-react';

interface ResultsAndHandoffProps {
  result: ExplainableResult;
  who5: Who5Responses;
  physicalContext?: PhysicalContextResponses;
  gad7?: Gad7Responses;
  phq9?: Phq9Responses;
  history: HistoricalRecord[];
  onStartNewCheckIn: () => void;
  onReinterpretAssessment?: (updated: {
    who5: Who5Responses;
    physicalContext?: PhysicalContextResponses;
    gad7?: Gad7Responses;
    phq9?: Phq9Responses;
    result: ExplainableResult;
  }) => void;
  onHandoffCreated?: (pin: string, keyBase64Url: string) => void;
}

const SELF_GUIDED_EXERCISES = [
  {
    id: 'ex-breathing',
    title: 'Slow Paced Breathing Reset',
    duration: '2 mins · Nervous System Calm',
    videoSrc: '/media/breathing-demo.mp4',
    cues: [
      'Sit comfortably with both feet flat on the floor and shoulders dropped.',
      'Breathe in gently through your nose for 4 seconds, pause for 4 seconds.',
      'Exhale slowly through your mouth for 6 seconds to signal safety to your body.',
    ],
  },
  {
    id: 'ex-neck',
    title: 'Neck & Upper-Shoulder Tension Release',
    duration: '3 mins · Desk & Stress Relief',
    videoSrc: '/media/neck-release.mp4',
    cues: [
      'Slowly tilt your right ear toward your right shoulder without lifting the left shoulder.',
      'Hold for 15 seconds while breathing softly, then return to center and switch sides.',
      'Finish with 5 slow backward shoulder rolls to ease upper-back tightness.',
    ],
  },
  {
    id: 'ex-posture',
    title: 'Seated Chest & Posture Opening',
    duration: '2 mins · Energy & Shallow Breathing',
    videoSrc: '/media/posture-stretch.mp4',
    cues: [
      'Clasp your hands gently behind your head or lower back while seated tall.',
      'Open your elbows wide and lift your chest slightly as you take a full breath in.',
      'Relax your arms down on the exhale; repeat 4 times to counter desk fatigue.',
    ],
  },
  {
    id: 'ex-winddown',
    title: 'Evening Screen-Free Wind-Down',
    duration: '10 mins · Sleep Recovery',
    videoSrc: '/media/breathing-demo.mp4',
    cues: [
      'Dim room lights and silence non-urgent notifications 30 minutes before bed.',
      'Unclench your jaw, drop your shoulders, and let your hands rest open.',
      'Write down tomorrow’s single top priority on paper so your mind can let go.',
    ],
  },
];

const WHO5_MODULE_PROMPTS = [
  'I have felt cheerful and in good spirits',
  'I have felt calm and relaxed',
  'I have felt active and vigorous',
  'I woke up feeling fresh and rested',
  'My daily life has been filled with things that interest me',
];

const GAD7_MODULE_PROMPTS = [
  'Feeling nervous, anxious, or on edge',
  'Not being able to stop or control worrying',
  'Worrying too much about different things',
  'Trouble relaxing',
  'Being so restless that it is hard to sit still',
  'Becoming easily annoyed or irritable',
  'Feeling afraid, as if something awful might happen',
];

const PHQ9_MODULE_PROMPTS = [
  'Little interest or pleasure in doing things',
  'Feeling down, depressed, or hopeless',
  'Trouble falling or staying asleep, or sleeping too much',
  'Feeling tired or having little energy',
  'Poor appetite or overeating',
  'Feeling bad about yourself — or that you are a failure',
  'Trouble concentrating on things',
  'Moving or speaking slowly, or being unusually fidgety/restless',
  'Thoughts that you would be better off dead, or of hurting yourself in some way',
];

export default function ResultsAndHandoff({
  result,
  who5,
  physicalContext,
  gad7,
  phq9,
  history,
  onStartNewCheckIn,
  onReinterpretAssessment,
  onHandoffCreated,
}: ResultsAndHandoffProps) {
  const [activePathway, setActivePathway] = useState<SupportTier>(result.tier);

  const [openModule, setOpenModule] = useState<'who5' | 'gad7' | 'phq9' | null>(null);
  const [who5Draft, setWho5Draft] = useState<number[]>([
    who5.q1_cheerful,
    who5.q2_calm,
    who5.q3_active,
    who5.q4_rested,
    who5.q5_interested,
  ]);
  const [gad7Draft, setGad7Draft] = useState<number[]>(gad7?.items ?? [0, 0, 0, 0, 0, 0, 0]);
  const [phq9Draft, setPhq9Draft] = useState<number[]>(
    phq9?.items ?? [0, 0, 0, 0, 0, 0, 0, 0, 0]
  );
  const [completedModules, setCompletedModules] = useState<{
    who5: boolean;
    gad7: boolean;
    phq9: boolean;
  }>({
    who5: false,
    gad7: Boolean(gad7),
    phq9: Boolean(phq9),
  });

  const defaultClinic =
    CLINIC_DIRECTORY.find((c) => c.tier === result.tier) || CLINIC_DIRECTORY[0];
  const [selectedClinicId, setSelectedClinicId] = useState<string>(defaultClinic.id);
  const [consultationMode, setConsultationMode] = useState<
    'Video Consultation' | 'In-Person Visit'
  >(defaultClinic.consultationModes[0]);
  const [residentNote, setResidentNote] = useState('');

  const [shareScope, setShareScope] = useState<AuthorizedShareScope>({
    includeWho5: true,
    includePhysicalContext: Boolean(physicalContext),
    includeGad7: Boolean(gad7),
    includePhq9: Boolean(phq9),
    includePreferredLanguage: true,
  });
  const [preferredLanguage, setPreferredLanguage] = useState('Arabic / English');

  const [credential, setCredential] = useState<GeneratedHandoffCredential | null>(null);
  const [isGeneratingHandoff, setIsGeneratingHandoff] = useState(false);
  const [handoffSyncNotice, setHandoffSyncNotice] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);

  const [keySharedInPortal, setKeySharedInPortal] = useState(false);
  const [sharingKey, setSharingKey] = useState(false);

  const [clinicianReply, setClinicianReply] = useState<ClinicianReplyPayload | null>(null);
  const [referralStatus, setReferralStatus] = useState<string>('GENERATED');
  const [checkingReply, setCheckingReply] = useState(false);
  const [reservedCircle, setReservedCircle] = useState(false);

  const pathwaySectionRef = React.useRef<HTMLDivElement>(null);

  const selectedClinic =
    CLINIC_DIRECTORY.find((c) => c.id === selectedClinicId) || CLINIC_DIRECTORY[0];

  const handleSaveModuleAndReinterpret = (moduleKey: 'who5' | 'gad7' | 'phq9') => {
    const nextCompleted = { ...completedModules, [moduleKey]: true };
    setCompletedModules(nextCompleted);

    const nextWho5: Who5Responses = nextCompleted.who5
      ? {
          q1_cheerful: who5Draft[0] ?? 3,
          q2_calm: who5Draft[1] ?? 3,
          q3_active: who5Draft[2] ?? 3,
          q4_rested: who5Draft[3] ?? 3,
          q5_interested: who5Draft[4] ?? 3,
        }
      : who5;

    const nextGad7: Gad7Responses | undefined = nextCompleted.gad7
      ? {
          items: [
            gad7Draft[0] ?? 0,
            gad7Draft[1] ?? 0,
            gad7Draft[2] ?? 0,
            gad7Draft[3] ?? 0,
            gad7Draft[4] ?? 0,
            gad7Draft[5] ?? 0,
            gad7Draft[6] ?? 0,
          ],
        }
      : gad7;

    const nextPhq9: Phq9Responses | undefined = nextCompleted.phq9
      ? {
          items: [
            phq9Draft[0] ?? 0,
            phq9Draft[1] ?? 0,
            phq9Draft[2] ?? 0,
            phq9Draft[3] ?? 0,
            phq9Draft[4] ?? 0,
            phq9Draft[5] ?? 0,
            phq9Draft[6] ?? 0,
            phq9Draft[7] ?? 0,
            phq9Draft[8] ?? 0,
          ],
        }
      : phq9;

    const recalculated = evaluateBiopsychosocialTriage({
      who5: nextWho5,
      physicalContext,
      gad7: nextGad7,
      phq9: nextPhq9,
      history,
    });

    setShareScope((prev) => ({
      ...prev,
      includeGad7: Boolean(nextGad7),
      includePhq9: Boolean(nextPhq9),
    }));
    setActivePathway(recalculated.tier);
    setOpenModule(null);

    onReinterpretAssessment?.({
      who5: nextWho5,
      physicalContext,
      gad7: nextGad7,
      phq9: nextPhq9,
      result: recalculated,
    });
  };

  const handleSelectClinic = (clinicId: string) => {
    setSelectedClinicId(clinicId);
    const found = CLINIC_DIRECTORY.find((c) => c.id === clinicId);
    if (found && !found.consultationModes.includes(consultationMode)) {
      setConsultationMode(found.consultationModes[0]);
    }
  };

  const handleGenerateHandoff = async () => {
    setIsGeneratingHandoff(true);
    setHandoffSyncNotice(null);
    setRevoked(false);
    setClinicianReply(null);
    setKeySharedInPortal(false);

    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

      const scopeLabels: string[] = [];
      if (shareScope.includeWho5) scopeLabels.push('Wellbeing Summary');
      if (shareScope.includePhysicalContext && physicalContext)
        scopeLabels.push('Sleep, Appetite & Body Comfort');
      if (shareScope.includeGad7 && result.gad7Total !== null) scopeLabels.push('Worry Check-In');
      if (shareScope.includePhq9 && result.phq9Total !== null) scopeLabels.push('Mood Check-In');
      if (shareScope.includePreferredLanguage) scopeLabels.push('Language Preference');

      const summary: AuthorizedClinicalSummary = {
        createdAt: now.toISOString(),
        expiresAt,
        recommendedTier: result.tier,
        tierLabel: result.tierLabel,
        referralReason: result.whatThisMeans.join(' '),
        consentScope: scopeLabels,
        ...(shareScope.includeWho5 ? { who5Standardized: result.who5Standardized } : {}),
        ...(shareScope.includePhysicalContext && physicalContext
          ? {
              physicalLoadScore: result.physicalLoadScore,
              physicalBreakdown: physicalContext,
            }
          : {}),
        ...(shareScope.includeGad7 && result.gad7Total !== null
          ? { gad7Total: result.gad7Total }
          : {}),
        ...(shareScope.includePhq9 && result.phq9Total !== null
          ? {
              phq9Total: result.phq9Total,
              phq9Item9Positive: result.phq9Item9Positive,
            }
          : {}),
        ...(shareScope.includePreferredLanguage ? { preferredLanguage } : {}),
        selectedClinicId: selectedClinic.id,
        selectedProviderName: `${selectedClinic.name} (${selectedClinic.leadClinician})`,
        preferredConsultationMode: consultationMode,
        ...(residentNote.trim() ? { residentNote: residentNote.trim() } : {}),
      };

      // 1. Encrypt client-side first and immediately render the 6-digit PIN + Key so mobile browsers never lose it
      const { credential: generated, serverPayload } = await createEncryptedHandoffPackage(summary);
      setCredential(generated);
      setReferralStatus('GENERATED');
      onHandoffCreated?.(generated.pin, generated.keyBase64Url);

      // 2. Transmit encrypted blob to /api/handoff with mobile-safe retry
      const postBody = JSON.stringify({
        action: 'create',
        ...serverPayload,
        selectedClinicId: selectedClinic.id,
        selectedClinicName: selectedClinic.name,
        consultationMode,
      });

      const sendToServer = async () => {
        const res = await fetch('/api/handoff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: postBody,
        });
        if (!res.ok) {
          throw new Error('Server sync pending');
        }
      };

      try {
        await sendToServer();
      } catch {
        // Automatic single retry for mobile Safari transient network hiccups
        try {
          await new Promise((r) => setTimeout(r, 600));
          await sendToServer();
        } catch {
          setHandoffSyncNotice(
            'Your booking code and private key are saved above. If your connection paused, tap "Check Clinic Reply" in a moment to confirm sync.'
          );
        }
      }
    } finally {
      setIsGeneratingHandoff(false);
    }
  };

  const handleShareKeyWithClinician = async () => {
    if (!credential) return;
    setSharingKey(true);
    try {
      const res = await fetch('/api/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          action: 'release_key',
          pin: credential.pin,
          keyBase64Url: credential.keyBase64Url,
        }),
      });
      if (res.ok) {
        setKeySharedInPortal(true);
      }
    } finally {
      setSharingKey(false);
    }
  };

  const handleCheckClinicianReply = async () => {
    if (!credential) return;
    setCheckingReply(true);
    setHandoffSyncNotice(null);
    try {
      const res = await fetch('/api/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check_reply', pin: credential.pin }),
      });
      const data = await res.json();
      if (data.active) {
        setReferralStatus(data.status || 'GENERATED');
        if (data.clinicianReply) {
          setClinicianReply(data.clinicianReply);
        }
        if (data.keyShared) {
          setKeySharedInPortal(true);
        }
      }
    } finally {
      setCheckingReply(false);
    }
  };

  const handleRevokeHandoff = async () => {
    if (!credential) return;
    try {
      await fetch('/api/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke', pin: credential.pin }),
      });
    } catch {
      // Clear local credential regardless
    }
    setRevoked(true);
    setCredential(null);
    setClinicianReply(null);
    setKeySharedInPortal(false);
  };

  const copyPinAndKey = () => {
    if (!credential) return;
    navigator.clipboard?.writeText(`PIN: ${credential.pin} | KEY: ${credential.keyBase64Url}`);
    setCopiedPin(true);
    setTimeout(() => setCopiedPin(false), 2500);
  };

  const chartData = history.map((h) => ({
    date: new Date(h.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    who5: h.who5Standardized,
  }));

  const humanTierHeadline =
    result.tier === 4
      ? 'Reaching out to a trained professional today is the safest next step.'
      : result.tier === 3
      ? 'Speaking with a doctor or counselor could offer real relief right now.'
      : result.tier === 2
      ? 'A supportive peer circle or guided recovery routine fits well right now.'
      : 'Your reflection shows steady ground, gentle daily habits can help keep it that way.';

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {(result.tier === 4 || result.phq9Item9Positive) && (
        <CrisisSafetyBanner
          phq9Item9Positive={result.phq9Item9Positive}
          onProceedToHumanHandoff={() => {
            setActivePathway(4);
            pathwaySectionRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
        />
      )}

      {/* 1. Warm Reflection Summary */}
      <div className="bg-[#FFFEFB] border border-stone-200 rounded-3xl shadow-xs p-6 md:p-9">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-6 mb-6 border-b border-stone-100">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-teal-50 text-teal-900 border border-teal-200/80">
              Your Personal Reflection
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl text-stone-900 mt-2.5 leading-snug">
              {humanTierHeadline}
            </h2>
          </div>

          <button
            type="button"
            onClick={onStartNewCheckIn}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-stone-200 text-xs font-medium text-stone-600 hover:bg-stone-50 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Check In Again
          </button>
        </div>

        {/* 4 Score Cards (Interactive: Tap to Complete Optional Sections Independently) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-6">
          <button
            type="button"
            onClick={() => setOpenModule(openModule === 'who5' ? null : 'who5')}
            className="p-4 rounded-2xl bg-teal-50/60 border border-teal-200 hover:border-teal-600 text-left transition cursor-pointer"
          >
            <div className="text-xs font-medium text-teal-900 flex items-center justify-between">
              <span>Overall Wellbeing</span>
              <PlusCircle className="w-3.5 h-3.5 text-teal-700" />
            </div>
            <div className="text-2xl font-bold text-stone-900 mt-1">
              {result.who5Standardized}
              <span className="text-xs font-normal text-stone-500"> / 100</span>
            </div>
            <div className="text-[11px] text-teal-800 font-medium mt-0.5">
              {completedModules.who5 ? 'Full 5 items completed ✓' : 'Tap to refine (5 items)'}
            </div>
          </button>

          <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-100">
            <div className="text-xs font-medium text-amber-900">Body, Sleep &amp; Appetite</div>
            <div className="text-2xl font-bold text-stone-900 mt-1">
              {result.physicalLoadScore !== null ? `${result.physicalLoadScore} / 9` : 'Checked'}
            </div>
            <div className="text-[11px] text-stone-500 mt-0.5">From your 3-question check</div>
          </div>

          <button
            type="button"
            onClick={() => setOpenModule(openModule === 'gad7' ? null : 'gad7')}
            className="p-4 rounded-2xl bg-stone-50 border border-stone-200 hover:border-teal-600 text-left transition cursor-pointer"
          >
            <div className="text-xs font-medium text-stone-700 flex items-center justify-between">
              <span>Worry &amp; Tension</span>
              <PlusCircle className="w-3.5 h-3.5 text-teal-700" />
            </div>
            <div className="text-2xl font-bold text-stone-900 mt-1">
              {result.gad7Total !== null ? `${result.gad7Total} / 21` : 'Optional'}
            </div>
            <div className="text-[11px] text-teal-800 font-medium mt-0.5">
              {result.gad7Total !== null ? 'Completed · Tap to edit' : 'Tap to answer independently'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setOpenModule(openModule === 'phq9' ? null : 'phq9')}
            className="p-4 rounded-2xl bg-stone-50 border border-stone-200 hover:border-teal-600 text-left transition cursor-pointer"
          >
            <div className="text-xs font-medium text-stone-700 flex items-center justify-between">
              <span>Mood &amp; Energy</span>
              <PlusCircle className="w-3.5 h-3.5 text-teal-700" />
            </div>
            <div className="text-2xl font-bold text-stone-900 mt-1">
              {result.phq9Total !== null ? `${result.phq9Total} / 27` : 'Optional'}
            </div>
            <div className="text-[11px] text-teal-800 font-medium mt-0.5">
              {result.phq9Total !== null ? 'Completed · Tap to edit' : 'Tap to answer independently'}
            </div>
          </button>
        </div>

        {/* Independent Optional Module Drawer */}
        {openModule && (
          <div className="p-5 sm:p-6 rounded-2xl bg-stone-50 border border-teal-200 mb-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-teal-800">
                  Optional Self-Paced Section
                </span>
                <h3 className="font-serif text-lg text-stone-900">
                  {openModule === 'who5'
                    ? 'Refine Your 5-Item Wellbeing Reflection'
                    : openModule === 'gad7'
                    ? 'Optional Worry & Restlessness Check (7 short items)'
                    : 'Optional Mood, Energy & Safety Check (9 short items)'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setOpenModule(null)}
                className="text-xs text-stone-500 hover:text-stone-900 underline cursor-pointer"
              >
                Close
              </button>
            </div>

            {openModule === 'who5' && (
              <div className="space-y-3">
                {WHO5_MODULE_PROMPTS.map((prompt, idx) => (
                  <div
                    key={prompt}
                    className="p-3.5 rounded-xl bg-white border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <span className="text-xs font-medium text-stone-800">{prompt}</span>
                    <select
                      value={who5Draft[idx]}
                      onChange={(e) => {
                        const copy = [...who5Draft];
                        copy[idx] = Number(e.target.value);
                        setWho5Draft(copy);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-stone-300 text-xs bg-stone-50"
                    >
                      <option value={5}>All of the time</option>
                      <option value={4}>Most of the time</option>
                      <option value={3}>More than half the time</option>
                      <option value={2}>Less than half the time</option>
                      <option value={1}>Some of the time</option>
                      <option value={0}>At no time</option>
                    </select>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => handleSaveModuleAndReinterpret('who5')}
                  className="px-5 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-900 text-white text-xs font-semibold cursor-pointer"
                >
                  Update My Reflection &amp; Re-Interpret
                </button>
              </div>
            )}

            {openModule === 'gad7' && (
              <div className="space-y-3">
                {GAD7_MODULE_PROMPTS.map((prompt, idx) => (
                  <div
                    key={prompt}
                    className="p-3.5 rounded-xl bg-white border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <span className="text-xs font-medium text-stone-800">{prompt}</span>
                    <select
                      value={gad7Draft[idx]}
                      onChange={(e) => {
                        const copy = [...gad7Draft];
                        copy[idx] = Number(e.target.value);
                        setGad7Draft(copy);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-stone-300 text-xs bg-stone-50"
                    >
                      <option value={0}>Not at all</option>
                      <option value={1}>Several days</option>
                      <option value={2}>More than half the days</option>
                      <option value={3}>Nearly every day</option>
                    </select>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => handleSaveModuleAndReinterpret('gad7')}
                  className="px-5 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-900 text-white text-xs font-semibold cursor-pointer"
                >
                  Combine with My 3 Answers &amp; Re-Interpret
                </button>
              </div>
            )}

            {openModule === 'phq9' && (
              <div className="space-y-3">
                {PHQ9_MODULE_PROMPTS.map((prompt, idx) => (
                  <div
                    key={prompt}
                    className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                      idx === 8 ? 'bg-rose-50/70 border-rose-200' : 'bg-white border-stone-200'
                    }`}
                  >
                    <span className="text-xs font-medium text-stone-800">{prompt}</span>
                    <select
                      value={phq9Draft[idx]}
                      onChange={(e) => {
                        const copy = [...phq9Draft];
                        copy[idx] = Number(e.target.value);
                        setPhq9Draft(copy);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-stone-300 text-xs bg-stone-50"
                    >
                      <option value={0}>Not at all</option>
                      <option value={1}>Several days</option>
                      <option value={2}>More than half the days</option>
                      <option value={3}>Nearly every day</option>
                    </select>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => handleSaveModuleAndReinterpret('phq9')}
                  className="px-5 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-900 text-white text-xs font-semibold cursor-pointer"
                >
                  Combine with My 3 Answers &amp; Re-Interpret
                </button>
              </div>
            )}
          </div>
        )}

        {chartData.length >= 2 && (
          <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 mb-6">
            <div className="text-xs font-semibold text-stone-700 mb-1">
              Your Saved Wellbeing Trend
            </div>
            <p className="text-xs text-stone-600 mb-3">{result.baselineComparison.message}</p>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="who5"
                    name="Wellbeing"
                    stroke="#115e59"
                    strokeWidth={2.5}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-200/80">
            <h3 className="font-semibold text-emerald-950 text-sm flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              What this reflection shows
            </h3>
            <ul className="space-y-1.5 text-xs text-stone-700 leading-relaxed list-disc pl-4">
              {result.whatThisMeans.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="p-5 rounded-2xl bg-amber-50/50 border border-amber-200/80">
            <h3 className="font-semibold text-amber-950 text-sm flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
              Important to keep in mind
            </h3>
            <ul className="space-y-1.5 text-xs text-stone-700 leading-relaxed list-disc pl-4">
              {result.whatThisDoesNotMean.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* 2. Interactive Care Pathways */}
      <div
        ref={pathwaySectionRef}
        className="bg-[#FFFEFB] border border-stone-200 rounded-3xl shadow-xs p-6 md:p-9"
      >
        <div className="mb-6">
          <h3 className="font-serif text-2xl text-stone-900">
            Choose what feels right for you next
          </h3>
          <p className="text-sm text-stone-600 mt-1">
            Tap any pathway below to explore self-guided video exercises, community circles, or
            book a private session with a local clinic.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {[
            {
              tier: 1 as SupportTier,
              title: 'Self-Guided & Prevention',
              subtitle: 'Video breathing & body relief',
              icon: Video,
            },
            {
              tier: 2 as SupportTier,
              title: 'Community & Peer Support',
              subtitle: 'Small confidential circles',
              icon: Users,
            },
            {
              tier: 3 as SupportTier,
              title: 'Clinic & Counselor Care',
              subtitle: 'Book video or clinic visit',
              icon: HeartHandshake,
            },
            {
              tier: 4 as SupportTier,
              title: 'Priority Human Support',
              subtitle: 'Immediate safety & urgent care',
              icon: PhoneCall,
            },
          ].map((card) => {
            const Icon = card.icon;
            const isSelected = activePathway === card.tier;
            const isRecommended = result.tier === card.tier;
            return (
              <button
                key={card.tier}
                type="button"
                onClick={() => setActivePathway(card.tier)}
                className={`p-4 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-teal-800 text-white border-teal-800 shadow-xs'
                    : 'bg-stone-50/80 text-stone-900 border-stone-200 hover:border-teal-500 hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <Icon
                    className={`w-5 h-5 ${isSelected ? 'text-teal-200' : 'text-teal-700'}`}
                  />
                  {isRecommended && (
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        isSelected
                          ? 'bg-teal-700 text-teal-100'
                          : 'bg-teal-100 text-teal-900'
                      }`}
                    >
                      Suggested
                    </span>
                  )}
                </div>
                <div>
                  <div className="font-semibold text-sm">{card.title}</div>
                  <div
                    className={`text-xs mt-0.5 ${
                      isSelected ? 'text-teal-100' : 'text-stone-500'
                    }`}
                  >
                    {card.subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {activePathway === 1 && (
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-teal-50/70 border border-teal-100 text-xs text-teal-950 leading-relaxed">
              <strong>Mind-Body Recovery Toolkit:</strong> Short, gentle guided demonstrations
              designed to calm a busy nervous system and release neck, shoulder, and chest
              tension—paired with simple cues you can follow anywhere.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {SELF_GUIDED_EXERCISES.map((ex) => (
                <div
                  key={ex.id}
                  className="rounded-2xl border border-stone-200 bg-stone-50/60 overflow-hidden flex flex-col"
                >
                  <div className="relative aspect-video bg-stone-900">
                    <video
                      src={ex.videoSrc}
                      controls
                      muted
                      loop
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <span className="text-[11px] font-medium text-teal-800">{ex.duration}</span>
                      <h4 className="font-semibold text-stone-900 text-base mt-0.5">{ex.title}</h4>
                      <ul className="mt-3 space-y-1.5 text-xs text-stone-600 list-disc pl-4 leading-relaxed">
                        {ex.cues.map((cue, idx) => (
                          <li key={idx}>{cue}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activePathway === 2 && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center p-5 rounded-2xl bg-stone-50 border border-stone-200">
              <div className="md:col-span-5 rounded-xl overflow-hidden bg-stone-900 aspect-video">
                <video
                  src="/media/human-support.mp4"
                  autoPlay
                  muted
                  loop
                  playsInline
                  controls
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="md:col-span-7 space-y-3">
                <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-full">
                  Confidential Peer Circles · No Diagnosis Required
                </span>
                <h4 className="font-serif text-xl text-stone-900">
                  Al Ain &amp; Abu Dhabi Wellbeing Peer Circles
                </h4>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Join a small, facilitator-led group of 6–8 residents focusing on sleep recovery,
                  workplace balance, and everyday stress. You can join using a first name or
                  nickname only.
                </p>
                <div className="flex flex-wrap gap-3 text-xs text-stone-500">
                  <span>Next Session: Wednesday, 6:00 PM (Arabic &amp; English)</span>
                  <span>4 open seats remaining</span>
                </div>
                {!reservedCircle ? (
                  <button
                    type="button"
                    onClick={() => setReservedCircle(true)}
                    className="px-5 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-900 text-white text-xs font-semibold transition cursor-pointer"
                  >
                    Reserve an Anonymous Seat
                  </button>
                ) : (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-medium">
                    Seat reserved for Wednesday at 6:00 PM. Show code <strong>CIRCLE-84</strong> at
                    welcome—no ID or full name required.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {(activePathway === 3 || activePathway === 4) && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center p-5 rounded-2xl bg-stone-50/90 border border-stone-200">
              <div className="md:col-span-5 rounded-xl overflow-hidden bg-stone-900 aspect-video shadow-2xs">
                <video
                  src="/media/human-support.mp4"
                  autoPlay
                  muted
                  loop
                  playsInline
                  controls
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="md:col-span-7 space-y-2">
                <h4 className="font-serif text-xl text-stone-900">
                  Supportive care with licensed local clinicians
                </h4>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Your clinical scores stay encrypted on your device. The clinic can accept your
                  booking right away and send your appointment time, while you hold your{' '}
                  <strong>Private Unlock Key</strong> until you choose to release it inside the
                  portal.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-3">
                Select a Licensed Clinic or Care Center (Live Availability):
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {CLINIC_DIRECTORY.map((clinic) => {
                  const selected = selectedClinicId === clinic.id;
                  return (
                    <button
                      key={clinic.id}
                      type="button"
                      onClick={() => handleSelectClinic(clinic.id)}
                      className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                        selected
                          ? 'border-teal-800 bg-teal-50/50 ring-1 ring-teal-800'
                          : 'border-stone-200 bg-white hover:border-teal-400'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-700">
                          {clinic.emirate} · {clinic.focusLabel}
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-700">
                          {clinic.slotsRemaining} slots open
                        </span>
                      </div>
                      <div className="font-semibold text-stone-900 text-sm flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-teal-800 shrink-0" />
                        {clinic.name}
                      </div>
                      <div className="text-xs text-teal-900 font-medium mt-1">
                        Clinician on duty: {clinic.leadClinician} ({clinic.clinicianRole})
                      </div>
                      <p className="text-xs text-stone-600 mt-1.5 leading-relaxed">
                        {clinic.summary}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 mt-3 pt-2.5 border-t border-stone-100 text-[11px] text-stone-500">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-teal-700" /> {clinic.nextAvailable}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Globe2 className="w-3 h-3 text-teal-700" /> {clinic.languages.join(', ')}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl bg-stone-50 border border-stone-200">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-2">
                  How would you prefer to meet?
                </label>
                <div className="flex flex-wrap gap-2">
                  {selectedClinic.consultationModes.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setConsultationMode(mode)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-medium border transition cursor-pointer ${
                        consultationMode === mode
                          ? 'bg-teal-800 text-white border-teal-800'
                          : 'bg-white text-stone-700 border-stone-200 hover:border-teal-400'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-2">
                  Optional note for {selectedClinic.leadClinician}:
                </label>
                <input
                  type="text"
                  value={residentNote}
                  onChange={(e) => setResidentNote(e.target.value)}
                  placeholder="Share preferred day, time, or accessibility need"
                  className="w-full px-3.5 py-2 rounded-xl border border-stone-300 bg-white text-xs focus:outline-none focus:border-teal-700"
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200">
              <div className="text-xs font-semibold text-stone-800 mb-3">
                Choose what your encrypted clinical summary includes:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-stone-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={shareScope.includeWho5}
                    onChange={(e) =>
                      setShareScope((s) => ({ ...s, includeWho5: e.target.checked }))
                    }
                    className="rounded text-teal-800"
                  />
                  <span>Overall Wellbeing Score ({result.who5Standardized}/100)</span>
                </label>

                {physicalContext && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shareScope.includePhysicalContext}
                      onChange={(e) =>
                        setShareScope((s) => ({ ...s, includePhysicalContext: e.target.checked }))
                      }
                      className="rounded text-teal-800"
                    />
                    <span>Sleep, Appetite &amp; Body Comfort ({result.physicalLoadScore}/9)</span>
                  </label>
                )}

                {result.gad7Total !== null && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shareScope.includeGad7}
                      onChange={(e) =>
                        setShareScope((s) => ({ ...s, includeGad7: e.target.checked }))
                      }
                      className="rounded text-teal-800"
                    />
                    <span>Worry &amp; Tension Check-In ({result.gad7Total}/21)</span>
                  </label>
                )}

                {result.phq9Total !== null && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shareScope.includePhq9}
                      onChange={(e) =>
                        setShareScope((s) => ({ ...s, includePhq9: e.target.checked }))
                      }
                      className="rounded text-teal-800"
                    />
                    <span>Mood &amp; Energy Check-In ({result.phq9Total}/27)</span>
                  </label>
                )}

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={shareScope.includePreferredLanguage}
                    onChange={(e) =>
                      setShareScope((s) => ({ ...s, includePreferredLanguage: e.target.checked }))
                    }
                    className="rounded text-teal-800"
                  />
                  <span>Preferred Language:</span>
                  <select
                    value={preferredLanguage}
                    onChange={(e) => setPreferredLanguage(e.target.value)}
                    className="border border-stone-300 rounded-lg px-2 py-0.5 bg-white text-xs"
                  >
                    <option>Arabic / English</option>
                    <option>Arabic</option>
                    <option>English</option>
                    <option>Urdu</option>
                    <option>Tagalog</option>
                  </select>
                </label>
              </div>
            </div>

            {!credential ? (
              <div>
                <button
                  type="button"
                  disabled={isGeneratingHandoff}
                  onClick={handleGenerateHandoff}
                  className="px-6 py-3.5 rounded-2xl bg-teal-800 hover:bg-teal-900 disabled:opacity-50 text-white font-semibold text-sm transition shadow-xs cursor-pointer"
                >
                  {isGeneratingHandoff
                    ? 'Creating Your Booking Pass...'
                    : `Request Appointment with ${selectedClinic.name}`}
                </button>
                {revoked && (
                  <p className="text-xs text-rose-600 font-medium mt-2">
                    Your previous booking pass has been withdrawn and deleted.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                {handoffSyncNotice && (
                  <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-950">
                    {handoffSyncNotice}
                  </div>
                )}

                <div className="p-6 rounded-3xl bg-stone-900 text-white flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="space-y-3 flex-1">
                    <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                      <Shield className="w-4 h-4" />
                      {keySharedInPortal
                        ? 'Clinical Key Shared with Your Clinician'
                        : 'Key Held Privately by You · Locked on Server'}
                    </div>
                    <div>
                      <div className="text-xs text-stone-400">Your 6-Digit Booking Code</div>
                      <div className="text-3xl font-mono font-bold tracking-widest text-white">
                        {credential.pin}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-stone-400">
                        Private Unlock Key (Held only by you until you choose to share)
                      </div>
                      <div className="text-xs font-mono bg-stone-800 px-3 py-1.5 rounded-xl text-teal-300 break-all mt-1">
                        {credential.keyBase64Url}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      {!keySharedInPortal ? (
                        <button
                          type="button"
                          onClick={handleShareKeyWithClinician}
                          disabled={sharingKey}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white cursor-pointer"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          {sharingKey
                            ? 'Releasing Key...'
                            : 'Share My Clinical Key with Clinician'}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-950 border border-emerald-700 text-xs font-semibold text-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Key Shared in Portal
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={copyPinAndKey}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white cursor-pointer"
                      >
                        {copiedPin ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedPin ? 'Copied' : 'Copy Details'}
                      </button>

                      <button
                        type="button"
                        onClick={handleCheckClinicianReply}
                        disabled={checkingReply}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white cursor-pointer"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${checkingReply ? 'animate-spin' : ''}`}
                        />
                        {checkingReply ? 'Checking...' : 'Check Clinic Reply'}
                      </button>

                      <button
                        type="button"
                        onClick={handleRevokeHandoff}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-950 hover:bg-rose-900 text-xs font-semibold text-rose-200 border border-rose-800 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Withdraw Pass
                      </button>
                    </div>
                  </div>

                  <div className="bg-white p-3.5 rounded-2xl shrink-0 text-center">
                    <QRCodeSVG value={credential.qrPayload} size={132} />
                    <div className="text-[10px] font-semibold text-stone-700 mt-1.5 flex items-center justify-center gap-1">
                      <QrCode className="w-3 h-3" /> Clinic Check-In QR
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl border border-teal-200 bg-teal-50/50">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-teal-900 flex items-center gap-1.5">
                      <CalendarCheck className="w-4 h-4 text-teal-700" />
                      Clinic Response &amp; Consultation Details
                    </span>
                    <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-white border border-teal-200 text-teal-900">
                      Status: {referralStatus.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {!clinicianReply ? (
                    <p className="text-xs text-stone-600 leading-relaxed">
                      Waiting for <strong>{selectedClinic.leadClinician}</strong> at{' '}
                      <strong>{selectedClinic.name}</strong> to accept your booking and confirm
                      your slot. Tap <strong>&ldquo;Check Clinic Reply&rdquo;</strong> above once
                      the clinician responds.
                    </p>
                  ) : (
                    <div className="space-y-3 mt-3 bg-white p-4 rounded-xl border border-teal-200/80">
                      <div>
                        <div className="font-bold text-stone-900 text-sm">
                          {clinicianReply.clinicianName} · {clinicianReply.clinicName}
                        </div>
                        <div className="text-xs text-emerald-700 font-semibold mt-0.5">
                          Confirmed Time: {clinicianReply.confirmedTime} (
                          {clinicianReply.consultationMode})
                        </div>
                      </div>

                      <p className="text-xs text-stone-700 bg-stone-50 p-3 rounded-lg border border-stone-200 leading-relaxed">
                        &ldquo;{clinicianReply.message}&rdquo;
                      </p>

                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        {clinicianReply.consultationMode === 'Video Consultation' &&
                          clinicianReply.meetingRoomUrl && (
                            <a
                              href={clinicianReply.meetingRoomUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-900 text-white text-xs font-semibold transition"
                            >
                              <Video className="w-4 h-4" />
                              Join Private Online Consultation Room
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}

                        {!keySharedInPortal && (
                          <button
                            type="button"
                            onClick={handleShareKeyWithClinician}
                            disabled={sharingKey}
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition cursor-pointer"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            {sharingKey
                              ? 'Sharing Key...'
                              : 'Release My Clinical Key for This Session'}
                          </button>
                        )}
                      </div>

                      {clinicianReply.consultationMode === 'In-Person Visit' &&
                        clinicianReply.clinicLocation && (
                          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700">
                            <MapPin className="w-4 h-4 text-teal-700" />
                            Location: {clinicianReply.clinicLocation}
                          </div>
                        )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}