import { brand, contact, stats } from "@/data/site";

export default function Hero() {
  return (
    <section className="hero">
      <div className="container hero-grid">
        <div>
          <span className="eyebrow">외식업소 전용 B2B 육수 공급</span>
          <h1 className="hero-title">
            식당의 맛을 좌우하는
            <br />
            <span className="accent">육수</span>, 매일 안정적으로
            <br />
            공급합니다
          </h1>
          <p className="hero-desc">{brand.description}</p>
          <div className="hero-actions">
            <a href="#contact" className="btn btn-primary">
              무료 견적 요청하기
            </a>
            <a href={`tel:${contact.phone}`} className="btn btn-secondary">
              전화 {contact.phoneDisplay}
            </a>
          </div>
          <div className="hero-stats">
            {stats.map((stat) => (
              <div className="hero-stat" key={stat.label}>
                <div className="hero-stat-value">
                  {stat.value}
                  <span className="hero-stat-unit">{stat.unit}</span>
                </div>
                <div className="hero-stat-label">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="hero-visual">
          <div>
            <div className="hero-visual-tag">TODAY&apos;S PRODUCTION</div>
            <div className="hero-visual-title">
              오늘 아침에 우려낸
              <br />
              육수를 그대로
            </div>
          </div>
          <ul className="hero-visual-list">
            <li>
              <span className="dot" /> 매일 신선 생산, 당일·익일 배송
            </li>
            <li>
              <span className="dot" /> 사골 · 멸치 · 가쓰오 · 채수 등 다양한 라인업
            </li>
            <li>
              <span className="dot" /> 매장 맞춤 농도·염도 조정 가능
            </li>
            <li>
              <span className="dot" /> 정기 납품 계약으로 재고 걱정 없이
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
