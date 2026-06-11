'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import NumberBall from '@/components/NumberBall';
import { getJobHistory } from '@/lib/ipc';
import type { JobRecord } from '@/lib/types';

export default function HistoryPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<'all' | '649' | 'max'>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    getJobHistory(undefined)
      .then((j) => { setJobs(j); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const filtered = filter === 'all' ? jobs : jobs.filter(j => j.lottery === filter);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('en-CA', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });
    } catch { return iso; }
  };

  return (
    <>
      <NavBar title="Job History" showBack backTo="/" />

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        padding: '20px 30px',
        gap: 16,
      }}>
        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          {(['all', '649', 'max'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 16px',
                borderRadius: 20,
                border: `1px solid ${filter === f ? 'var(--accent)' : 'var(--border)'}`,
                background: filter === f ? 'var(--accent)' : 'var(--bg-card)',
                color: filter === f ? '#fff' : 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {f === 'all' ? 'All' : f === '649' ? 'Lotto 6/49' : 'Lotto Max'}
            </button>
          ))}
        </div>

        {/* Job count */}
        {loaded && (
          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
            {filtered.length} run{filtered.length !== 1 ? 's' : ''}
          </p>
        )}

        {/* Job list */}
        {!loaded ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--border)', borderTopColor: 'var(--accent)' }}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <span style={{ fontSize: 40 }}>📭</span>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No runs yet</p>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => router.push('/')}
              style={{
                padding: '10px 28px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, var(--accent), #c0395b)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              🎲 Start a Prediction
            </motion.button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 640, width: '100%', margin: '0 auto', paddingBottom: 30 }}>
            <AnimatePresence>
              {filtered.map((job, idx) => {
                const isExpanded = expandedId === job.id;
                const p = job.prediction;
                const name = job.lottery === '649' ? 'Lotto 6/49' : 'Lotto Max';

                return (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    style={{
                      background: 'var(--bg-card)',
                      border: `1px solid ${isExpanded ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 12,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Header row */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : job.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 18 }}>
                          {job.lottery === '649' ? '🎱' : '💎'}
                        </span>
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>{name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {formatDate(job.createdAt)} · {job.drawCount} draws
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 8,
                          background: p.confidence > 0.7 ? 'rgba(46, 213, 115, 0.15)' : 'rgba(245, 197, 24, 0.15)',
                          color: p.confidence > 0.7 ? 'var(--success)' : 'var(--accent-gold)',
                          fontSize: 11,
                          fontWeight: 700,
                        }}>
                          {Math.round(p.confidence * 100)}%
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {isExpanded ? '▲' : '▼'}
                        </span>
                      </div>
                    </button>

                    {/* Expanded content */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div style={{
                            padding: '0 16px 16px 16px',
                            borderTop: '1px solid var(--border)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                          }}>
                            {/* Numbers */}
                            <div style={{ paddingTop: 12 }}>
                              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                                Main Numbers
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                {p.mainNumbers.map((n, i) => (
                                  <NumberBall key={i} number={n} size={36} delay={i * 0.03} />
                                ))}
                                <NumberBall number={p.bonus} size={36} color="#f5c518" delay={0.2} />
                              </div>
                            </div>

                            {/* Encore & Gold Ball */}
                            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                              <div>
                                <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                                  Encore
                                </div>
                                <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700 }}>
                                  {p.encore}
                                </span>
                              </div>
                              {p.goldBall && (
                                <div>
                                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                                    Gold Ball
                                  </div>
                                  <span style={{
                                    fontFamily: 'monospace', fontSize: 16, fontWeight: 700,
                                    color: 'var(--accent-gold)',
                                  }}>
                                    {p.goldBall}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Reasoning */}
                            <div>
                              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                                AI Reasoning
                              </div>
                              <div style={{
                                fontSize: 11,
                                color: 'var(--text-secondary)',
                                lineHeight: 1.6,
                                background: 'var(--bg-secondary)',
                                padding: '10px 12px',
                                borderRadius: 8,
                                maxHeight: 120,
                                overflowY: 'auto',
                              }}>
                                {p.reasoning}
                              </div>
                            </div>

                            {/* Re-run button */}
                            <motion.button
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.97 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/generate?lottery=${job.lottery}`);
                              }}
                              style={{
                                padding: '8px 0',
                                borderRadius: 8,
                                background: 'var(--accent)',
                                color: '#fff',
                                fontSize: 13,
                                fontWeight: 700,
                                border: 'none',
                                cursor: 'pointer',
                                textAlign: 'center',
                                width: '100%',
                              }}
                            >
                              🔄 Run {name} Again
                            </motion.button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </>
  );
}
