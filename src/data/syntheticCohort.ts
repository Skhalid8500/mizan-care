// src/data/syntheticCohort.ts

export interface SyntheticTelemetryRecord {
  id: string;
  isSynthetic: true;
  ageGroup: '18-24' | '25-34' | '35-44' | '45-54' | '55+';
  gender: 'Female' | 'Male';
  nationalityGroup: 'UAE National' | 'Expat - South Asia' | 'Expat - Arab Region' | 'Expat - Southeast Asia' | 'Expat - Western/Other';
  language: 'Arabic' | 'English' | 'Urdu' | 'Tagalog';
  region: 'Abu Dhabi' | 'Al Ain' | 'Al Dhafra';
  recommendedTier: 1 | 2 | 3 | 4;
  positiveScreen: boolean;
  referralGenerated: boolean;
  clinicianAccessed: boolean;
  followupWithin7Days: boolean;
  waitTimeDays: number;
  baselineWho5: number;
  day30Who5: number;
  functioningImproved: boolean;
  crisisEscalated: boolean;
  crisisHumanCompleted: boolean;
}

// Deterministic pseudo-random generator so dashboard figures remain consistent across reloads
function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function generateSyntheticCohort(count = 500): SyntheticTelemetryRecord[] {
  const rand = seededRandom(20261120);
  const ageGroups: SyntheticTelemetryRecord['ageGroup'][] = ['18-24', '25-34', '35-44', '45-54', '55+'];
  const regions: SyntheticTelemetryRecord['region'][] = ['Abu Dhabi', 'Al Ain', 'Al Dhafra'];
  const languages: SyntheticTelemetryRecord['language'][] = ['Arabic', 'English', 'Urdu', 'Tagalog'];
  const nationalities: SyntheticTelemetryRecord['nationalityGroup'][] = [
    'UAE National',
    'Expat - South Asia',
    'Expat - Arab Region',
    'Expat - Southeast Asia',
    'Expat - Western/Other',
  ];

  const records: SyntheticTelemetryRecord[] = [];

  for (let i = 0; i < count; i++) {
    const rAge = rand();
    const ageGroup =
      rAge < 0.24 ? ageGroups[0] : rAge < 0.62 ? ageGroups[1] : rAge < 0.84 ? ageGroups[2] : rAge < 0.94 ? ageGroups[3] : ageGroups[4];

    const gender: 'Female' | 'Male' = rand() < 0.51 ? 'Female' : 'Male';

    const rReg = rand();
    const region = rReg < 0.62 ? regions[0] : rReg < 0.88 ? regions[1] : regions[2];

    const rNat = rand();
    const nationalityGroup =
      rNat < 0.26
        ? nationalities[0]
        : rNat < 0.58
        ? nationalities[1]
        : rNat < 0.76
        ? nationalities[2]
        : rNat < 0.90
        ? nationalities[3]
        : nationalities[4];

    const language: SyntheticTelemetryRecord['language'] =
      nationalityGroup === 'UAE National' || nationalityGroup === 'Expat - Arab Region'
        ? rand() < 0.78
          ? 'Arabic'
          : 'English'
        : nationalityGroup === 'Expat - South Asia'
        ? rand() < 0.55
          ? 'Urdu'
          : 'English'
        : nationalityGroup === 'Expat - Southeast Asia'
        ? rand() < 0.52
          ? 'Tagalog'
          : 'English'
        : 'English';

    // Baseline WHO-5 score distribution (0-100)
    const baselineWho5 = Math.min(96, Math.max(12, Math.round(28 + rand() * 58)));
    const positiveScreen = baselineWho5 <= 50;

    let recommendedTier: 1 | 2 | 3 | 4 = 1;
    if (baselineWho5 <= 20 && rand() < 0.28) {
      recommendedTier = 4;
    } else if (baselineWho5 <= 36) {
      recommendedTier = 3;
    } else if (baselineWho5 <= 52) {
      recommendedTier = 2;
    }

    const referralGenerated = recommendedTier >= 2 && rand() < 0.86;
    const clinicianAccessed = referralGenerated && rand() < 0.84;
    const followupWithin7Days = clinicianAccessed && rand() < 0.79;

    // Wait times vary slightly by tier and region
    const baseWait =
      recommendedTier === 4 ? 0.3 : recommendedTier === 3 ? 3.1 : recommendedTier === 2 ? 1.8 : 0;
    const regionPenalty = region === 'Al Dhafra' ? 1.2 : region === 'Al Ain' ? 0.4 : 0;
    const waitTimeDays =
      recommendedTier === 1 ? 0 : Number((baseWait + regionPenalty + rand() * 1.6).toFixed(1));

    const gain = followupWithin7Days
      ? Math.round(11 + rand() * 14)
      : referralGenerated
      ? Math.round(4 + rand() * 8)
      : Math.round(1 + rand() * 6);
    const day30Who5 = Math.min(96, baselineWho5 + gain);
    const functioningImproved = day30Who5 - baselineWho5 >= 8;

    const crisisEscalated = recommendedTier === 4;
    const crisisHumanCompleted = crisisEscalated ? rand() < 0.97 : false;

    records.push({
      id: `SYN-${(i + 1).toString().padStart(4, '0')}`,
      isSynthetic: true,
      ageGroup,
      gender,
      nationalityGroup,
      language,
      region,
      recommendedTier,
      positiveScreen,
      referralGenerated,
      clinicianAccessed,
      followupWithin7Days,
      waitTimeDays,
      baselineWho5,
      day30Who5,
      functioningImproved,
      crisisEscalated,
      crisisHumanCompleted,
    });
  }

  return records;
}