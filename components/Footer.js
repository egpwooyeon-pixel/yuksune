import { seller } from "@/data/site";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="seller-info">
          <div>
            <b>상호명</b> {seller.companyName}
          </div>
          <div>
            <b>대표자</b> {seller.ceoName}
          </div>
          <div>
            <b>고객센터</b> {seller.customerCenter}
          </div>
          <div>
            <b>사업자등록번호</b> {seller.bizRegNo}
          </div>
          <div>
            <b>사업장 소재지</b> {seller.address}
          </div>
          <div>
            <b>통신판매업번호</b> {seller.mailOrderNo}
          </div>
          <div>
            <b>e-mail</b> {seller.email}
          </div>
        </div>
      </div>
    </footer>
  );
}
