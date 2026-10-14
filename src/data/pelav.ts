export interface PelavFeature {
  title: string;
  description: string;
  status: 'live' | 'coming-soon';
}

export const features: PelavFeature[] = [
  {
    title: 'Best Fishing Window',
    description: '',
    status: 'live',
  },
  {
    title: 'Marine Conditions',
    description: '',
    status: 'live',
  },
  {
    title: 'Solunar Intelligence',
    description: '',
    status: 'live',
  },
  {
    title: 'Species Intelligence',
    description: '',
    status: 'live',
  },
  // The Digital Fishing Licence Vault is deferred to V11 (not available in the
  // V10 app; see Terms §9) and is deliberately not listed as a feature. The
  // Length-to-Weight Calculator is not available in the V10 app either (Terms
  // §10) and is likewise not listed.
  {
    title: 'Sardine Run Intelligence',
    description: '',
    status: 'coming-soon',
  },
];

export const playStoreUrl: string | null =
  'https://play.google.com/store/apps/details?id=com.continuumdataguard.pelav&hl=en';

// PELAV™'s legal documents have a single source (the PELAV app repository,
// assets/legal/). tool/legal/build_legal_site.mjs in that repository
// generates them into public/pelav/legal/ here, the canonical host (owner
// decision OI-11, option A): https://continuumdataguardtech.co.za/pelav/legal/.
// Never edit those files by hand, and never link to a personal GitHub URL.
export const pelavLegalBase = '/pelav/legal';
export const pelavLegal = {
  privacy: `${pelavLegalBase}/privacy-policy.html`,
  terms: `${pelavLegalBase}/terms-and-conditions.html`,
  safety: `${pelavLegalBase}/safety-and-disclaimers.html`,
  dataSources: `${pelavLegalBase}/data-sources.html`,
  accountDeletion: `${pelavLegalBase}/account-deletion.html`,
};

export interface PelavDisclaimerRef {
  label: string;
  summary: string;
}

// One-line summaries of sections of the PELAV Safety and Disclaimers notice;
// the notice itself (pelavLegal.safety) is the full text.
export const disclaimerRefs: PelavDisclaimerRef[] = [
  {
    label: 'Marine and Fishing Intelligence',
    summary:
      'Weather, tide, readiness and recommendation information is planning guidance, not a safety system or an official source.',
  },
  {
    label: 'Digital Fishing Licence Vault',
    summary:
      'The Licence Vault is not available in this version of the app. PELAV™ does not issue, verify, renew or authenticate any licence.',
  },
  {
    label: 'Length-to-Weight Calculator',
    summary:
      'The calculator is not available in this version of the app. In app versions 1.3.0 and older, its results are statistical estimates, not a measured weight.',
  },
];
