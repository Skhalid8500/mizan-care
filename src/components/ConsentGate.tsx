'use client';

import React, { useState } from 'react';
import { Lock, HeartHandshake, Sparkles, Trash2 } from 'lucide-react';

export interface ConsentPreferences {
  localDeviceStorage: boolean;
  physicalContextIncluded: boolean;
  anonymousTelemetry: boolean;
}

interface ConsentGateProps {
  onProceed: (prefs: ConsentPreferences) => void;
  onWipeLocalVault?: () => void;
  hasExistingLocalData?: boolean;
}

export default function ConsentGate({
  onProceed,
  onWipeLocalVault,
  hasExistingLocalData = false,
}: ConsentGateProps) {
  const [prefs, setPrefs] = useState<ConsentPreferences>({
    localDeviceStorage: false,
    physicalContextIncluded: true,
    anonymousTelemetry: false,
  });

  const togglePref = (key: keyof ConsentPreferences) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="max-w-3xl mx-auto bg-[#FFFEFB] border border-stone-200/90 rounded-3xl shadow-xs overflow-hidden">
      {/* Natural Hero Image Banner */}
      <div className="relative h-56 sm:h-64 w-full bg-stone-200 overflow-hidden">
        <img
          src="/media/hero-calm.jpg"
          alt="Calm morning light symbolizing quiet reflection"
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#FFFEFB] via-[#FFFEFB]/30 to-transparent" />
        <div className="absolute top-4 left-4 sm:left-6 inline-flex items-center gap-1.5 bg-white/90 backdrop-blur-xs border border-stone-200/80 text-teal-900 px-3.5 py-1.5 rounded-full text-xs font-medium shadow-2xs">
          <Lock className="w-3.5 h-3.5 text-teal-700" />
          Private by default · Everything stays on your device
        </div>
      </div>

      <div className="px-6 pb-8 pt-2 md:px-10 md:pb-10">
        {/* Warm Editorial Welcome */}
        <div className="max-w-xl mb-7">
          <h1 className="font-serif text-3xl sm:text-4xl font-normal text-stone-900 tracking-tight leading-snug">
            A quiet moment to check in with yourself.
          </h1>
          <p className="text-stone-600 text-sm sm:text-base mt-2.5 leading-relaxed">
            No account, email, or phone number required. Take a gentle minute to reflect on how
            you have been feeling, and decide for yourself what happens next.
          </p>
        </div>

        {/* Plain-Language Privacy Preferences */}
        <div className="space-y-3 mb-8">
          <div className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-stone-200/90 bg-stone-50/70">
            <div>
              <div className="font-semibold text-stone-900 text-sm">
                Keep a private journal on this device
              </div>
              <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                Saves your check-ins locally inside this browser so you can notice personal trends
                over time. Never uploaded to any server or visible to employers.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.localDeviceStorage}
              onClick={() => togglePref('localDeviceStorage')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                prefs.localDeviceStorage ? 'bg-teal-800' : 'bg-stone-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                  prefs.localDeviceStorage ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-stone-200/90 bg-stone-50/70">
            <div>
              <div className="font-semibold text-stone-900 text-sm flex items-center gap-1.5">
                <HeartHandshake className="w-4 h-4 text-amber-700" />
                Notice how my body has been feeling too
              </div>
              <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                Includes gentle questions on sleep, appetite, and daily energy because stress often
                shows up in the body first.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.physicalContextIncluded}
              onClick={() => togglePref('physicalContextIncluded')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                prefs.physicalContextIncluded ? 'bg-teal-800' : 'bg-stone-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                  prefs.physicalContextIncluded ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="flex items-start justify-between gap-4 p-4 rounded-2xl border border-stone-200/90 bg-stone-50/70">
            <div>
              <div className="font-semibold text-stone-900 text-sm flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-teal-700" />
                Contribute anonymous community insights
              </div>
              <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                Shares only anonymous summary counts (never your answers or identity) to help
                local clinics shorten waiting times.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.anonymousTelemetry}
              onClick={() => togglePref('anonymousTelemetry')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                prefs.anonymousTelemetry ? 'bg-teal-800' : 'bg-stone-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                  prefs.anonymousTelemetry ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Primary Action Row */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-stone-100">
          {hasExistingLocalData && onWipeLocalVault ? (
            <button
              type="button"
              onClick={onWipeLocalVault}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600 hover:text-rose-700"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Erase saved history on this device
            </button>
          ) : (
            <span className="text-xs text-stone-500">
              Every toggle is optional. You stay in control throughout.
            </span>
          )}

          <button
            type="button"
            onClick={() => onProceed(prefs)}
            className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-teal-800 hover:bg-teal-900 text-white font-medium text-sm transition shadow-xs cursor-pointer"
          >
            Begin Quiet Check-In
          </button>
        </div>
      </div>
    </div>
  );
}