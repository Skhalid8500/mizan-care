'use client';

import React from 'react';
import { PhoneCall, HeartHandshake, AlertTriangle, ShieldAlert, ArrowRight } from 'lucide-react';

interface CrisisSafetyBannerProps {
  phq9Item9Positive?: boolean;
  onProceedToHumanHandoff?: () => void;
}

export default function CrisisSafetyBanner({
  phq9Item9Positive = false,
  onProceedToHumanHandoff,
}: CrisisSafetyBannerProps) {
  return (
    <div
      role="alert"
      className="bg-rose-950 text-white border border-rose-800 rounded-3xl p-6 md:p-8 shadow-lg space-y-5"
    >
      <div className="flex items-start gap-3.5">
        <div className="w-11 h-11 rounded-2xl bg-rose-900 border border-rose-700 flex items-center justify-center shrink-0 text-rose-200">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-rose-900 text-rose-200 border border-rose-700">
            <AlertTriangle className="w-3 h-3" />
            {phq9Item9Positive
              ? 'Priority Safety Assessment & Support'
              : 'Immediate Human Support Available'}
          </span>
          <h3 className="font-serif text-xl sm:text-2xl text-white leading-snug pt-1">
            You do not have to carry this alone—free, confidential support is available right now.
          </h3>
          <p className="text-xs sm:text-sm text-rose-100/90 leading-relaxed max-w-2xl">
            {phq9Item9Positive
              ? 'Because you indicated thoughts of self-harm or distress, a structured conversation with a trained professional is strongly recommended. If you are in immediate physical danger, please call emergency services right away.'
              : 'Your reflection indicates heavy distress. Connecting directly with a licensed counselor or urgent helpline today is the safest next step.'}
          </p>
        </div>
      </div>

      {/* UAE Official Mental Health & Emergency Helplines */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
        <a
          href="tel:800725462"
          className="p-3.5 rounded-2xl bg-white text-stone-900 hover:bg-rose-50 transition flex flex-col justify-between shadow-xs"
        >
          <div className="text-[11px] font-bold uppercase tracking-wide text-teal-800 flex items-center gap-1">
            <HeartHandshake className="w-3.5 h-3.5" /> Abu Dhabi DoH
          </div>
          <div className="text-lg font-mono font-bold text-stone-900 mt-1">800-SAKINA</div>
          <div className="text-[11px] text-stone-600">800-725462 · 24/7 Mental Health</div>
        </a>

        <a
          href="tel:8004673"
          className="p-3.5 rounded-2xl bg-white text-stone-900 hover:bg-rose-50 transition flex flex-col justify-between shadow-xs"
        >
          <div className="text-[11px] font-bold uppercase tracking-wide text-teal-800 flex items-center gap-1">
            <PhoneCall className="w-3.5 h-3.5" /> UAE National Line
          </div>
          <div className="text-lg font-mono font-bold text-stone-900 mt-1">800-4673</div>
          <div className="text-[11px] text-stone-600">800-HOPE · Confidential Support</div>
        </a>

        <a
          href="tel:998"
          className="p-3.5 rounded-2xl bg-rose-900/90 border border-rose-700 text-white hover:bg-rose-800 transition flex flex-col justify-between"
        >
          <div className="text-[11px] font-bold uppercase tracking-wide text-rose-200">
            Medical Emergency
          </div>
          <div className="text-xl font-mono font-bold text-white mt-1">998</div>
          <div className="text-[11px] text-rose-200">UAE National Ambulance</div>
        </a>

        <a
          href="tel:999"
          className="p-3.5 rounded-2xl bg-rose-900/90 border border-rose-700 text-white hover:bg-rose-800 transition flex flex-col justify-between"
        >
          <div className="text-[11px] font-bold uppercase tracking-wide text-rose-200">
            Urgent Dispatch
          </div>
          <div className="text-xl font-mono font-bold text-white mt-1">999</div>
          <div className="text-[11px] text-rose-200">UAE Police &amp; Emergency</div>
        </a>
      </div>

      {onProceedToHumanHandoff && (
        <div className="pt-2 border-t border-rose-800/80 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-rose-200">
            Prefer a scheduled video or clinic consultation with a local practitioner?
          </span>
          <button
            type="button"
            onClick={onProceedToHumanHandoff}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold transition cursor-pointer"
          >
            Connect with a Licensed Clinic
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}