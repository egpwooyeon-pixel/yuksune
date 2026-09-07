import { hero, contact } from "@/data/site";

export default function Hero() {
  return (
    <section className="hero">
      <div className="container">
        <div className="hero-inner">
          <span className="eyebrow">{hero.eyebrow}</span>
          <h1 className="hero-title">{hero.title}</h1>
          <p className="hero-subtitle">{hero.subtitle}</p>
          <div className="hero-actions">
            <a
              href={contact.storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
            >
              스마트스토어
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
