export interface NeptuneFeature {
  title: string;
  description: string;
  status: 'live' | 'coming-soon';
}

export const features: NeptuneFeature[] = [
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
  {
    title: 'Length-to-Weight Calculator',
    description: '',
    status: 'live',
  },
  {
    title: 'Digital Fishing Licence Vault',
    description: '',
    status: 'live',
  },
  {
    title: 'Sardine Run Intelligence',
    description: '',
    status: 'coming-soon',
  },
];

// Real Google Play listing URL not yet available — keep null so DownloadCTA
// renders a disabled "Coming Soon" state instead of a fake link.
export const playStoreUrl: string | null = null;

export interface NeptunePricingTier {
  name: string;
  status: 'live' | 'coming-soon';
}

export interface NeptunePricing {
  free: NeptunePricingTier;
  premium: NeptunePricingTier;
}

// Feature-by-tier allocation is not yet confirmed — neither tier lists
// specific features until that is decided.
export const pricing: NeptunePricing = {
  free: {
    name: 'Free',
    status: 'live',
  },
  premium: {
    name: 'Premium',
    status: 'coming-soon',
  },
};

export interface NeptuneDisclaimerRef {
  label: string;
  termsAnchor: string;
}

// References only — actual disclaimer legal text is written in terms.astro,
// not here (blocked pending Phase 1 legal review).
export const disclaimerRefs: NeptuneDisclaimerRef[] = [
  {
    label: 'Marine and Fishing Intelligence',
    termsAnchor: '#marine-fishing-disclaimer',
  },
  {
    label: 'Digital Fishing Licence Vault',
    termsAnchor: '#licence-vault-disclaimer',
  },
  {
    label: 'Length-to-Weight Calculator',
    termsAnchor: '#length-to-weight-disclaimer',
  },
];
