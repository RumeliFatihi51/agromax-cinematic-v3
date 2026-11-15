# Marketing presentation loop

This change belongs to the legacy product marketing website served at agromax-alpha.vercel.app (baseline 99dad08), not the newer application in src/App.jsx.

Start with ?sunum=1. The seven public marketing pages scroll gently at 35 px/s, wait seven seconds at entry and 6.5 seconds at the bottom, then fade and continue; contact wraps to Home. Controls pause/resume/exit. Hidden tabs pause scrolling. No account pages or data actions participate.

In the legacy React marketing source, import Presentation into App and mount it inside Layout after the page; import presentation.css from main.tsx. Keep the current application's main branch unchanged.

Local verification: static build/check, automatic scroll and pause. Deployment is staged separately and only the marketing alias is updated after verification.
