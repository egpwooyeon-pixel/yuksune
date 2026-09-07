import { production } from "@/data/detail";
import PhotoPlaceholder from "./PhotoPlaceholder";

export default function ProductionStory() {
  return (
    <section className="section section-alt">
      <div className="container">
        <span className="eyebrow">{production.eyebrow}</span>
        <h2 className="section-title">{production.title}</h2>
        <p className="section-desc">{production.description}</p>
        <div className="grid grid-2">
          <PhotoPlaceholder label="생산 공정 사진 1" ratio="4 / 3" />
          <PhotoPlaceholder label="생산 공정 사진 2" ratio="4 / 3" />
        </div>
      </div>
    </section>
  );
}
