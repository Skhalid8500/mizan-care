// Mizan Care Zero-Access Handoff Protocol (protocol.ts)

export type ReferralStatus =
  | 'GENERATED'
  | 'ACCESSED'
  | 'APPOINTMENT_REQUESTED'
  | 'APPOINTMENT_SCHEDULED'
  | 'FOLLOWUP_COMPLETED';

export interface HandoffPayload {
  ciphertextBase64: string;
  ivBase64: string;
  pinHash: string;
  selectedClinicId: string;
  recommendedTier: number;
  consentScope: string[];
}

export interface ClinicianReplyPayload {
  clinicianName: string;
  clinicName: string;
  confirmedTime: string;
  consultationMode: 'Video Consultation' | 'In-Person Visit';
  meetingRoomUrl?: string;
  clinicLocation?: string;
  message: string;
  repliedAt: string;
}

export interface AuthorizedClinician {
  id: string;
  name: string;
  license: string;
}

export type AuthorizedShareScope = {
  includeWho5: boolean;
  includePhysicalContext: boolean;
  includeGad7: boolean;
  includePhq9: boolean;
  includePreferredLanguage: boolean;
};

export interface AuthorizedClinicalSummary {
  createdAt: string;
  expiresAt: string;
  recommendedTier: number;
  tierLabel?: string;
  referralReason: string;
  consentScope: string[];
  who5Standardized?: number;
  physicalLoadScore?: number | null;
  physicalBreakdown?: {
    sleepDisruption: number;
    painOrTension: number;
    fatigueOrRoleLimit: number;
  };
  gad7Total?: number | null;
  phq9Total?: number | null;
  phq9Item9Positive?: boolean;
  preferredLanguage?: string;
  selectedClinicId: string;
  selectedProviderName: string;
  preferredConsultationMode: string;
  residentNote?: string;
}

export interface GeneratedHandoffCredential {
  pin: string;
  keyBase64Url: string;
  qrPayload: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return base64ToBytes(padded);
}

export async function createEncryptedHandoffPackage(
  summary: AuthorizedClinicalSummary
): Promise<{
  credential: GeneratedHandoffCredential;
  serverPayload: HandoffPayload & { pin: string };
}> {
  const pin = Math.floor(100000 + Math.random() * 900000).toString();
  const rawKeyBytes = crypto.getRandomValues(new Uint8Array(32));
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    rawKeyBytes as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const encodedSummary = new TextEncoder().encode(JSON.stringify(summary));
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes as unknown as BufferSource },
    cryptoKey,
    encodedSummary as unknown as BufferSource
  );

  const pinHashBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(pin) as unknown as BufferSource
  );
  const pinHash = Array.from(new Uint8Array(pinHashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const ciphertextBase64 = bytesToBase64(new Uint8Array(encryptedBuffer));
  const ivBase64 = bytesToBase64(ivBytes);
  const keyBase64Url = bytesToBase64Url(rawKeyBytes);

  const qrPayload = JSON.stringify({
    pin,
    key: keyBase64Url,
    clinicId: summary.selectedClinicId,
  });

  return {
    credential: {
      pin,
      keyBase64Url,
      qrPayload,
    },
    serverPayload: {
      pin,
      ciphertextBase64,
      ivBase64,
      pinHash,
      selectedClinicId: summary.selectedClinicId,
      recommendedTier: summary.recommendedTier,
      consentScope: summary.consentScope,
    },
  };
}

export async function decryptHandoffPackage(
  ciphertextBase64: string,
  ivBase64: string,
  keyBase64Url: string
): Promise<AuthorizedClinicalSummary> {
  const rawKeyBytes = base64UrlToBytes(keyBase64Url);
  const ivBytes = base64ToBytes(ivBase64);
  const cipherBytes = base64ToBytes(ciphertextBase64);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    rawKeyBytes as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes as unknown as BufferSource },
    cryptoKey,
    cipherBytes as unknown as BufferSource
  );

  const decodedString = new TextDecoder().decode(decryptedBuffer);
  return JSON.parse(decodedString) as AuthorizedClinicalSummary;
}