import Link from "next/link";
import { brand, contact } from "@/data/site";

const navItems = [
  { href: "#products", label: "육수 라인업" },
  { href: "#why-us", label: "왜 육수네인가" },
  { href: "#process", label: "도입 절차" },
  { href: "#faq", label: "자주 묻는 질문" },
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
