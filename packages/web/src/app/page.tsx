/**
 * Home page -- Title browser.
 *
 * Search titles, view filter coverage, see which providers are supported.
 * This is the main entry point for community members.
 */

// Sample data (would come from API in production)
const SAMPLE_TITLES = [
  {
    id: '1', title: 'The Chosen', provider: 'Netflix', year: 2023,
    segmentCount: 47, coverage: 0.85, categories: ['blasphemy', 'language', 'violence'],
  },
  {
    id: '2', title: 'The Passion of the Christ', provider: 'Amazon', year: 2004,
    segmentCount: 112, coverage: 0.92, categories: ['violence', 'blasphemy', 'fear'],
  },
  {
    id: '3', title: 'Breaking Bad S1', provider: 'Netflix', year: 2008,
    segmentCount: 234, coverage: 0.78, categories: ['language', 'violence', 'substances'],
  },
  {
    id: '4', title: 'Bluey', provider: 'Disney+', year: 2018,
    segmentCount: 0, coverage: 0, categories: [],
  },
  {
    id: '5', title: 'Oppenheimer', provider: 'Amazon', year: 2023,
    segmentCount: 89, coverage: 0.65, categories: ['nudity', 'language', 'violence', 'blasphemy'],
  },
  {
    id: '6', title: 'The Shawshank Redemption', provider: 'Max', year: 1994,
    segmentCount: 156, coverage: 0.88, categories: ['language', 'violence', 'blasphemy'],
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  blasphemy: 'badge-purple',
  language: 'badge-yellow',
  violence: 'badge-red',
  nudity: 'badge-red',
  sexual: 'badge-red',
  substances: 'badge-green',
  fear: 'badge-blue',
};

export default function BrowsePage() {
  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 64 }}>
      {/* Search */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Browse Titles</h1>
        <p style={{ color: '#8b90a0', marginBottom: 16 }}>
          Search movies and shows. View filter coverage and contribute segments.
        </p>
        <input
          type="text"
          className="search-input"
          placeholder="Search titles, providers, categories..."
        />
      </div>

      {/* Stats */}
      <div className="grid-3" style={{ marginBottom: 32 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#3b82f6' }}>6</div>
          <div style={{ fontSize: 12, color: '#8b90a0' }}>Titles with filters</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#22c55e' }}>638</div>
          <div style={{ fontSize: 12, color: '#8b90a0' }}>Total segments</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#8b5cf6' }}>4</div>
          <div style={{ fontSize: 12, color: '#8b90a0' }}>Category packs</div>
        </div>
      </div>

      {/* Title grid */}
      <div className="grid-2">
        {SAMPLE_TITLES.map((title) => (
          <a key={title.id} href={`/title/${title.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{title.title}</div>
                  <div style={{ fontSize: 12, color: '#8b90a0' }}>{title.year}</div>
                </div>
                <span className="badge badge-blue">{title.provider}</span>
              </div>

              {/* Coverage bar */}
              {title.segmentCount > 0 ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8b90a0', marginBottom: 4 }}>
                    <span>{title.segmentCount} segments</span>
                    <span>{Math.round(title.coverage * 100)}% coverage</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${title.coverage * 100}%` }} />
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                    {title.categories.map((cat) => (
                      <span key={cat} className={`badge ${CATEGORY_COLORS[cat] ?? 'badge-blue'}`}>{cat}</span>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: '#5c6070', marginTop: 8 }}>
                  No filters yet. Be the first to contribute!
                </div>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
