import { faqs } from "@/data/site";

export default function FaqSection() {
  return (
    <section className="section section-alt" id="faq">
      <div className="container">
        <span className="eyebrow">FAQ</span>
        <h2 className="section-title">자주 묻는 질문</h2>
        <p className="section-desc">
          B2B 거래 담당자분들이 자주 문의하시는 내용을 정리했습니다.
        </p>
        <div className="grid grid-2">
          {faqs.map((item) => (
            <div className="faq-item" key={item.question}>
              <p className="faq-q">Q. {item.question}</p>
              <p className="faq-a">A. {item.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
