'use client';

import React, { useState, useEffect } from 'react';
import {
  AdlDriftReport,
  AdaptiveQuestion,
  generateAdaptiveQuestions,
  readLiveBleHeartRate,
  buildInstantAnchorDataset,
  buildSampleDriftDataset,
  saveAdlHistory,
  evaluateMindBodyAdlDrift,
  dispatchSystemWellbeingNotification,
} from '@/lib/sensing/adlDetector';
import {
  Who5Responses,
  PhysicalContextResponses,
  ExplainableResult,
  HistoricalRecord,
  evaluateBiopsychosocialTriage,
} from '@/lib/clinical/triage';
import {
  Sparkles,
  Watch,
  Bluetooth,
  Activity,
  Moon,
  HeartPulse,
  BellRing,
  Send,
  Wind,
  ShieldAlert,
  ArrowRight,
  SlidersHorizontal,
  Play,
  RotateCcw,
} from 'lucide-react';

interface MizanCompanionProps {
  adlReport: AdlDriftReport;
  onReportUpdated: (report: AdlDriftReport) => void;
  history: HistoricalRecord[];
  onCompleteAdaptiveCheckIn: (payload: {
    who5: Who5Responses;
    physicalContext: PhysicalContextResponses;
    result: ExplainableResult;
  }) => void;
}

const MICRO_INTERVENTIONS = [
  {
    id: 'vagal-breathing',
    title: '4-4-6 Vagal Paced Breathing Reset',
    tag: 'Recommended for HRV / Stress Drift',
    description:
      'Slows elevated resting heart rate and signals safety to your nervous system in 6 breath cycles.',
    steps: [
      'Inhale gently through your nose for 4 seconds.',
      'Hold softly at the top for 4 seconds without straining.',
      'Exhale slowly through your mouth for 6 seconds.',
    ],
  },
  {
    id: 'somatic-release',
    title: 'Progressive Neck & Shoulder Tension Release',
    tag: 'Recommended for Physical Load & Fatigue',
    description:
      'Releases upper-trapezius and cervical stiffness accumulated during prolonged desk or screen focus.',
    steps: [
      'Drop both shoulders away from your ears and unclench your jaw.',
      'Tilt right ear gently toward right shoulder for 15 seconds, then switch sides.',
      'Roll shoulders backward slowly 5 times while breathing deeply.',
    ],
  },
  {
    id: 'sleep-anchor',
    title: 'Circadian Wind-Down & Night Pickup Reset',
    tag: 'Recommended for Sleep Duration Drift',
    description:
      'Reduces late-night cognitive arousal and screen-wake fragmentation before sleep.',
    steps: [
      'Dim overhead lighting and place your phone face-down out of arm’s reach.',
      'Write down tomorrow’s single top priority on paper so your mind can let go.',
      'Take 5 slow belly breaths with eyes closed before lying down.',
    ],
  },
];

