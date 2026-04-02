/**
 * legalContent.ts — Single source of truth for Terms of Service and Privacy Policy.
 *
 * Both the in-app screens (app/legal/terms.tsx, app/legal/privacy.tsx) and the
 * hosted markdown files (legal/terms.md, legal/privacy.md) are generated from
 * this module. Edit here; do NOT edit the markdown files or screen JSX directly.
 *
 * Structure:
 *   LegalDoc.title        — document title shown in the screen header and md h1
 *   LegalDoc.lastUpdated  — ISO date string shown below the title
 *   LegalDoc.intro        — optional lead paragraph before sections
 *   LegalDoc.sections[]   — ordered array of { heading, body }
 *   LegalDoc.contact      — contact block rendered at the bottom
 */

export interface LegalSection {
  heading: string;
  body: string;
}

export interface LegalDoc {
  title: string;
  lastUpdated: string;
  intro?: string;
  sections: LegalSection[];
  contact: string;
}

// ─── Terms of Service ─────────────────────────────────────────────────────────

export const TERMS: LegalDoc = {
  title: 'Terms of Service',
  lastUpdated: 'April 2, 2026',
  intro:
    'Please read these Terms of Service ("Terms") carefully before using the LifeOS mobile application and related services ("Service") operated by LifeOS ("we," "us," or "our"). By accessing or using the Service you agree to be bound by these Terms. If you do not agree, do not use the Service.',

  sections: [
    {
      heading: '1. Description of Service',
      body: 'LifeOS is a personal productivity application that helps you plan your day, track goals, build habits, and receive AI-generated scheduling suggestions. The Service includes a mobile application, a cloud sync backend powered by Supabase, and AI features powered by third-party large-language-model providers.',
    },
    {
      heading: '2. Eligibility',
      body: 'You must be at least 13 years old to use the Service. If you are between 13 and 18 years old, you represent that a parent or legal guardian has reviewed and agreed to these Terms on your behalf. By using the Service you represent and warrant that you meet these requirements.',
    },
    {
      heading: '3. User Accounts',
      body: 'You may use the Service in Guest Mode (data stored locally on your device) or by creating an account with a valid email address and password. You are responsible for maintaining the confidentiality of your credentials and for all activity that occurs under your account. You agree to notify us immediately if you suspect unauthorized access to your account. We reserve the right to suspend or terminate accounts that violate these Terms.',
    },
    {
      heading: '4. Subscriptions and Billing',
      body: 'LifeOS offers a free tier and a paid "Pro" subscription. Pro subscriptions are offered on a monthly or annual basis and are processed through Apple App Store or Google Play in-app purchases, managed by RevenueCat. All payments are handled by the respective platform; we do not store your payment card information. Subscription prices are displayed at the time of purchase and may change upon renewal with advance notice. Refunds are subject to the refund policy of Apple or Google, as applicable.',
    },
    {
      heading: '5. Free Trial',
      body: 'New users receive a 3-day free trial of LifeOS Pro features. The trial begins when you complete onboarding. At the end of the trial period your account reverts to the free tier unless you have purchased a Pro subscription. Trial eligibility is tracked per account; reinstalling the app does not reset trial eligibility on the server.',
    },
    {
      heading: '6. AI Features',
      body: 'LifeOS uses AI to generate daily schedules, coaching messages, and productivity suggestions. AI-generated content is provided for informational and motivational purposes only and does not constitute professional advice (medical, financial, legal, or otherwise). AI responses may occasionally be inaccurate, incomplete, or inappropriate. You are solely responsible for decisions you make based on AI output. We do not guarantee the accuracy, reliability, or fitness of AI-generated content for any particular purpose.',
    },
    {
      heading: '7. Acceptable Use',
      body: 'You agree not to: (a) use the Service for any unlawful purpose; (b) attempt to reverse-engineer, decompile, or extract source code from the Service; (c) use automated tools to scrape or abuse the AI endpoints; (d) upload content that is unlawful, defamatory, obscene, or infringes third-party rights; (e) attempt to bypass usage limits, payment requirements, or security controls; (f) impersonate any person or entity. Violation of these restrictions may result in immediate termination of your account.',
    },
    {
      heading: '8. Your Content',
      body: 'You retain ownership of any data you enter into LifeOS (goals, tasks, notes, schedule information, etc.). By using the Service you grant us a limited, non-exclusive, royalty-free license to store and process your content solely to provide and improve the Service. We will not sell your personal content to third parties. You can export or delete your data at any time from the Settings screen.',
    },
    {
      heading: '9. Intellectual Property',
      body: 'All software, design, trademarks, and other intellectual property in the Service are owned by us or our licensors. These Terms do not grant you any right to use our trademarks or branding. You may not copy, modify, distribute, sell, or lease any part of the Service without our explicit written permission.',
    },
    {
      heading: '10. Disclaimer of Warranties',
      body: 'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE. YOUR USE OF THE SERVICE IS AT YOUR SOLE RISK.',
    },
    {
      heading: '11. Limitation of Liability',
      body: 'TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL LIFEOS, ITS OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS OR DATA, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF OR INABILITY TO USE THE SERVICE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR TOTAL LIABILITY FOR ANY CLAIM UNDER THESE TERMS SHALL NOT EXCEED THE AMOUNT YOU PAID TO US IN THE 12 MONTHS PRECEDING THE CLAIM, OR USD $50, WHICHEVER IS GREATER.',
    },
    {
      heading: '12. Termination',
      body: 'We may suspend or terminate your access to the Service at any time, with or without notice, for conduct that we believe violates these Terms or is harmful to other users, us, or third parties. You may terminate your account at any time by contacting us. Upon termination, your license to use the Service ends immediately. Sections 8–11 and 13–15 survive termination.',
    },
    {
      heading: '13. Governing Law',
      body: 'These Terms are governed by and construed in accordance with applicable law. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the competent courts in the jurisdiction where we are registered. If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force and effect.',
    },
    {
      heading: '14. Changes to These Terms',
      body: 'We may update these Terms from time to time. When we make material changes we will update the "Last Updated" date and, where required by law, provide in-app or email notice. Your continued use of the Service after the effective date of revised Terms constitutes acceptance of the changes.',
    },
  ],

  contact:
    'If you have questions about these Terms, please contact us at: support@lifeos.app',
};

