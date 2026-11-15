'use client';

import React, { useMemo, useState } from 'react';
import {
  Who5Responses,
  PhysicalContextResponses,
  Gad7Responses,
  Phq9Responses,
  HistoricalRecord,
  ExplainableResult,
  evaluateBiopsychosocialTriage,
  scoreWho5,
  scorePhysicalContext,
} from '@/lib/clinical/triage';
import { Globe, ArrowLeft, ArrowRight, Check, HeartHandshake, Sparkles } from 'lucide-react';

interface CheckInFlowProps {
  includePhysicalContext: boolean;
  history: HistoricalRecord[];
  onComplete: (payload: {
    who5: Who5Responses;
    physicalContext?: PhysicalContextResponses;
    gad7?: Gad7Responses;
    phq9?: Phq9Responses;
    result: ExplainableResult;
  }) => void;
  onBack: () => void;
}

type DomainKey = 'wellbeing' | 'body' | 'worry' | 'mood';

interface QuestionPrompt {
  id: string;
  domain: DomainKey;
  sectionTagEn: string;
  sectionTagAr: string;
  en: string;
  ar: string;
  scaleType: 'who5' | 'frequency';
  isSafetyItem?: boolean;
}

const DOMAIN_TRANSITIONS: Record<
  Exclude<DomainKey, 'wellbeing'>,
  {
    badgeEn: string;
    badgeAr: string;
    titleEn: string;
    titleAr: string;
    descEn: string;
    descAr: string;
    countLabelEn: string;
    countLabelAr: string;
  }
> = {
  body: {
    badgeEn: 'Next Area · Mind & Body',
    badgeAr: 'المحور التالي · الجسد والنفس',
    titleEn: 'Now let’s check in on how your body has been feeling.',
    titleAr: 'الآن دعنا نطمئن على كيفية شعور جسدك مؤخراً.',
    descEn:
      'Stress and emotional fatigue often show up first as restless sleep, tight shoulders, or physical exhaustion. These 3 short questions help us see the whole picture.',
    descAr:
      'غالباً ما يظهر التوتر والإرهاق النفسي أولاً في صورة اضطراب النوم أو شد العضلات أو التعب الجسدي. تساعدنا هذه الأسئلة الثلاثة القصيرة على فهم الصورة الكاملة.',
    countLabelEn: '3 brief questions · ~20 seconds',
    countLabelAr: '3 أسئلة قصيرة · حوالي 20 ثانية',
  },
  worry: {
    badgeEn: 'Optional Follow-Up · Worry & Tension',
    badgeAr: 'متابعة اختيارية · القلق والتوتر',
    titleEn: 'Let’s look gently at daily worry and restlessness.',
    titleAr: 'دعنا نلقي نظرة هادئة على القلق اليومي وصعوبة الاسترخاء.',
    descEn:
      'These 7 brief prompts explore how often nervous tension or racing thoughts have been present over the last two weeks. You can pause or view your summary whenever you wish.',
    descAr:
      'تستكشف هذه الأسئلة السبعة مدى تكرار التوتر العصبي أو الأفكار المتسارعة خلال الأسبوعين الماضيين. يمكنك التوقف أو عرض ملخصك في أي وقت.',
    countLabelEn: '7 brief questions · ~40 seconds',
    countLabelAr: '7 أسئلة قصيرة · حوالي 40 ثانية',
  },
  mood: {
    badgeEn: 'Final Area · Mood & Daily Energy',
    badgeAr: 'المحور الأخير · المزاج والطاقة اليومية',
    titleEn: 'Finally, a few questions on mood, sleep, and concentration.',
    titleAr: 'أخيراً، بضعة أسئلة حول المزاج والنوم والتركيز.',
    descEn:
      'You are nearly finished. These last 9 prompts help distinguish temporary tiredness from deeper low mood so we can suggest the right level of care.',
    descAr:
      'أوشكت على الانتهاء. تساعد هذه الأسئلة التسعة الأخيرة في التمييز بين التعب المؤقت وانخفاض المزاج الأعمق لنقترح لك مستوى الدعم الأنسب.',
    countLabelEn: '9 brief questions · ~45 seconds',
    countLabelAr: '9 أسئلة قصيرة · حوالي 45 ثانية',
  },
};

