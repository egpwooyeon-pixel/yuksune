import { combination } from "@/data/detail";
import { products } from "@/data/products";

export default function FlavorCombination() {
  return (
    <section className="section section-alt" id="products">
      <div className="container">
        <span className="eyebrow">{combination.eyebrow}</span>
        <h2 className="section-title">{combination.title}</h2>
        <p className="section-desc">{combination.description}</p>
        <div className="grid grid-3">
          {products.map((product) => (
            <div className="flavor-card" key={product.id}>
              {product.badge && <span className="product-badge">{product.badge}</span>}
              <span className="product-category">{product.category}</span>
              <h3 className="product-name">{product.name}</h3>
              <p className="product-desc">{product.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
