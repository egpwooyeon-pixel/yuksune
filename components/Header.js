import Link from "next/link";
import { brand, contact } from "@/data/site";

const navItems = [
  { href: "#points", label: "탁월한 선택" },
  { href: "#ingredients", label: "자연재료" },
  { href: "#usage", label: "사용법" },
  { href: "#products", label: "제품 라인업" },
  { href: "#contact", label: "문의하기" },
];

export default function Header() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand">
          {brand.shortName}
          <span className="brand-mark">B2B</span>
        </Link>
        <nav className="nav-links">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="header-cta">
          <a href={`tel:${contact.phone}`} className="btn btn-secondary">
            전화 문의
          </a>
          <a href="#contact" className="btn btn-primary">
            견적 문의
          </a>
        </div>
      </div>
    </header>
  );
}
