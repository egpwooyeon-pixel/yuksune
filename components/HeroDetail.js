import { hero } from "@/data/detail";
import { brand, contact } from "@/data/site";
import PhotoPlaceholder from "./PhotoPlaceholder";

export default function HeroDetail() {
  return (
    <section className="detail-hero">
      <div className="container detail-hero-inner">
        <span className="eyebrow">{hero.eyebrow}</span>
        <h1 className="detail-hero-title">{hero.title}</h1>
        <p className="detail-hero-subtitle">{hero.subtitle}</p>
        <div className="hero-actions">
          <a href="#contact" className="btn btn-primary">
            문의하기
          </a>
          <a href={`tel:${contact.phone}`} className="btn btn-secondary">
            전화 {contact.phoneDisplay}
          </a>
        </div>
        <div className="detail-hero-photo">
          <PhotoPlaceholder label={`${brand.name} 제품 패키지 사진`} ratio="4 / 5" />
        </div>
      </div>
    </section>
  );
}
