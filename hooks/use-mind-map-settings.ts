import { useState } from 'react';

interface MindMapSettings {
  intraGraphCompactness: number;
  interGraphCompactness: number;
  enableHoverEffects: boolean;
  showSettings: boolean;
}

interface MindMapSettingsReturn {
  settings: MindMapSettings;
  updateSettings: (updates: Partial<MindMapSettings>) => void;
}

const DEFAULT_SETTINGS: MindMapSettings = {
  intraGraphCompactness: 5,
  interGraphCompactness: 10,
  enableHoverEffects: true,
  showSettings: false,
};

export function useMindMapSettings(): MindMapSettingsReturn {
  const [settings, setSettings] = useState<MindMapSettings>(DEFAULT_SETTINGS);

  const updateSettings = (updates: Partial<MindMapSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  };

  return {
    settings,
    updateSettings,
  };
} 