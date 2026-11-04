// Practice facts for the public site, from Information.txt §3 (taken from the practice's current website).
// This is an unofficial concept redesign: keep facts accurate, write our own copy.

export const PRACTICE = {
  name: 'SEEDS of the Willistons',
  legalName: 'S.E.E.D.S. of the Willistons Inc.',
  tagline: 'Unlocking the power of communication, one word at a time.',
  address: { line1: '129A Hillside Avenue', city: 'Williston Park', state: 'NY', zip: '11596' },
  phone: '(516) 742-5243',
  phoneHref: 'tel:+15167425243',
  fax: '(516) 742-3536',
  email: 'FrontDesk@seedsofthewillistons.com',
  hours: [
    { days: 'Monday – Thursday', time: '8:30 AM – 7:00 PM' },
    { days: 'Friday', time: '8:30 AM – 3:30 PM' },
    { days: 'Saturday – Sunday', time: 'Closed' },
  ],
  mapsUrl: 'https://www.bing.com/maps?q=129A+Hillside+Avenue+Williston+Park+NY+11596',
  officialSite: 'https://www.seedsofthewillistons.com',
} as const;

export const SERVICES = [
  {
    id: 'speech',
    title: 'Speech & language therapy',
    ages: '12 months through adulthood',
    body: 'Late talking, articulation, stuttering, language and social communication, with plans built around your child and backed by evidence.',
  },
  {
    id: 'ot',
    title: 'Occupational therapy',
    ages: 'Including Nassau County preschool (ages 3–5)',
    body: 'Fine-motor and handwriting skills, sensory processing, self-care and the everyday skills that help kids take part at home and school.',
  },
  {
    id: 'art',
    title: 'Art therapy',
    ages: 'Grief & life transitions',
    body: 'A skilled art therapist helps children process loss and big changes through creative expression.',
  },
  {
    id: 'playgroups',
    title: 'Playgroups & classes',
    ages: 'Speech & language enrichment',
    body: 'Small, playful groups where children practice communication with peers in a supportive setting.',
  },
] as const;

export const SETTINGS_OFFERED = [
  { id: 'clinic', title: 'In our office', body: 'Interactive sessions at our Williston Park office on Hillside Avenue.' },
  { id: 'home', title: 'At home', body: 'Therapists come to you, so practice happens where your child is most comfortable.' },
  { id: 'school', title: 'School & daycare', body: 'Services delivered in your child’s classroom or daycare.' },
  { id: 'telehealth', title: 'Teletherapy', body: 'Secure video sessions when getting to the office isn’t possible.' },
] as const;

export const INSURANCE = {
  plans: ['Blue Cross Blue Shield', 'UnitedHealthcare', 'Oxford', 'EmblemHealth', 'GHI'],
  programs: [
    { name: 'Nassau County CPSE', detail: 'Approved provider for preschoolers, ages 3–5' },
    { name: 'Nassau County CSE', detail: 'Approved provider for school-age children, ages 6–21' },
    { name: 'Private pay', detail: 'Available for any service' },
  ],
} as const;

export const TEAM = [
  { name: 'Eileen Devaney', credential: 'MS, CCC-SLP', role: 'Founder & Director', note: 'More than 30 years as a speech-language pathologist.' },
  { name: 'Bridget Devaney Nerses', credential: 'MA, CCC-SLP', role: 'Owner', note: 'More than 15 years as a speech-language pathologist.' },
] as const;

export const FAQ = [
  {
    q: 'Does insurance cover speech therapy?',
    a: 'Often, yes, but it depends on your plan. Some plans only cover speech therapy that restores a lost skill (for example after an illness), so call your insurer to confirm. We participate in most major plans and our front desk can help.',
  },
  {
    q: 'How young can my child be evaluated?',
    a: 'Very young. Most one-year-olds use somewhere between 10 and 25 words, and by 18 months many are close to 100 and starting to put two words together. Some sounds simply develop later, so imperfect pronunciation is expected. If you’re wondering, ask us.',
  },
  {
    q: 'How long will my child need therapy?',
    a: 'Every child progresses differently. What makes the biggest difference is practice at home between sessions; a weekly visit on its own usually isn’t enough.',
  },
  {
    q: 'How often should my child come?',
    a: 'After the evaluation your therapist recommends a frequency, and you choose what fits your family’s schedule and budget. More sessions aren’t always better than consistent practice at home.',
  },
  {
    q: 'How do I know if my child needs services?',
    a: 'Call or email us. We offer a free screening of about 15–20 minutes to help decide whether a full evaluation makes sense.',
  },
] as const;

export const OFFICE_POLICY = [
  'Please give at least 24 hours’ notice to cancel. A missed session without notice may incur a $25 fee.',
  'Three or more missed sessions within two months may lead to confirming each visit by phone, or dismissal.',
  'A parent or caregiver stays on the premises for the whole session.',
  'For school or daycare visits, let us know before the therapist arrives if your child is absent.',
  'Teletherapy is available in legitimate circumstances; request it at least 2 hours before the session.',
] as const;
