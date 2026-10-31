import { useEffect, useRef } from 'react';

/** A checkbox drawn as a switch: native, so keyboard and screen readers need no extra code */
export function Switch(props: { id?: string; checked: boolean; indeterminate?: boolean; label: string; disabled?: boolean; onChange: (on: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!props.indeterminate;
  }, [props.indeterminate]);
  return (
    <input
      ref={ref}
      id={props.id}
      type="checkbox"
      role="switch"
      className="gs-switch"
      aria-label={props.label}
      disabled={props.disabled}
      checked={props.checked}
      onChange={(e) => props.onChange(e.target.checked)}
    />
  );
}
