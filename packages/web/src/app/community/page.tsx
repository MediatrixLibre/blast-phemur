/**
 * Community page -- leaderboards, profiles, reputation.
 */

const LEADERBOARD = [
  { rank: 1, name: 'MarianDevotee', segments: 1240, accepted: 1180, rep: 892, level: 'Guardian' },
  { rank: 2, name: 'FamilyFilter42', segments: 890, accepted: 845, rep: 634, level: 'Guardian' },
  { rank: 3, name: 'CleanScreens', segments: 567, accepted: 530, rep: 412, level: 'Expert' },
  { rank: 4, name: 'RosaryMom', segments: 445, accepted: 420, rep: 356, level: 'Expert' },
  { rank: 5, name: 'SafeViewDad', segments: 312, accepted: 290, rep: 245, level: 'Expert' },
  { rank: 6, name: 'LiturgicalFilter', segments: 234, accepted: 210, rep: 178, level: 'Trusted' },
  { rank: 7, name: 'CatholicCinema', segments: 189, accepted: 175, rep: 145, level: 'Trusted' },
  { rank: 8, name: 'ModuleBuilder01', segments: 45, accepted: 42, rep: 120, level: 'Trusted' },
];

const LEVEL_COLORS: Record<string, string> = {
  Guardian: 'badge-purple',
  Expert: 'badge-blue',
  Trusted: 'badge-green',
  Contributor: 'badge-yellow',
  Newcomer: 'badge-blue',
};

const RECENT_ACTIVITY = [
  { user: 'MarianDevotee', action: 'submitted 12 segments', title: 'Oppenheimer', time: '2 hours ago' },
  { user: 'FamilyFilter42', action: 'verified 8 segments', title: 'The Chosen S3', time: '3 hours ago' },
  { user: 'RosaryMom', action: 'created category pack', title: 'Marian Devotion Filter', time: '5 hours ago' },
  { user: 'CleanScreens', action: 'submitted 24 segments', title: 'Breaking Bad S2', time: '8 hours ago' },
  { user: 'ModuleBuilder01', action: 'updated provider module', title: 'Peacock', time: '1 day ago' },
];

export default function CommunityPage() {
  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 64 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Community</h1>
      <p style={{ color: '#8b90a0', marginBottom: 32 }}>
        Contributors who make GuardianStream better for everyone.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        {/* Leaderboard */}
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Leaderboard</h2>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Contributor</th>
                  <th>Level</th>
                  <th>Segments</th>
                  <th>Accepted</th>
                  <th>Reputation</th>
                </tr>
              </thead>
              <tbody>
                {LEADERBOARD.map((user) => (
                  <tr key={user.rank}>
                    <td style={{ fontWeight: 700, color: user.rank <= 3 ? '#f59e0b' : '#8b90a0' }}>
                      {user.rank}
                    </td>
                    <td style={{ fontWeight: 600 }}>{user.name}</td>
                    <td>
                      <span className={`badge ${LEVEL_COLORS[user.level] ?? 'badge-blue'}`}>
                        {user.level}
                      </span>
                    </td>
                    <td>{user.segments.toLocaleString()}</td>
                    <td>
                      {user.accepted.toLocaleString()}
                      <span style={{ fontSize: 10, color: '#8b90a0', marginLeft: 4 }}>
                        ({Math.round(user.accepted / user.segments * 100)}%)
                      </span>
                    </td>
                    <td style={{ fontWeight: 700, color: '#3b82f6' }}>{user.rep}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Reputation levels */}
          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#5c6070', marginBottom: 12 }}>
              Reputation Levels
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                ['Newcomer', '0-10', 'Submissions reviewed by trusted users'],
                ['Contributor', '10-50', 'Segments go to community voting'],
                ['Trusted', '50-200', 'Segments go live immediately'],
                ['Expert', '200-500', 'Can review others\' submissions'],
                ['Guardian', '500+', 'Taxonomy governance committee eligible'],
              ].map(([level, range, desc]) => (
                <div key={level} style={{ flex: '1 1 180px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className={`badge ${LEVEL_COLORS[level] ?? 'badge-blue'}`}>{level}</span>
                    <span style={{ fontSize: 11, color: '#8b90a0' }}>{range} rep</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#5c6070', marginTop: 2 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent activity */}
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Recent Activity</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {RECENT_ACTIVITY.map((item, i) => (
              <div key={i} className="card" style={{ padding: 12 }}>
                <div style={{ fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>{item.user}</span>
                  <span style={{ color: '#8b90a0' }}> {item.action}</span>
                </div>
                <div style={{ fontSize: 12, color: '#5c6070', marginTop: 2 }}>
                  {item.title} - {item.time}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
