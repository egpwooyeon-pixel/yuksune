import { naturalIngredients, ingredientIcons } from "@/data/detail";
import PhotoPlaceholder from "./PhotoPlaceholder";

export default function NaturalIngredients() {
  return (
    <section className="section section-alt" id="ingredients">
      <div className="container detail-split">
        <div>
          <span className="eyebrow">{naturalIngredients.eyebrow}</span>
          <h2 className="section-title">{naturalIngredients.title}</h2>
          <p className="section-desc">{naturalIngredients.description}</p>
          <div className="ingredient-icon-grid">
            {ingredientIcons.map((item) => (
              <div className="ingredient-icon-item" key={item.label}>
                <span className="ingredient-icon-emoji" aria-hidden="true">
                  {item.emoji}
                </span>
                <span className="ingredient-icon-label">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
        <PhotoPlaceholder label="원재료 근접 사진" ratio="4 / 5" />
      </div>
    </section>
  );
}
