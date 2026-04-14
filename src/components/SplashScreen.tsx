const SplashScreen = () => (
  <div
    className="fixed inset-0 flex flex-col items-center justify-center gap-8 z-50"
    style={{ background: "#15012A" }}
  >
    <style>{`
      @keyframes splashFade {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .splash-logo  { animation: splashFade 0.4s ease both; }
      .splash-steppie { animation: splashFade 0.5s ease 0.15s both; }
    `}</style>

    <img
      src="/brand/logo-over-lime.svg"
      alt="steps academy"
      className="splash-logo h-16"
    />
    <img
      src="/steppie/steppie-orgulhoso.svg"
      alt=""
      aria-hidden="true"
      className="splash-steppie h-48"
    />
  </div>
);

export default SplashScreen;