const CORE_QUESTIONS: QuestionPrompt[] = [
  {
    id: 'q1_cheerful',
    domain: 'wellbeing',
    sectionTagEn: 'Emotional Wellbeing',
    sectionTagAr: 'العافية النفسية',
    en: 'Over the past two weeks, I have felt cheerful and in good spirits.',
    ar: 'خلال الأسبوعين الماضيين، شعرت بالبهجة وبروح معنوية جيدة.',
    scaleType: 'who5',
  },
  {
    id: 'q2_calm',
    domain: 'wellbeing',
    sectionTagEn: 'Emotional Wellbeing',
    sectionTagAr: 'العافية النفسية',
    en: 'Over the past two weeks, I have felt calm and relaxed.',
    ar: 'خلال الأسبوعين الماضيين، شعرت بالهدوء والاسترخاء.',
    scaleType: 'who5',
  },
  {
    id: 'q3_active',
    domain: 'wellbeing',
    sectionTagEn: 'Energy & Vitality',
    sectionTagAr: 'الطاقة والحيوية',
    en: 'Over the past two weeks, I have felt active and vigorous.',
    ar: 'خلال الأسبوعين الماضيين، شعرت بالنشاط والحيوية.',
    scaleType: 'who5',
  },
  {
    id: 'q4_rested',
    domain: 'wellbeing',
    sectionTagEn: 'Rest & Recovery',
    sectionTagAr: 'الراحة والنوم',
    en: 'Over the past two weeks, I woke up feeling fresh and rested.',
    ar: 'خلال الأسبوعين الماضيين، استيقظت وأنا أشعر بالانتعاش والراحة.',
    scaleType: 'who5',
  },
  {
    id: 'q5_interested',
    domain: 'wellbeing',
    sectionTagEn: 'Daily Engagement',
    sectionTagAr: 'الاهتمام بالحياة اليومية',
    en: 'Over the past two weeks, my daily life has been filled with things that interest me.',
    ar: 'خلال الأسبوعين الماضيين، كانت حياتي اليومية مليئة بالأشياء التي تثير اهتمامي.',
    scaleType: 'who5',
  },
];

const BODY_QUESTIONS: QuestionPrompt[] = [
  {
    id: 'sleepDisruption',
    domain: 'body',
    sectionTagEn: 'Mind & Body Connection',
    sectionTagAr: 'ترابط الجسد والنفس',
    en: 'Have sleep difficulties affected your daily functioning?',
    ar: 'هل أثرت صعوبات النوم على أدائك اليومي؟',
    scaleType: 'frequency',
  },
  {
    id: 'painOrTension',
    domain: 'body',
    sectionTagEn: 'Mind & Body Connection',
    sectionTagAr: 'ترابط الجسد والنفس',
    en: 'Have physical discomfort, pain, or muscular tension affected your activities?',
    ar: 'هل أثر الانزعاج الجسدي أو الألم أو الشد العضلي على أنشطتك؟',
    scaleType: 'frequency',
  },
  {
    id: 'fatigueOrRoleLimit',
    domain: 'body',
    sectionTagEn: 'Mind & Body Connection',
    sectionTagAr: 'ترابط الجسد والنفس',
    en: 'Have fatigue or physical limitations affected your work, studies, or daily responsibilities?',
    ar: 'هل أثر الإرهاق أو القيود الجسدية على عملك أو دراستك أو مسؤولياتك اليومية؟',
    scaleType: 'frequency',
  },
];

