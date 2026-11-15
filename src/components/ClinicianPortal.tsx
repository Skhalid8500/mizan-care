'use client';

import React, { useEffect, useState } from 'react';
import {
  AuthorizedClinicalSummary,
  ReferralStatus,
  ClinicianReplyPayload,
  decryptHandoffPackage,
} from '@/lib/handoff/protocol';
import { CLINIC_DIRECTORY } from '@/data/clinics';
import {
  ShieldCheck,
  Clock,
  Activity,
  HeartPulse,
  FileCheck2,
  AlertCircle,
  Send,
  Lock,
  Video,
  MapPin,
  CheckCircle2,
  RefreshCw,
  Calendar,
  LogOut,
  Building2,
  UserPlus,
  KeyRound,
  CalendarCheck,
  Award,
  X,
} from 'lucide-react';

interface ClinicianPortalProps {
  onClosedLoopCompleted?: (summary: AuthorizedClinicalSummary, finalStatus: ReferralStatus) => void;
}

interface ClinicSession {
  clinicId: string;
  clinicName: string;
  emirate: string;
  practitionerName: string;
  licenseId: string;
}

interface QueueItem {
  pin: string;
  selectedClinicName: string;
  consultationMode: string;
  recommendedTier: number;
  status: string;
  createdAt: string;
  consentScopeCount: number;
  keySharedByClient: boolean;
  releasedKey: string | null;
}

const CLOSED_LOOP_STEPS: { status: ReferralStatus; label: string }[] = [
  { status: 'GENERATED', label: 'Request Received' },
  { status: 'ACCESSED', label: 'Brief Opened' },
  { status: 'APPOINTMENT_REQUESTED', label: 'Slot Offered' },
  { status: 'APPOINTMENT_SCHEDULED', label: 'Booked / Confirmed' },
  { status: 'FOLLOWUP_COMPLETED', label: 'Session Completed' },
];

const QUICK_SLOTS = [
  'Today at 4:30 PM',
  'Tomorrow at 10:30 AM',
  'Tomorrow at 2:00 PM',
  'Thursday at 11:00 AM',
];

