'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useApp } from '@/contexts/AppContext';
import { cancelJob } from '@/lib/ipc';

interface NavBarProps {
  title: string;
  showBack?: boolean;
  backTo?: string;
  showSettings?: boolean;
}

export default function NavBar({ title, showBack, backTo, showSettings }: NavBarProps) {
  const router = useRouter();
  const { activeJobType } = useApp();

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
      padding: '12px 24px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-secondary)',
      minHeight: 52,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {showBack && (
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => backTo ? router.push(backTo) : router.back()}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ←
          </motion.button>
        )}
        <span style={{ fontSize: 16, fontWeight: 600 }}>{title}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 4 }}>
        {/* Running job indicator — cohesive pill */}
        {activeJobType && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 20,
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 12px rgba(233, 69, 96, 0.35)',
            }}
            onClick={() => router.push(`/generate?lottery=${activeJobType}`)}
            title={`Active ${activeJobType === '649' ? '6/49' : 'Max'} job — click to view`}
          >
            <motion.span
              animate={{ opacity: [1, 0.35, 1] }}
              transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
              style={{ fontSize: 10 }}
            >
              ●
            </motion.span>
            <span>
              Running ({activeJobType === '649' ? '6/49' : 'Max'})
            </span>
            <motion.span
              whileHover={{ scale: 1.2, color: '#ffcdd2' }}
              onClick={(e) => { e.stopPropagation(); handleCancel(); }}
              style={{
                fontSize: 14,
                fontWeight: 700,
                opacity: 0.8,
                lineHeight: 1,
                paddingLeft: 2,
              }}
              title="Cancel job"
            >
              ✕
            </motion.span>
          </motion.div>
        )}

        {showSettings && (
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => router.push('/settings')}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Settings"
          >
            ⚙
          </motion.button>
        )}
      </div>
    </div>
  );
}
