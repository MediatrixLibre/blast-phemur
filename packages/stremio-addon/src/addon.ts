/**
 * GuardianStream Stremio Addon.
 *
 * Serves filter data as subtitle tracks and provides a browsable
 * catalog of titles with filter data available. Works on every
 * Stremio client: Android TV, Fire TV, Windows, Mac, Linux, iOS.
 */

export const MANIFEST = {
  id: 'org.guardianstream.addon',
  version: '0.1.0',
  name: 'GuardianStream - Content Filter',
  description: 'Filter blasphemy and profanity from movies and TV shows. AI-powered, context-aware, open source. Shows visual markers at filtered moments.',
  types: ['movie', 'series'] as const,
  resources: ['catalog', 'subtitles'] as const,
  idPrefixes: ['tt'],
  catalogs: [
    {
      id: 'guardianstream-movies',
      type: 'movie' as const,
      name: 'GuardianStream Ready',
      extra: [
        { name: 'search', isRequired: false },
        { name: 'skip', isRequired: false },
      ],
    },
    {
      id: 'guardianstream-series',
      type: 'series' as const,
      name: 'GuardianStream Ready (TV)',
      extra: [
        { name: 'search', isRequired: false },
        { name: 'skip', isRequired: false },
      ],
    },
  ],
  behaviorHints: {
    configurable: true,
    adult: false,
  },
  config: [
    {
      key: 'filterLevel',
      type: 'select',
      title: 'Filter Sensitivity',
      options: ['strict', 'moderate', 'light'],
      default: 'moderate',
    },
  ],
  logo: 'https://mediatrixlibre.github.io/blast-phemur/assets/icon-128.png',
  background: 'https://mediatrixlibre.github.io/blast-phemur/assets/background.jpg',
  contactEmail: 'mediatrixdev@proton.me',
} as const;
