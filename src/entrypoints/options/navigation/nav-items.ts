import type { LucideIcon } from 'lucide-react';
import {
  Sliders,
  Eye,
  Wand2,
  Cpu,
  Layers,
  HardDrive,
  KeyRound,
} from 'lucide-react';

import type { TranslationKey } from '@/i18n';

export interface NavItem {
  id: string;
  path: string;
  icon: LucideIcon;
  labelKey: TranslationKey;
  badge?: string;
  badgeColor?: string;
}

export interface NavGroup {
  groupKey: TranslationKey;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    groupKey: 'options.nav.groupBasic',
    items: [
      {
        id: 'general',
        path: '/general',
        icon: Sliders,
        labelKey: 'options.nav.general',
      },
    ],
  },
  {
    groupKey: 'options.nav.groupAi',
    items: [
      {
        id: 'models-vision',
        path: '/models/vision',
        icon: Eye,
        labelKey: 'options.nav.modelsVision',
      },
      {
        id: 'models-image',
        path: '/models/image',
        icon: Wand2,
        labelKey: 'options.nav.modelsImage',
      },
    ],
  },
  {
    groupKey: 'options.nav.groupAgent',
    items: [
      {
        id: 'mcp',
        path: '/mcp',
        icon: Cpu,
        labelKey: 'options.nav.mcp',
      },
    ],
  },
  {
    groupKey: 'options.nav.groupLibrary',
    items: [
      {
        id: 'prompts',
        path: '/prompts',
        icon: Layers,
        labelKey: 'options.nav.prompts',
      },
      {
        id: 'storage',
        path: '/storage',
        icon: HardDrive,
        labelKey: 'options.nav.storage',
      },
    ],
  },
  {
    groupKey: 'options.nav.groupAccount',
    items: [
      {
        id: 'pro',
        path: '/pro',
        icon: KeyRound,
        labelKey: 'options.nav.pro',
      },
    ],
  },
];
