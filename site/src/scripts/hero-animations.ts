/**
 * Hero GSAP animations — elastic entrances and micro-interactions.
 */
import gsap from 'gsap';

// ---------- Intro timeline ----------

export function playHeroIntro() {
  const tl = gsap.timeline({ defaults: { ease: 'elastic.out(1, 0.4)' } });

  // Logo — scale bounce in
  tl.fromTo('.hero-logo',
    { scale: 0.6, opacity: 0 },
    { scale: 1, opacity: 1, duration: 1.4 },
  );

  // Logo grid cells — stagger flap
  tl.fromTo('.logo-cell',
    { rotateY: 90, opacity: 0 },
    { rotateY: 0, opacity: 1, duration: 0.8, stagger: 0.05 },
    '-=0.8',
  );

  // App name
  tl.fromTo('.hero-title',
    { y: 30, opacity: 0 },
    { y: 0, opacity: 1, duration: 1.2 },
    '-=0.5',
  );

  // Catchphrase — per-word stagger
  tl.fromTo('.hero-catchphrase .word',
    { y: 20, opacity: 0, scale: 0.9 },
    { y: 0, opacity: 1, scale: 1, duration: 1, stagger: 0.08 },
    '-=0.7',
  );

  // Sub-line
  tl.fromTo('.hero-subline',
    { y: 15, opacity: 0 },
    { y: 0, opacity: 1, duration: 1, ease: 'power3.out' },
    '-=0.5',
  );

  // CTA button — spring in
  tl.fromTo('.hero-cta',
    { scale: 0.8, opacity: 0 },
    { scale: 1, opacity: 1, duration: 1 },
    '-=0.4',
  );

  return tl;
}

// ---------- CTA hover glow sweep ----------

export function initCtaHover() {
  const btn = document.querySelector('.hero-cta') as HTMLElement | null;
  if (!btn) return;

  btn.addEventListener('mouseenter', () => {
    gsap.fromTo(btn,
      { '--glow-x': '-100%' },
      { '--glow-x': '200%', duration: 0.6, ease: 'power2.out' },
    );
  });
}

// ---------- Logo hover flap ----------

export function initLogoHover() {
  const logo = document.querySelector('.hero-logo') as HTMLElement | null;
  if (!logo) return;

  logo.addEventListener('mouseenter', () => {
    const cells = logo.querySelectorAll('.logo-cell');
    gsap.fromTo(cells,
      { rotateY: 0 },
      { rotateY: 360, duration: 0.6, stagger: 0.03, ease: 'power2.inOut' },
    );
  });
}

// ---------- Ticker ----------

export function initTicker() {
  const track = document.querySelector('.ticker-track') as HTMLElement | null;
  if (!track) return;

  // Duplicate content for seamless loop
  track.innerHTML += track.innerHTML;

  gsap.to(track, {
    xPercent: -50,
    duration: 30,
    ease: 'none',
    repeat: -1,
  });
}

// ---------- Scroll parallax on hero text ----------

export function initHeroParallax() {
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    const hero = document.querySelector('.hero-content') as HTMLElement | null;
    if (!hero) return;

    // Parallax: text moves up slower than scroll
    const offset = scrollY * 0.3;
    hero.style.transform = `translateY(${offset}px)`;

    // Fade out hero as user scrolls
    const opacity = Math.max(0, 1 - scrollY / (window.innerHeight * 0.6));
    hero.style.opacity = String(opacity);
  });
}
