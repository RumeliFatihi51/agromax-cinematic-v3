import { Component } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";

export default class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(previous) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed)
      this.setState({ failed: false });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="studio-module-empty" role="alert">
        <span>
          <TriangleAlert size={30} />
        </span>
        <h2>Bu çalışma alanı açılamadı.</h2>
        <p>
          Sayfayı yeniden yükleyerek tekrar deneyebilirsin. Kaydedilmemiş
          çizimler yenilemede kaybolabilir.
        </p>
        <button className="primary" onClick={() => window.location.reload()}>
          <RefreshCw size={16} />
          Yeniden yükle
        </button>
      </section>
    );
  }
}
