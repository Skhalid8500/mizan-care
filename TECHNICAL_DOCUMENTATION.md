# Mizan Care — Technical Architecture, Clinical Assumptions & Prototype Limitations

**Track:** Wellness — Earlier, Safer Mental-Wellbeing Support  
**Event:** Future Health Digital Innovation Challenge  

---

## 1. Why We Built This & How the Pieces Fit Together

Most digital mental-health tools stop at the screening score. A person fills out a form, gets told they might have moderate anxiety, and is handed a generic phone number they rarely call. In working-age populations, that drop-off happens for practical reasons: fear that employer-linked apps might expose sensitive records, confusion over where to go first, and the reality that emotional burnout often shows up alongside physical complaints like poor sleep, fatigue, or musculoskeletal tension.

Mizan Care is designed to bridge that gap without asking users to surrender their privacy upfront. Instead of a central cloud database holding identifiable patient histories, the platform splits trust between the user's browser and a lightweight verification relay.

### The Three Connected Interfaces

1. **Resident Portal (`src/components/ConsentGate.tsx`, `src/components/CheckInFlow.tsx`)**  
   Users enter without creating an account, giving an email, or entering an ID. Every data-sharing toggle starts turned off. The check-in runs in both English and Arabic (with proper right-to-left layout switching) and pairs the validated **WHO-5 Well-Being Index** with three brief questions about sleep, physical tension or pain, and daily fatigue. When scores cross defined thresholds—or whenever the user simply wants a deeper look—they can also complete the **GAD-7** and **PHQ-9**. If local trend tracking is switched on, entries are encrypted in the browser with the Web Crypto API (`AES-256-GCM`) and saved inside `IndexedDB` using a non-extractable device key (`src/lib/crypto/vault.ts`).

2. **Stepped Navigation, Warm Hand-Off & Zero-Knowledge Verification (`src/components/ResultsAndHandoff.tsx`, `src/lib/handoff/protocol.ts`, `src/lib/zk/eligibility.ts`)**  
   Rather than relying on an LLM to improvise care advice, a transparent rules engine (`src/lib/clinical/triage.ts`) maps responses to one of four support tiers. When a resident chooses to connect with a clinic or tele-health provider, they select the exact scores they are comfortable sharing. The browser generates a fresh 256-bit `AES-GCM` key that stays inside the user's QR pass, while the server only stores the encrypted blob alongside a `SHA-256` hash of a short-lived, rate-limited 6-digit lookup PIN. Separately, if a community programme requires proof of eligibility (`WHO-5 <= 50`) before granting a subsidized spot, the user can generate a `Poseidon` Fiat-Shamir Zero-Knowledge Proof that confirms they meet the cutoff without exposing their actual answers.

3. **Clinician Hand-Off Decoder & Public-Health Monitor (`src/components/ClinicianPortal.tsx`, `src/components/PublicHealthMonitor.tsx`)**  
   On the receiving end, a clinician enters the 6-digit PIN and the resident's key fragment to decrypt only the authorized summary in their browser, viewing mental-wellbeing scores alongside physical-functioning context. They then log each step of the follow-up (`GENERATED` through `FOLLOWUP_COMPLETED`) so referrals do not vanish into a black hole. A companion public-health view aggregates anonymised conversion rates, wait times, 30-day score changes, crisis escalation outcomes, and demographic equity across age, gender, nationality, language, and emirate region, automatically masking any subgroup smaller than five people (`n < 5`).

---

## 2. Keeping Cryptographic Terms Honest

In health tech, "encryption" and "zero-knowledge" often get lumped together loosely. Mizan Care keeps them strictly separate because they solve different problems:

* **Local Encryption (`AES-256-GCM` in `IndexedDB`):** Protects a resident's longitudinal check-in history on their own device. Because the Web Crypto key is marked non-extractable, scripts cannot read the raw key bytes out of storage, and the user can wipe the entire vault in one click.
* **End-to-End Clinician Hand-Off (`AES-GCM` + `SHA-256` PIN Locator):** Ensures the relay server (`src/app/api/handoff/route.ts`) acts purely as a blind courier. The 6-digit PIN is only a temporary, rate-limited lookup index (locked after five failed attempts and expired after 24 hours)—never the decryption key itself.
* **Zero-Knowledge Eligibility Proof (`circomlibjs` Poseidon + Fiat-Shamir Range Proof):** Allows a resident to prove a mathematical statement about their score (`standardizedScore <= 50`) without revealing the underlying five WHO-5 item responses or the exact total.

---

## 3. Clinical Foundations & Design Assumptions

* **WHO-5 Well-Being Index:** Chosen as the entry screen because its positively worded items reduce stigma compared to pathology-heavy checklists. Raw scores (`0–25`) are multiplied by four to produce a `0–100` scale. Because WHO distributes the WHO-5 under a `CC BY-NC-SA 3.0 IGO` license, commercial deployment beyond research or competition evaluation would require formal permission from the World Health Organization.
* **GAD-7 and PHQ-9:** Used strictly as validated symptom-severity screens (`0–21` and `0–27`) to guide stepped-care routing, never as standalone diagnostic labels.
* **Physical-Functioning Context Questions:** The three items covering sleep disruption, musculoskeletal discomfort, and daily fatigue are contextual prompts meant to flag mind-body overlap for primary-care teams. They are not presented as a standalone validated clinical scale.
* **Handling Positive Suicide-Related Responses (PHQ-9 Item 9):** Any score above `0` on Item 9 routes the user to Tier 4 (`src/components/CrisisSafetyBanner.tsx`). Following established clinical guidance (such as the NIMH ASQ toolkit and Zero Suicide framework), a positive screening item triggers timely human clinical evaluation and verified emergency contacts rather than an automated assumption of imminent danger.
* **Personal Baseline Calculation:** The trend engine refuses to fabricate a four-week baseline from a single visit. At least two prior encrypted entries spanning 14 or more days must exist locally before baseline deviations are calculated.

---

## 4. Current Prototype Limitations & Scope Boundaries

To keep the evaluation transparent for clinical and technical reviewers, several boundaries apply to this build:

1. **No Prospective Clinical Validation Yet:** Individual questionnaires (`WHO-5`, `GAD-7`, `PHQ-9`) are clinically validated, but Mizan Care as a combined digital triage pathway has not yet undergone real-world clinical trials.
2. **Synthetic Public-Health Cohort:** The 500 resident records loaded into the Public-Health Monitor (`src/data/syntheticCohort.ts`) are synthetic data created to test conversion funnels, wait-time tracking, and small-cell suppression logic. They demonstrate telemetry mechanics, not real-world clinical outcomes.
3. **Public Helplines Instead of Live Hospital APIs:** Emergency numbers (`999`) and the UAE National Mental Support Line (`800-4673`) are provided as verified public contacts; direct EHR scheduling integrations are planned for a later phase.
4. **In-Memory Relay Store for Demo Testing:** The Next.js API route (`/api/handoff`) holds active encrypted referral envelopes in server memory so judges can test the end-to-end PIN/QR flow immediately without setting up external database credentials. In production, this maps directly to a persistent PostgreSQL table with scheduled TTL cleanup.
5. **Deterministic Rules Over Generative AI:** All tier assignments and safety escalations are governed by fixed, auditable TypeScript rules rather than generative language models.