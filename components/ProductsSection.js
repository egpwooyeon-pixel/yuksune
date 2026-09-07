import { products } from "@/data/products";

export default function ProductsSection() {
  return (
    <section className="section" id="products">
      <div className="container">
        <span className="eyebrow">PRODUCT LINE-UP</span>
        <h2 className="section-title">육수 라인업</h2>
        <p className="section-desc">
          업종과 메뉴에 맞춰 선택할 수 있는 다양한 육수를 공급합니다. 목록에 없는
          맞춤 육수 개발 문의도 가능합니다.
        </p>
        <div className="grid grid-3">
          {products.map((product) => (
            <div className="product-card" key={product.id}>
              {product.badge && (
                <span className="product-badge">{product.badge}</span>
              )}
              <span className="product-category">{product.category}</span>
              <h3 className="product-name">{product.name}</h3>
              <p className="product-desc">{product.description}</p>
              <ul className="feature-list">
                {product.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
