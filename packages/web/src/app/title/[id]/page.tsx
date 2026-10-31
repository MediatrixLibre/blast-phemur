/**
 * Title detail page with filter timeline visualization.
 *
 * Shows all segments for a title on a timeline, allows voting,
 * and provides a segment editor for contributions.
 */

// Sample data for "The Chosen"
const SAMPLE_SEGMENTS = [
  { id: 's1', start: 125, end: 128, category: 'blasphemy.gods_name', severity: 2, action: 'mute', votes: 8, confidence: 0.95, description: '"Oh my God" (profane exclamation)' },
  { id: 's2', start: 342, end: 345, category: 'language.profanity', severity: 2, action: 'mute', votes: 12, confidence: 0.92, description: '"damn"' },
  { id: 's3', start: 567, end: 572, category: 'violence.moderate', severity: 2, action: 'skip', votes: 6, confidence: 0.88, description: 'Fight scene with visible impact' },
  { id: 's4', start: 890, end: 892, category: 'blasphemy.jesus_name', severity: 2, action: 'mute', votes: 15, confidence: 0.97, description: '"Jesus Christ" (profane exclamation)' },
  { id: 's5', start: 1205, end: 1208, category: 'language.crude', severity: 1, action: 'mute', votes: 3, confidence: 0.85, description: '"crap"' },
  { id: 's6', start: 1580, end: 1590, category: 'violence.graphic', severity: 3, action: 'skip', votes: 20, confidence: 0.94, description: 'Brutal crucifixion scene' },
  { id: 's7', start: 2100, end: 2102, category: 'blasphemy.gods_name', severity: 3, action: 'mute', votes: 18, confidence: 0.95, description: '"goddamn"' },
];

const TITLE_INFO = {
  title: 'The Chosen',
  provider: 'Netflix',
  year: 2023,
  duration: 2700, // 45 minutes
  segmentCount: 7,
  coverage: 0.85,
};

const CATEGORY_COLORS: Record<string, string> = {
  blasphemy: '#8b5cf6',
  language: '#f59e0b',
  violence: '#ef4444',
  nudity: '#ec4899',
  sexual_content: '#ec4899',
  substances: '#22c55e',
  fear: '#64748b',
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function TitleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const duration = TITLE_INFO.duration;

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 64 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>{TITLE_INFO.title}</h1>
          <div style={{ fontSize: 14, color: '#8b90a0', display: 'flex', gap: 12, marginTop: 4 }}>
            <span>{TITLE_INFO.year}</span>
            <span>{Math.floor(duration / 60)} min</span>
            <span className="badge badge-blue">{TITLE_INFO.provider}</span>
          </div>
        </div>
        <button className="btn btn-primary">+ Add Segment</button>
      </div>

      {/* Coverage stats */}
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#3b82f6' }}>{TITLE_INFO.segmentCount}</div>
          <div style={{ fontSize: 11, color: '#8b90a0' }}>Segments</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#22c55e' }}>{Math.round(TITLE_INFO.coverage * 100)}%</div>
          <div style={{ fontSize: 11, color: '#8b90a0' }}>Coverage</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#f59e0b' }}>AI + Community</div>
          <div style={{ fontSize: 11, color: '#8b90a0' }}>Source</div>
        </div>
      </div>

      {/* Timeline visualization */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#5c6070', marginBottom: 8 }}>
          Filter Timeline
        </div>
        <div className="timeline-track">
          {SAMPLE_SEGMENTS.map((seg) => {
            const left = (seg.start / duration) * 100;
            const width = Math.max(0.5, ((seg.end - seg.start) / duration) * 100);
            const catRoot = seg.category.split('.')[0];
            const color = CATEGORY_COLORS[catRoot] ?? '#3b82f6';
            return (
              <div
                key={seg.id}
                className="timeline-segment"
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  background: color,
                }}
                title={`${formatTime(seg.start)} - ${formatTime(seg.end)}: ${seg.description}`}
              />
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#5c6070', marginTop: 4 }}>
          <span>0:00</span>
          <span>{formatTime(duration / 4)}</span>
          <span>{formatTime(duration / 2)}</span>
          <span>{formatTime(duration * 3 / 4)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Segments table */}
      <div className="card">
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#5c6070', marginBottom: 12 }}>
          All Segments
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Category</th>
              <th>Action</th>
              <th>Description</th>
              <th>Confidence</th>
              <th>Votes</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE_SEGMENTS.map((seg) => {
              const catRoot = seg.category.split('.')[0];
              const color = CATEGORY_COLORS[catRoot] ?? '#3b82f6';
              return (
                <tr key={seg.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {formatTime(seg.start)} - {formatTime(seg.end)}
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-block', width: 8, height: 8,
                      borderRadius: '50%', background: color, marginRight: 6,
                    }} />
                    {seg.category}
                  </td>
                  <td>
                    <span className={`badge ${seg.action === 'skip' ? 'badge-red' : 'badge-yellow'}`}>
                      {seg.action}
                    </span>
                  </td>
                  <td style={{ color: '#8b90a0', maxWidth: 300 }}>{seg.description}</td>
                  <td>{Math.round(seg.confidence * 100)}%</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button className="btn-ghost" style={{ padding: '2px 6px', fontSize: 14, border: 'none', background: 'none', color: '#8b90a0', cursor: 'pointer' }}>+</button>
                      <span style={{ fontWeight: 600, color: seg.votes > 0 ? '#22c55e' : '#8b90a0' }}>
                        {seg.votes}
                      </span>
                      <button className="btn-ghost" style={{ padding: '2px 6px', fontSize: 14, border: 'none', background: 'none', color: '#8b90a0', cursor: 'pointer' }}>-</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
