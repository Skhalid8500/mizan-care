import { NextResponse } from 'next/server';

interface ClinicAccount {
  clinicId: string;
  clinicName: string;
  emirate: string;
  practitionerName: string;
  licenseId: string;
  password: string;
}

interface StoredHandoff {
  pin: string;
  ciphertextBase64: string;
  ivBase64: string;
  selectedClinicId: string;
  selectedClinicName: string;
  consultationMode: string;
  recommendedTier: number;
  consentScope: string[];
  status: string;
  createdAt: string;
  keySharedByClient: boolean;
  releasedKey: string | null;
  clinicianReply: any | null;
  auditLog: { timestamp: string; event: string }[];
}

// Persist across hot-reloads in Next.js dev mode
const globalStore = globalThis as unknown as {
  __mizanClinics?: Map<string, ClinicAccount>;
  __mizanHandoffs?: Map<string, StoredHandoff>;
};

if (!globalStore.__mizanClinics) {
  globalStore.__mizanClinics = new Map<string, ClinicAccount>();
}
if (!globalStore.__mizanHandoffs) {
  globalStore.__mizanHandoffs = new Map<string, StoredHandoff>();
}

const clinicAccounts = globalStore.__mizanClinics;
const handoffRecords = globalStore.__mizanHandoffs;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    // 1. Register Clinic Account
    if (action === 'register_clinic') {
      const { clinicId, clinicName, emirate, practitionerName, licenseId, password } = body;
      if (!licenseId || !password || !practitionerName || !clinicName) {
        return NextResponse.json(
          { error: 'All clinic registration fields are required.' },
          { status: 400 }
        );
      }

      const normalizedLicense = licenseId.trim().toUpperCase();
      const account: ClinicAccount = {
        clinicId,
        clinicName,
        emirate,
        practitionerName,
        licenseId: normalizedLicense,
        password,
      };
      clinicAccounts.set(normalizedLicense, account);

      const { password: _, ...safeAccount } = account;
      return NextResponse.json({ ok: true, account: safeAccount });
    }

    // 2. Sign In to Clinic Account
    if (action === 'login_clinic') {
      const { licenseId, password } = body;
      const normalizedLicense = (licenseId || '').trim().toUpperCase();
      const account = clinicAccounts.get(normalizedLicense);

      if (!account || account.password !== password) {
        return NextResponse.json(
          { error: 'Invalid Practitioner License ID or password. Please register first or verify credentials.' },
          { status: 401 }
        );
      }

      const { password: _, ...safeAccount } = account;
      return NextResponse.json({ ok: true, account: safeAccount });
    }

    // 3. Resident Creates Encrypted Booking Pass
    if (action === 'create') {
      const {
        pin,
        ciphertextBase64,
        ivBase64,
        selectedClinicId,
        selectedClinicName,
        consultationMode,
        recommendedTier,
        consentScope,
      } = body;

      const targetPin = pin || Math.floor(100000 + Math.random() * 900000).toString();
      const now = new Date().toISOString();

      const record: StoredHandoff = {
        pin: targetPin,
        ciphertextBase64,
        ivBase64,
        selectedClinicId,
        selectedClinicName: selectedClinicName || 'Selected Care Facility',
        consultationMode: consultationMode || 'Video Consultation',
        recommendedTier: recommendedTier || 2,
        consentScope: Array.isArray(consentScope) ? consentScope : [],
        status: 'GENERATED',
        createdAt: now,
        keySharedByClient: false,
        releasedKey: null,
        clinicianReply: null,
        auditLog: [
          {
            timestamp: now,
            event: `Encrypted booking pass #${targetPin} created & routed to ${selectedClinicName || selectedClinicId}.`,
          },
        ],
      };

      handoffRecords.set(targetPin, record);
      return NextResponse.json({ ok: true, pin: targetPin });
    }

    // 4. List Clinic-Scoped Booking Queue
    if (action === 'list_queue') {
      const { clinicId } = body;
      const queue = Array.from(handoffRecords.values())
        .filter((rec) => rec.selectedClinicId === clinicId)
        .map((rec) => ({
          pin: rec.pin,
          selectedClinicName: rec.selectedClinicName,
          consultationMode: rec.consultationMode,
          recommendedTier: rec.recommendedTier,
          status: rec.status,
          createdAt: rec.createdAt,
          consentScopeCount: rec.consentScope.length,
          keySharedByClient: rec.keySharedByClient,
          releasedKey: rec.releasedKey,
        }));

      return NextResponse.json({ ok: true, queue });
    }

    // 5. Resident Releases Private Unlock Key Inside Portal
    if (action === 'release_key') {
      const { pin, keyBase64Url } = body;
      const record = handoffRecords.get(pin);
      if (!record) {
        return NextResponse.json({ error: 'Booking pass not found.' }, { status: 404 });
      }

      record.keySharedByClient = true;
      record.releasedKey = keyBase64Url;
      record.auditLog.push({
        timestamp: new Date().toISOString(),
        event: 'Resident authorized and released Private Unlock Key inside portal.',
      });
      handoffRecords.set(pin, record);

      return NextResponse.json({ ok: true });
    }

    // 6. Clinician Confirms Slot & Sends Reply (Works even before key is released!)
    if (action === 'reply') {
      const { pin, reply } = body;
      const record = handoffRecords.get(pin);
      if (!record) {
        return NextResponse.json({ error: 'Booking pass not found.' }, { status: 404 });
      }

      record.clinicianReply = reply;
      record.status = 'APPOINTMENT_SCHEDULED';
      record.auditLog.push({
        timestamp: new Date().toISOString(),
        event: `Appointment confirmed for ${reply.confirmedTime} by ${reply.clinicianName}.`,
      });
      handoffRecords.set(pin, record);

      return NextResponse.json({
        ok: true,
        status: record.status,
        auditLog: record.auditLog,
      });
    }

    // 7. Clinician Retrieves Encrypted Brief for Local Decryption
    if (action === 'retrieve') {
      const { pin, clinicId } = body;
      const record = handoffRecords.get(pin);
      if (!record) {
        return NextResponse.json(
          { error: 'No active booking found with that 6-digit code.' },
          { status: 404 }
        );
      }

      if (clinicId && record.selectedClinicId !== clinicId) {
        return NextResponse.json(
          { error: 'Access denied: This booking pass is addressed to a different clinic.' },
          { status: 403 }
        );
      }

      if (record.status === 'GENERATED') {
        record.status = 'ACCESSED';
      }
      record.auditLog.push({
        timestamp: new Date().toISOString(),
        event: 'Encrypted clinical payload retrieved for local browser decryption.',
      });
      handoffRecords.set(pin, record);

      return NextResponse.json({
        ok: true,
        ciphertextBase64: record.ciphertextBase64,
        ivBase64: record.ivBase64,
        releasedKey: record.releasedKey,
        status: record.status,
        consentScope: record.consentScope,
        auditLog: record.auditLog,
      });
    }

    // 8. Update Closed-Loop Status
    if (action === 'update_status') {
      const { pin, status } = body;
      const record = handoffRecords.get(pin);
      if (!record) {
        return NextResponse.json({ error: 'Booking pass not found.' }, { status: 404 });
      }

      record.status = status;
      record.auditLog.push({
        timestamp: new Date().toISOString(),
        event: `Closed-loop care status updated to ${status}.`,
      });
      handoffRecords.set(pin, record);

      return NextResponse.json({
        ok: true,
        status: record.status,
        auditLog: record.auditLog,
      });
    }

    // 9. Resident Checks for Clinician Reply
    if (action === 'check_reply') {
      const { pin } = body;
      const record = handoffRecords.get(pin);
      if (!record) {
        return NextResponse.json({ active: false });
      }

      return NextResponse.json({
        active: true,
        status: record.status,
        clinicianReply: record.clinicianReply,
        keyShared: record.keySharedByClient,
      });
    }

    // 10. Resident Revokes / Withdraws Pass
    if (action === 'revoke') {
      const { pin } = body;
      handoffRecords.delete(pin);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request payload.' }, { status: 400 });
  }
}