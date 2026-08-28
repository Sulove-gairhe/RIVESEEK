"use client";

import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseAlpha: number;
  twinklePhase: number;
  twinkleSpeed: number;
  driftPhase: number;
};

export function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const pointer = { x: -1000, y: -1000, active: false };
    let particles: Particle[] = [];
    let frame = 0;
    let width = 0;
    let height = 0;
    let particleRgb = "103, 232, 249";
    let lineRgb = "56, 189, 248";

    const updatePalette = () => {
      const styles = getComputedStyle(document.documentElement);
      particleRgb =
        styles.getPropertyValue("--particle-rgb").trim() || "103, 232, 249";
      lineRgb =
        styles.getPropertyValue("--particle-line-rgb").trim() || "56, 189, 248";
    };

    const createParticles = () => {
      const count = Math.min(140, Math.max(55, Math.floor(width / 11)));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.11,
        vy: (Math.random() - 0.5) * 0.11,
        radius: Math.random() * 1.05 + 0.5,
        baseAlpha: Math.random() * 0.48 + 0.32,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: Math.random() * 0.0022 + 0.0011,
        driftPhase: Math.random() * Math.PI * 2,
      }));
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      createParticles();
    };

    const draw = (time = 0) => {
      context.clearRect(0, 0, width, height);

      for (const particle of particles) {
        if (!reduceMotion) {
          particle.x +=
            particle.vx +
            Math.sin(time * 0.00025 + particle.driftPhase) * 0.018;
          particle.y +=
            particle.vy + Math.cos(time * 0.0002 + particle.driftPhase) * 0.014;

          if (particle.x < -8) particle.x = width + 8;
          if (particle.x > width + 8) particle.x = -8;
          if (particle.y < -8) particle.y = height + 8;
          if (particle.y > height + 8) particle.y = -8;

          if (pointer.active) {
            const dx = particle.x - pointer.x;
            const dy = particle.y - pointer.y;
            const distance = Math.hypot(dx, dy);
            if (distance < 110 && distance > 0) {
              const force = (110 - distance) / 110;
              particle.x += (dx / distance) * force * 0.8;
              particle.y += (dy / distance) * force * 0.8;
            }
          }
        }

        const twinkle =
          0.28 +
          ((Math.sin(time * particle.twinkleSpeed + particle.twinklePhase) +
            1) /
            2) *
            0.72;
        const alpha = particle.baseAlpha * twinkle;
        const radius = particle.radius * (0.72 + twinkle * 0.42);

        context.shadowBlur = twinkle > 0.78 ? 7 * twinkle : 0;
        context.shadowColor = `rgba(${particleRgb}, ${alpha * 0.8})`;
        context.beginPath();
        context.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(${particleRgb}, ${alpha})`;
        context.fill();
        context.shadowBlur = 0;
      }

      for (let i = 0; i < particles.length; i += 1) {
        for (let j = i + 1; j < particles.length; j += 1) {
          const first = particles[i];
          const second = particles[j];
          const distance = Math.hypot(first.x - second.x, first.y - second.y);
          if (distance < 104) {
            context.beginPath();
            context.moveTo(first.x, first.y);
            context.lineTo(second.x, second.y);
            context.strokeStyle = `rgba(${lineRgb}, ${(1 - distance / 104) * 0.075})`;
            context.lineWidth = 0.6;
            context.stroke();
          }
        }
      }

      if (!reduceMotion) frame = window.requestAnimationFrame(draw);
    };

    const handlePointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
    };

    const handlePointerLeave = () => {
      pointer.active = false;
    };

    const themeObserver = new MutationObserver(updatePalette);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    updatePalette();
    resize();
    draw(performance.now());

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    document.documentElement.addEventListener(
      "pointerleave",
      handlePointerLeave
    );

    return () => {
      window.cancelAnimationFrame(frame);
      themeObserver.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
      document.documentElement.removeEventListener(
        "pointerleave",
        handlePointerLeave
      );
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 opacity-90 dark:opacity-80"
      aria-hidden="true"
    />
  );
}
