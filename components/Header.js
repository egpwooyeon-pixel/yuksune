import { brand, contact } from "@/data/site";
import { withBasePath } from "@/lib/basePath";

export default function Header() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <span className="brand">
          <img className="brand-logo" src={withBasePath(brand.logo)} alt="로고" />
          {brand.shortName}
        </span>
        <nav className="nav-links">
          <a href={contact.storeUrl} target="_blank" rel="noopener noreferrer">
            구매하러 가기
          </a>
          <a href={contact.kakaoUrl} target="_blank" rel="noopener noreferrer">
            카카오톡
          </a>
          <a href={`tel:${contact.phone}`}>문의하기</a>
        </nav>
      </div>
    </header>
  );
}
