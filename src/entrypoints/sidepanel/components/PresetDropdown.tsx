import React, { useState, useRef, useEffect } from 'react';
import { BrandIcon } from './BrandIcon';
import { ChevronDown, Check, Sparkles } from 'lucide-react';

export interface PresetModelItem {
  id: string;
  name: string;
  icon: string;
  baseUrl: string;
  defaultModel?: string;
  tag?: string;
  description: string;
  badgeColor?: string;
}

interface PresetDropdownProps {
  label: string;
  sublabel?: string;
  presets: PresetModelItem[];
  currentBaseUrl: string;
  currentModel?: string;
  onSelect: (preset: PresetModelItem) => void;
  placeholder?: string;
}

export const PresetDropdown: React.FC<PresetDropdownProps> = ({
  label,
  sublabel,
  presets,
  currentBaseUrl,
  currentModel,
  onSelect,
  placeholder = '选择服务商预设...',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Determine which preset matches current settings
  const cleanUrl = (url: string) => url?.trim().replace(/\/+$/, '') || '';
  const currentCleanUrl = cleanUrl(currentBaseUrl);

  const matchedPreset = presets.find((p) => {
    const pUrl = cleanUrl(p.baseUrl);
    if (pUrl !== currentCleanUrl) return false;
    if (currentModel && p.defaultModel !== currentModel) return false;
    return true;
  }) || presets.find((p) => cleanUrl(p.baseUrl) === currentCleanUrl);

  return (
    <div ref={containerRef} className={`space-y-1 relative ${isOpen ? 'z-30' : 'z-0'}`}>
      {/* Header Label and Sublabel */}
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
          {label}
        </label>
        {sublabel && (
          <span className="text-zinc-400 font-normal text-[9px]">
            {sublabel}
          </span>
        )}
      </div>

      {/* Trigger Bar */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-all cursor-pointer shadow-2xs ${
          isOpen
            ? 'border-zinc-900 bg-white ring-1 ring-zinc-900/10'
            : matchedPreset
              ? 'border-zinc-200/90 bg-white hover:border-zinc-300'
              : 'border-zinc-200 bg-zinc-50/60 hover:bg-white text-zinc-500'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {matchedPreset ? (
            <>
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-zinc-100 text-zinc-800">
                <BrandIcon icon={matchedPreset.icon} className="h-3.5 w-3.5" />
              </div>
              <span className="truncate text-xs font-semibold text-zinc-900">
                {matchedPreset.name}
              </span>
              <span className="shrink-0 text-[10px] font-mono text-zinc-400 bg-zinc-100/80 px-1.5 py-0.2 rounded">
                {matchedPreset.tag}
              </span>
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
              <span className="text-xs text-zinc-400 truncate">
                {placeholder}
              </span>
            </>
          )}
        </div>

        <ChevronDown
          className={`h-3.5 w-3.5 text-zinc-400 shrink-0 transition-transform duration-200 ml-2 ${
            isOpen ? 'rotate-180 text-zinc-700' : ''
          }`}
        />
      </button>

      {/* Dropdown Floating Panel */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 z-40 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl animate-in fade-in zoom-in-95">
          <div className="max-h-60 overflow-y-auto space-y-1">
            {presets.map((preset) => {
              const isSelected = matchedPreset?.id === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    onSelect(preset);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-zinc-900 text-white font-semibold'
                      : 'hover:bg-zinc-100/80 text-zinc-800'
                  }`}
                  title={`${preset.name}: ${preset.description}`}
                >
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                      isSelected
                        ? 'bg-zinc-800 text-white'
                        : 'bg-zinc-100 text-zinc-700'
                    }`}
                  >
                    <BrandIcon icon={preset.icon} className="h-3.5 w-3.5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-semibold leading-tight">
                        {preset.name}
                      </span>
                      <span
                        className={`truncate text-[9px] font-mono px-1 py-0.2 rounded ${
                          isSelected
                            ? 'bg-zinc-800 text-zinc-300'
                            : 'bg-zinc-100 text-zinc-500'
                        }`}
                      >
                        {preset.tag}
                      </span>
                    </div>
                    <p
                      className={`truncate text-[10px] mt-0.5 ${
                        isSelected ? 'text-zinc-300' : 'text-zinc-400'
                      }`}
                    >
                      {preset.description}
                    </p>
                  </div>

                  {isSelected && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-white" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
