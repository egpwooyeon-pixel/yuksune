import { whyUs } from "@/data/site";

export default function WhyUsSection() {
  return (
    <section className="section section-alt" id="why-us">
      <div className="container">
        <span className="eyebrow">WHY 육수네</span>
        <h2 className="section-title">왜 압도적육수 육수네인가요</h2>
        <p className="section-desc">
          외식업소 운영에 꼭 필요한 안정적인 품질과 공급을 약속드립니다.
        </p>
        <div className="grid grid-4">
          {whyUs.map((item) => (
            <div className="why-card" key={item.title}>
              <h3 className="why-title">{item.title}</h3>
              <p className="why-desc">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
