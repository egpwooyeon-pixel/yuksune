import { nutritionFacts } from "@/data/detail";

export default function NutritionTable() {
  return (
    <section className="section">
      <div className="container">
        <span className="eyebrow">NUTRITION FACTS</span>
        <h2 className="section-title">영양성분표</h2>
        <p className="section-desc">
          정확한 수치는 실제 제품 라벨 확인 후 업데이트 예정입니다.
        </p>
        <div className="nutrition-table">
          {nutritionFacts.map((fact) => (
            <div className="nutrition-row" key={fact.label}>
              <span className="nutrition-label">{fact.label}</span>
              <span className="nutrition-value">{fact.value}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