export default function ClinicianPortal({ onClosedLoopCompleted }: ClinicianPortalProps) {
  const [authMode, setAuthMode] = useState<'register' | 'login'>('register');
  const [clinicSession, setClinicSession] = useState<ClinicSession | null>(null);

  const [selectedDirectoryClinicId, setSelectedDirectoryClinicId] = useState<string>(
    CLINIC_DIRECTORY[0].id
  );
  const [customClinicName, setCustomClinicName] = useState('');
  const [emirate, setEmirate] = useState('Abu Dhabi');
  const [practitionerName, setPractitionerName] = useState('');
  const [licenseId, setLicenseId] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [bookingQueue, setBookingQueue] = useState<QueueItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);

  // Interactive Booking Confirmation Modal State
  const [activeReplyBooking, setActiveReplyBooking] = useState<QueueItem | null>(null);
  const [confirmedTime, setConfirmedTime] = useState('');
  const [replyMode, setReplyMode] = useState<'Video Consultation' | 'In-Person Visit'>(
    'Video Consultation'
  );
  const [meetingLink, setMeetingLink] = useState('');
  const [clinicLocation, setClinicLocation] = useState('');
  const [replyMessage, setReplyMessage] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [bookingSuccessBanner, setBookingSuccessBanner] = useState<{
    pin: string;
    confirmedTime: string;
  } | null>(null);

  const [pin, setPin] = useState('');
  const [decryptionKey, setDecryptionKey] = useState('');
  const [isLoadingBrief, setIsLoadingBrief] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  const [summary, setSummary] = useState<AuthorizedClinicalSummary | null>(null);
  const [currentStatus, setCurrentStatus] = useState<ReferralStatus>('GENERATED');
  const [consentScope, setConsentScope] = useState<string[]>([]);
  const [auditLog, setAuditLog] = useState<{ timestamp: string; event: string }[]>([]);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const fetchClinicQueue = async (clinicId: string) => {
    setLoadingQueue(true);
    try {
      const res = await fetch('/api/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list_queue', clinicId }),
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.queue)) {
        setBookingQueue(data.queue);
      }
    } finally {
      setLoadingQueue(false);
    }
  };

  useEffect(() => {
    if (clinicSession) {
      fetchClinicQueue(clinicSession.clinicId);
    }
  }, [clinicSession]);

  const handleRegisterOrLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    try {
      if (authMode === 'register') {
        const chosenFromDir = CLINIC_DIRECTORY.find((c) => c.id === selectedDirectoryClinicId);
        const resolvedClinicId =
          selectedDirectoryClinicId === 'custom'
            ? `clinic-${licenseId.trim().toLowerCase()}`
            : selectedDirectoryClinicId;
        const resolvedClinicName =
          selectedDirectoryClinicId === 'custom'
            ? customClinicName.trim()
            : chosenFromDir?.name || '';
        const resolvedEmirate =
          selectedDirectoryClinicId === 'custom' ? emirate : chosenFromDir?.emirate || emirate;

        const res = await fetch('/api/handoff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'register_clinic',
            clinicId: resolvedClinicId,
            clinicName: resolvedClinicName,
            emirate: resolvedEmirate,
            practitionerName: practitionerName.trim(),
            licenseId: licenseId.trim(),
            password,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not create clinic account.');
        setClinicSession(data.account);
      } else {
        const res = await fetch('/api/handoff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'login_clinic',
            licenseId: licenseId.trim(),
            password,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Unable to sign in.');
        setClinicSession(data.account);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const openBookingConfirmation = (item: QueueItem) => {
    setModalError(null);
    setActiveReplyBooking(item);
    setPin(item.pin);
    setConfirmedTime('Tomorrow at 10:30 AM');
    setMeetingLink('');
    setClinicLocation('');
    setReplyMessage(
      `Hello, your ${item.consultationMode.toLowerCase()} with ${
        clinicSession?.practitionerName || 'our clinical team'
      } at ${clinicSession?.clinicName || 'our clinic'} is confirmed. We look forward to speaking with you.`
    );
    if (item.releasedKey) setDecryptionKey(item.releasedKey);
    if (item.consultationMode === 'In-Person Visit') {
      setReplyMode('In-Person Visit');
    } else {
      setReplyMode('Video Consultation');
    }
  };

  const handleSendBookingConfirmation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReplyBooking || !clinicSession) return;
    if (!confirmedTime.trim() || !replyMessage.trim()) {
      setModalError('Please enter both an appointment time and a confirmation note.');
      return;
    }
    if (replyMode === 'Video Consultation' && !meetingLink.trim()) {
      setModalError('Please paste your consultation room link (Zoom, Meet, Teams, or clinic portal).');
      return;
    }

    setSendingReply(true);
    setModalError(null);

    try {
      const targetPin = activeReplyBooking.pin;
      const confirmedSlot = confirmedTime.trim();
      const rawUrl = meetingLink.trim();
      const normalizedUrl =
        replyMode === 'Video Consultation' && rawUrl
          ? /^https?:\/\//i.test(rawUrl)
            ? rawUrl
            : `https://${rawUrl}`
          : undefined;

      const replyPayload: ClinicianReplyPayload = {
        clinicianName: clinicSession.practitionerName,
        clinicName: clinicSession.clinicName,
        confirmedTime: confirmedSlot,
        consultationMode: replyMode,
        meetingRoomUrl: normalizedUrl,
        clinicLocation: replyMode === 'In-Person Visit' ? clinicLocation.trim() : undefined,
        message: replyMessage.trim(),
        repliedAt: new Date().toISOString(),
      };

      const res = await fetch('/api/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reply',
          pin: targetPin,
          reply: replyPayload,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not confirm booking right now.');
      }

      setCurrentStatus((data.status as ReferralStatus) || 'APPOINTMENT_SCHEDULED');
      if (data.auditLog) setAuditLog(data.auditLog);
      setBookingSuccessBanner({ pin: targetPin, confirmedTime: confirmedSlot });
      setActiveReplyBooking(null);
      setConfirmedTime('');
      setMeetingLink('');
      setReplyMessage('');
      await fetchClinicQueue(clinicSession.clinicId);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Unable to send confirmation.');
    } finally {
      setSendingReply(false);
    }
  };

  const handleMarkSessionCompleted = async (targetPin: string) => {
    if (!clinicSession) return;
    setStatusUpdating(true);
    try {
      const res = await fetch('/api/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_status',
          pin: targetPin,
          status: 'FOLLOWUP_COMPLETED',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentStatus('FOLLOWUP_COMPLETED');
        if (data.auditLog) setAuditLog(data.auditLog);
        if (summary) onClosedLoopCompleted?.(summary, 'FOLLOWUP_COMPLETED');
        fetchClinicQueue(clinicSession.clinicId);
      }
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleSelectForUnlock = (item: QueueItem) => {
    setPin(item.pin);
    setBriefError(null);
    if (item.releasedKey) {
      setDecryptionKey(item.releasedKey);
    } else {
      setDecryptionKey('');
    }
  };

  const handleRetrieveAndDecrypt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicSession) return;
    setIsLoadingBrief(true);
    setBriefError(null);
    setSummary(null);

    try {
      const cleanPin = pin.trim();
      const cleanKey = decryptionKey.trim();

      if (!/^\d{6}$/.test(cleanPin)) {
        throw new Error('Please enter a valid 6-digit resident booking code.');
      }

      const res = await fetch('/api/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'retrieve',
          pin: cleanPin,
          clinicId: clinicSession.clinicId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unable to retrieve booking brief.');
      }

      const keyToUse = cleanKey || data.releasedKey || '';
      if (!keyToUse) {
        throw new Error(
          'The resident has not released their unlock key yet. Ask them to tap "Share My Clinical Key" in their portal or paste their key.'
        );
      }

      if (!cleanKey && data.releasedKey) {
        setDecryptionKey(data.releasedKey);
      }

      const decrypted = await decryptHandoffPackage(
        data.ciphertextBase64,
        data.ivBase64,
        keyToUse
      );

      setSummary(decrypted);
      setCurrentStatus(data.status as ReferralStatus);
      setConsentScope(data.consentScope || []);
      setAuditLog(data.auditLog || []);
      fetchClinicQueue(clinicSession.clinicId);
    } catch (err) {
      setBriefError(
        err instanceof Error
          ? err.message
          : 'Unable to unlock clinical brief. Please verify both the 6-digit code and unlock key.'
      );
    } finally {
      setIsLoadingBrief(false);
    }
  };

  const handleUpdateClosedLoopStatus = async (nextStatus: ReferralStatus) => {
    if (!clinicSession) return;
    const targetPin = pin.trim() || activeReplyBooking?.pin;
    if (!targetPin) return;

    setStatusUpdating(true);
    try {
      const res = await fetch('/api/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_status',
          pin: targetPin,
          status: nextStatus,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentStatus(data.status as ReferralStatus);
        setAuditLog(data.auditLog || []);
        if (summary) onClosedLoopCompleted?.(summary, nextStatus);
        fetchClinicQueue(clinicSession.clinicId);
      }
    } finally {
      setStatusUpdating(false);
    }
  };

  const renderStatusBadge = (status: string) => {
    if (status === 'APPOINTMENT_SCHEDULED') {
      return (
        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
          Booked Successfully ✓
        </span>
      );
    }
    if (status === 'FOLLOWUP_COMPLETED') {
      return (
        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-900 border border-indigo-300">
          Session Completed ✓
        </span>
      );
    }
    return (
      <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-white border border-stone-200 text-stone-700">
        {status.replace(/_/g, ' ')}
      </span>
    );
  };

  if (!clinicSession) {
    return (
      <div className="max-w-lg mx-auto bg-[#FFFEFB] border border-stone-200 rounded-3xl shadow-sm p-7 md:p-9">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="w-11 h-11 rounded-2xl bg-sky-900 text-white flex items-center justify-center">
            {authMode === 'register' ? (
              <UserPlus className="w-5 h-5" />
            ) : (
              <Lock className="w-5 h-5" />
            )}
          </div>

          <div className="inline-flex rounded-xl bg-stone-100 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setAuthMode('register');
                setAuthError(null);
              }}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                authMode === 'register'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Create Clinic Account
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setAuthError(null);
              }}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                authMode === 'login'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Sign In
            </button>
          </div>
        </div>

        <h2 className="font-serif text-2xl text-stone-900">
          {authMode === 'register'
            ? 'Register Your Clinic Workspace'
            : 'Sign In to Your Clinic Workspace'}
        </h2>
        <p className="text-xs text-stone-600 mt-1.5 leading-relaxed">
          {authMode === 'register'
            ? 'Create a dedicated clinic account so your team only sees appointment bookings routed specifically to your facility.'
            : 'Enter your registered practitioner license ID and password to access your clinic’s private booking log.'}
        </p>

        <form onSubmit={handleRegisterOrLogin} className="space-y-4 mt-6">
          {authMode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Select Your Facility / Clinic
                </label>
                <select
                  value={selectedDirectoryClinicId}
                  onChange={(e) => setSelectedDirectoryClinicId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-xs text-stone-900 focus:outline-none focus:border-sky-800"
                >
                  {CLINIC_DIRECTORY.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.emirate})
                    </option>
                  ))}
                  <option value="custom">Other Licensed Facility (Enter Name)</option>
                </select>
              </div>

              {selectedDirectoryClinicId === 'custom' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Facility Name
                    </label>
                    <input
                      type="text"
                      required
                      value={customClinicName}
                      onChange={(e) => setCustomClinicName(e.target.value)}
                      placeholder="Enter clinic or hospital name"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-xs text-stone-900 focus:outline-none focus:border-sky-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Region
                    </label>
                    <select
                      value={emirate}
                      onChange={(e) => setEmirate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-xs text-stone-900"
                    >
                      <option>Abu Dhabi</option>
                      <option>Al Ain</option>
                      <option>Al Dhafra</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Lead Clinician Full Name
                </label>
                <input
                  type="text"
                  required
                  value={practitionerName}
                  onChange={(e) => setPractitionerName(e.target.value)}
                  placeholder="Enter clinician full name"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-sm text-stone-900 focus:outline-none focus:border-sky-800"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Practitioner License ID (DOH / DHA)
            </label>
            <input
              type="text"
              required
              value={licenseId}
              onChange={(e) => setLicenseId(e.target.value)}
              placeholder="Enter practitioner license number"
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-sm text-stone-900 font-mono focus:outline-none focus:border-sky-800"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Account Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter account password"
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-sm text-stone-900 focus:outline-none focus:border-sky-800"
            />
          </div>

          {authError && <p className="text-xs text-rose-600">{authError}</p>}

          <button
            type="submit"
            disabled={authLoading}
            className="w-full py-3 rounded-xl bg-sky-900 hover:bg-sky-950 disabled:opacity-50 text-white font-semibold text-sm transition cursor-pointer"
          >
            {authLoading
              ? 'Verifying...'
              : authMode === 'register'
              ? 'Create Clinic Account & Open Dashboard'
              : 'Sign In to Clinic Dashboard'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Interactive Pop-Up Modal for Accepting & Confirming a Booking */}
      {activeReplyBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={() => setActiveReplyBooking(null)}
        >
          <div
            className="w-full max-w-lg bg-[#FFFEFB] border border-stone-200 rounded-3xl shadow-2xl p-6 md:p-7 space-y-4 my-auto transition-all duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-stone-100">
              <div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-teal-900 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
                  <CalendarCheck className="w-3 h-3" />
                  Immediate Booking Confirmation
                </span>
                <h3 className="font-serif text-xl text-stone-900 mt-1.5">
                  Accept Booking #{activeReplyBooking.pin}
                </h3>
                <p className="text-xs text-stone-600 mt-0.5">
                  Select or enter an appointment time and consultation details to notify the resident.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveReplyBooking(null)}
                aria-label="Close modal"
                className="p-2 rounded-xl text-stone-500 hover:text-stone-800 hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSendBookingConfirmation} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Quick-Select Available Slot
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_SLOTS.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setConfirmedTime(slot)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer ${
                        confirmedTime === slot
                          ? 'bg-teal-800 text-white border-teal-800'
                          : 'bg-stone-50 text-stone-700 border-stone-200 hover:border-teal-500'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Confirmed Date &amp; Time
                  </label>
                  <input
                    type="text"
                    required
                    value={confirmedTime}
                    onChange={(e) => setConfirmedTime(e.target.value)}
                    placeholder="e.g. Tomorrow at 10:30 AM"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-xs text-stone-900 focus:outline-none focus:border-teal-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Consultation Setting
                  </label>
                  <select
                    value={replyMode}
                    onChange={(e) =>
                      setReplyMode(e.target.value as 'Video Consultation' | 'In-Person Visit')
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-xs text-stone-900 focus:outline-none focus:border-teal-700"
                  >
                    <option value="Video Consultation">Video Consultation</option>
                    <option value="In-Person Visit">In-Person Clinic Visit</option>
                  </select>
                </div>
              </div>

              {replyMode === 'In-Person Visit' ? (
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Clinic Room / Directions
                  </label>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-teal-700 shrink-0" />
                    <input
                      type="text"
                      required
                      value={clinicLocation}
                      onChange={(e) => setClinicLocation(e.target.value)}
                      placeholder="Enter clinic floor, room, or arrival instructions"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-xs text-stone-900 focus:outline-none focus:border-teal-700"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Private Consultation Room Link
                  </label>
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-teal-700 shrink-0" />
                    <input
                      type="text"
                      required
                      value={meetingLink}
                      onChange={(e) => setMeetingLink(e.target.value)}
                      placeholder="Paste Zoom, Google Meet, Teams, or clinic video URL"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-xs text-stone-900 focus:outline-none focus:border-teal-700"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Message to Resident
                </label>
                <textarea
                  rows={3}
                  required
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  placeholder="Write a supportive confirmation note and any preparation details..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white text-xs text-stone-900 leading-relaxed focus:outline-none focus:border-teal-700"
                />
              </div>

              {modalError && (
                <p className="text-xs text-rose-600 font-medium">{modalError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setActiveReplyBooking(null)}
                  className="px-4 py-2.5 rounded-xl bg-white border border-stone-200 text-stone-600 text-xs font-medium hover:bg-stone-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingReply}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-900 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  {sendingReply ? 'Confirming...' : 'Confirm Booking & Send to Resident'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 1. Clinic-Isolated Booking Queue */}
      <div className="bg-[#FFFEFB] border border-stone-200 rounded-3xl shadow-sm p-6 md:p-8">
        <div className="flex items-center justify-between flex-wrap gap-3 pb-4 mb-5 border-b border-stone-100">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-900 bg-sky-50 border border-sky-200 px-3 py-1 rounded-full">
              <Building2 className="w-3.5 h-3.5" />
              {clinicSession.clinicName} · {clinicSession.practitionerName} ({clinicSession.licenseId})
            </div>
            <h2 className="font-serif text-2xl text-stone-900 mt-2">
              Bookings Routed to {clinicSession.clinicName}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchClinicQueue(clinicSession.clinicId)}
              disabled={loadingQueue}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingQueue ? 'animate-spin' : ''}`} />
              Refresh Bookings
            </button>

            <button
              type="button"
              onClick={() => {
                setClinicSession(null);
                setPassword('');
                setSummary(null);
                setActiveReplyBooking(null);
                setBookingQueue([]);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-stone-200 text-xs font-semibold text-stone-600 hover:bg-stone-50 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>

        {/* Clear Booking Confirmed Banner */}
        {bookingSuccessBanner && (
          <div className="mb-5 p-4 rounded-2xl bg-emerald-50 border border-emerald-300 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-emerald-950">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
              <div>
                <strong className="text-sm block">
                  Booking #{bookingSuccessBanner.pin} Confirmed &amp; Booked Successfully!
                </strong>
                <span>
                  Scheduled for <strong>{bookingSuccessBanner.confirmedTime}</strong>. The resident
                  can now see your confirmation and join the session.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setBookingSuccessBanner(null)}
              className="text-xs font-semibold text-emerald-800 hover:underline shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {bookingQueue.length === 0 ? (
          <div className="p-5 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-600 leading-relaxed">
            There are currently no resident appointment bookings addressed to{' '}
            <strong>{clinicSession.clinicName}</strong>. Bookings routed to other clinics remain
            isolated from this dashboard.
          </div>
        ) : (
          <div className="space-y-3">
            {bookingQueue.map((item) => {
              const isBooked = item.status === 'APPOINTMENT_SCHEDULED';
              const isCompleted = item.status === 'FOLLOWUP_COMPLETED';

              return (
                <div
                  key={item.pin}
                  className={`p-4 rounded-2xl border transition ${
                    isCompleted
                      ? 'border-indigo-200 bg-indigo-50/30'
                      : isBooked
                      ? 'border-emerald-200 bg-emerald-50/30'
                      : 'border-stone-200 bg-stone-50/70'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm text-stone-900">
                          Booking #{item.pin}
                        </span>
                        <span
                          className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                            item.recommendedTier === 4
                              ? 'bg-rose-100 text-rose-900'
                              : 'bg-teal-100 text-teal-900'
                          }`}
                        >
                          Priority Level {item.recommendedTier}
                        </span>
                        {renderStatusBadge(item.status)}
                        {item.keySharedByClient ? (
                          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900">
                            Key Shared by Resident ✓
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-900">
                            Key Held by Resident
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-semibold text-stone-800">
                        {item.consultationMode}
                      </div>
                      <div className="text-[11px] text-stone-500 flex items-center gap-1.5">
                        <Calendar className="w-3 h-3" />
                        Requested at{' '}
                        {new Date(item.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        · {item.consentScopeCount} clinical items encrypted
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {!isBooked && !isCompleted && (
                        <button
                          type="button"
                          onClick={() => openBookingConfirmation(item)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-800 hover:bg-teal-900 text-white text-xs font-semibold cursor-pointer"
                        >
                          <CalendarCheck className="w-3.5 h-3.5" />
                          Accept &amp; Confirm Slot
                        </button>
                      )}

                      {isBooked && (
                        <button
                          type="button"
                          disabled={statusUpdating}
                          onClick={() => handleMarkSessionCompleted(item.pin)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-800 hover:bg-indigo-900 text-white text-xs font-semibold cursor-pointer"
                        >
                          <Award className="w-3.5 h-3.5" />
                          Mark Session Completed
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleSelectForUnlock(item)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-stone-100 border border-stone-300 text-stone-800 text-xs font-semibold cursor-pointer"
                      >
                        <KeyRound className="w-3.5 h-3.5 text-sky-800" />
                        {item.keySharedByClient ? 'Load Shared Key' : 'Unlock Brief'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Zero-Access Clinical Summary Reader */}
      <div className="bg-[#FFFEFB] border border-stone-200 rounded-3xl shadow-sm p-6 md:p-8 space-y-6">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-900 bg-sky-50 border border-sky-200 px-3 py-1 rounded-full">
            <KeyRound className="w-3.5 h-3.5" />
            Zero-Access Clinical Summary Reader
          </span>
          <h3 className="font-serif text-xl text-stone-900 mt-2">
            Unlock Resident’s Clinical Reflection (When Resident Releases Their Key)
          </h3>
          <p className="text-xs text-stone-600 mt-1 leading-relaxed">
            Once the resident taps <strong>&ldquo;Share My Clinical Key&rdquo;</strong> inside
            their portal (or shares their key/QR directly), click <strong>Load Shared Key</strong>{' '}
            above or paste it below to decrypt their clinical reflection locally.
          </p>
        </div>

        <form onSubmit={handleRetrieveAndDecrypt} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              6-Digit Booking Code
            </label>
            <input
              type="text"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter 6-digit code"
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white font-mono text-sm text-stone-900 focus:outline-none focus:border-sky-800"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-stone-700 mb-1.5">
              Resident’s Private Unlock Key
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={decryptionKey}
                onChange={(e) => setDecryptionKey(e.target.value)}
                placeholder="Auto-fills once resident shares key, or paste manually"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 bg-white font-mono text-xs text-stone-900 focus:outline-none focus:border-sky-800"
              />
              <button
                type="submit"
                disabled={isLoadingBrief}
                className="px-5 py-2.5 rounded-xl bg-sky-900 hover:bg-sky-950 disabled:opacity-50 text-white font-semibold text-sm shrink-0 transition cursor-pointer"
              >
                {isLoadingBrief ? 'Unlocking...' : 'Unlock Brief'}
              </button>
            </div>
          </div>
        </form>

        {briefError && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{briefError}</span>
          </div>
        )}

        {summary && (
          <div className="pt-6 border-t border-stone-100 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-md">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Decrypted Locally · Expires{' '}
                  {new Date(summary.expiresAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
                <p className="text-xs text-stone-500 mt-1.5">
                  Preferred Format:{' '}
                  <strong>{summary.preferredConsultationMode || 'Flexible'}</strong> · Language:{' '}
                  <strong>{summary.preferredLanguage || 'Not specified'}</strong>
                </p>
              </div>

              <div className="text-right">
                <span className="text-[11px] font-semibold text-stone-500 block">
                  Shared by Resident
                </span>
                <div className="flex flex-wrap justify-end gap-1 mt-1">
                  {consentScope.map((scope, i) => (
                    <span
                      key={i}
                      className="text-[11px] px-2 py-0.5 rounded bg-stone-100 text-stone-700 font-medium"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {summary.residentNote && (
              <div className="p-4 rounded-2xl bg-sky-50/70 border border-sky-200 text-xs text-sky-950">
                <strong>Note from Resident:</strong> &ldquo;{summary.residentNote}&rdquo;
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl bg-teal-50/50 border border-teal-200">
                <div className="flex items-center gap-2 font-semibold text-teal-950 text-sm mb-3">
                  <HeartPulse className="w-4 h-4 text-teal-700" />
                  Emotional &amp; Wellbeing Reflection
                </div>
                <div className="space-y-2 text-xs text-stone-800">
                  <div className="flex justify-between py-1 border-b border-teal-100">
                    <span>WHO-5 Wellbeing Score:</span>
                    <strong>
                      {summary.who5Standardized !== undefined
                        ? `${summary.who5Standardized} / 100`
                        : 'Withheld'}
                    </strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-teal-100">
                    <span>GAD-7 Anxiety Check-In:</span>
                    <strong>
                      {summary.gad7Total !== undefined && summary.gad7Total !== null
                        ? `${summary.gad7Total} / 21`
                        : 'Not included'}
                    </strong>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>PHQ-9 Mood Check-In:</span>
                    <strong>
                      {summary.phq9Total !== undefined && summary.phq9Total !== null
                        ? `${summary.phq9Total} / 27`
                        : 'Not included'}
                    </strong>
                  </div>
                  {summary.phq9Item9Positive && (
                    <div className="mt-2 p-2.5 rounded-xl bg-rose-100 border border-rose-300 text-rose-950 font-semibold">
                      Priority Safety Notice: PHQ-9 Item 9 endorsed — conduct structured human
                      risk assessment during consultation.
                    </div>
                  )}
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-amber-50/50 border border-amber-200">
                <div className="flex items-center gap-2 font-semibold text-amber-950 text-sm mb-3">
                  <Activity className="w-4 h-4 text-amber-700" />
                  Physical Functioning &amp; Sleep Context
                </div>
                {summary.physicalBreakdown ? (
                  <div className="space-y-2 text-xs text-stone-800">
                    <div className="flex justify-between py-1 border-b border-amber-100">
                      <span>Combined Physical Load:</span>
                      <strong>{summary.physicalLoadScore} / 9</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-amber-100">
                      <span>Sleep Disruption:</span>
                      <strong>{summary.physicalBreakdown.sleepDisruption} / 3</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-amber-100">
                      <span>Muscular Tension / Pain:</span>
                      <strong>{summary.physicalBreakdown.painOrTension} / 3</strong>
                    </div>
                    <div className="flex justify-between py-1">
                      <span>Fatigue / Daily Activity Limit:</span>
                      <strong>{summary.physicalBreakdown.fatigueOrRoleLimit} / 3</strong>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-stone-600">
                    Physical-functioning context was not shared by the resident.
                  </p>
                )}
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-stone-50 border border-stone-200">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                <div className="flex items-center gap-2 font-semibold text-stone-900 text-sm">
                  <FileCheck2 className="w-4 h-4 text-sky-800" />
                  Care Follow-Up Log
                </div>
                {renderStatusBadge(currentStatus)}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
                {CLOSED_LOOP_STEPS.map((step) => {
                  const isActive = currentStatus === step.status;
                  return (
                    <button
                      key={step.status}
                      type="button"
                      disabled={statusUpdating}
                      onClick={() => handleUpdateClosedLoopStatus(step.status)}
                      className={`p-2.5 rounded-xl border text-xs font-semibold text-left transition cursor-pointer ${
                        isActive
                          ? 'bg-sky-900 text-white border-sky-900'
                          : 'bg-white text-stone-700 border-stone-200 hover:border-sky-400'
                      }`}
                    >
                      {step.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="text-xs text-stone-500">
              <div className="font-semibold text-stone-700 mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Clinic Activity Log
              </div>
              <ul className="space-y-1 font-mono text-[11px] bg-stone-50 p-3 rounded-xl border border-stone-200">
                {auditLog.map((entry, idx) => (
                  <li key={idx}>
                    [{new Date(entry.timestamp).toLocaleTimeString()}] {entry.event}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}