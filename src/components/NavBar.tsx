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
      padding: '12px 20px',
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Running job indicator */}
        {activeJobType && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <motion.button
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              onClick={() => router.push(`/generate?lottery=${activeJobType}`)}
              style={{
                padding: '4px 10px 4px 12px',
                borderRadius: '8px 0 0 8px',
                background: 'var(--accent)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
              }}
              title={`Active ${activeJobType === '649' ? '6/49' : 'Max'} job — click to view`}
            >
              ⏳ Running
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleCancel}
              style={{
                padding: '4px 9px',
                borderRadius: '0 8px 8px 0',
                background: 'rgba(244, 67, 54, 0.65)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                borderLeft: '1px solid rgba(255,255,255,0.3)',
              }}
              title="Cancel job"
            >
              ✕
            </motion.button>
          </div>
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
