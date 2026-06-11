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
        gap: 'clamp(14px, 1.5vw, 22px)',
        padding: 'clamp(18px, 2vh, 28px) clamp(20px, 2.5vw, 32px)',
        borderRadius: 18,
        background: 'var(--bg-card)',
        border: '2px solid var(--border)',
        width: '100%',
        cursor: 'pointer',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        textAlign: 'left',
      }}
    >
      <div style={{
        width: 'clamp(48px, 5vw, 64px)',
        height: 'clamp(48px, 5vw, 64px)',
        borderRadius: 14,
        background: selected ? 'var(--accent)' : 'var(--bg-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 'clamp(20px, 2.5vw, 28px)',
        flexShrink: 0,
        transition: 'background 0.2s',
        color: selected ? '#fff' : 'var(--text-secondary)',
        overflow: 'hidden',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 'clamp(17px, 1.8vw, 22px)', fontWeight: 700, marginBottom: 3 }}>{name}</div>
        <div style={{ fontSize: 'clamp(12px, 1.2vw, 15px)', color: 'var(--text-secondary)', marginBottom: 5 }}>{description}</div>
        <div style={{ display: 'flex', gap: 'clamp(12px, 1.5vw, 20px)', fontSize: 'clamp(11px, 1.1vw, 13px)', color: 'var(--text-secondary)' }}>
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
