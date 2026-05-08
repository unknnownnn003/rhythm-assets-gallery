type TagPillProps = {
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
};

export function TagPill({ label, count, active = false, onClick }: TagPillProps) {
  return (
    <button
      className={`tag-pill${active ? " is-active" : ""}`}
      type="button"
      onClick={onClick}
      aria-pressed={active}
    >
      <span>{label}</span>
      {count !== undefined ? <strong>{count}</strong> : null}
    </button>
  );
}
