'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useApp } from '@/contexts/AppContext';
import { cancelJob } from '@/lib/ipc';
import { useState } from 'react';
import Logo from './Logo';

interface NavBarProps {
  title?: string;
  showBack?: boolean;
  backTo?: string;
  showSettings?: boolean;
}

export default function NavBar({ title, showBack, backTo, showSettings }: NavBarProps) {
  const router = useRouter();
  const { activeJobType } = useApp();
  const [hoveredSettings, setHoveredSettings] = useState(false);

  const handleCancel = () => {
    if (typeof window !== 'undefined' && window.confirm('Cancel this running job?')) {
      cancelJob();
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 22px',
      background: 'linear-gradient(180deg, #141428 0%, #0f0f1a 100%)',
      minHeight: 56,
      position: 'relative',
      zIndex: 50,
    }}>
      {/* Left section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {showBack && (
          <motion.button
            whileHover={{ scale: 1.08, backgroundColor: 'rgba(233, 69, 96, 0.12)' }}
            whileTap={{ scale: 0.92 }}
            onClick={() => backTo ? router.push(backTo) : router.back()}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(42, 42, 74, 0.6)',
              color: 'var(--text-secondary)',
              fontSize: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </motion.button>
        )}
        <Logo size={28} />
        {title && (
          <>
            <span style={{ color: 'var(--border)', fontSize: 18, fontWeight: 300, margin: '0 2px' }}>/</span>
            <span style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              letterSpacing: '-0.01em',
            }}>
              {title}
            </span>
          </>
        )}
      </div>

      {/* Right section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Running job indicator */}
        {activeJobType && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, filter: 'blur(4px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '6px 12px',
              borderRadius: 20,
              background: 'rgba(233, 69, 96, 0.15)',
              border: '1px solid rgba(233, 69, 96, 0.3)',
              color: 'var(--accent)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => router.push(`/generate?lottery=${activeJobType}`)}
            title={`Active ${activeJobType === '649' ? '6/49' : 'Max'} job — click to view`}
          >
            <motion.span
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }}
              style={{ fontSize: 8, color: 'var(--accent)' }}
            >
              ●
            </motion.span>
            <span style={{ color: 'var(--text-primary)', opacity: 0.9 }}>
              {activeJobType === '649' ? '6/49' : 'Max'}
            </span>
            <motion.button
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9 }}
              onClick={(e) => { e.stopPropagation(); handleCancel(); }}
              style={{
                background: 'rgba(244,67,54,0.2)',
                border: 'none',
                borderRadius: '50%',
                width: 18,
                height: 18,
                fontSize: 10,
                color: 'var(--error)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                opacity: 0.7,
              }}
              title="Cancel job"
            >
              ✕
            </motion.button>
          </motion.div>
        )}

        {showSettings && (
          <motion.button
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.93 }}
            onClick={() => router.push('/settings')}
            onMouseEnter={() => setHoveredSettings(true)}
            onMouseLeave={() => setHoveredSettings(false)}
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(233, 69, 96, 0.18)',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              position: 'relative',
              overflow: 'hidden',
            }}
            title="Settings"
          >
            {/* Subtle accent glow on hover */}
            <motion.div
              animate={{ opacity: hoveredSettings ? 0.35 : 0 }}
              transition={{ duration: 0.25 }}
              style={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(circle at center, rgba(233,69,96,0.25) 0%, transparent 70%)',
                borderRadius: 12,
                pointerEvents: 'none',
              }}
            />
            <motion.div
              animate={{ rotate: hoveredSettings ? 90 : 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 18 }}
              style={{ display: 'flex', position: 'relative', zIndex: 1 }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="2.6" stroke="currentColor" strokeWidth="1.6" opacity="0.85"/>
                <path d="M9 1V4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M9 14V17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M1 9H4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M14 9H17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M3.34 3.34L5.46 5.46" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M12.54 12.54L14.66 14.66" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M3.34 14.66L5.46 12.54" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M12.54 5.46L14.66 3.34" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </motion.div>
          </motion.button>
        )}
      </div>
    </div>
  );
}

