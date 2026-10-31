import { appName } from '../brand.js';

interface HeaderProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export function Header({ enabled, onToggle }: HeaderProps) {
  return (
    <header className="gs-header">
      <div className="gs-brand">
        <img src="icons/icon-32.png" width={24} height={24} alt="" />
        <span className="gs-wordmark">{appName()}</span>
      </div>
      {/* The name is the visible word "Protection"; the state word beside it repeats the switch's own state */}
      <label className="gs-power" title="Protection on all sites">
        <span>Protection</span>
        <span className="gs-power-state" aria-hidden="true">{enabled ? 'On' : 'Off'}</span>
        <input
          type="checkbox"
          role="switch"
          className="gs-switch"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
      </label>
    </header>
  );
}
