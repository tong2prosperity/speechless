import React from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "../hooks/useSettings";
import logoImage from "@/assets/logo.jpeg";
import {
  GeneralSettings,
  AdvancedSettings,
  HistorySettings,
  DebugSettings,
  AboutSettings,
  PromptsSettings,
  ModelsSettings,
} from "./settings";

export type SidebarSection = keyof typeof SECTIONS_CONFIG;

interface SectionConfig {
  labelKey: string;
  icon: string;
  component: React.ComponentType;
  enabled: (settings: any) => boolean;
}

export const SECTIONS_CONFIG = {
  general: {
    labelKey: "sidebar.general",
    icon: "settings",
    component: GeneralSettings,
    enabled: () => true,
  },
  models: {
    labelKey: "sidebar.models",
    icon: "smart_toy",
    component: ModelsSettings,
    enabled: () => true,
  },
  advanced: {
    labelKey: "sidebar.advanced",
    icon: "tune",
    component: AdvancedSettings,
    enabled: () => true,
  },
  prompts: {
    labelKey: "sidebar.prompts",
    icon: "auto_awesome",
    component: PromptsSettings,
    enabled: () => true,
  },
  history: {
    labelKey: "sidebar.history",
    icon: "history",
    component: HistorySettings,
    enabled: () => true,
  },
  debug: {
    labelKey: "sidebar.debug",
    icon: "flask_conical",
    component: DebugSettings,
    enabled: (settings) => settings?.debug_mode ?? false,
  },
  about: {
    labelKey: "sidebar.about",
    icon: "info",
    component: AboutSettings,
    enabled: () => true,
  },
} as const satisfies Record<string, SectionConfig>;

interface SidebarProps {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSectionChange,
}) => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const showAccountUi = false;

  const availableSections = Object.entries(SECTIONS_CONFIG)
    .filter(([_, config]) => config.enabled(settings))
    .map(([id, config]) => ({ id: id as SidebarSection, ...config }));

  return (
    <nav className="w-64 bg-zinc-50 border-r border-zinc-200 flex flex-col flex-shrink-0 h-full text-base">
      <div className="p-5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-md overflow-hidden border border-zinc-200 bg-white flex items-center justify-center">
          <img
            src={logoImage}
            alt="Speechless logo"
            className="w-full h-full object-cover"
          />
        </div>
        <h1 className="font-semibold text-base tracking-tight text-zinc-900">
          Speechless
        </h1>
      </div>

      <div className="px-3 py-2 space-y-0.5 flex-1 overflow-y-auto">
        {availableSections.map((section) => {
          const isActive = activeSection === section.id;

          return (
            <button
              key={section.id}
              className={`w-full flex items-center gap-3 px-3 py-2 text-base rounded-md transition-colors group cursor-pointer ${
                isActive
                  ? "bg-zinc-100 text-zinc-900 font-medium"
                  : "text-zinc-600 hover:bg-zinc-100"
              }`}
              onClick={() => onSectionChange(section.id)}
            >
              <span
                className={`material-symbols-outlined text-[18px] transition-colors ${
                  isActive
                    ? "text-zinc-900"
                    : "text-zinc-400 group-hover:text-zinc-900"
                }`}
              >
                {section.icon}
              </span>
              {t(section.labelKey)}
            </button>
          );
        })}
      </div>

      {showAccountUi && (
        <div className="p-4 border-t border-zinc-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-zinc-200 flex items-center justify-center text-sm font-medium text-zinc-600">
              JD
            </div>
            <div className="text-sm">
              <div className="font-medium text-zinc-900">John Doe</div>
              <div className="text-zinc-500">Pro Plan</div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};
