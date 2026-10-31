/**
 * Taxonomy browser -- categories and packs.
 */

const LAYER1 = [
  { id: 'violence', name: 'Violence', desc: 'Physical harm, fighting, injury, death', count: 1250 },
  { id: 'sexual_content', name: 'Sexual Content', desc: 'Sexual activity, implied or explicit', count: 430 },
  { id: 'language', name: 'Language', desc: 'Profanity, slurs, crude language', count: 3200 },
  { id: 'nudity', name: 'Nudity', desc: 'Exposed nudity, partial or full', count: 280 },
  { id: 'substances', name: 'Substances', desc: 'Drug use, alcohol, smoking', count: 520 },
  { id: 'fear', name: 'Fear/Horror', desc: 'Jump scares, horror, disturbing imagery', count: 340 },
];

const LAYER2_BLASPHEMY = [
  { id: 'blasphemy.gods_name', name: "God's Name in Vain", desc: 'Using God, Lord as expletives', count: 890 },
  { id: 'blasphemy.jesus_name', name: 'Holy Name of J*sus', desc: 'Profane use of J*sus, Ch**st', count: 620 },
  { id: 'blasphemy.sacred_mockery', name: 'Sacred Mockery', desc: 'Mocking prayer, sacraments, clergy', count: 145 },
  { id: 'blasphemy.demonic', name: 'Demonic Glorification', desc: 'Positive portrayal of Satan/demons', count: 78 },
];

const PACKS = [
  { id: 'catholic-family', name: 'Catholic Family', desc: 'Comprehensive filter aligned with Catholic teaching', subscribers: 1240, tags: ['catholic', 'family', 'faith-based'] },
  { id: 'young-kids-5-8', name: 'Young Kids (5-8)', desc: 'Strict filtering for young children', subscribers: 2100, tags: ['kids', 'family', 'strict'] },
  { id: 'clean-language', name: 'Clean Language Only', desc: 'Filters language and blasphemy only', subscribers: 890, tags: ['language', 'minimal'] },
  { id: 'trauma-informed', name: 'Trauma-Informed', desc: 'Filters specific trauma triggers', subscribers: 560, tags: ['trauma', 'triggers', 'mental-health'] },
];

export default function TaxonomyPage() {
  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 64 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Open Taxonomy</h1>
      <p style={{ color: '#8b90a0', marginBottom: 32 }}>
        Browse content categories. Subscribe to packs. Create your own categories.
      </p>

      {/* Layer 1: Universal Dimensions */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="badge badge-blue">Layer 1</span>
          Universal Dimensions
        </h2>
        <div className="grid-3">
          {LAYER1.map((cat) => (
            <div key={cat.id} className="card">
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{cat.name}</div>
              <div style={{ fontSize: 12, color: '#8b90a0', marginBottom: 8 }}>{cat.desc}</div>
              <div style={{ fontSize: 11, color: '#5c6070' }}>{cat.count.toLocaleString()} segments</div>
            </div>
          ))}
        </div>
      </div>

      {/* Layer 2: Blasphemy (highlighted) */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="badge badge-purple">Layer 2</span>
          Catholic Blasphemy Categories
          <span style={{ fontSize: 11, color: '#8b90a0', fontWeight: 400 }}>CCC 2142-2167</span>
        </h2>
        <div className="grid-2">
          {LAYER2_BLASPHEMY.map((cat) => (
            <div key={cat.id} className="card">
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{cat.name}</div>
              <div style={{ fontSize: 12, color: '#8b90a0', marginBottom: 4 }}>{cat.desc}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#5c6070' }}>{cat.count} segments</span>
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#8b5cf6' }}>{cat.id}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Category Packs */}
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Category Packs</h2>
        <div className="grid-2">
          {PACKS.map((pack) => (
            <div key={pack.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{pack.name}</div>
                <div style={{ fontSize: 12, color: '#8b90a0', marginBottom: 6 }}>{pack.desc}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {pack.tags.map((t) => (
                    <span key={t} className="badge badge-blue">{t}</span>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#3b82f6' }}>{pack.subscribers.toLocaleString()}</div>
                <div style={{ fontSize: 10, color: '#8b90a0' }}>subscribers</div>
                <button className="btn btn-ghost" style={{ marginTop: 8, fontSize: 12 }}>Subscribe</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
