import { useFeedStore } from "@/lib/store";

interface StatsBarProps {
  filteredCount: number;
}

export function StatsBar({ filteredCount }: StatsBarProps) {
  const { stats } = useFeedStore();
  return (
    <section className="stats">
      <div className="stat-card">
        <div className="label">New Pools</div>
        <div className="value accent">{stats?.newPairs ?? "—"}</div>
      </div>
      <div className="stat-card">
        <div className="label">Trending</div>
        <div className="value">{stats?.trending ?? "—"}</div>
      </div>
      <div className="stat-card">
        <div className="label">Profiles</div>
        <div className="value">{stats?.profiles ?? "—"}</div>
      </div>
      <div className="stat-card">
        <div className="label">Boosts</div>
        <div className="value">{stats?.boosts ?? "—"}</div>
      </div>
      <div className="stat-card">
        <div className="label">Showing</div>
        <div className="value">{filteredCount}</div>
      </div>
    </section>
  );
}
