import React, { useState } from 'react';
import { formatPeriodFR, formatShortXOF, formatXOF } from '../lib/format';

interface MonthlyPoint {
  period: string;
  expected_xof: number;
  collected_xof: number;
  overdue_xof: number;
}

export const RevenueComparisonChart: React.FC<{ data: MonthlyPoint[] }> = ({ data }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [showExpected, setShowExpected] = useState(true);
  const [showCollected, setShowCollected] = useState(true);

  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[#66736D]">
        Aucune donnée financière disponible pour le graphique.
      </div>
    );
  }

  const maxVal = Math.max(
    1,
    ...data.map((d) => Math.max(showExpected ? d.expected_xof : 0, showCollected ? d.collected_xof : 0))
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs">
          <button
            type="button"
            onClick={() => setShowCollected((v) => !v)}
            className={`inline-flex items-center gap-2 font-medium transition-opacity cursor-pointer ${
              showCollected ? 'text-[#123C32]' : 'text-[#66736D] opacity-50'
            }`}
          >
            <span className="h-2.5 w-2.5 rounded-xs bg-[#185C46]" />
            <span>Loyers encaissés</span>
          </button>
          <button
            type="button"
            onClick={() => setShowExpected((v) => !v)}
            className={`inline-flex items-center gap-2 font-medium transition-opacity cursor-pointer ${
              showExpected ? 'text-[#123C32]' : 'text-[#66736D] opacity-50'
            }`}
          >
            <span className="h-2.5 w-2.5 rounded-xs bg-[#D6AE55]" />
            <span>Loyers attendus</span>
          </button>
        </div>
        {hoveredIdx !== null && data[hoveredIdx] && (
          <div className="text-xs font-mono tabular-nums text-[#123C32]">
            {formatPeriodFR(data[hoveredIdx].period)} · Encaissé :{' '}
            <strong>{formatXOF(data[hoveredIdx].collected_xof)}</strong> / Attendu :{' '}
            {formatXOF(data[hoveredIdx].expected_xof)}
          </div>
        )}
      </div>

      <div className="relative h-60 w-full pt-4">
        <div className="flex h-full items-end justify-between gap-2 sm:gap-4 border-b border-[#E8EEEB] pb-2">
          {data.map((item, idx) => {
            const expH = Math.max(4, Math.round((item.expected_xof / maxVal) * 180));
            const colH = Math.max(4, Math.round((item.collected_xof / maxVal) * 180));
            const rate = item.expected_xof > 0 ? Math.round((item.collected_xof / item.expected_xof) * 100) : 0;

            return (
              <div
                key={item.period}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="group relative flex flex-1 flex-col items-center justify-end h-full cursor-pointer"
              >
                {hoveredIdx === idx && (
                  <div className="pointer-events-none absolute -top-2 z-10 whitespace-nowrap rounded-lg border border-[#E8EEEB] bg-[#123C32] px-2.5 py-1.5 text-[11px] text-white shadow-sm">
                    <div className="font-medium text-[#F0D99A]">{formatPeriodFR(item.period)} ({rate}%)</div>
                    <div className="font-mono tabular-nums">Encaissé : {formatShortXOF(item.collected_xof)}</div>
                    <div className="font-mono tabular-nums text-white/80">Attendu : {formatShortXOF(item.expected_xof)}</div>
                  </div>
                )}

                <div className="flex items-end justify-center gap-1 sm:gap-1.5 w-full">
                  {showExpected && (
                    <div
                      style={{ height: `${expH}px` }}
                      className="w-3 sm:w-5 rounded-t bg-[#F0D99A] transition-all duration-200 group-hover:bg-[#D6AE55]"
                    />
                  )}
                  {showCollected && (
                    <div
                      style={{ height: `${colH}px` }}
                      className="w-3 sm:w-5 rounded-t bg-[#185C46] transition-all duration-200 group-hover:bg-[#123C32]"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-medium text-[#66736D]">
          {data.map((item) => (
            <span key={item.period} className="flex-1 text-center truncate">
              {item.period.slice(5)}/{item.period.slice(2, 4)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export const OccupancyDonutChart: React.FC<{
  occupied: number;
  available: number;
  maintenance: number;
}> = ({ occupied, available, maintenance }) => {
  const total = Math.max(1, occupied + available + maintenance);
  const occPct = Math.round((occupied / total) * 100);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  const occLen = (occupied / total) * circumference;
  const availLen = (available / total) * circumference;
  const maintLen = (maintenance / total) * circumference;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative flex h-36 w-36 shrink-0 items-center justify-center">
        <svg viewBox="0 0 140 140" className="h-36 w-36 -rotate-90">
          <circle cx="70" cy="70" r={radius} fill="none" stroke="#E8EEEB" strokeWidth="14" />
          {occupied > 0 && (
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke="#185C46"
              strokeWidth="14"
              strokeDasharray={`${occLen} ${circumference}`}
              strokeDashoffset={0}
            />
          )}
          {available > 0 && (
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke="#D6AE55"
              strokeWidth="14"
              strokeDasharray={`${availLen} ${circumference}`}
              strokeDashoffset={-occLen}
            />
          )}
          {maintenance > 0 && (
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke="#E9A23B"
              strokeWidth="14"
              strokeDasharray={`${maintLen} ${circumference}`}
              strokeDashoffset={-(occLen + availLen)}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-display text-2xl font-bold text-[#123C32] tabular-nums">{occPct}%</span>
          <span className="text-[11px] text-[#66736D]">Occupation</span>
        </div>
      </div>

      <div className="flex-1 space-y-2.5 w-full">
        <div className="flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-2 text-[#123C32]">
            <span className="h-2.5 w-2.5 rounded-xs bg-[#185C46]" />
            Logements occupés
          </span>
          <span className="font-mono font-semibold tabular-nums text-[#123C32]">{occupied}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-2 text-[#123C32]">
            <span className="h-2.5 w-2.5 rounded-xs bg-[#D6AE55]" />
            Disponibles
          </span>
          <span className="font-mono font-semibold tabular-nums text-[#123C32]">{available}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-2 text-[#123C32]">
            <span className="h-2.5 w-2.5 rounded-xs bg-[#E9A23B]" />
            En maintenance
          </span>
          <span className="font-mono font-semibold tabular-nums text-[#123C32]">{maintenance}</span>
        </div>
      </div>
    </div>
  );
};

export const BuildingRevenueBars: React.FC<{
  items: Array<{ building_name: string; collected_xof: number }>;
}> = ({ items }) => {
  const max = Math.max(1, ...items.map((i) => i.collected_xof));
  if (items.length === 0) {
    return <p className="text-sm text-[#66736D]">Aucun revenu enregistré par immeuble.</p>;
  }
  return (
    <div className="space-y-3.5">
      {items.map((item) => {
        const pct = Math.max(4, Math.round((item.collected_xof / max) * 100));
        return (
          <div key={item.building_name}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium text-[#123C32] truncate pr-2">{item.building_name}</span>
              <span className="font-mono font-semibold tabular-nums text-[#185C46] shrink-0">
                {formatXOF(item.collected_xof)}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-[#F6F8F7] overflow-hidden">
              <div
                style={{ width: `${pct}%` }}
                className="h-full rounded-full bg-[#247A5B] transition-all duration-300"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
