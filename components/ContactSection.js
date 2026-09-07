import { contact } from "@/data/site";

export default function ContactSection() {
  return (
    <section className="section" id="contact">
      <div className="container">
        <div className="cta-section">
          <h2 className="cta-title">지금 바로 육수 도입을 문의하세요</h2>
          <p className="cta-desc">
            매장 상황에 맞는 육수 종류와 견적을 상담해드립니다. 전화, 카카오톡
            채널 중 편하신 방법으로 연락주세요.
          </p>
          <div className="cta-actions">
            <a href={`tel:${contact.phone}`} className="btn btn-primary">
              전화로 문의하기
            </a>
            <a
              href={contact.kakaoChannelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
            >
              {contact.kakaoChannelLabel}
            </a>
          </div>
        </div>

        <div className="contact-info">
          <div className="contact-info-item">
            <div className="contact-info-label">대표 전화</div>
            <div className="contact-info-value">{contact.phoneDisplay}</div>
          </div>
          <div className="contact-info-item">
            <div className="contact-info-label">이메일</div>
            <div className="contact-info-value">{contact.email}</div>
          </div>
          <div className="contact-info-item">
            <div className="contact-info-label">운영 시간</div>
            <div className="contact-info-value">{contact.businessHours}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