const DEEPER_QUESTIONS: QuestionPrompt[] = [
  { id: 'gad_0', domain: 'worry', sectionTagEn: 'Worry & Tension', sectionTagAr: 'القلق والتوتر', en: 'Feeling nervous, anxious, or on edge', ar: 'الشعور بالعصبية أو القلق أو التوتر الشديد', scaleType: 'frequency' },
  { id: 'gad_1', domain: 'worry', sectionTagEn: 'Worry & Tension', sectionTagAr: 'القلق والتوتر', en: 'Not being able to stop or control worrying', ar: 'عدم القدرة على التوقف عن القلق أو السيطرة عليه', scaleType: 'frequency' },
  { id: 'gad_2', domain: 'worry', sectionTagEn: 'Worry & Tension', sectionTagAr: 'القلق والتوتر', en: 'Worrying too much about different things', ar: 'القلق المفرط بشأن أشياء مختلفة', scaleType: 'frequency' },
  { id: 'gad_3', domain: 'worry', sectionTagEn: 'Worry & Tension', sectionTagAr: 'القلق والتوتر', en: 'Trouble relaxing', ar: 'صعوبة في الاسترخاء', scaleType: 'frequency' },
  { id: 'gad_4', domain: 'worry', sectionTagEn: 'Worry & Tension', sectionTagAr: 'القلق والتوتر', en: 'Being so restless that it is hard to sit still', ar: 'شدة التململ بحيث يصعب الجلوس بهدوء', scaleType: 'frequency' },
  { id: 'gad_5', domain: 'worry', sectionTagEn: 'Worry & Tension', sectionTagAr: 'القلق والتوتر', en: 'Becoming easily annoyed or irritable', ar: 'سرعة الانزعاج أو الانفعال', scaleType: 'frequency' },
  { id: 'gad_6', domain: 'worry', sectionTagEn: 'Worry & Tension', sectionTagAr: 'القلق والتوتر', en: 'Feeling afraid, as if something awful might happen', ar: 'الشعور بالخوف كما لو أن شيئاً فظيعاً قد يحدث', scaleType: 'frequency' },
  { id: 'phq_0', domain: 'mood', sectionTagEn: 'Mood & Daily Energy', sectionTagAr: 'المزاج والطاقة اليومية', en: 'Little interest or pleasure in doing things', ar: 'قلة الاهتمام أو الاستمتاع بممارسة الأشياء', scaleType: 'frequency' },
  { id: 'phq_1', domain: 'mood', sectionTagEn: 'Mood & Daily Energy', sectionTagAr: 'المزاج والطاقة اليومية', en: 'Feeling down, depressed, or hopeless', ar: 'الشعور بالحزن أو الاكتئاب أو اليأس', scaleType: 'frequency' },
  { id: 'phq_2', domain: 'mood', sectionTagEn: 'Mood & Daily Energy', sectionTagAr: 'المزاج والطاقة اليومية', en: 'Trouble falling or staying asleep, or sleeping too much', ar: 'صعوبة في النوم أو الاستمرار فيه، أو النوم أكثر من اللازم', scaleType: 'frequency' },
  { id: 'phq_3', domain: 'mood', sectionTagEn: 'Mood & Daily Energy', sectionTagAr: 'المزاج والطاقة اليومية', en: 'Feeling tired or having little energy', ar: 'الشعور بالتعب أو قلة الطاقة', scaleType: 'frequency' },
  { id: 'phq_4', domain: 'mood', sectionTagEn: 'Mood & Daily Energy', sectionTagAr: 'المزاج والطاقة اليومية', en: 'Poor appetite or overeating', ar: 'ضعف الشهية أو الإفراط في تناول الطعام', scaleType: 'frequency' },
  { id: 'phq_5', domain: 'mood', sectionTagEn: 'Mood & Daily Energy', sectionTagAr: 'المزاج والطاقة اليومية', en: 'Feeling bad about yourself — or that you are a failure', ar: 'الشعور بالسوء تجاه نفسك أو أنك فاشل', scaleType: 'frequency' },
  { id: 'phq_6', domain: 'mood', sectionTagEn: 'Mood & Daily Energy', sectionTagAr: 'المزاج والطاقة اليومية', en: 'Trouble concentrating on things', ar: 'صعوبة في التركيز على الأشياء', scaleType: 'frequency' },
  { id: 'phq_7', domain: 'mood', sectionTagEn: 'Mood & Daily Energy', sectionTagAr: 'المزاج والطاقة اليومية', en: 'Moving or speaking slowly, or being unusually fidgety/restless', ar: 'بطء الحركة أو الكلام، أو كثرة التململ على غير العادة', scaleType: 'frequency' },
  { id: 'phq_8', domain: 'mood', sectionTagEn: 'Personal Safety Check', sectionTagAr: 'الاطمئنان على سلامتك', en: 'Thoughts that you would be better off dead, or of hurting yourself in some way', ar: 'أفكار بأنك ستكون أفضل حالاً لو مت، أو بإيذاء نفسك بطريقة ما', scaleType: 'frequency', isSafetyItem: true },
];

