import { process } from "@/data/site";

export default function ProcessSection() {
  return (
    <section className="section" id="process">
      <div className="container">
        <span className="eyebrow">HOW IT WORKS</span>
        <h2 className="section-title">거래 시작 절차</h2>
        <p className="section-desc">
          문의부터 정기 납품까지, 4단계로 간단하게 진행됩니다.
        </p>
        <div className="grid grid-4">
          {process.map((item) => (
            <div className="process-step" key={item.step}>
              <div className="process-number">{item.step}</div>
              <h3 className="process-title">{item.title}</h3>
              <p className="process-desc">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
