'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  AdlDriftReport,
  AdaptiveQuestion,
  generateAdaptiveQuestions,
  buildInstantAnchorDataset,
  buildMildDriftDataset,
  buildSampleDriftDataset,
  saveAdlHistory,
  evaluateMindBodyAdlDrift,
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
  Activity,
  Moon,
  HeartPulse,
  Send,
  ShieldAlert,
  ArrowRight,
  Globe,
  Volume2,
  Square,
  Stethoscope,
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
  onDirectConsult?: () => void;
}

const SELF_CARE_GUIDES = [
  {
    id: 'breathing',
    titleEn: '2-Minute Guided Breathing',
    titleAr: 'تنفس هادئ لمدة دقيقتين',
    tagEn: 'Calms Stress & Heart Rate',
    tagAr: 'يهدئ التوتر ونبض القلب',
    descEn: 'Close your eyes and listen as the voice guides you through a gentle breathing pace.',
    descAr: 'أغمض عينيك واستمع للصوت وهو يرشدك عبر إيقاع تنفس لطيف وهادئ.',
    stepsEn: [
      'Sit comfortably, drop your shoulders, and breathe in softly through your nose for 4 seconds.',
      'Hold your breath gently for 4 seconds without straining.',
      'Breathe out slowly through your mouth for 6 seconds, letting tension leave your chest.',
    ],
    stepsAr: [
      'اجلس براحة، أنزل كتفيك، واستنشق الهواء بهدوء عبر أنفك لمدة 4 ثوانٍ.',
      'توقف بلطف لمدة 4 ثوانٍ دون شد.',
      'أخرج الزفير ببطء عبر فمك لمدة 6 ثوانٍ، واترك التوتر يغادر صدرك.',
    ],
    stepDurationsMs: [5500, 4500, 6500],
  },
  {
    id: 'shoulders',
    titleEn: 'Neck & Shoulder Tension Release',
    titleAr: 'إرخاء شد الرقبة والكتفين',
    tagEn: 'Relieves Physical Tightness',
    tagAr: 'يخفف الشد الجسدي',
    descEn: 'Follow the spoken cues to soften tightness stored in your neck, shoulders, and jaw.',
    descAr: 'اتبع الإرشاد الصوتي لتخفيف الشد المتراكم في الرقبة والكتفين والفك.',
    stepsEn: [
      'Drop both shoulders down away from your ears and gently unclench your jaw.',
      'Tilt your right ear softly toward your right shoulder, breathe deeply, then switch to the left side.',
      'Roll both shoulders slowly backward 5 times while taking slow, steady breaths.',
    ],
    stepsAr: [
      'أنزل كتفيك بعيداً عن أذنيك وأرخِ فكيك بلطف.',
      'أمل أذنك اليمنى بهدوء نحو كتفك الأيمن مع تنفس عميق، ثم بدّل إلى الجهة اليسرى.',
      'حرّك كتفيك ببطء إلى الخلف 5 مرات مع أخذ أنفاس بطيئة ومنتظمة.',
    ],
    stepDurationsMs: [6000, 8000, 7000],
  },
  {
    id: 'appetite-sleep',
    titleEn: 'Gentle Evening & Stomach Reset',
    titleAr: 'تهدئة المساء والمعدة',
    tagEn: 'Supports Sleep & Appetite',
    tagAr: 'يدعم النوم والشهية',
    descEn: 'Listen to calming steps for when stress tightens your stomach or makes it hard to eat or sleep.',
    descAr: 'استمع لخطوات مهدئة عندما يشد التوتر معدتك أو يصعّب عليك الأكل أو النوم.',
    stepsEn: [
      'Take a slow sip of warm water or herbal tea to soothe a tight stomach before trying to eat.',
      'Dim bright room lights and place your phone face-down away from your bed.',
      'Rest one hand gently on your stomach and take 5 slow, unhurried belly breaths.',
    ],
    stepsAr: [
      'ارتشف رشفة بطيئة من الماء الدافئ أو شاي الأعشاب لتهدئة معدتك قبل محاولة الأكل.',
      'خفّف الإضاءة القوية وضع هاتفك مقلوباً بعيداً عن سريرك.',
      'ضع يدك برفق على معدتك وخذ 5 أنفاس بطيئة وهادئة.',
    ],
    stepDurationsMs: [6500, 6000, 7000],
  },
];

