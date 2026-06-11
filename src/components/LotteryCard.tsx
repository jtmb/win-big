'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface LotteryCardProps {
  name: string;
  description: string;
  drawDays: string;
  numbers: string;
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
}

export default function LotteryCard({
  name,
  description,
  drawDays,
  numbers,
  selected,
  onClick,
  icon,
}: LotteryCardProps) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      animate={{
        borderColor: selected ? 'var(--accent)' : 'var(--border)',
        boxShadow: selected
          ? '0 0 24px rgba(233, 69, 96, 0.4)'
          : '0 0 0px rgba(233, 69, 96, 0)',
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '20px 24px',
        borderRadius: 16,
        background: 'var(--bg-card)',
        border: '2px solid var(--border)',
        width: '100%',
        cursor: 'pointer',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        textAlign: 'left',
      }}
    >
      <div style={{
        width: 56,
        height: 56,
        borderRadius: 14,
        background: selected ? 'var(--accent)' : 'var(--bg-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
        flexShrink: 0,
        transition: 'background 0.2s',
        color: selected ? '#fff' : 'var(--text-secondary)',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>{name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{description}</div>
        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-secondary)' }}>
          <span>📅 {drawDays}</span>
          <span>🎯 {numbers}</span>
        </div>
      </div>
      {selected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          ✓
        </motion.div>
      )}
    </motion.button>
  );
}