// ─── Privacy Policy ───────────────────────────────────────────────────────────

export const PRIVACY: LegalDoc = {
  title: 'Privacy Policy',
  lastUpdated: 'April 2, 2026',
  intro:
    'This Privacy Policy describes how LifeOS ("we," "us," or "our") collects, uses, and shares information about you when you use our mobile application and related services ("Service"). By using the Service you agree to the collection and use of information in accordance with this policy.',

  sections: [
    {
      heading: '1. Information We Collect',
      body: `We collect the following categories of information:

Account Data: email address and hashed password when you register an account. Guest Mode users store data only on their device and we collect no account data.

Profile & Preference Data: your main focus, goals, schedule preferences, habit targets, and productivity settings that you enter in the app.

Usage Data: how you interact with the app — screens viewed, features used, focus sessions completed, and similar behavioral signals. This data is pseudonymous (linked to your user ID, not your name).

AI Interaction Data: the content of messages you send to the AI coach, limited to what is necessary to generate a response. We do not store raw conversation history longer than required to maintain context within a session.

Device & Diagnostic Data: device type, operating system version, app version, and crash reports collected via standard platform diagnostic tools. We do not collect precise GPS location.`,
    },
    {
      heading: '2. How We Use Your Information',
      body: `We use the information we collect to:

• Provide and personalize the Service (generate your daily plan, coaching messages, and habit tracking).
• Process subscriptions and enforce trial limits.
• Improve the Service through aggregated, de-identified analytics.
• Send you important service notifications (e.g., password reset, subscription renewal).
• Diagnose and fix bugs and performance issues.
• Comply with legal obligations.

We do not use your data to serve third-party advertising.`,
    },
    {
      heading: '3. AI Processing',
      body: 'When you interact with the AI coach, your message, selected AI mode, and relevant context (today\'s plan, goal summaries) are sent to a Supabase Edge Function that routes to a third-party large-language-model provider (OpenAI or NVIDIA NIM). These providers process your input to generate a response and are bound by their own data processing agreements. We do not send personally identifying information (name, email) to AI providers. AI prompts and responses are logged in our database for abuse prevention and quality monitoring; this log is retained for 90 days and is not used to train AI models.',
    },
    {
      heading: '4. Information Sharing',
      body: `We do not sell your personal information. We share information only in the following limited circumstances:

Service Providers: Supabase (database and authentication), RevenueCat (subscription management), OpenAI / NVIDIA NIM (AI inference), and standard platform analytics tools (Apple/Google). Each provider is contractually bound to process data only as necessary to provide their services.

Legal Requirements: We may disclose information when required to do so by law, court order, or governmental authority, or when we believe in good faith that disclosure is necessary to protect our rights, your safety, or the safety of others.

Business Transfers: If we are involved in a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction, subject to the same privacy protections described here.`,
    },
    {
      heading: '5. Data Retention',
      body: 'We retain your account and profile data for as long as your account is active. AI interaction logs are retained for 90 days. Usage analytics are retained in aggregate for up to 2 years. If you delete your account, we will delete or anonymize your personal data within 30 days, except where retention is required by law or for legitimate business purposes such as fraud prevention.',
    },
    {
      heading: '6. Data Security',
      body: 'We use industry-standard measures to protect your data, including TLS encryption in transit, row-level security policies on our database, and hashed credential storage. Despite these measures, no method of transmission over the internet or electronic storage is 100% secure. We cannot guarantee absolute security of your information.',
    },
    {
      heading: '7. Children\'s Privacy',
      body: 'The Service is not directed to children under the age of 13. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided us with personal information, please contact us and we will promptly delete it.',
    },
    {
      heading: '8. Your Rights and Choices',
      body: `Depending on your jurisdiction, you may have the following rights:

• Access: request a copy of the personal data we hold about you.
• Correction: request that we correct inaccurate data.
• Deletion: request deletion of your account and associated data (Settings → Reset All Data, or by contacting us).
• Export: export your data as JSON from Settings → Export Data.
• Opt-out of analytics: you may opt out of analytics tracking by contacting us.

To exercise any of these rights, please contact us at support@lifeos.app. We will respond within 30 days.`,
    },
    {
      heading: '9. International Transfers',
      body: 'Our Service is operated from servers that may be located outside your country of residence. By using the Service you consent to the transfer of your information to these servers. Where required by law, we apply appropriate safeguards (such as standard contractual clauses) for cross-border transfers.',
    },
    {
      heading: '10. Changes to This Policy',
      body: 'We may update this Privacy Policy from time to time. When we make material changes we will update the "Last Updated" date and provide notice in the app or by email where required. We encourage you to review this policy periodically. Your continued use of the Service after changes take effect constitutes acceptance of the revised policy.',
    },
  ],

  contact:
    'For privacy-related questions, data requests, or concerns, contact us at: privacy@lifeos.app',
};
