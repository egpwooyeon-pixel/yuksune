export default function PhotoPlaceholder({ label, ratio = "4 / 3" }) {
  return (
    <div className="photo-placeholder" style={{ aspectRatio: ratio }}>
      <span className="photo-placeholder-icon" aria-hidden="true">
        🖼
      </span>
      <span className="photo-placeholder-label">{label}</span>
    </div>
  );
}