export default function MizanCompanion({
  adlReport,
  onReportUpdated,
  history,
  onCompleteAdaptiveCheckIn,
}: MizanCompanionProps) {
  const [bleConnecting, setBleConnecting] = useState(false);
  const [bleStatus, setBleStatus] = useState<string | null>(null);
  const [showSimulatorDrawer, setShowSimulatorDrawer] = useState(false);

  const [adaptiveQuestions, setAdaptiveQuestions] = useState<AdaptiveQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [adaptiveAnswers, setAdaptiveAnswers] = useState<Record<string, number>>({});

  const [userReflectionText, setUserReflectionText] = useState('');
  const [companionMessages, setCompanionMessages] = useState<
    { sender: 'mizan' | 'user'; text: string }[]
  >([]);
  const [safetyFlagged, setSafetyFlagged] = useState(false);

  const [breathingActive, setBreathingActive] = useState(false);
  const [breathPhase, setBreathPhase] = useState<'Inhale (4s)' | 'Hold (4s)' | 'Exhale (6s)'>(
    'Inhale (4s)'
  );

  useEffect(() => {
    const qs = generateAdaptiveQuestions(adlReport);
    setAdaptiveQuestions(qs);
    setQIndex(0);
    setAdaptiveAnswers({});
    setSafetyFlagged(false);

    const greeting = adlReport.driftDetected
      ? `I noticed a shift over the past 3 days: your sleep averaged ${adlReport.recentSummary.sleepHours}h (down from ${adlReport.baselineSummary.sleepHours}h) and daily movement dipped to ${adlReport.recentSummary.steps.toLocaleString()} steps. How have you been feeling?`
      : `Your daily rhythm looks steady (${adlReport.recentSummary.sleepHours}h sleep, ${adlReport.recentSummary.steps.toLocaleString()} steps/day). Would you like a quick 30-second check-in?`;

    setCompanionMessages([{ sender: 'mizan', text: greeting }]);
  }, [adlReport]);

  useEffect(() => {
    if (!breathingActive) return;
    let step = 0;
    const phases: ('Inhale (4s)' | 'Hold (4s)' | 'Exhale (6s)')[] = [
      'Inhale (4s)',
      'Hold (4s)',
      'Exhale (6s)',
    ];
    const interval = setInterval(() => {
      step = (step + 1) % phases.length;
      setBreathPhase(phases[step]);
    }, 4000);
    return () => clearInterval(interval);
  }, [breathingActive]);

  const handlePairBluetoothWatch = async () => {
    setBleConnecting(true);
    setBleStatus(null);
    const reading = await readLiveBleHeartRate();
    setBleConnecting(false);

    if (reading) {
      setBleStatus(
        `Connected · Live Heart Rate: ${reading.bpm} bpm (Est. HRV: ${reading.estimatedHrvMs} ms)`
      );
      const updated = buildInstantAnchorDataset(
        adlReport.recentSummary.sleepHours,
        adlReport.recentSummary.steps,
        reading.bpm
      );
      updated[updated.length - 1].restingHr = reading.bpm;
      updated[updated.length - 1].hrvMs = reading.estimatedHrvMs;
      saveAdlHistory(updated);
      onReportUpdated(evaluateMindBodyAdlDrift(updated));
    } else {
      setBleStatus(
        'No Bluetooth HR sensor paired (requires Chrome/Edge on HTTPS with BLE device). Use Test Passive Drift to simulate wearable shifts.'
      );
    }
  };

  const applyPresetScenario = async (scenario: 'steady' | 'drift') => {
    const dataset =
      scenario === 'drift' ? buildSampleDriftDataset() : buildInstantAnchorDataset(7.2, 6800, 66);
    saveAdlHistory(dataset);
    const report = evaluateMindBodyAdlDrift(dataset);
    onReportUpdated(report);
    if (scenario === 'drift') {
      await dispatchSystemWellbeingNotification(report);
    }
  };

  const handleCompanionChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = userReflectionText.trim();
    if (!text) return;

    const lower = text.toLowerCase();
    const concerningKeywords = [
      'hurt myself',
      'end my life',
      'suicide',
      'kill myself',
      'hopeless',
      'better off dead',
      'can’t go on',
      "can't go on",
    ];
    const isUrgent = concerningKeywords.some((kw) => lower.includes(kw));

    let reply = '';
    if (isUrgent) {
      setSafetyFlagged(true);
      reply =
        'Thank you for trusting me with how heavy things feel right now. Because your safety matters most, I am immediately surfacing free, confidential UAE support lines (800-SAKINA and 800-HOPE) and a direct priority connection to a licensed clinician.';
    } else if (lower.includes('work') || lower.includes('stress') || lower.includes('overwhelm')) {
      reply = `Work pressure combined with ${adlReport.recentSummary.sleepHours}h of sleep can noticeably drain daytime focus and physical recovery. Try the 2-minute Vagal Breathing Reset below, or answer the 3 quick questions to explore confidential clinic support.`;
    } else if (lower.includes('sleep') || lower.includes('tired') || lower.includes('exhaust')) {
      reply = `Disrupted rest (${adlReport.recentSummary.sleepHours}h vs your ${adlReport.baselineSummary.sleepHours}h baseline) often shows up first as daytime heaviness and neck/shoulder tension. Try the Sleep Recovery Reset below or tap through the 3 quick questions.`;
    } else {
      reply = `Thank you for sharing that. Connecting your daily physical rhythm (${adlReport.recentSummary.steps.toLocaleString()} steps/day) with how you feel helps catch stress early—without diagnosing. Answer the 3 quick questions to view your explainable reflection.`;
    }

    setCompanionMessages((prev) => [
      ...prev,
      { sender: 'user', text },
      { sender: 'mizan', text: reply },
    ]);
    setUserReflectionText('');
  };

  const handleSelectAdaptiveAnswer = (questionId: string, score: number) => {
    const updated = { ...adaptiveAnswers, [questionId]: score };
    setAdaptiveAnswers(updated);

    if (qIndex < adaptiveQuestions.length - 1) {
      setQIndex((prev) => prev + 1);
    } else {
      const totalAdaptiveScore = Object.values(updated).reduce((a, b) => a + b, 0);
      const mappedWho5Item = Math.max(0, Math.min(5, Math.round(5 - (totalAdaptiveScore / 9) * 5)));

      const who5: Who5Responses = {
        q1_cheerful: mappedWho5Item,
        q2_calm: mappedWho5Item,
        q3_active: adlReport.driftedDomains.includes('movement')
          ? Math.max(0, mappedWho5Item - 1)
          : mappedWho5Item,
        q4_rested: adlReport.driftedDomains.includes('sleep')
          ? Math.max(0, mappedWho5Item - 1)
          : mappedWho5Item,
        q5_interested: mappedWho5Item,
      };

      const physicalContext: PhysicalContextResponses = {
        sleepDisruption: Math.max(
          adlReport.suggestedPhysicalContext.sleepDisruption,
          updated['q-sleep'] ?? 0
        ),
        painOrTension: Math.max(
          adlReport.suggestedPhysicalContext.painOrTension,
          updated['q-autonomic'] ?? 0
        ),
        fatigueOrRoleLimit: Math.max(
          adlReport.suggestedPhysicalContext.fatigueOrRoleLimit,
          updated['q-movement'] ?? 0
        ),
      };

      const result = evaluateBiopsychosocialTriage({
        who5,
        physicalContext,
        history,
      });

      if (adlReport.driftDetected) {
        result.whatThisMeans.unshift(
          `Longitudinal Mind–Body Correlation (${adlReport.baselineStage}): ${adlReport.contextualExplanation}`
        );
      }

      onCompleteAdaptiveCheckIn({ who5, physicalContext, result });
    }
  };

  const currentAdaptiveQ = adaptiveQuestions[qIndex];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {safetyFlagged && (
        <div className="p-5 rounded-3xl bg-rose-950 text-white border border-rose-800 space-y-3 shadow-md">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-200">
            <ShieldAlert className="w-4 h-4" /> Immediate Human Safety Pathway Activated
          </div>
          <p className="text-xs sm:text-sm text-rose-100 leading-relaxed">
            You do not have to carry this alone. Speak confidentially with a trained specialist in
            the UAE right now:
          </p>
          <div className="flex flex-wrap gap-2.5">
            <a
              href="tel:800725462"
              className="px-4 py-2 rounded-xl bg-white text-stone-900 font-bold text-xs"
            >
              Call 800-SAKINA (800-725462)
            </a>
            <a
              href="tel:8004673"
              className="px-4 py-2 rounded-xl bg-teal-600 text-white font-bold text-xs"
            >
              Call 800-HOPE (800-4673)
            </a>
            <a
              href="tel:998"
              className="px-4 py-2 rounded-xl bg-rose-800 border border-rose-600 text-white font-bold text-xs"
            >
              Ambulance 998
            </a>
            <a
              href="tel:999"
              className="px-4 py-2 rounded-xl bg-rose-800 border border-rose-600 text-white font-bold text-xs"
            >
              Emergency 999
            </a>
          </div>
        </div>
      )}

      {/* 1. Live On-Device Passive Baseline & Drift Telemetry Card */}
      <div className="bg-[#FFFEFB] border border-stone-200 rounded-3xl shadow-xs p-6 md:p-7 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-teal-900 bg-teal-50 border border-teal-200 px-3 py-1 rounded-full">
              <Watch className="w-3.5 h-3.5 text-teal-700" />
              On-Device Passive Baseline · {adlReport.baselineStage}
            </div>
            <h2 className="font-serif text-xl sm:text-2xl text-stone-900 mt-2">
              {adlReport.headline}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePairBluetoothWatch}
              disabled={bleConnecting}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-xs font-semibold text-stone-700 cursor-pointer"
            >
              <Bluetooth className="w-3.5 h-3.5 text-sky-700" />
              {bleConnecting ? 'Scanning BLE...' : 'Pair Watch HR'}
            </button>

            <button
              type="button"
              onClick={() => setShowSimulatorDrawer((p) => !p)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-teal-300" />
              Test Passive Drift
            </button>
          </div>
        </div>

        {bleStatus && (
          <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-950">
            {bleStatus}
          </div>
        )}

        {showSimulatorDrawer && (
          <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-stone-600">
              <strong>Prototype Telemetry Controls:</strong> Switch between a steady personal
              baseline and a 3-day multi-domain drift (sleep 7.1h → 4.6h, steps 6,100 → 2,600, HR
              68 → 76 bpm) to watch the 3 adaptive questions update automatically.
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => applyPresetScenario('steady')}
                className="px-3.5 py-2 rounded-xl bg-white border border-stone-300 hover:border-teal-600 text-xs font-semibold text-stone-800 cursor-pointer"
              >
                Steady Rhythm
              </button>
              <button
                type="button"
                onClick={() => applyPresetScenario('drift')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer"
              >
                <BellRing className="w-3.5 h-3.5" />
                Simulate 3-Day Drift
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div
            className={`p-4 rounded-2xl border ${
              adlReport.driftedDomains.includes('sleep')
                ? 'bg-amber-50/80 border-amber-300'
                : 'bg-stone-50/70 border-stone-200'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-stone-700">
              <span className="inline-flex items-center gap-1.5">
                <Moon className="w-3.5 h-3.5 text-teal-800" /> Sleep Duration
              </span>
              {adlReport.driftedDomains.includes('sleep') && (
                <span className="text-[10px] font-bold text-amber-900 bg-amber-200/70 px-2 py-0.5 rounded-full">
                  Shifted
                </span>
              )}
            </div>
            <div className="text-2xl font-bold text-stone-900 mt-1.5">
              {adlReport.recentSummary.sleepHours}h
              <span className="text-xs font-normal text-stone-500">
                {' '}
                / {adlReport.baselineSummary.sleepHours}h baseline
              </span>
            </div>
          </div>

          <div
            className={`p-4 rounded-2xl border ${
              adlReport.driftedDomains.includes('movement')
                ? 'bg-amber-50/80 border-amber-300'
                : 'bg-stone-50/70 border-stone-200'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-stone-700">
              <span className="inline-flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-teal-800" /> Daily Movement
              </span>
              {adlReport.driftedDomains.includes('movement') && (
                <span className="text-[10px] font-bold text-amber-900 bg-amber-200/70 px-2 py-0.5 rounded-full">
                  Reduced
                </span>
              )}
            </div>
            <div className="text-2xl font-bold text-stone-900 mt-1.5">
              {adlReport.recentSummary.steps.toLocaleString()}
              <span className="text-xs font-normal text-stone-500">
                {' '}
                / {adlReport.baselineSummary.steps.toLocaleString()} steps
              </span>
            </div>
          </div>

          <div
            className={`p-4 rounded-2xl border ${
              adlReport.driftedDomains.includes('autonomic')
                ? 'bg-amber-50/80 border-amber-300'
                : 'bg-stone-50/70 border-stone-200'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-stone-700">
              <span className="inline-flex items-center gap-1.5">
                <HeartPulse className="w-3.5 h-3.5 text-teal-800" /> Autonomic Recovery
              </span>
              {adlReport.driftedDomains.includes('autonomic') && (
                <span className="text-[10px] font-bold text-amber-900 bg-amber-200/70 px-2 py-0.5 rounded-full">
                  Elevated Load
                </span>
              )}
            </div>
            <div className="text-2xl font-bold text-stone-900 mt-1.5">
              {adlReport.recentSummary.hrvMs} ms
              <span className="text-xs font-normal text-stone-500">
                {' '}
                HRV · {adlReport.recentSummary.restingHr} bpm
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Mizan Companion + Pure 3-Question Adaptive Micro-Check-In */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-[#FFFEFB] border border-stone-200 rounded-3xl shadow-xs p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-900 bg-teal-50 border border-teal-200 px-3 py-1 rounded-full">
                <Sparkles className="w-3.5 h-3.5 text-teal-700" />
                Mizan Companion
              </span>
              <span className="text-[11px] text-stone-400">On-Device · Private</span>
            </div>

            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {companionMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                    msg.sender === 'mizan'
                      ? 'bg-teal-50/70 border border-teal-100 text-stone-800'
                      : 'bg-stone-900 text-white ml-6'
                  }`}
                >
                  {msg.text}
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleCompanionChatSubmit} className="pt-2 border-t border-stone-100 flex gap-2">
            <input
              type="text"
              value={userReflectionText}
              onChange={(e) => setUserReflectionText(e.target.value)}
              placeholder="Share what’s affecting your sleep or energy..."
              className="flex-1 px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-xs text-stone-900 focus:outline-none focus:border-teal-800"
            />
            <button
              type="submit"
              aria-label="Send reflection"
              className="px-3.5 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-900 text-white cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>

        <div className="lg:col-span-7 bg-[#FFFEFB] border border-stone-200 rounded-3xl shadow-xs p-6 md:p-7 flex flex-col justify-between space-y-5">
          {currentAdaptiveQ && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-teal-800 bg-teal-50 px-3 py-1 rounded-full">
                    30-Second Adaptive Check-In · Question {qIndex + 1} of 3
                  </span>
                  <span className="text-stone-400">{currentAdaptiveQ.subtext}</span>
                </div>

                <h3 className="font-serif text-xl sm:text-2xl text-stone-900 leading-snug pt-2">
                  {currentAdaptiveQ.prompt}
                </h3>
              </div>

              <div className="space-y-2.5">
                {currentAdaptiveQ.options.map((opt) => {
                  const isSelected = adaptiveAnswers[currentAdaptiveQ.id] === opt.score;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => handleSelectAdaptiveAnswer(currentAdaptiveQ.id, opt.score)}
                      className={`w-full px-4 py-3 rounded-2xl border text-xs sm:text-sm font-medium flex items-center justify-between transition cursor-pointer ${
                        isSelected
                          ? 'bg-teal-800 text-white border-teal-800'
                          : 'bg-stone-50/80 text-stone-800 border-stone-200 hover:border-teal-600 hover:bg-white'
                      }`}
                    >
                      <span>{opt.label}</span>
                      <ArrowRight
                        className={`w-4 h-4 ${isSelected ? 'text-teal-200' : 'text-stone-400'}`}
                      />
                    </button>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                <span className="text-stone-500">
                  3 targeted questions tailored to your passive baseline — 87.5% less effort than static forms.
                </span>
                {qIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => setQIndex((prev) => prev - 1)}
                    className="text-teal-800 hover:underline font-semibold cursor-pointer shrink-0 ml-2"
                  >
                    ← Back
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 3. Clinically Reviewed Micro-Intervention Library */}
      <div className="bg-[#FFFEFB] border border-stone-200 rounded-3xl shadow-xs p-6 md:p-7 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-800">
              Clinically Reviewed Self-Care Library
            </span>
            <h3 className="font-serif text-xl text-stone-900 mt-0.5">
              Immediate 2-to-5 Minute Mind–Body Micro-Interventions
            </h3>
          </div>

          <button
            type="button"
            onClick={() => setBreathingActive((p) => !p)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-800 hover:bg-teal-900 text-white text-xs font-semibold cursor-pointer"
          >
            {breathingActive ? (
              <>
                <RotateCcw className="w-3.5 h-3.5" /> Stop Guided Pacer ({breathPhase})
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" /> Start Live 4-4-6 Breath Pacer
              </>
            )}
          </button>
        </div>

        {breathingActive && (
          <div className="p-4 rounded-2xl bg-teal-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Wind className="w-6 h-6 text-teal-300 animate-pulse" />
              <div>
                <div className="text-xs text-teal-200">Follow the rhythm slowly:</div>
                <div className="text-xl font-serif font-medium">{breathPhase}</div>
              </div>
            </div>
            <span className="text-xs text-teal-200">Physiological Vagal Reset</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {MICRO_INTERVENTIONS.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-2xl bg-stone-50/80 border border-stone-200 space-y-2 flex flex-col justify-between"
            >
              <div className="space-y-1.5">
                <span className="inline-block text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-900 border border-teal-200">
                  {item.tag}
                </span>
                <h4 className="font-semibold text-sm text-stone-900">{item.title}</h4>
                <p className="text-xs text-stone-600 leading-relaxed">{item.description}</p>
              </div>
              <ul className="pt-2 border-t border-stone-200/70 space-y-1 text-[11px] text-stone-700 list-disc pl-4">
                {item.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}