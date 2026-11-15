'use client';

import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { generateSyntheticCohort } from '@/data/syntheticCohort';
import { BarChart3, ShieldAlert, Users, CheckCircle2, Clock, Info } from 'lucide-react';

interface PublicHealthMonitorProps {
  liveCompletedFollowups?: number;
}

type FairnessDimension = 'region' | 'language' | 'ageGroup' | 'gender' | 'nationalityGroup';

export default function PublicHealthMonitor({
  liveCompletedFollowups = 0,
}: PublicHealthMonitorProps) {
  const cohort = useMemo(() => generateSyntheticCohort(500), []);
  const [dimension, setDimension] = useState<FairnessDimension>('region');

  const metrics = useMemo(() => {
    const totalScreened = cohort.length + liveCompletedFollowups;
    const positiveScreens = cohort.filter((r) => r.positiveScreen).length + liveCompletedFollowups;
    const referralsGenerated =
      cohort.filter((r) => r.referralGenerated).length + liveCompletedFollowups;
    const clinicianHandoffs =
      cohort.filter((r) => r.clinicianAccessed).length + liveCompletedFollowups;
    const followup7d =
      cohort.filter((r) => r.followupWithin7Days).length + liveCompletedFollowups;

    const conversionRate7d =
      positiveScreens > 0 ? ((followup7d / positiveScreens) * 100).toFixed(1) : '0.0';

    const referredRecords = cohort.filter((r) => r.recommendedTier >= 2);
    const avgWaitDays = (
      referredRecords.reduce((s, r) => s + r.waitTimeDays, 0) / referredRecords.length
    ).toFixed(1);

    const avgBaselineWho5 = Math.round(
      cohort.reduce((s, r) => s + r.baselineWho5, 0) / cohort.length
    );
    const avgDay30Who5 = Math.round(
      cohort.reduce((s, r) => s + r.day30Who5, 0) / cohort.length
    );
    const functioningImprovedPct = (
      (cohort.filter((r) => r.functioningImproved).length / cohort.length) *
      100
    ).toFixed(1);

    const crisisCases = cohort.filter((r) => r.crisisEscalated);
    const crisisCompleted = crisisCases.filter((r) => r.crisisHumanCompleted).length;

    return {
      totalScreened,
      positiveScreens,
      referralsGenerated,
      clinicianHandoffs,
      followup7d,
      conversionRate7d,
      avgWaitDays,
      avgBaselineWho5,
      avgDay30Who5,
      functioningImprovedPct,
      crisisTotal: crisisCases.length,
      crisisCompleted,
    };
  }, [cohort, liveCompletedFollowups]);

  const funnelData = [
    { stage: 'Screened', count: metrics.totalScreened },
    { stage: 'Positive Screen', count: metrics.positiveScreens },
    { stage: 'Referral Created', count: metrics.referralsGenerated },
    { stage: 'Clinician Accessed', count: metrics.clinicianHandoffs },
    { stage: 'Follow-Up ≤7d', count: metrics.followup7d },
  ];

  const fairnessRows = useMemo(() => {
    const groups = new Map<string, typeof cohort>();
    cohort.forEach((rec) => {
      const key = rec[dimension];
      const arr = groups.get(key) || [];
      arr.push(rec);
      groups.set(key, arr);
    });

    return Array.from(groups.entries()).map(([groupName, rows]) => {
      // Small-cell suppression rule (n < 5) to protect against re-identification
      if (rows.length < 5) {
        return {
          groupName,
          count: rows.length,
          suppressed: true,
          conversionPct: 'Suppressed (n < 5)',
          avgWait: 'Suppressed',
          who5Delta: 'Suppressed',
        };
      }

      const pos = rows.filter((r) => r.positiveScreen).length;
      const fu = rows.filter((r) => r.followupWithin7Days).length;
      const referred = rows.filter((r) => r.recommendedTier >= 2);
      const wait =
        referred.length > 0
          ? (referred.reduce((s, r) => s + r.waitTimeDays, 0) / referred.length).toFixed(1)
          : '0.0';
      const delta = (
        rows.reduce((s, r) => s + (r.day30Who5 - r.baselineWho5), 0) / rows.length
      ).toFixed(1);

      return {
        groupName,
        count: rows.length,
        suppressed: false,
        conversionPct: pos > 0 ? `${((fu / pos) * 100).toFixed(1)}%` : 'N/A',
        avgWait: `${wait} days`,
        who5Delta: `+${delta} pts`,
      };
    });
  }, [cohort, dimension]);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Synthetic Data Disclosure Banner */}
      <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-950 flex items-start gap-3">
        <Info className="w-5 h-5 text-indigo-700 shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed">
          <strong>Synthetic Demonstration Dataset Disclosure:</strong> The population metrics below
          are computed from <strong>500 clearly labelled synthetic resident records</strong>{' '}
          (plus {liveCompletedFollowups} live closed-loop session event
          {liveCompletedFollowups === 1 ? '' : 's'} from your current demo) to demonstrate Mizan
          Care&apos;s outcome and fairness monitoring architecture. Synthetic figures illustrate
          system telemetry and do not constitute real-world clinical trial evidence.
        </div>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>7-Day Follow-Up Conversion</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">{metrics.conversionRate7d}%</div>
          <p className="text-[11px] text-slate-500 mt-1">
            {metrics.followup7d} of {metrics.positiveScreens} positive screens completed care ≤7d
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Mean Service Wait Time</span>
            <Clock className="w-4 h-4 text-teal-700" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">{metrics.avgWaitDays} days</div>
          <p className="text-[11px] text-slate-500 mt-1">
            Across Tiers 2–4 (Tier 4 priority &lt; 24h)
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>30-Day Wellbeing & Functioning</span>
            <BarChart3 className="w-4 h-4 text-sky-700" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">
            {metrics.avgBaselineWho5} → {metrics.avgDay30Who5}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {metrics.functioningImprovedPct}% showed meaningful daily functioning gain
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Human Crisis Escalation</span>
            <ShieldAlert className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-2">
            {metrics.crisisCompleted} / {metrics.crisisTotal}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Verified human clinical assessment hand-offs
          </p>
        </div>
      </div>

      {/* Closed-Loop Conversion Funnel Chart */}
      <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-xs">
        <h3 className="text-lg font-bold text-slate-900 mb-1">
          Closed-Loop Care Conversion Funnel (Closing the Screening-to-Care Gap)
        </h3>
        <p className="text-xs text-slate-500 mb-6">
          Tracks progression from initial wellbeing screening through clinician retrieval and
          verified appointment completion.
        </p>

        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnelData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="stage" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" name="Individuals" fill="#0f766e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Demographic Fairness & Equity Audit Table */}
      <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase text-teal-800 mb-1">
              <Users className="w-3.5 h-3.5" />
              Demographic Equity & Small-Cell Privacy Protection
            </div>
            <h3 className="text-lg font-bold text-slate-900">
              Fairness Monitoring Across Population Subgroups
            </h3>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'region', label: 'Geography' },
                { id: 'language', label: 'Language' },
                { id: 'ageGroup', label: 'Age Group' },
                { id: 'gender', label: 'Gender' },
                { id: 'nationalityGroup', label: 'Nationality' },
              ] as { id: FairnessDimension; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDimension(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  dimension === tab.id
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 uppercase">
                <th className="py-3 px-3">Subgroup</th>
                <th className="py-3 px-3">Cohort Size (n)</th>
                <th className="py-3 px-3">7-Day Follow-Up Conversion</th>
                <th className="py-3 px-3">Mean Wait Time</th>
                <th className="py-3 px-3">30-Day Mean WHO-5 Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {fairnessRows.map((row) => (
                <tr key={row.groupName} className="hover:bg-slate-50">
                  <td className="py-3 px-3 font-semibold">{row.groupName}</td>
                  <td className="py-3 px-3">{row.count}</td>
                  <td className="py-3 px-3 font-medium text-emerald-700">{row.conversionPct}</td>
                  <td className="py-3 px-3">{row.avgWait}</td>
                  <td className="py-3 px-3 font-semibold text-teal-800">{row.who5Delta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500 mt-4">
          Privacy Rule: All demographic fields are optional and aggregated with small-cell
          suppression (groups with n &lt; 5 are automatically masked) to prevent re-identification.
        </p>
      </div>
    </div>
  );
}