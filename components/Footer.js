import { brand, contact } from "@/data/site";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="footer-brand">{brand.name}</div>
            <p className="footer-desc">{brand.description}</p>
          </div>
          <div>
            <div className="footer-heading">바로가기</div>
            <ul className="footer-list">
              <li>
                <a href="#products">육수 라인업</a>
              </li>
              <li>
                <a href="#process">도입 절차</a>
              </li>
              <li>
                <a href="#faq">자주 묻는 질문</a>
              </li>
              <li>
                <a href="#contact">문의하기</a>
              </li>
            </ul>
          </div>
          <div>
            <div className="footer-heading">연락처</div>
            <ul className="footer-list">
              <li>대표전화 {contact.phoneDisplay}</li>
              <li>{contact.email}</li>
              <li>{contact.address}</li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            {brand.name} · 대표 {contact.ceoName} · 사업자등록번호{" "}
            {contact.businessRegistrationNumber}
          </span>
          <span>
            © {year} {brand.name}. All rights reserved.
          </span>
        </div>
      </div>
    </footer>
  );
}
