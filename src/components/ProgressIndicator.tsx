'use client';

import { motion } from 'framer-motion';

interface ProgressIndicatorProps {
  message: string;
  current?: number;
  total?: number;
}

export default function ProgressIndicator({ message, current, total }: ProgressIndicatorProps) {
  const pct = current != null && total != null && total > 0
    ? Math.round((current / total) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        padding: 40,
      }}
    >
      {/* Spinner */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          borderTop: '5px solid var(--accent)',
          borderRight: '5px solid var(--accent)',
          borderBottom: '5px solid var(--border)',
          borderLeft: '5px solid var(--border)',
          boxShadow: '0 0 24px rgba(233, 69, 96, 0.25)',
        }}
      />

      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center', maxWidth: 320 }}>
        {message}
      </div>

      {current != null && total != null && total > 0 && (
        <div style={{ width: 280 }}>
          <div style={{
            height: 6,
            borderRadius: 3,
            background: 'var(--border)',
            overflow: 'hidden',
          }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ type: 'spring', stiffness: 100, damping: 20 }}
              style={{
                height: '100%',
                background: 'linear-gradient(90deg, var(--accent), #e94560)',
                borderRadius: 3,
              }}
            />
          </div>
          <div style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--text-secondary)',
            textAlign: 'center',
            marginTop: 8,
          }}>
            {current} / {total}
          </div>
        </div>
      )}
    </motion.div>
  );
}