export default function MizanCompanion({
  adlReport,
  onReportUpdated,
  history,
  onCompleteAdaptiveCheckIn,
  onDirectConsult,
}: MizanCompanionProps) {
  const [lang, setLang] = useState<'en' | 'ar'>('en');
  const isRtl = lang === 'ar';

  const [adaptiveQuestions, setAdaptiveQuestions] = useState<AdaptiveQuestion[]>(() =>
    generateAdaptiveQuestions(adlReport)
  );
  const [qIndex, setQIndex] = useState(0);
  const [adaptiveAnswers, setAdaptiveAnswers] = useState<Record<string, number>>({});

  const [userReflectionText, setUserReflectionText] = useState('');
  const [companionMessages, setCompanionMessages] = useState<
    { sender: 'mizan' | 'user'; text: string }[]
  >([]);
  const [safetyFlagged, setSafetyFlagged] = useState(false);

  const [activeGuideId, setActiveGuideId] = useState<string | null>(null);
  const [activeStepIdx, setActiveStepIdx] = useState<number>(0);
  const guideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioFallbackRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const qs = generateAdaptiveQuestions(adlReport);
    setAdaptiveQuestions(qs);
    setQIndex(0);
    setAdaptiveAnswers({});
    setSafetyFlagged(false);

    const greeting =
      lang === 'ar'
        ? adlReport.severity === 'notable_drift'
          ? 'لاحظت تغيراً ملحوظاً خلال 3 أيام في النوم والحركة وراحة الجسد. يمكنك حجز استشارة مباشرة الآن أو إكمال الأسئلة الثلاثة السريعة.'
          : adlReport.driftDetected
          ? 'لاحظت تغيراً طفيفاً خلال الأيام الثلاثة الماضية. أجب على هذه الأسئلة الثلاثة القصيرة لنفهم كيف تشعر.'
          : 'مؤشراتك اليومية تبدو مستقرة. أجب على 3 أسئلة قصيرة لنطمئن على نومك وشهيتك وطاقتك.'
        : adlReport.severity === 'notable_drift'
        ? 'I noticed a high 3-day shift across your sleep, movement, and body recovery. You can connect directly with a physical consultant now or answer 3 quick questions first.'
        : adlReport.driftDetected
        ? 'I noticed a mild shift over the past 3 days. Answer these 3 short questions so we can tailor your support.'
        : 'Your daily indicators look steady. Answer 3 short questions below to check in on your rest, appetite, and energy.';

    setCompanionMessages([{ sender: 'mizan', text: greeting }]);
  }, [adlReport, lang]);

  const stopVoiceGuide = () => {
    if (guideTimerRef.current) {
      clearTimeout(guideTimerRef.current);
      guideTimerRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (audioFallbackRef.current) {
      audioFallbackRef.current.pause();
      audioFallbackRef.current.src = '';
      audioFallbackRef.current = null;
    }
    setActiveGuideId(null);
    setActiveStepIdx(0);
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
    return () => stopVoiceGuide();
  }, []);

  const speakStep = (text: string, currentLang: 'en' | 'ar') => {
    if (typeof window === 'undefined') return;

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (audioFallbackRef.current) {
      audioFallbackRef.current.pause();
      audioFallbackRef.current = null;
    }

    const voices =
      'speechSynthesis' in window ? window.speechSynthesis.getVoices() : [];

    if (currentLang === 'ar') {
      // 1. Try native Arabic voice on phone/PC first (ar-AE, ar-SA, ar-EG, etc.)
      const arabicVoice = voices.find((v) =>
        v.lang.toLowerCase().startsWith('ar')
      );

      if (arabicVoice && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = arabicVoice;
        utterance.lang = arabicVoice.lang;
        utterance.rate = 0.88;
        window.speechSynthesis.speak(utterance);
        return;
      }

      // 2. Automatic Arabic TTS audio fallback when Windows/desktop lacks Arabic voice packs
      const encoded = encodeURIComponent(text);
      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ar&q=${encoded}`;
      const audio = new Audio(ttsUrl);
      audio.playbackRate = 0.92;
      audioFallbackRef.current = audio;
      audio.play().catch(() => {
        // Graceful fallback if offline without local Arabic voice
      });
      return;
    }

    // English native Web Speech
    if ('speechSynthesis' in window) {
      const enVoice =
        voices.find((v) => v.lang.toLowerCase().startsWith('en')) || null;
      const utterance = new SpeechSynthesisUtterance(text);
      if (enVoice) utterance.voice = enVoice;
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  const startVoiceGuide = (guideId: string) => {
    if (activeGuideId === guideId) {
      stopVoiceGuide();
      return;
    }

    stopVoiceGuide();
    const guide = SELF_CARE_GUIDES.find((g) => g.id === guideId);
    if (!guide) return;

    setActiveGuideId(guideId);
    const steps = lang === 'ar' ? guide.stepsAr : guide.stepsEn;

    const runStep = (idx: number) => {
      if (idx >= steps.length) {
        stopVoiceGuide();
        return;
      }
      setActiveStepIdx(idx);
      speakStep(steps[idx], lang);
      guideTimerRef.current = setTimeout(() => {
        runStep(idx + 1);
      }, guide.stepDurationsMs[idx] || 6000);
    };

    runStep(0);
  };

  const applyPresetScenario = (scenario: 'steady' | 'mild' | 'high') => {
    const dataset =
      scenario === 'high'
        ? buildSampleDriftDataset()
        : scenario === 'mild'
        ? buildMildDriftDataset()
        : buildInstantAnchorDataset();
    saveAdlHistory(dataset);
    onReportUpdated(evaluateMindBodyAdlDrift(dataset));
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
      'انتحار',
      'أؤذي نفسي',
    ];
    const isUrgent = concerningKeywords.some((kw) => lower.includes(kw));

    let reply = '';
    if (isUrgent) {
      setSafetyFlagged(true);
      reply =
        lang === 'ar'
          ? 'شكراً لثقتك ومشاركتي ما تمر به. سلامتك هي الأهم الآن—تتوفر خطوط دعم مجانية وسرية في الإمارات على مدار الساعة (800-SAKINA و 800-HOPE) أو التواصل المباشر مع مختص.'
          : 'Thank you for trusting me with how heavy things feel right now. Your safety matters most—free, confidential support in the UAE is available right now (800-SAKINA and 800-HOPE), along with direct connection to a licensed clinician.';
    } else if (
      lower.includes('eat') ||
      lower.includes('food') ||
      lower.includes('appetite') ||
      lower.includes('hungry') ||
      lower.includes('أكل') ||
      lower.includes('شهية')
    ) {
      reply =
        lang === 'ar'
          ? 'فقدان الشهية أو صعوبة الأكل رغم الشعور بالجوع علامة جسدية شائعة عند التوتر. استمع إلى مرشد تهدئة المعدة الصوتي أدناه وأكمل الأسئلة الثلاثة.'
          : 'Feeling hungry yet struggling to eat is a very common physical sign when stress tightens your nervous system. Listen to the Gentle Evening & Stomach Reset below, and answer the 3 quick questions.';
    } else {
      reply =
        lang === 'ar'
          ? 'شكراً لمشاركتك. ربط إشارات جسدك اليومية بمشاعرك يساعدنا على دعمك مبكراً وبخصوصية تامة. أجب على الأسئلة الثلاثة السريعة لعرض ملخصك.'
          : 'Thank you for sharing that. Connecting how your body has been resting and moving with how you feel helps catch overload early. Answer the 3 quick questions to view your personal reflection.';
    }

    setCompanionMessages((prev) => [
      ...prev,
      { sender: 'user', text },
      { sender: 'mizan', text: reply },
    ]);
    setUserReflectionText('');
  };

  // Strictly enforces all 3 questions (qIndex 0 -> 1 -> 2 -> finish)
  const handleSelectAdaptiveAnswer = (questionId: string, score: number) => {
    const updated = { ...adaptiveAnswers, [questionId]: score };
    setAdaptiveAnswers(updated);

    if (qIndex < 2) {
      setQIndex((prev) => prev + 1);
      return;
    }

    stopVoiceGuide();
    const totalAdaptiveScore = Object.values(updated).reduce((a, b) => a + b, 0); // 0 to 9
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
        updated['q-appetite'] ?? 0
      ),
      fatigueOrRoleLimit: Math.max(
        adlReport.suggestedPhysicalContext.fatigueOrRoleLimit,
        updated['q-energy-calm'] ?? 0
      ),
    };

    const result = evaluateBiopsychosocialTriage({
      who5,
      physicalContext,
      history,
    });

    if (adlReport.driftDetected) {
      result.whatThisMeans.unshift(adlReport.contextualExplanation);
    }

    onCompleteAdaptiveCheckIn({ who5, physicalContext, result });
  };

  const currentAdaptiveQ = adaptiveQuestions[qIndex] ?? adaptiveQuestions[0];

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="max-w-4xl mx-auto space-y-6">
      {/* Top State Switcher & Language Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => applyPresetScenario('steady')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer ${
              adlReport.severity === 'stable'
                ? 'bg-teal-800 text-white border-teal-800'
                : 'bg-white text-stone-700 border-stone-200 hover:border-teal-600'
            }`}
          >
            {lang === 'ar' ? 'إيقاع مستقر' : 'Steady Rhythm'}
          </button>
          <button
            type="button"
            onClick={() => applyPresetScenario('mild')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer ${
              adlReport.severity === 'mild_drift'
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-amber-50 text-amber-950 border-amber-200 hover:bg-amber-100'
            }`}
          >
            {lang === 'ar' ? 'تغيّر طفيف (3 أسئلة)' : 'Mild Shift (3-Question Check)'}
          </button>
          <button
            type="button"
            onClick={() => applyPresetScenario('high')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer ${
              adlReport.severity === 'notable_drift'
                ? 'bg-rose-700 text-white border-rose-700'
                : 'bg-rose-50 text-rose-950 border-rose-200 hover:bg-rose-100'
            }`}
          >
            {lang === 'ar' ? 'تغيّر كبير (استشارة مباشرة)' : 'High Shift (Direct Consult)'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            stopVoiceGuide();
            setLang((prev) => (prev === 'en' ? 'ar' : 'en'));
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white hover:bg-stone-50 border border-stone-200 text-xs font-semibold text-stone-800 cursor-pointer"
        >
          <Globe className="w-3.5 h-3.5 text-teal-700" />
          {lang === 'en' ? 'العربية' : 'English'}
        </button>
      </div>

      {/* Direct Clinic Escalation Banner when High 3-Day Shift Detected */}
      {adlReport.severity === 'notable_drift' && onDirectConsult && (
        <div className="p-4 sm:p-5 rounded-3xl bg-rose-950 text-white border border-rose-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-rose-200">
              {lang === 'ar'
                ? 'توجيه مباشر إلى استشارة حضورية أو عن بُعد'
                : 'Automated Clinical Pathway Triggered'}
            </div>
            <p className="text-xs sm:text-sm text-rose-100 leading-relaxed">
              {lang === 'ar'
                ? 'نظراً لوجود تغيّر ملحوظ في النوم والحركة وراحة الجسد خلال 3 أيام، يمكنك حجز استشارة مباشرة الآن أو إكمال الأسئلة الثلاثة أدناه.'
                : 'Because your sleep, movement, and body recovery all shifted significantly over 3 days, you can book a direct physical consultation right now—or answer the 3 quick questions below.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onDirectConsult}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-stone-100 text-stone-900 text-xs font-bold shrink-0 cursor-pointer"
          >
            <Stethoscope className="w-4 h-4 text-teal-800" />
            {lang === 'ar' ? 'حجز استشارة مباشرة' : 'Book Direct Consultation'}
          </button>
        </div>
      )}

      {/* Urgent Safety Banner */}
      {safetyFlagged && (
        <div className="p-5 rounded-3xl bg-rose-950 text-white border border-rose-800 space-y-3 shadow-md">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-200">
            <ShieldAlert className="w-4 h-4" />
            {lang === 'ar' ? 'دعم إنساني فوري ومجاني' : 'Immediate Confidential Support'}
          </div>
          <p className="text-xs sm:text-sm text-rose-100 leading-relaxed">
            {lang === 'ar'
              ? 'لست وحدك. يمكنك التحدث بسرية تامة مع مختص في الإمارات الآن:'
              : 'You do not have to carry this alone. Speak confidentially with a trained specialist in the UAE right now:'}
          </p>
          <div className="flex flex-wrap gap-2.5">
            <a
              href="tel:800725462"
              className="px-4 py-2 rounded-xl bg-white text-stone-900 font-bold text-xs"
            >
              800-SAKINA (800-725462)
            </a>
            <a
              href="tel:8004673"
              className="px-4 py-2 rounded-xl bg-teal-600 text-white font-bold text-xs"
            >
              800-HOPE (800-4673)
            </a>
            <a
              href="tel:998"
              className="px-4 py-2 rounded-xl bg-rose-800 border border-rose-600 text-white font-bold text-xs"
            >
              {lang === 'ar' ? 'الإسعاف 998' : 'Ambulance 998'}
            </a>
            <a
              href="tel:999"
              className="px-4 py-2 rounded-xl bg-rose-800 border border-rose-600 text-white font-bold text-xs"
            >
              {lang === 'ar' ? 'الطوارئ 999' : 'Emergency 999'}
            </a>
          </div>
        </div>
      )}

      {/* 1. Simple Human Rhythm Summary */}
      <div className="bg-[#FFFEFB] border border-stone-200 rounded-3xl shadow-xs p-6 space-y-4">
        <h2 className="font-serif text-xl sm:text-2xl text-stone-900">
          {lang === 'ar' ? adlReport.headlineAr : adlReport.headlineEn}
        </h2>

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
                <Moon className="w-3.5 h-3.5 text-teal-800" />
                {lang === 'ar' ? 'معدل النوم' : 'Sleep Rhythm'}
              </span>
              {adlReport.driftedDomains.includes('sleep') && (
                <span className="text-[10px] font-bold text-amber-900 bg-amber-200/70 px-2 py-0.5 rounded-full">
                  {lang === 'ar' ? 'انخفاض' : 'Shifted'}
                </span>
              )}
            </div>
            <div className="text-xl font-bold text-stone-900 mt-1.5">
              {adlReport.recentSummary.sleepHours}h
              <span className="text-xs font-normal text-stone-500">
                {' '}
                / {adlReport.baselineSummary.sleepHours}h {lang === 'ar' ? 'المعتاد' : 'usual'}
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
                <Activity className="w-3.5 h-3.5 text-teal-800" />
                {lang === 'ar' ? 'الحركة اليومية' : 'Daily Movement'}
              </span>
              {adlReport.driftedDomains.includes('movement') && (
                <span className="text-[10px] font-bold text-amber-900 bg-amber-200/70 px-2 py-0.5 rounded-full">
                  {lang === 'ar' ? 'أقل' : 'Slower'}
                </span>
              )}
            </div>
            <div className="text-xl font-bold text-stone-900 mt-1.5">
              {adlReport.recentSummary.steps.toLocaleString()}
              <span className="text-xs font-normal text-stone-500">
                {' '}
                {lang === 'ar' ? 'خطوة/يوم' : 'steps/day'}
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
                <HeartPulse className="w-3.5 h-3.5 text-teal-800" />
                {lang === 'ar' ? 'راحة الجسد' : 'Body Recovery'}
              </span>
            </div>
            <div className="text-xl font-bold text-stone-900 mt-1.5">
              {adlReport.driftedDomains.includes('autonomic')
                ? lang === 'ar'
                  ? 'إجهاد ملحوظ'
                  : 'Strained'
                : lang === 'ar'
                ? 'هادئ ومستقر'
                : 'Calm & Rested'}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Mizan Companion + Guaranteed 3 Quick Human Questions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-[#FFFEFB] border border-stone-200 rounded-3xl shadow-xs p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-900 bg-teal-50 border border-teal-200 px-3 py-1 rounded-full">
                <Sparkles className="w-3.5 h-3.5 text-teal-700" />
                {lang === 'ar' ? 'رفيق ميزان' : 'Mizan Companion'}
              </span>
              <span className="text-[11px] text-stone-400">
                {lang === 'ar' ? 'خاص على جهازك' : 'Private on your device'}
              </span>
            </div>

            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {companionMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                    msg.sender === 'mizan'
                      ? 'bg-teal-50/70 border border-teal-100 text-stone-800'
                      : 'bg-stone-900 text-white'
                  }`}
                >
                  {msg.text}
                </div>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleCompanionChatSubmit}
            className="pt-2 border-t border-stone-100 flex gap-2"
          >
            <input
              type="text"
              value={userReflectionText}
              onChange={(e) => setUserReflectionText(e.target.value)}
              placeholder={
                lang === 'ar'
                  ? 'شارك ما يؤثر على نومك أو شهيتك أو طاقتك...'
                  : 'Share what’s affecting your sleep, appetite, or energy...'
              }
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
                    {lang === 'ar'
                      ? `سؤال ${qIndex + 1} من 3 · ${currentAdaptiveQ.subtextAr}`
                      : `Question ${qIndex + 1} of 3 · ${currentAdaptiveQ.subtextEn}`}
                  </span>
                  <div className="flex gap-1">
                    {[0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        className={`h-1.5 w-6 rounded-full transition-colors ${
                          dot <= qIndex ? 'bg-teal-700' : 'bg-stone-200'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <h3 className="font-serif text-xl sm:text-2xl text-stone-900 leading-snug pt-2">
                  {lang === 'ar' ? currentAdaptiveQ.promptAr : currentAdaptiveQ.promptEn}
                </h3>
              </div>

              <div className="space-y-2.5">
                {currentAdaptiveQ.options.map((opt) => {
                  const isSelected = adaptiveAnswers[currentAdaptiveQ.id] === opt.score;
                  return (
                    <button
                      key={opt.labelEn}
                      type="button"
                      onClick={() => handleSelectAdaptiveAnswer(currentAdaptiveQ.id, opt.score)}
                      className={`w-full px-4 py-3.5 rounded-2xl border text-xs sm:text-sm font-medium flex items-center justify-between transition cursor-pointer ${
                        isSelected
                          ? 'bg-teal-800 text-white border-teal-800'
                          : 'bg-stone-50/80 text-stone-800 border-stone-200 hover:border-teal-600 hover:bg-white'
                      }`}
                    >
                      <span>{lang === 'ar' ? opt.labelAr : opt.labelEn}</span>
                      <ArrowRight
                        className={`w-4 h-4 ${isRtl ? 'rotate-180' : ''} ${
                          isSelected ? 'text-teal-200' : 'text-stone-400'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                <span className="text-stone-500">
                  {lang === 'ar'
                    ? 'اختر الإجابة الأقرب لحالتك لعرض ملخصك وخيارات الدعم.'
                    : 'Tap the option closest to how you feel to view your personal guidance.'}
                </span>
                {qIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => setQIndex((prev) => prev - 1)}
                    className="text-teal-800 hover:underline font-semibold cursor-pointer shrink-0"
                  >
                    {lang === 'ar' ? 'السابق →' : '← Back'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 3. Voice + Visual Guided Mind-Body Resets (All 3 Exercises) */}
      <div className="bg-[#FFFEFB] border border-stone-200 rounded-3xl shadow-xs p-6 md:p-7 space-y-4">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-800">
            {lang === 'ar' ? 'إرشاد صوتي وبصري فوري' : 'Voice & Visual Guided Relief'}
          </span>
          <h3 className="font-serif text-xl text-stone-900 mt-0.5">
            {lang === 'ar'
              ? 'اختر أي تمرين للاستماع واتباع الخطوات دون الحاجة للقراءة'
              : 'Tap any exercise to listen and follow with your eyes closed'}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SELF_CARE_GUIDES.map((item) => {
            const isPlayingThis = activeGuideId === item.id;
            const steps = lang === 'ar' ? item.stepsAr : item.stepsEn;

            return (
              <div
                key={item.id}
                className={`p-5 rounded-2xl border space-y-3 flex flex-col justify-between transition ${
                  isPlayingThis
                    ? 'bg-teal-950 text-white border-teal-800 shadow-md'
                    : 'bg-stone-50/80 text-stone-900 border-stone-200'
                }`}
              >
                <div className="space-y-2">
                  <span
                    className={`inline-block text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${
                      isPlayingThis
                        ? 'bg-teal-900 text-teal-200 border-teal-700'
                        : 'bg-teal-50 text-teal-900 border-teal-200'
                    }`}
                  >
                    {lang === 'ar' ? item.tagAr : item.tagEn}
                  </span>

                  <h4 className="font-semibold text-base">
                    {lang === 'ar' ? item.titleAr : item.titleEn}
                  </h4>

                  <p
                    className={`text-xs leading-relaxed ${
                      isPlayingThis ? 'text-teal-100/90' : 'text-stone-600'
                    }`}
                  >
                    {lang === 'ar' ? item.descAr : item.descEn}
                  </p>

                  <ol className="pt-2 space-y-2 text-xs">
                    {steps.map((stepText, idx) => {
                      const isCurrentStep = isPlayingThis && activeStepIdx === idx;
                      return (
                        <li
                          key={idx}
                          className={`p-2.5 rounded-xl transition ${
                            isCurrentStep
                              ? 'bg-teal-700 text-white font-semibold ring-1 ring-teal-300'
                              : isPlayingThis
                              ? 'text-teal-200/75'
                              : 'bg-white/80 text-stone-700 border border-stone-200/60'
                          }`}
                        >
                          <span className="font-bold me-1.5">{idx + 1}.</span>
                          {stepText}
                        </li>
                      );
                    })}
                  </ol>
                </div>

                <button
                  type="button"
                  onClick={() => startVoiceGuide(item.id)}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-2 transition cursor-pointer ${
                    isPlayingThis
                      ? 'bg-rose-600 hover:bg-rose-500 text-white'
                      : 'bg-teal-800 hover:bg-teal-900 text-white'
                  }`}
                >
                  {isPlayingThis ? (
                    <>
                      <Square className="w-3.5 h-3.5" />
                      {lang === 'ar' ? 'إيقاف الصوت' : 'Stop Voice Guide'}
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4" />
                      {lang === 'ar' ? 'ابدأ الإرشاد الصوتي' : 'Listen & Follow Guide'}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}