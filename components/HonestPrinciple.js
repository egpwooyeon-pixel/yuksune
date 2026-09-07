import { principles } from "@/data/detail";

export default function HonestPrinciple() {
  return (
    <section className="section">
      <div className="container">
        <span className="eyebrow">OUR PRINCIPLE</span>
        <h2 className="section-title">정직한 육수의 원칙</h2>
        <div className="grid grid-3">
          {principles.map((item, index) => (
            <div className="principle-card" key={item.title}>
              <div className="principle-number">{String(index + 1).padStart(2, "0")}</div>
              <h3 className="principle-title">{item.title}</h3>
              <p className="principle-desc">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
