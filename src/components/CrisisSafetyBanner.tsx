'use client';

import React, { useState } from 'react';
import { PhoneCall, ShieldAlert, UserCheck, CheckCircle2, Info } from 'lucide-react';

interface CrisisSafetyBannerProps {
  phq9Item9Positive: boolean;
  onProceedToHumanHandoff: () => void;
}

export default function CrisisSafetyBanner({
  phq9Item9Positive,
  onProceedToHumanHandoff,
}: CrisisSafetyBannerProps) {
  const [humanContactConfirmed, setHumanContactConfirmed] = useState(false);

  return (
    <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-6 md:p-7 mb-8 shadow-sm">
      <div className="flex items-start gap-3.5">
        <div className="p-2.5 rounded-xl bg-rose-100 text-rose-700 shrink-0">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div className="space-y-3 flex-1">
          <div>
            <span className="inline-block text-xs font-bold uppercase tracking-wider text-rose-800 bg-rose-200/70 px-2.5 py-0.5 rounded-md mb-1.5">
              Tier 4 · Priority Human Clinical Assessment Recommended
            </span>
            <h3 className="text-xl font-bold text-slate-900">
              You Deserve Timely Support from a Trained Healthcare Professional
            </h3>
          </div>

          <p className="text-sm text-slate-800 leading-relaxed">
            {phq9Item9Positive
              ? 'Your response on PHQ-9 Item 9 indicated thoughts of self-harm or being better off dead. In clinical practice, a positive screening response requires a supportive conversation and formal risk assessment with a qualified healthcare professional—it is not an automated diagnosis.'
              : 'Your screening responses indicate elevated distress that warrants timely evaluation by a licensed healthcare professional rather than self-guided tools alone.'}
          </p>

          {/* Important Clinical Boundary Box */}
          <div className="p-3.5 rounded-xl bg-white/90 border border-rose-200 text-xs text-slate-700 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
            <span>
              <strong>Human Oversight Principle:</strong> Mizan Care is an early-identification
              and navigation tool—not an emergency monitoring service or replacement for clinical
              care. If you are in immediate physical danger, please contact emergency services right
              away.
            </span>
          </div>

          {/* Public Helpline Cards (Clearly Labeled per Prototype Governance) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="p-4 rounded-xl bg-white border border-rose-200 flex items-start gap-3">
              <PhoneCall className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-rose-800 uppercase">
                  UAE Emergency Services
                </div>
                <div className="text-lg font-bold text-slate-900">999</div>
                <p className="text-xs text-slate-600 mt-0.5">
                  For immediate physical danger or urgent medical emergency (24/7).
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-rose-200 flex items-start gap-3">
              <UserCheck className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-teal-800 uppercase">
                  UAE National Mental Support Line
                </div>
                <div className="text-lg font-bold text-slate-900">800-4673 (HOPE)</div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Confidential support with trained professionals (Public Helpline · Phase 2 Live API planned).
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons & Escalation Completion Tracking */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-rose-200/80">
            <button
              type="button"
              onClick={onProceedToHumanHandoff}
              className="px-5 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-semibold text-sm transition shadow-xs"
            >
              Generate Priority Clinician Warm Hand-Off →
            </button>

            <button
              type="button"
              onClick={() => setHumanContactConfirmed((prev) => !prev)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                humanContactConfirmed
                  ? 'bg-emerald-100 border-emerald-300 text-emerald-900'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              {humanContactConfirmed
                ? 'Human Support Contact Initiated (Recorded)'
                : 'Mark: I Have Connected With Human Support'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}