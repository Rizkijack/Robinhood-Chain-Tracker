"use client";

import { useState, useEffect, useCallback } from "react";
import { formatUsd } from "@/lib/format";

interface EntityActivity {
  name: string;
  logo: string | null;
  totalVolume: number;
  txCount: number;
}

interface EntityHeatmapProps {
  entities?: EntityActivity[];
  isLoading?: boolean;
}

export function EntityHeatmap({ entities = [], isLoading }: EntityHeatmapProps) {
  const maxVolume = Math.max(...entities.map((e) => e.totalVolume), 1);

  return (
    <div className="entity-heatmap">
      <div className="entity-heatmap-header">
        <div className="entity-heatmap-title">
          <span>🗺️</span>
          <span>Entity Activity Map</span>
        </div>
        <span className="muted" style={{ fontSize: 11 }}>
          Powered by Arkham Intelligence
        </span>
      </div>

      {isLoading ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-mute)", fontSize: 12 }}>
          Loading entity data…
        </div>
      ) : entities.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-mute)", fontSize: 12 }}>
          No entity activity detected
        </div>
      ) : (
        <div className="entity-grid">
          {entities.map((entity, i) => (
            <div key={i} className="entity-card">
              <div className="entity-card-name">
                {entity.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entity.logo}
                    alt=""
                    className="entity-card-logo"
                    width={20}
                    height={20}
                  />
                )}
                <span>{entity.name}</span>
              </div>
              <div className="entity-card-volume">{formatUsd(entity.totalVolume)}</div>
              <div className="entity-card-txs">{entity.txCount} transactions</div>
              <div className="entity-bar">
                <div
                  className="entity-bar-fill"
                  style={{ width: `${(entity.totalVolume / maxVolume) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Hook to fetch entity activity data from Arkham via whale endpoint.
 */
export function useEntityActivity() {
  const [entities, setEntities] = useState<EntityActivity[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchEntities = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/whales");
      const data = await res.json();
      const txs = data.transactions || [];

      // Aggregate by entity
      const entityMap = new Map<string, EntityActivity>();
      for (const tx of txs) {
        const name = tx.entity || null;
        if (!name) continue;
        const existing = entityMap.get(name);
        if (existing) {
          existing.totalVolume += tx.usdValue;
          existing.txCount++;
        } else {
          entityMap.set(name, {
            name,
            logo: tx.entityLogo,
            totalVolume: tx.usdValue,
            txCount: 1,
          });
        }
      }

      const sorted = [...entityMap.values()].sort((a, b) => b.totalVolume - a.totalVolume);
      setEntities(sorted);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntities();
    const id = setInterval(fetchEntities, 30_000);
    return () => clearInterval(id);
  }, [fetchEntities]);

  return { entities, isLoading, refetch: fetchEntities };
}
