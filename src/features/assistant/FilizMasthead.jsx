import { FilizAvatar } from "../../components/Brand";

export default function FilizMasthead({ eyebrow, description, status, modelAvailable = false }) {
  return (
    <header className="filiz-stage">
      <div className="filiz-stage-identity">
        <span className="filiz-stage-kicker"><FilizAvatar size={25} />{eyebrow}</span>
        <h1>Filiz<span>AI</span></h1>
        <p>{description}</p>
      </div>
      <span className="filiz-stage-status" data-ready={modelAvailable}>{status}</span>
    </header>
  );
}