const WHO5_CHOICES = [
  { value: 5, en: 'All of the time', ar: 'طوال الوقت' },
  { value: 4, en: 'Most of the time', ar: 'معظم الوقت' },
  { value: 3, en: 'More than half of the time', ar: 'أكثر من نصف الوقت' },
  { value: 2, en: 'Less than half of the time', ar: 'أقل من نصف الوقت' },
  { value: 1, en: 'Some of the time', ar: 'بعض الوقت' },
  { value: 0, en: 'At no time', ar: 'في أي وقت' },
];

const FREQ_CHOICES = [
  { value: 0, en: 'Not at all', ar: 'أبداً' },
  { value: 1, en: 'Several days', ar: 'عدة أيام' },
  { value: 2, en: 'More than half the days', ar: 'أكثر من نصف الأيام' },
  { value: 3, en: 'Nearly every day', ar: 'تقريباً كل يوم' },
];

export default function CheckInFlow({
  includePhysicalContext,
  history,
  onComplete,
  onBack,
}: CheckInFlowProps) {
  const [lang, setLang] = useState<'en' | 'ar'>('en');
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [isTransitioning, setIsTransitioning] = useState(false);

  const [showDeeperOffer, setShowDeeperOffer] = useState(false);
  const [includeDeeper, setIncludeDeeper] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [domainNotice, setDomainNotice] = useState<Exclude<DomainKey, 'wellbeing'> | null>(null);

  const activeQuestions = useMemo(() => {
    const base = includePhysicalContext
      ? [...CORE_QUESTIONS, ...BODY_QUESTIONS]
      : [...CORE_QUESTIONS];
    return includeDeeper ? [...base, ...DEEPER_QUESTIONS] : base;
  }, [includePhysicalContext, includeDeeper]);

  const currentQuestion = activeQuestions[currentIndex];
  const progressPercent = Math.round(((currentIndex + 1) / activeQuestions.length) * 100);
  const isRtl = lang === 'ar';

  const buildPayloadsAndFinish = (withDeeper: boolean, finalAnswers: Record<string, number>) => {
    const who5: Who5Responses = {
      q1_cheerful: finalAnswers.q1_cheerful ?? 3,
      q2_calm: finalAnswers.q2_calm ?? 3,
      q3_active: finalAnswers.q3_active ?? 3,
      q4_rested: finalAnswers.q4_rested ?? 3,
      q5_interested: finalAnswers.q5_interested ?? 3,
    };

    const physicalContext: PhysicalContextResponses | undefined = includePhysicalContext
      ? {
          sleepDisruption: finalAnswers.sleepDisruption ?? 0,
          painOrTension: finalAnswers.painOrTension ?? 0,
          fatigueOrRoleLimit: finalAnswers.fatigueOrRoleLimit ?? 0,
        }
      : undefined;

    const gad7: Gad7Responses | undefined = withDeeper
      ? {
          items: [
            finalAnswers.gad_0 ?? 0,
            finalAnswers.gad_1 ?? 0,
            finalAnswers.gad_2 ?? 0,
            finalAnswers.gad_3 ?? 0,
            finalAnswers.gad_4 ?? 0,
            finalAnswers.gad_5 ?? 0,
            finalAnswers.gad_6 ?? 0,
          ],
        }
      : undefined;

    const phq9: Phq9Responses | undefined = withDeeper
      ? {
          items: [
            finalAnswers.phq_0 ?? 0,
            finalAnswers.phq_1 ?? 0,
            finalAnswers.phq_2 ?? 0,
            finalAnswers.phq_3 ?? 0,
            finalAnswers.phq_4 ?? 0,
            finalAnswers.phq_5 ?? 0,
            finalAnswers.phq_6 ?? 0,
            finalAnswers.phq_7 ?? 0,
            finalAnswers.phq_8 ?? 0,
          ],
        }
      : undefined;

    const result = evaluateBiopsychosocialTriage({
      who5,
      physicalContext,
      gad7,
      phq9,
      history,
    });

    onComplete({ who5, physicalContext, gad7, phq9, result });
  };

  const advanceAfterSelect = (updated: Record<string, number>) => {
    const coreCount = includePhysicalContext
      ? CORE_QUESTIONS.length + BODY_QUESTIONS.length
      : CORE_QUESTIONS.length;

    if (!includeDeeper && currentIndex === coreCount - 1) {
      const { standardized } = scoreWho5({
        q1_cheerful: updated.q1_cheerful ?? 3,
        q2_calm: updated.q2_calm ?? 3,
        q3_active: updated.q3_active ?? 3,
        q4_rested: updated.q4_rested ?? 3,
        q5_interested: updated.q5_interested ?? 3,
      });
      const phys = includePhysicalContext
        ? scorePhysicalContext({
            sleepDisruption: updated.sleepDisruption ?? 0,
            painOrTension: updated.painOrTension ?? 0,
            fatigueOrRoleLimit: updated.fatigueOrRoleLimit ?? 0,
          })
        : null;

      setShowDeeperOffer(true);
      setIncludeDeeper(standardized <= 50 || (phys !== null && phys >= 5));
      return;
    }

    if (currentIndex < activeQuestions.length - 1) {
      const nextIndex = currentIndex + 1;
      const currentDomain = activeQuestions[currentIndex].domain;
      const nextDomain = activeQuestions[nextIndex].domain;

      setCurrentIndex(nextIndex);

      if (nextDomain !== currentDomain && nextDomain !== 'wellbeing') {
        setDomainNotice(nextDomain);
      }
    } else {
      buildPayloadsAndFinish(includeDeeper, updated);
    }
  };

  const handleSelectOption = (value: number) => {
    if (isTransitioning) return;
    const updated = { ...answers, [currentQuestion.id]: value };
    setAnswers(updated);
    setIsTransitioning(true);

    setTimeout(() => {
      setIsTransitioning(false);
      advanceAfterSelect(updated);
    }, 240);
  };

  if (domainNotice) {
    const info = DOMAIN_TRANSITIONS[domainNotice];
    return (
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className="max-w-2xl mx-auto bg-[#FFFEFB] border border-stone-200 rounded-3xl shadow-xs p-6 md:p-10 space-y-6"
      >
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-900 bg-teal-50 border border-teal-200/80 px-3 py-1 rounded-full">
            <HeartHandshake className="w-3.5 h-3.5 text-teal-700" />
            {lang === 'en' ? info.badgeEn : info.badgeAr}
          </span>

          <button
            type="button"
            onClick={() => setLang((p) => (p === 'en' ? 'ar' : 'en'))}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-stone-200 text-xs font-medium text-stone-600 hover:bg-stone-50"
          >
            <Globe className="w-3.5 h-3.5 text-teal-700" />
            {lang === 'en' ? 'العربية' : 'English'}
          </button>
        </div>

        <div className="space-y-2.5">
          <h2 className="font-serif text-2xl sm:text-3xl text-stone-900 leading-snug">
            {lang === 'en' ? info.titleEn : info.titleAr}
          </h2>
          <p className="text-sm text-stone-600 leading-relaxed">
            {lang === 'en' ? info.descEn : info.descAr}
          </p>
          <p className="text-xs font-medium text-teal-800 pt-1">
            {lang === 'en' ? info.countLabelEn : info.countLabelAr}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-stone-100">
          {(domainNotice === 'worry' || domainNotice === 'mood') && (
            <button
              type="button"
              onClick={() => {
                setDomainNotice(null);
                buildPayloadsAndFinish(domainNotice === 'mood', answers);
              }}
              className="text-xs font-medium text-stone-500 hover:text-stone-900 underline underline-offset-4 cursor-pointer"
            >
              {lang === 'en' ? 'Skip remaining & see my reflection' : 'تخطي الباقي وعرض ملخصي'}
            </button>
          )}

          <button
            type="button"
            onClick={() => setDomainNotice(null)}
            className="ml-auto px-6 py-3 rounded-2xl bg-teal-800 hover:bg-teal-900 text-white text-sm font-semibold transition cursor-pointer"
          >
            {lang === 'en' ? 'Continue' : 'متابعة'}
          </button>
        </div>
      </div>
    );
  }

  if (showDeeperOffer) {
    return (
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className="max-w-2xl mx-auto bg-[#FFFEFB] border border-stone-200 rounded-3xl shadow-xs p-6 md:p-10"
      >
        <div className="flex justify-end mb-4">
          <button
            type="button"
            onClick={() => setLang((p) => (p === 'en' ? 'ar' : 'en'))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-stone-200 text-xs font-medium text-stone-600 hover:bg-stone-50"
          >
            <Globe className="w-3.5 h-3.5 text-teal-700" />
            {lang === 'en' ? 'العربية' : 'English'}
          </button>
        </div>

        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-900 bg-teal-50 px-3 py-1 rounded-full mb-3">
          <Sparkles className="w-3.5 h-3.5 text-teal-700" />
          {lang === 'en' ? 'Core Reflection Complete' : 'اكتمل التقييم الأساسي'}
        </div>

        <h2 className="font-serif text-2xl sm:text-3xl text-stone-900 leading-snug">
          {lang === 'en'
            ? 'Thank you for sharing how things have been feeling.'
            : 'شكراً لمشاركتك كيف كانت أحوالك مؤخراً.'}
        </h2>
        <p className="text-sm text-stone-600 mt-3 leading-relaxed">
          {lang === 'en'
            ? 'You can view your personal reflection right now, or answer two brief optional sections on worry and mood so we can match support options more closely.'
            : 'يمكنك عرض ملخصك الشخصي الآن، أو الإجابة على قسمين اختياريين قصيرين حول القلق والمزاج لنخصص لك خيارات الدعم بدقة أكبر.'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-7">
          <button
            type="button"
            onClick={() => {
              setIncludeDeeper(true);
              setShowDeeperOffer(false);
              setCurrentIndex(
                includePhysicalContext
                  ? CORE_QUESTIONS.length + BODY_QUESTIONS.length
                  : CORE_QUESTIONS.length
              );
              setDomainNotice('worry');
            }}
            className="p-4 rounded-2xl bg-teal-800 hover:bg-teal-900 text-white text-start transition shadow-xs cursor-pointer"
          >
            <div className="font-semibold text-sm">
              {lang === 'en'
                ? 'Explore optional worry & mood check'
                : 'متابعة أسئلة القلق والمزاج الاختيارية'}
            </div>
            <div className="text-xs text-teal-100 mt-1">
              {lang === 'en'
                ? 'Guided section by section · ~1 minute'
                : 'مقسمة بهدوء إلى محورين · حوالي دقيقة'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => buildPayloadsAndFinish(false, answers)}
            className="p-4 rounded-2xl bg-stone-100 hover:bg-stone-200/80 text-stone-900 text-start transition cursor-pointer"
          >
            <div className="font-semibold text-sm">
              {lang === 'en' ? 'View my reflection now' : 'عرض ملخصي الآن'}
            </div>
            <div className="text-xs text-stone-600 mt-1">
              {lang === 'en'
                ? 'Use my responses so far without extra questions'
                : 'الاعتماد على إجاباتي الحالية دون أسئلة إضافية'}
            </div>
          </button>
        </div>
      </div>
    );
  }

  const choices = currentQuestion.scaleType === 'who5' ? WHO5_CHOICES : FREQ_CHOICES;
  const currentVal = answers[currentQuestion.id];

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="max-w-3xl mx-auto bg-[#FFFEFB] border border-stone-200 rounded-3xl shadow-xs overflow-hidden"
    >
      <div className="h-1.5 w-full bg-stone-100">
        <div
          className="h-full bg-teal-700 transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Mobile & Tablet Mind-Body Banner */}
      <div className="md:hidden relative h-36 w-full bg-stone-100 border-b border-stone-200/70">
        <img
          src="/media/mind-body.jpg"
          alt="Mind and body balance"
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950/60 via-transparent to-transparent flex items-end p-3.5">
          <p className="text-white text-xs font-medium">
            {lang === 'en'
              ? 'Take your time — answer honestly at your own pace.'
              : 'خذ وقتك — أجب بصدق وبالوتيرة التي تناسبك.'}
          </p>
        </div>
      </div>

      <div className="p-6 md:p-10 grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
        <div className="md:col-span-8 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-teal-800 bg-teal-50 px-3 py-1 rounded-full">
              {lang === 'en' ? currentQuestion.sectionTagEn : currentQuestion.sectionTagAr}
            </span>

            <button
              type="button"
              onClick={() => setLang((prev) => (prev === 'en' ? 'ar' : 'en'))}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-stone-200 text-xs font-medium text-stone-600 hover:bg-stone-50"
            >
              <Globe className="w-3.5 h-3.5 text-teal-700" />
              {lang === 'en' ? 'العربية' : 'English'}
            </button>
          </div>

          <h2 className="font-serif text-2xl sm:text-[26px] text-stone-900 leading-snug">
            {lang === 'en' ? currentQuestion.en : currentQuestion.ar}
          </h2>

          <div className="space-y-2.5">
            {choices.map((opt) => {
              const selected = currentVal === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelectOption(opt.value)}
                  className={`w-full px-4 py-3.5 rounded-2xl border text-sm font-medium flex items-center justify-between transition-all duration-150 cursor-pointer ${
                    selected
                      ? currentQuestion.isSafetyItem && opt.value > 0
                        ? 'bg-rose-800 text-white border-rose-800 scale-[0.99]'
                        : 'bg-teal-800 text-white border-teal-800 shadow-xs scale-[0.99]'
                      : 'bg-stone-50/70 text-stone-800 border-stone-200 hover:border-teal-500 hover:bg-white'
                  }`}
                >
                  <span>{lang === 'en' ? opt.en : opt.ar}</span>
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                      selected
                        ? 'bg-white text-teal-900 border-white'
                        : 'border-stone-300 bg-white'
                    }`}
                  >
                    {selected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-stone-100 text-xs">
            <button
              type="button"
              onClick={() => {
                if (currentIndex === 0) onBack();
                else setCurrentIndex((prev) => prev - 1);
              }}
              className="inline-flex items-center gap-1.5 text-stone-500 hover:text-stone-900 font-medium cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {lang === 'en' ? 'Previous' : 'السابق'}
            </button>

            <span className="text-stone-400">
              {currentIndex + 1} / {activeQuestions.length}
            </span>

            {currentVal !== undefined ? (
              <button
                type="button"
                onClick={() => advanceAfterSelect(answers)}
                className="inline-flex items-center gap-1 text-teal-800 hover:text-teal-950 font-semibold cursor-pointer"
              >
                {lang === 'en' ? 'Next' : 'التالي'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <span className="text-stone-400 text-[11px]">
                {lang === 'en' ? 'Tap an answer' : 'اختر إجابة'}
              </span>
            )}
          </div>
        </div>

        {/* Desktop Side Visual Companion Card */}
        <div className="hidden md:block md:col-span-4">
          <div className="rounded-2xl overflow-hidden border border-stone-200 bg-stone-100 shadow-2xs">
            <img
              src="/media/mind-body.jpg"
              alt="Mind and body balance"
              className="w-full h-64 object-cover"
            />
            <div className="p-4 bg-stone-50 text-xs text-stone-600 leading-relaxed">
              {lang === 'en'
                ? 'Take your time. There are no right or wrong answers—only an honest snapshot of how your days have felt.'
                : 'خذ وقتك. لا توجد إجابات صحيحة أو خاطئة، بل هي نظرة صادقة لكيفية شعورك في أيامك الأخيرة.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}