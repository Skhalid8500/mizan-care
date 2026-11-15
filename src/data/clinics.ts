// src/data/clinics.ts
import { SupportTier } from '@/lib/clinical/triage';

export interface ClinicCenter {
  id: string;
  name: string;
  tier: SupportTier;
  focusLabel: string;
  emirate: 'Abu Dhabi' | 'Al Ain' | 'Al Dhafra';
  neighborhood: string;
  leadClinician: string;
  clinicianRole: string;
  languages: string[];
  nextAvailable: string;
  slotsRemaining: number;
  consultationModes: ('Video Consultation' | 'In-Person Visit')[];
  summary: string;
}

export const CLINIC_DIRECTORY: ClinicCenter[] = [
  {
    id: 'clinic-mushrif',
    name: 'Al Mushrif Integrated Mind & Body Clinic',
    tier: 3,
    focusLabel: 'Primary Care & Physical-Mental Support',
    emirate: 'Abu Dhabi',
    neighborhood: 'Al Mushrif, near Umm Al Emarat Park',
    leadClinician: 'Dr. Layla Al-Mansoori',
    clinicianRole: 'Family Medicine & Biopsychosocial Lead',
    languages: ['Arabic', 'English'],
    nextAvailable: 'Tomorrow, 10:30 AM – 1:00 PM',
    slotsRemaining: 3,
    consultationModes: ['Video Consultation', 'In-Person Visit'],
    summary:
      'Ideal when sleep disruption, muscular tension, or exhaustion overlap with ongoing stress or low mood.',
  },
  {
    id: 'clinic-telecare',
    name: 'Mubadala / Emirates Tele-Wellbeing Network',
    tier: 3,
    focusLabel: 'Private Remote Counseling',
    emirate: 'Abu Dhabi',
    neighborhood: 'UAE-Wide Encrypted Video Portal',
    leadClinician: 'Tariq Al-Hashimi, MSc',
    clinicianRole: 'Licensed Clinical Counselor',
    languages: ['Arabic', 'English', 'Urdu', 'Tagalog'],
    nextAvailable: 'Today, 5:00 PM – 8:00 PM',
    slotsRemaining: 5,
    consultationModes: ['Video Consultation'],
    summary:
      'Evening and weekend one-on-one counseling sessions from home with multilingual licensed therapists.',
  },
  {
    id: 'clinic-alain-hub',
    name: 'Al Ain Community Wellbeing & Peer Circle',
    tier: 2,
    focusLabel: 'Guided Peer & Stress Recovery Group',
    emirate: 'Al Ain',
    neighborhood: 'Al Jimi Community Health Annex',
    leadClinician: 'Amina Al-Nuaimi',
    clinicianRole: 'Wellbeing Facilitator & Nurse Educator',
    languages: ['Arabic', 'English', 'Urdu'],
    nextAvailable: 'Wednesday, 6:00 PM (Small Group)',
    slotsRemaining: 4,
    consultationModes: ['In-Person Visit', 'Video Consultation'],
    summary:
      'Small, confidential peer circles focused on sleep recovery, burnout prevention, and everyday coping.',
  },
  {
    id: 'clinic-aldhafra',
    name: 'Al Dhafra Urgent Assessment & Family Care Unit',
    tier: 4,
    focusLabel: 'Same-Day Priority Human Assessment',
    emirate: 'Al Dhafra',
    neighborhood: 'Madinat Zayed Medical Complex',
    leadClinician: 'Dr. Omar Al-Kaabi',
    clinicianRole: 'Consultant Psychiatrist & Crisis Lead',
    languages: ['Arabic', 'English'],
    nextAvailable: 'Same-Day Priority Review (Within 2 Hours)',
    slotsRemaining: 2,
    consultationModes: ['In-Person Visit', 'Video Consultation'],
    summary:
      'Dedicated priority clinical evaluation when safety items or severe distress need immediate human support.',
  },
];