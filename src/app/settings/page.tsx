'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import NavBar from '@/components/NavBar';
import { useApp } from '@/contexts/AppContext';
import { getSettings, saveSettings, testAiConnection, fetchLmStudioModels } from '@/lib/ipc';
import type { AppSettings } from '@/lib/types';

// Cache models across re-renders so we only fetch once per session
let modelsCache: { baseUrl: string; models: { id: string }[] } | null = null;

export default function SettingsPage() {
  const { settings, setSettings } = useApp();

  const [localSettings, setLocalSettings] = useState<AppSettings | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lmModels, setLmModels] = useState<{ id: string }[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const prefetchedRef = useRef(false);

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setLocalSettings({ ...s });
    });
  }, [setSettings]);

  // Pre-fetch LM Studio models as soon as settings load
  useEffect(() => {
    if (!localSettings || prefetchedRef.current) return;
    // Use cache if baseUrl matches
    if (modelsCache && modelsCache.baseUrl === localSettings.lmstudio.baseUrl) {
      setLmModels(modelsCache.models);
      prefetchedRef.current = true;
      return;
    }
    // Fetch in background
    prefetchedRef.current = true;
    setLoadingModels(true);
    fetchLmStudioModels(localSettings.lmstudio.baseUrl)
      .then((models) => {
        setLmModels(models);
        modelsCache = { baseUrl: localSettings.lmstudio.baseUrl, models };
      })
      .catch(() => setLmModels([]))
      .finally(() => setLoadingModels(false));
  }, [localSettings]);

  if (!localSettings) {
    return (
      <>
        <NavBar title="Settings" showBack backTo="/" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Loading settings...</p>
        </div>
      </>
    );
  }

  const handleSave = async () => {
    if (!localSettings) return;
    await saveSettings(localSettings);
    setSettings(localSettings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    if (!localSettings) return;
    setTesting(true);
    setTestResult(null);
    const provider = localSettings.aiProvider;
    const config: Record<string, string> = provider === 'lmstudio'
      ? { baseUrl: localSettings.lmstudio.baseUrl, model: localSettings.lmstudio.model, apiKey: '' }
      : { baseUrl: localSettings.openai.baseUrl, apiKey: localSettings.openai.apiKey, model: localSettings.openai.model };
    const result = await testAiConnection(provider, config);
    setTestResult(result);
    setTesting(false);
  };

  const updateProvider = (provider: 'lmstudio' | 'openai') => {
    setLocalSettings({ ...localSettings, aiProvider: provider });
  };

  return (
    <>
      <NavBar title="Settings" showBack backTo="/" />

      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 40px',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}>
        {/* Provider Selection */}
        <section>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
            AI Provider
          </h3>
          <div style={{ display: 'flex', gap: 10 }}>
            {(['lmstudio', 'openai'] as const).map((provider) => (
              <motion.button
                key={provider}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => updateProvider(provider)}
                style={{
                  flex: 1,
                  padding: '14px 16px',
                  borderRadius: 12,
                  background: localSettings.aiProvider === provider ? 'var(--accent)' : 'var(--bg-card)',
                  border: localSettings.aiProvider === provider ? 'none' : '1px solid var(--border)',
                  color: localSettings.aiProvider === provider ? '#fff' : 'var(--text-primary)',
                  fontSize: 14,
                  fontWeight: 600,
                  textAlign: 'center',
                  cursor: 'pointer',
                }}
              >
                {provider === 'lmstudio' ? '🖥️ LM Studio' : '☁️ Open AI'}
                <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.7, marginTop: 2 }}>
                  {provider === 'lmstudio' ? 'Local (offline)' : 'OpenAI compatible API'}
                </div>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Provider-specific settings */}
        <AnimatePresence mode="wait">
          {localSettings.aiProvider === 'lmstudio' && (
            <motion.section
              key="lmstudio"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                LM Studio Configuration
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <InputField
                  label="Base URL"
                  value={localSettings.lmstudio.baseUrl}
                  onChange={(v) => setLocalSettings({
                    ...localSettings,
                    lmstudio: { ...localSettings.lmstudio, baseUrl: v },
                  })}
                  placeholder="http://localhost:1234/v1"
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Model
                  </label>
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => setModelsOpen(!modelsOpen)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                        fontSize: 13,
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {localSettings.lmstudio.model || 'Select a model...'}
                      </span>
                      <span style={{ marginLeft: 8, fontSize: 10 }}>{modelsOpen ? '▲' : '▼'}</span>
                    </button>
                    {modelsOpen && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        maxHeight: 180,
                        overflowY: 'auto',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        marginTop: 4,
                        zIndex: 10,
                      }}>
                        {loadingModels ? (
                          <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-secondary)' }}>Loading models...</div>
                        ) : lmModels.length === 0 ? (
                          <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-secondary)' }}>No models found. Check your Base URL.</div>
                        ) : (
                          lmModels.map((m, i) => (
                            <div
                              key={i}
                              onClick={() => {
                                setLocalSettings({ ...localSettings, lmstudio: { ...localSettings.lmstudio, model: m.id } });
                                setModelsOpen(false);
                              }}
                              style={{
                                padding: '9px 14px',
                                fontSize: 12,
                                color: localSettings.lmstudio.model === m.id ? 'var(--accent)' : 'var(--text-primary)',
                                background: localSettings.lmstudio.model === m.id ? 'rgba(233, 69, 96, 0.1)' : 'transparent',
                                cursor: 'pointer',
                                fontWeight: localSettings.lmstudio.model === m.id ? 600 : 400,
                              }}
                            >
                              {m.id}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.section>
          )}

          {localSettings.aiProvider === 'openai' && (
            <motion.section
              key="openai"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                Open AI Configuration
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <InputField
                  label="Base URL"
                  value={localSettings.openai.baseUrl}
                  onChange={(v) => setLocalSettings({
                    ...localSettings,
                    openai: { ...localSettings.openai, baseUrl: v },
                  })}
                  placeholder="https://api.openai.com/v1"
                />
                <InputField
                  label="API Key"
                  value={localSettings.openai.apiKey}
                  onChange={(v) => setLocalSettings({
                    ...localSettings,
                    openai: { ...localSettings.openai, apiKey: v },
                  })}
                  placeholder="sk-..."
                  type="password"
                />
                <InputField
                  label="Model"
                  value={localSettings.openai.model}
                  onChange={(v) => setLocalSettings({
                    ...localSettings,
                    openai: { ...localSettings.openai, model: v },
                  })}
                  placeholder="gpt-4o"
                />
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Test Connection */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleTest}
            disabled={testing}
            style={{
              padding: '10px 24px',
              borderRadius: 10,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontSize: 13,
              fontWeight: 600,
              cursor: testing ? 'not-allowed' : 'pointer',
            }}
          >
            {testing ? 'Testing...' : '🔌 Test Connection'}
          </motion.button>

          {testResult && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: testResult.success ? 'var(--success)' : 'var(--error)',
              }}
            >
              {testResult.success ? '✓ Connected' : '✗ Failed'}
            </motion.span>
          )}
        </div>

        {testResult && !testResult.success && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 8,
            background: 'rgba(244, 67, 54, 0.1)',
            border: '1px solid rgba(244, 67, 54, 0.3)',
            fontSize: 12,
            color: 'var(--error)',
            lineHeight: 1.5,
          }}>
            {testResult.message}
          </div>
        )}

        {/* Scraper Concurrency */}
        <section>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
            ⚡ Scraper Speed
          </h3>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '14px 18px', borderRadius: 12,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
          }}>
            <input
              type="range"
              min={1}
              max={24}
              value={localSettings.scraperConcurrency || 12}
              onChange={(e) => setLocalSettings({ ...localSettings, scraperConcurrency: parseInt(e.target.value, 10) })}
              style={{ flex: 1, accentColor: 'var(--accent)' }}
            />
            <span style={{
              fontSize: 18, fontWeight: 700, color: 'var(--accent)',
              minWidth: 36, textAlign: 'center',
            }}>
              {localSettings.scraperConcurrency || 12}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              parallel windows
            </span>
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 6, marginLeft: 4 }}>
            More = faster scraping but higher CPU usage. Recommended: 6–18
          </p>
        </section>

        {/* Save */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleSave}
            style={{
              padding: '12px 36px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, var(--accent), #c0395b)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            💾 Save Settings
          </motion.button>

          {saved && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ fontSize: 13, color: 'var(--success)', fontWeight: 600 }}
            >
              ✓ Saved
            </motion.span>
          )}
        </div>
      </div>
    </>
  );
}

// Reusable input field
function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        style={{
          padding: '10px 14px',
          borderRadius: 8,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          fontSize: 13,
          fontFamily: 'monospace',
        }}
      />
    </div>
  );
}
