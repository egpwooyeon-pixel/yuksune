import { keyPoints } from "@/data/detail";
import PhotoPlaceholder from "./PhotoPlaceholder";

export default function KeyPoints() {
  return (
    <section className="section" id="points">
      <div className="container">
        <span className="eyebrow">STRONG POINTS</span>
        <h2 className="section-title">탁월한 선택</h2>
        <div className="grid grid-4">
          {keyPoints.map((point) => (
            <div className="key-point-card" key={point.title}>
              <PhotoPlaceholder label={point.title} ratio="1 / 1" />
              <h3 className="key-point-title">{point.title}</h3>
              <p className="key-point-desc">{point.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
