import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

/* ─── Aurora blobs ─── */
const ORBS = [
  {
    size: 1100,
    color: "rgba(76, 71, 111, 0.07)",
    blur: 200,
    style: { left: "-15%", top: "-20%" } as React.CSSProperties,
    animate: { x: [0, 120, 50, -10, 0], y: [0, 80, 160, 60, 0] },
    duration: 35,
    delay: 0,
  },
  {
    size: 900,
    color: "rgba(55, 52, 95, 0.07)",
    blur: 180,
    style: { right: "-10%", top: "-10%" } as React.CSSProperties,
    animate: { x: [0, -90, -30, -100, 0], y: [0, 120, 60, 30, 0] },
    duration: 28,
    delay: 6,
  },
  {
    size: 950,
    color: "rgba(65, 60, 110, 0.06)",
    blur: 220,
    style: { left: "20%", top: "35%" } as React.CSSProperties,
    animate: { x: [0, -60, 70, -25, 0], y: [0, -80, 60, -40, 0] },
    duration: 40,
    delay: 12,
  },
  {
    size: 800,
    color: "rgba(50, 47, 90, 0.06)",
    blur: 190,
    style: { left: "-10%", top: "55%" } as React.CSSProperties,
    animate: { x: [0, 80, 40, 65, 0], y: [0, -90, -160, -85, 0] },
    duration: 32,
    delay: 4,
  },
  {
    size: 750,
    color: "rgba(60, 56, 105, 0.06)",
    blur: 200,
    style: { right: "0%", top: "55%" } as React.CSSProperties,
    animate: { x: [0, -70, -25, -55, 0], y: [0, -100, -50, -115, 0] },
    duration: 26,
    delay: 9,
  },
];

/* ─── Fireflies canvas ─── */
interface Particle {
  x: number;
  y: number;
  vy: number;
  phase: number;
  phaseSpeed: number;
  r: number;
  alpha: number;
  alphaDir: number;
  alphaSpeed: number;
}

function FirefliesCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const setSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    setSize();

    const COUNT = 48;
    const particles: Particle[] = Array.from({ length: COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vy: -(0.22 + Math.random() * 0.42),
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.007 + Math.random() * 0.007,
      r: 0.9 + Math.random() * 1.7,
      alpha: 0.05 + Math.random() * 0.55,
      alphaDir: Math.random() > 0.5 ? 1 : -1,
      alphaSpeed: 0.003 + Math.random() * 0.004,
    }));

    const onResize = () => {
      setSize();
      for (const p of particles) {
        p.x = Math.random() * canvas.width;
        p.y = Math.random() * canvas.height;
      }
    };
    window.addEventListener("resize", onResize, { passive: true });

    let raf = 0;
    function draw() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);

      for (const p of particles) {
        // Move
        p.y += p.vy;
        p.phase += p.phaseSpeed;
        p.x += Math.sin(p.phase) * 0.3;

        // Breathe
        p.alpha += p.alphaSpeed * p.alphaDir;
        if (p.alpha > 0.72 || p.alpha < 0.04) p.alphaDir *= -1;

        // Respawn from bottom when leaves top
        if (p.y < -12) {
          p.y = canvas!.height + 12;
          p.x = Math.random() * canvas!.width;
        }

        // Outer glow
        const glow = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
        glow.addColorStop(0, `rgba(255, 190, 80, ${p.alpha * 0.6})`);
        glow.addColorStop(0.5, `rgba(255, 137, 6, ${p.alpha * 0.25})`);
        glow.addColorStop(1, "rgba(255, 137, 6, 0)");
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2);
        ctx!.fillStyle = glow;
        ctx!.fill();

        // Core dot
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(255, 225, 150, ${Math.min(p.alpha * 1.6, 1)})`;
        ctx!.fill();
      }

      raf = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    />
  );
}

/* ─── Main export ─── */
export default function BackgroundAmbient() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: -1,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {/* Aurora gradient orbs */}
      {ORBS.map((orb, i) => (
        <motion.div
          key={i}
          style={{
            position: "absolute",
            width: orb.size,
            height: orb.size,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
            filter: `blur(${orb.blur}px)`,
            ...orb.style,
          }}
          animate={orb.animate}
          transition={{
            duration: orb.duration,
            delay: orb.delay,
            repeat: Infinity,
            repeatType: "mirror",
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Fireflies */}
      <FirefliesCanvas />
    </div>
  );
}
