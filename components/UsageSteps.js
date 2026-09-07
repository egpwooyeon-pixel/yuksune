import { usageSteps } from "@/data/detail";
import PhotoPlaceholder from "./PhotoPlaceholder";

export default function UsageSteps() {
  return (
    <section className="section" id="usage">
      <div className="container">
        <span className="eyebrow">HOW TO USE</span>
        <h2 className="section-title">간편한 사용법</h2>
        <div className="grid grid-3">
          {usageSteps.map((item) => (
            <div className="usage-step-card" key={item.step}>
              <PhotoPlaceholder label={`사용법 ${item.step} 사진`} ratio="1 / 1" />
              <div className="usage-step-number">{item.step}</div>
              <h3 className="usage-step-title">{item.title}</h3>
              <p className="usage-step-desc">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
